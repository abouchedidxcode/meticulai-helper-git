// Low-res render target + one post pass that does all of the PS1 look: nearest upscale, 4x4 Bayer dither,
// per-channel quantisation, horror grade, grain, vignette, blackout (eyes closed) with a fading afterimage,
// eyelids, flash, chunky shake and "dread" (swimming rows, colour split). Letterboxed to 4:3 by default.
// From Don't Blink by Meticulai.
import * as THREE from 'three';
import { ATMOSPHERE_DEFAULTS, resolveOptions } from './defaults.js';
import { PS1State, letterbox, targetSize } from './ps1-state.js';
import { setPS1Affine, setPS1Resolution } from './ps1-material.js';

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

const POST_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uTime;
uniform float uLevels;
uniform float uDither;
uniform float uGrain;
uniform float uVignette;
uniform float uBlack;
uniform float uGhost;
uniform float uLid;
uniform float uDread;
uniform float uFlash;
uniform vec2 uShake;
uniform float uSat;
uniform vec3 uTint;
uniform float uContrast;
uniform vec4 uDreadK; // swim px, split px, grain boost, edge darkening
uniform vec3 uFlashColor;
uniform vec3 uGhostColor;
varying vec2 vUv;

// Ordered dither: 0..15/16, stable per low-res pixel.
float bayer2( vec2 a ) {
	a = floor( a );
	return fract( a.x / 2.0 + a.y * a.y * 0.75 );
}
float bayer4( vec2 a ) {
	return bayer2( 0.5 * a ) * 0.25 + bayer2( a );
}

// "Hash without sine" by Dave Hoskins (MIT).
float hash12( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}

vec3 toSRGB( vec3 c ) {
	c = clamp( c, 0.0, 1.0 );
	return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) );
}

void main() {
	vec2 uv = vUv + uShake;
	if ( uv.x < 0.0 || uv.y < 0.0 || uv.x >= 1.0 || uv.y >= 1.0 ) {
		gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
		return;
	}
	// Everything below lives in low-res pixel space so dither/grain are chunky and stable.
	// Dread: when it is close the image starts to swim and split.
	if ( uDread > 0.0 ) {
		float row = floor( uv.y * uRes.y );
		uv.x += sin( row * 0.21 + uTime * 7.0 ) * uDread * uDreadK.x / uRes.x;
	}
	vec2 pix = floor( uv * uRes );
	vec2 suv = ( pix + 0.5 ) / uRes;
	vec3 c = toSRGB( texture2D( tScene, suv ).rgb );
	if ( uDread > 0.0 ) {
		vec2 ca = vec2( floor( uDread * uDreadK.y + 0.5 ) / uRes.x, 0.0 );
		c.r = toSRGB( texture2D( tScene, suv + ca ).rgb ).r;
		c.b = toSRGB( texture2D( tScene, suv - ca ).rgb ).b;
	}

	// Grade: drain colour, push toward a sick green-sepia, crush the toe a little.
	float l = dot( c, vec3( 0.299, 0.587, 0.114 ) );
	c = mix( vec3( l ), c, uSat );
	c *= uTint;
	c = mix( c, c * c * ( 3.0 - 2.0 * c ), uContrast );

	// Vignette (aspect-aware, reaches ~1 at the corners).
	vec2 d = ( suv - 0.5 ) * vec2( uRes.x / uRes.y, 1.0 );
	float r = length( d ) / length( vec2( uRes.x / uRes.y, 1.0 ) * 0.5 );
	c *= 1.0 - clamp( uVignette, 0.0, 1.0 ) * smoothstep( 0.25, 1.0, r );

	// Film grain, re-rolled ~24 times per second, weaker in deep black so shadows stay inky.
	float g = hash12( pix + floor( uTime * 24.0 ) * vec2( 37.0, 17.0 ) ) - 0.5;
	c += g * uGrain * ( 1.0 + uDreadK.z * uDread ) * ( 0.2 + 0.8 * sqrt( clamp( l, 0.0, 1.0 ) ) );
	c *= 1.0 - uDreadK.w * uDread * smoothstep( 0.1, 1.0, r );

	// Eyelids: on every reveal the image opens from a slit, top and bottom lids curving away.
	if ( uLid < 0.999 ) {
		float ly = abs( suv.y - 0.5 ) * 2.0;
		float lx = abs( suv.x - 0.5 ) * 2.0;
		float edge = uLid * ( 1.0 - 0.35 * lx * lx ) * 1.25;
		c *= smoothstep( edge, edge - 0.12, ly );
	}

	// Eyes-closed blackout. While blind, only the brightest parts of the last frame linger as a
	// dim, warm retinal afterimage (a frozen frame: nothing that happens while blind shows in it).
	float gl = dot( c, vec3( 0.299, 0.587, 0.114 ) );
	vec3 ghost = uGhostColor * smoothstep( 0.12, 0.7, gl ) * uGhost;
	c *= 1.0 - uBlack;
	c += ghost * uBlack;

	// Flash toward a harsh off-white with a faint red bite.
	c = mix( c, uFlashColor, clamp( uFlash, 0.0, 1.0 ) );

	// Ordered dither + per-channel quantisation.
	float steps = max( uLevels - 1.0, 1.0 );
	float b = ( bayer4( pix ) - 0.5 + 1.0 / 32.0 ) * uDither;
	c = floor( clamp( c, 0.0, 1.0 ) * steps + 0.5 + b ) / steps;
	c = clamp( c, 0.0, 1.0 );

	if ( uBlack >= 0.999 && uFlash <= 0.0 && uGhost <= 0.0 ) c = vec3( 0.0 );
	gl_FragColor = vec4( c, 1.0 );
}
`;

/**
 * The PS1 look. Replaces renderer.render(scene, camera) with pipeline.render(scene, camera, dt).
 *
 * @example
 * const ps1 = new PS1Pipeline({ renderer });            // or { container } to let it make its own renderer
 * function frame(dt) { ps1.render(scene, camera, dt); }
 */
export class PS1Pipeline {
  /**
   * @param {{ renderer?: THREE.WebGLRenderer, container?: HTMLElement } & Partial<import('./defaults.js').PS1Options>} [args]
   *   Pass your own `renderer` (it keeps its size; you resize it) or a `container` for a renderer made like
   *   Don't Blink's (no antialias, pixel ratio capped, canvas fills the container). Everything else is a look option.
   */
  constructor({ renderer, container, ...options } = {}) {
    this.options = resolveOptions(options);
    this.state = new PS1State(this.options);
    this.owned = !renderer;
    this.container = container ?? (renderer ? renderer.domElement.parentElement : document.body) ?? document.body;

    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.options.pixelRatioCap));
      renderer.setClearColor(0x000000, 1);
      const canvas = renderer.domElement;
      Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated', background: '#000' });
      this.container.appendChild(canvas);
      this.onResize = () => this.resize();
      window.addEventListener('resize', this.onResize);
    }
    /** @type {THREE.WebGLRenderer} */
    this.renderer = renderer;

    const [w, h] = targetSize(this.options, 0, 0);
    this.target = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      // Half float keeps precision in the near-black range before we quantise in sRGB.
      type: THREE.HalfFloatType,
    });

    this.postMaterial = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      uniforms: {
        tScene: { value: this.target.texture },
        uRes: { value: new THREE.Vector2(w, h) },
        uTime: { value: 0 },
        uLevels: { value: 0 },
        uDither: { value: 0 },
        uGrain: { value: 0 },
        uVignette: { value: 0 },
        uBlack: { value: 0 },
        uGhost: { value: 0 },
        uLid: { value: 1 },
        uDread: { value: 0 },
        uFlash: { value: 0 },
        uShake: { value: new THREE.Vector2() },
        uSat: { value: 1 },
        uTint: { value: new THREE.Vector3(1, 1, 1) },
        uContrast: { value: 0 },
        uDreadK: { value: new THREE.Vector4() },
        uFlashColor: { value: new THREE.Vector3() },
        uGhostColor: { value: new THREE.Vector3() },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial);
    this.postQuad.frustumCulled = false;
    this.postScene.add(this.postQuad);

    this._size = new THREE.Vector2();
    this._clear = new THREE.Color();
    this.set({});
    this.resize();
  }

  /** Change look options live (levels, dither, grain, grade, vertexSnap, affineStrength, letterbox...). */
  set(options) {
    this.options = resolveOptions(options, this.options);
    this.state.opts = this.options;
    const o = this.options;
    const u = this.postMaterial.uniforms;
    u.uLevels.value = o.colorLevels;
    u.uDither.value = o.ditherStrength;
    u.uGrain.value = o.grain;
    u.uSat.value = o.grade.saturation;
    u.uTint.value.fromArray(o.grade.tint);
    u.uContrast.value = o.grade.contrast;
    u.uDreadK.value.set(o.dread.swim, o.dread.split, o.dread.grain, o.dread.edge);
    u.uFlashColor.value.fromArray(o.fx.flashColor);
    u.uGhostColor.value.fromArray(o.fx.ghostColor);
    setPS1Affine(o.affineStrength);
    this._applyTargetSize(true);
    return this;
  }

  /** Aspect of the low-res picture (4:3 when letterboxed). The pipeline sets perspective cameras to it. */
  get aspect() {
    return this.target.width / this.target.height;
  }

  /** Current blackout 0..1 (1 = fully black). */
  get blackLevel() {
    return this.state.black;
  }

  /** Eyes closed / open. `instant` + open is a hard cut (no fade, no eyelids). */
  setBlind(blind, instant = false) {
    if (this.state.setBlind(blind, instant)) this._clearScreen();
  }
  /** 0..1 flash toward off-white; decay it yourself (Don't Blink: flash -= dt * 2.5). */
  setFlash(v) { this.state.setFlash(v); }
  /** 0..1 chunky whole-pixel shake; decay it yourself (Don't Blink: shake -= dt * 2). */
  setShake(v) { this.state.setShake(v); }
  /** 0..1 how close the threat is: grain, colour split, swimming rows, darker edges. */
  setDread(v) { this.state.setDread(v); }
  /** A sharp extra vignette pulse that fades on its own. */
  punch(v) { this.state.punch(v); }
  /** Close the eyes slowly over `ms`, ending fully black. */
  closeEyes(ms) { this.state.closeEyes(ms); }

  /**
   * Draw one frame. Replaces renderer.render(scene, camera).
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {number} dt seconds since the last frame (drives fades, eyelids, grain)
   */
  render(scene, camera, dt) {
    const r = this.renderer;
    if (this.owned) this.resize();
    this._applyTargetSize(false);
    const f = this.state.step(dt);
    const autoClear = r.autoClear;
    r.getClearColor(this._clear);
    const clearAlpha = r.getClearAlpha();
    r.autoClear = false;
    try {
      if (!f) {
        this._clearScreen();
        return;
      }
      if (camera.isPerspectiveCamera && Math.abs(camera.aspect - this.aspect) > 1e-6) {
        camera.aspect = this.aspect;
        camera.updateProjectionMatrix();
      }
      if (f.renderScene) {
        r.setRenderTarget(this.target);
        r.setClearColor(this._clear, clearAlpha);
        r.clear(true, true, true);
        r.render(scene, camera);
      }
      const u = this.postMaterial.uniforms;
      u.uGhost.value = f.u.ghost;
      u.uDread.value = f.u.dread;
      u.uLid.value = f.u.lid;
      u.uTime.value = f.u.time;
      u.uBlack.value = f.u.black;
      u.uFlash.value = f.u.flash;
      u.uVignette.value = f.u.vignette;
      u.uShake.value.set(f.u.shake[0], f.u.shake[1]);

      const { width: w, height: h } = this._css();
      r.setRenderTarget(null);
      r.setScissorTest(false);
      r.setViewport(0, 0, w, h);
      r.setClearColor(0x000000, 1);
      r.clear(true, true, true);
      const v = letterbox(w, h, this.aspect);
      r.setViewport(v.x, v.y, v.w, v.h);
      r.setScissor(v.x, v.y, v.w, v.h);
      r.setScissorTest(true);
      r.render(this.postScene, this.postCamera);
      r.setScissorTest(false);
      r.setViewport(0, 0, w, h);
    } finally {
      r.autoClear = autoClear;
      r.setClearColor(this._clear, clearAlpha);
    }
  }

  /** Resize an owned renderer to its container (called for you every frame). */
  resize() {
    if (!this.owned) return;
    const w = Math.max(1, this.container.clientWidth || window.innerWidth);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    const pr = Math.min(window.devicePixelRatio || 1, this.options.pixelRatioCap);
    if (this.renderer.getPixelRatio() !== pr) this.renderer.setPixelRatio(pr);
    const s = this.renderer.getSize(this._size);
    if (s.x !== w || s.y !== h) this.renderer.setSize(w, h, false);
  }

  dispose() {
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.target.dispose();
    this.postMaterial.dispose();
    this.postQuad.geometry.dispose();
    if (this.owned) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
    }
  }

  _css() {
    const s = this.renderer.getSize(this._size);
    return { width: Math.max(1, s.x), height: Math.max(1, s.y) };
  }

  _applyTargetSize(force) {
    const { width, height } = this._css();
    const [tw, th] = targetSize(this.options, width, height);
    if (force || tw !== this.target.width || th !== this.target.height) {
      this.target.setSize(tw, th);
      this.postMaterial.uniforms.uRes.value.set(tw, th);
      this.state.res = [tw, th];
      setPS1Resolution(tw, th, this.options.vertexSnap);
    }
  }

  _clearScreen() {
    const r = this.renderer;
    const { width, height } = this._css();
    r.setRenderTarget(null);
    r.setScissorTest(false);
    r.setViewport(0, 0, width, height);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
  }
}

/**
 * Don't Blink's air: black background, dense black FogExp2 and a barely-there ambient light.
 * @param {THREE.Scene} scene
 * @param {Partial<typeof ATMOSPHERE_DEFAULTS>} [overrides]
 * @returns {THREE.AmbientLight} the ambient light it added
 */
export function applyPS1Atmosphere(scene, overrides = {}) {
  const a = { ...ATMOSPHERE_DEFAULTS, ...overrides };
  scene.background = new THREE.Color(a.background);
  scene.fog = new THREE.FogExp2(a.fogColor, a.fogDensity);
  const ambient = new THREE.AmbientLight(a.ambientColor, a.ambientIntensity);
  ambient.name = 'ambient';
  scene.add(ambient);
  return ambient;
}
