// Camera effects for the postprocessing chain (pmndrs/postprocessing Effects).
//   AutoExposureEffect  centre-weighted metering with eye/camera adaptation, applied before bloom and tone mapping
//   MotionBlurEffect    camera motion blur reconstructed from depth and last frame's view-projection
//   FilmEffect          what a lens and sensor add after tone mapping: chromatic aberration, a touch of barrel
//                       distortion, natural vignetting, sharpening, a colour grade and luminance-dependent grain
import * as THREE from 'three';
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// ---------------------------------------------------------------------------------------------------------
// Auto exposure

const METER_FRAG = /* glsl */ `
  uniform sampler2D tInput;
  varying vec2 vUv;
  void main() {
    // 4x4 taps per output texel of the 64x64 meter
    vec3 c = vec3( 0.0 );
    for ( int y = 0; y < 4; y ++ ) for ( int x = 0; x < 4; x ++ ) {
      c += texture2D( tInput, vUv + ( vec2( x, y ) - 1.5 ) / 256.0 ).rgb;
    }
    c /= 16.0;
    float L = max( dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-4 );
    // centre-weighted metering, like a camera's default mode
    vec2 d = ( vUv - 0.5 ) * vec2( 1.6, 1.0 );
    float w = exp( - dot( d, d ) * 4.0 ) + 0.15;
    gl_FragColor = vec4( log( L ) * w, w, 0.0, 1.0 );
  }`;

const ADAPT_FRAG = /* glsl */ `
  uniform sampler2D tMeter;
  uniform sampler2D tPrev;
  uniform float uBlend;
  varying vec2 vUv;
  void main() {
    vec2 m = textureLod( tMeter, vec2( 0.5 ), 6.0 ).rg;
    float target = exp( m.r / max( m.g, 1e-4 ) );
    float prev = texture2D( tPrev, vec2( 0.5 ) ).r;
    float v = prev <= 0.0 ? target : exp( mix( log( prev ), log( target ), uBlend ) );
    gl_FragColor = vec4( v, 0.0, 0.0, 1.0 );
  }`;

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

export class AutoExposureEffect extends Effect {
  // key: target mid-grey after exposure; minEV/maxEV clamp the exposure (log2 of the multiplier);
  // speed: adaptation rate per second; compensation: extra EV.
  constructor({ key = 0.18, minEV = -6, maxEV = 6, speed = 1.6, compensation = 0 } = {}) {
    super(
      'AutoExposureEffect',
      /* glsl */ `
      uniform sampler2D tAdapted;
      uniform float uKey, uMin, uMax, uComp, uManual;
      void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
        float avg = texture2D( tAdapted, vec2( 0.5 ) ).r;
        float ev = uManual > -50.0 ? uManual : clamp( log2( uKey / max( avg, 1e-5 ) ), uMin, uMax );
        outputColor = vec4( inputColor.rgb * exp2( ev + uComp ), inputColor.a );
      }`,
      {
        blendFunction: BlendFunction.SRC,
        uniforms: new Map([
          ['tAdapted', new THREE.Uniform(null)],
          ['uKey', new THREE.Uniform(key)],
          ['uMin', new THREE.Uniform(minEV)],
          ['uMax', new THREE.Uniform(maxEV)],
          ['uComp', new THREE.Uniform(compensation)],
          ['uManual', new THREE.Uniform(-100)],
        ]),
      },
    );
    this.speed = speed;
    const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false };
    this.meter = new THREE.WebGLRenderTarget(64, 64, {
      ...rtOpts,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.adapted = [new THREE.WebGLRenderTarget(1, 1, rtOpts), new THREE.WebGLRenderTarget(1, 1, rtOpts)];
    this.flip = 0;
    this.meterQuad = new FullScreenQuad(
      new THREE.ShaderMaterial({ uniforms: { tInput: { value: null } }, vertexShader: QUAD_VERT, fragmentShader: METER_FRAG }),
    );
    this.adaptQuad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: { tMeter: { value: this.meter.texture }, tPrev: { value: null }, uBlend: { value: 1 } },
        vertexShader: QUAD_VERT,
        fragmentShader: ADAPT_FRAG,
      }),
    );
    this.reset = true;
  }

  set compensation(v) { this.uniforms.get('uComp').value = v; }
  get compensation() { return this.uniforms.get('uComp').value; }
  // A fixed exposure (EV) instead of metering; null to meter again.
  set manualEV(v) { this.uniforms.get('uManual').value = v == null ? -100 : v; }

  update(renderer, inputBuffer, deltaTime) {
    const prevTarget = renderer.getRenderTarget();
    this.meterQuad.material.uniforms.tInput.value = inputBuffer.texture;
    renderer.setRenderTarget(this.meter);
    this.meterQuad.render(renderer);
    const src = this.adapted[this.flip];
    const dst = this.adapted[1 - this.flip];
    const u = this.adaptQuad.material.uniforms;
    u.tPrev.value = src.texture;
    u.uBlend.value = this.reset ? 1 : 1 - Math.exp(-Math.min(deltaTime, 0.25) * this.speed);
    if (this.reset) {
      // first frame: adapt instantly
      renderer.setRenderTarget(src);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
    }
    renderer.setRenderTarget(dst);
    this.adaptQuad.render(renderer);
    renderer.setRenderTarget(prevTarget);
    this.flip = 1 - this.flip;
    this.reset = false;
    this.uniforms.get('tAdapted').value = dst.texture;
  }

  dispose() {
    super.dispose();
    this.meter.dispose();
    this.adapted.forEach((t) => t.dispose());
    this.meterQuad.dispose();
    this.adaptQuad.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------
// Camera motion blur

export class MotionBlurEffect extends Effect {
  constructor({ shutter = 0.5, samples = 10, maxBlur = 0.04 } = {}) {
    super(
      'MotionBlurEffect',
      /* glsl */ `
      uniform mat4 uReproject;
      uniform float uScale, uMax;
      void mainImage( const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor ) {
        vec4 ndc = vec4( uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0 );
        vec4 prev = uReproject * ndc;
        vec2 prevUv = prev.xy / prev.w * 0.5 + 0.5;
        vec2 v = ( uv - prevUv ) * uScale;
        float len = length( v );
        if ( len < 0.0008 ) { outputColor = inputColor; return; }
        v *= min( 1.0, uMax / len );
        vec3 acc = inputColor.rgb;
        float n = 1.0;
        float jitter = fract( sin( dot( uv, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
        for ( int i = 1; i < ${samples}; i ++ ) {
          float t = ( float( i ) + jitter - 0.5 ) / float( ${samples} - 1 ) - 0.5;
          vec2 suv = uv + v * t;
          // only blur over pixels at least as far away, so near edges stay crisp
          float sd = readDepth( suv );
          float w = sd >= depth - 0.0005 ? 1.0 : 0.25;
          acc += texture2D( inputBuffer, suv ).rgb * w;
          n += w;
        }
        outputColor = vec4( acc / n, inputColor.a );
      }`,
      {
        attributes: EffectAttribute.DEPTH | EffectAttribute.CONVOLUTION,
        blendFunction: BlendFunction.SRC,
        uniforms: new Map([
          ['uReproject', new THREE.Uniform(new THREE.Matrix4())],
          ['uScale', new THREE.Uniform(shutter)],
          ['uMax', new THREE.Uniform(maxBlur)],
        ]),
      },
    );
    this.shutter = shutter;
    this.prevViewProj = new THREE.Matrix4();
    this.viewProj = new THREE.Matrix4();
    this.inv = new THREE.Matrix4();
    this.hasPrev = false;
    this.camera = null;
  }

  // Called with the camera after its matrices are final for the frame.
  track(camera, dt) {
    camera.updateMatrixWorld();
    this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const reproject = this.uniforms.get('uReproject').value;
    if (!this.hasPrev) this.prevViewProj.copy(this.viewProj);
    this.inv.copy(this.viewProj).invert();
    reproject.multiplyMatrices(this.prevViewProj, this.inv);
    // blur length is "shutter open time / frame time": a 1/120 s shutter at 60 fps is half a frame
    this.uniforms.get('uScale').value = this.shutter * Math.min(1.5, 1 / 60 / Math.max(dt, 1 / 240)) ;
    this.prevViewProj.copy(this.viewProj);
    this.hasPrev = true;
  }

  // Skip the blur for one frame (after a teleport or camera cut).
  cut() {
    this.hasPrev = false;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Lens and film

export class FilmEffect extends Effect {
  constructor({ aberration = 0.0016, distortion = 0.025, vignette = 0.35, grain = 0.045, sharpen = 0.12, saturation = 1.06, contrast = 1.06, warmth = 0.0 } = {}) {
    super(
      'FilmEffect',
      /* glsl */ `
      uniform float uAberration, uDistortion, uVignette, uGrain, uSharpen, uSaturation, uContrast, uWarmth, uSeed, uFlash, uDesat;
      uniform vec3 uTint;

      float prHash( vec2 p ) {
        vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
        p3 += dot( p3, p3.yzx + 33.33 );
        return fract( ( p3.x + p3.y ) * p3.z );
      }

      vec2 lens( vec2 uv, float k ) {
        vec2 c = uv - 0.5;
        float r2 = dot( c * vec2( aspect, 1.0 ), c * vec2( aspect, 1.0 ) );
        return 0.5 + c * ( 1.0 - k * 0.25 + k * r2 ) ;
      }

      void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
        vec2 duv = lens( uv, uDistortion );
        vec2 c = duv - 0.5;
        float r = length( c * vec2( aspect, 1.0 ) );
        // lateral chromatic aberration: red and blue land at slightly different magnifications
        vec2 ca = c * uAberration * r * 2.0;
        vec3 col;
        col.r = texture2D( inputBuffer, duv + ca ).r;
        col.g = texture2D( inputBuffer, duv ).g;
        col.b = texture2D( inputBuffer, duv - ca ).b;

        // unsharp mask: recovers the crispness a real lens has after anti-aliasing softens edges
        vec3 blur = (
          texture2D( inputBuffer, duv + vec2( texelSize.x, 0.0 ) ).rgb +
          texture2D( inputBuffer, duv - vec2( texelSize.x, 0.0 ) ).rgb +
          texture2D( inputBuffer, duv + vec2( 0.0, texelSize.y ) ).rgb +
          texture2D( inputBuffer, duv - vec2( 0.0, texelSize.y ) ).rgb ) * 0.25;
        col = max( col + ( col - blur ) * uSharpen, 0.0 );

        // grade: gentle S-curve around mid grey, saturation, warm highlights / cool shadows
        float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
        col = mix( vec3( l ), col, uSaturation * ( 1.0 - uDesat ) );
        vec3 g = pow( max( col, 0.0 ), vec3( 1.0 / 2.2 ) );
        g = clamp( ( g - 0.5 ) * uContrast + 0.5, 0.0, 1.0 );
        col = pow( g, vec3( 2.2 ) );
        col *= mix( vec3( 1.0 - uWarmth * 0.5, 1.0, 1.0 + uWarmth * 0.6 ), vec3( 1.0 + uWarmth, 1.0, 1.0 - uWarmth ), smoothstep( 0.0, 0.6, l ) );
        col *= uTint;

        // natural vignetting (cos^4 law, softened)
        float vig = pow( cos( clamp( r * uVignette * 1.6, 0.0, 1.5 ) ), 4.0 );
        col *= vig;

        // flash
        col += uFlash;

        // grain: strongest in the mid-tones, like film; slightly blurred so it is not pixel noise
        vec2 p = floor( uv * resolution / 1.3 );
        float n = ( prHash( p + uSeed ) + prHash( p + vec2( 1.0, 0.0 ) + uSeed ) + prHash( p + vec2( 0.0, 1.0 ) + uSeed ) ) / 3.0 - 0.5;
        float lg = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
        float amt = uGrain * ( 0.35 + 1.6 * sqrt( lg ) * ( 1.0 - smoothstep( 0.4, 1.2, lg ) ) );
        col += n * amt * max( lg, 0.02 ) * 2.0 + n * amt * 0.012;

        // the corners beyond the distorted frame
        if ( any( lessThan( duv, vec2( 0.0 ) ) ) || any( greaterThan( duv, vec2( 1.0 ) ) ) ) col = vec3( 0.0 );
        outputColor = vec4( max( col, 0.0 ), inputColor.a );
      }`,
      {
        attributes: EffectAttribute.CONVOLUTION,
        blendFunction: BlendFunction.SRC,
        uniforms: new Map([
          ['uAberration', new THREE.Uniform(aberration)],
          ['uDistortion', new THREE.Uniform(distortion)],
          ['uVignette', new THREE.Uniform(vignette)],
          ['uGrain', new THREE.Uniform(grain)],
          ['uSharpen', new THREE.Uniform(sharpen)],
          ['uSaturation', new THREE.Uniform(saturation)],
          ['uContrast', new THREE.Uniform(contrast)],
          ['uWarmth', new THREE.Uniform(warmth)],
          ['uTint', new THREE.Uniform(new THREE.Color(1, 1, 1))],
          ['uSeed', new THREE.Uniform(0)],
          ['uFlash', new THREE.Uniform(0)],
          ['uDesat', new THREE.Uniform(0)],
        ]),
      },
    );
  }

  set(name, value) {
    const u = this.uniforms.get(name);
    if (u) u.value = value;
  }

  update(renderer, inputBuffer, deltaTime) {
    this.uniforms.get('uSeed').value = (this.uniforms.get('uSeed').value + 17.13) % 1000;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Screen-space reflections on a wet ground plane

// Puddles and damp asphalt mirror what is really on screen (walls, props, drones), found by marching the
// reflected ray through the depth buffer. Only the ground plane at `groundY` reflects; how much comes from
// the same wet mask the ground material uses (maskGlsl defines float srWetMask( vec3 p, out float puddle )).
export class WetReflectionEffect extends Effect {
  constructor({ maskGlsl, groundY = 0, steps = 40 } = {}) {
    super(
      'WetReflectionEffect',
      /* glsl */ `
      uniform mat4 uProj, uInvProj, uView, uInvView;
      uniform float uGroundY, uStrength, uWet;
      ${maskGlsl}

      vec3 ssrViewPos( vec2 uv, float d ) {
        vec4 v = uInvProj * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
        return v.xyz / v.w;
      }

      void mainImage( const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor ) {
        outputColor = inputColor;
        if ( depth >= 0.99999 || uStrength <= 0.0 ) return;
        vec3 vp = ssrViewPos( uv, depth );
        vec3 wp = ( uInvView * vec4( vp, 1.0 ) ).xyz;
        if ( abs( wp.y - uGroundY ) > 0.035 ) return;
        float puddle;
        float wet = srWetMask( wp, puddle );
        if ( wet < 0.02 ) return;
        vec3 n = normalize( ( uView * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
        vec3 v = normalize( vp );
        vec3 r = reflect( v, n );
        float stepLen = 0.06 + 0.02 * length( vp );
        vec3 p = vp + n * 0.02;
        vec3 prev = p;
        bool hit = false;
        vec2 huv = vec2( 0.0 );
        for ( int i = 0; i < ${steps}; i ++ ) {
          prev = p;
          p += r * stepLen;
          stepLen *= 1.09;
          vec4 c = uProj * vec4( p, 1.0 );
          vec2 suv = c.xy / c.w * 0.5 + 0.5;
          if ( suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0 || p.z > -0.05 ) break;
          float sd = readDepth( suv );
          if ( sd >= 0.99999 ) continue;
          float sz = ssrViewPos( suv, sd ).z;
          float diff = sz - p.z; // > 0: the scene is in front of the ray
          if ( diff > 0.0 && diff < 0.5 + stepLen * 2.0 ) {
            // refine between the last two points
            vec3 a = prev;
            vec3 b = p;
            for ( int j = 0; j < 6; j ++ ) {
              vec3 m = ( a + b ) * 0.5;
              vec4 mc = uProj * vec4( m, 1.0 );
              vec2 muv = mc.xy / mc.w * 0.5 + 0.5;
              float mz = ssrViewPos( muv, readDepth( muv ) ).z;
              if ( mz - m.z > 0.0 ) b = m; else a = m;
            }
            vec4 bc = uProj * vec4( b, 1.0 );
            huv = bc.xy / bc.w * 0.5 + 0.5;
            hit = true;
            break;
          }
        }
        if ( ! hit ) return;
        // fade toward the screen edges and for long rays, where the screen has nothing to show
        vec2 e = min( huv, 1.0 - huv );
        float fade = smoothstep( 0.0, 0.08, min( e.x, e.y ) ) * ( 1.0 - smoothstep( 15.0, 40.0, distance( p, vp ) ) );
        // damp asphalt is rough: a wider, blurrier reflection; puddles are mirrors
        float blur = mix( 0.012, 0.0015, clamp( puddle * 3.0, 0.0, 1.0 ) );
        vec3 col = texture2D( inputBuffer, huv ).rgb * 0.4
          + texture2D( inputBuffer, huv + vec2( blur, 0.0 ) ).rgb * 0.15
          + texture2D( inputBuffer, huv - vec2( blur, 0.0 ) ).rgb * 0.15
          + texture2D( inputBuffer, huv + vec2( 0.0, blur * 1.7 ) ).rgb * 0.15
          + texture2D( inputBuffer, huv - vec2( 0.0, blur * 1.7 ) ).rgb * 0.15;
        float cosv = clamp( dot( -v, n ), 0.0, 1.0 );
        float fresnel = 0.02 + 0.98 * pow( 1.0 - cosv, 5.0 );
        float amount = clamp( puddle * 3.0, 0.0, 1.0 ) * mix( 0.25, 1.0, fresnel ) + ( wet - puddle ) * fresnel * 0.5;
        outputColor.rgb = mix( inputColor.rgb, col, clamp( amount * fade * uStrength, 0.0, 0.92 ) );
      }`,
      {
        attributes: EffectAttribute.DEPTH | EffectAttribute.CONVOLUTION,
        blendFunction: BlendFunction.SRC,
        uniforms: new Map([
          ['uProj', new THREE.Uniform(new THREE.Matrix4())],
          ['uInvProj', new THREE.Uniform(new THREE.Matrix4())],
          ['uView', new THREE.Uniform(new THREE.Matrix4())],
          ['uInvView', new THREE.Uniform(new THREE.Matrix4())],
          ['uGroundY', new THREE.Uniform(groundY)],
          ['uStrength', new THREE.Uniform(1)],
          ['uWet', new THREE.Uniform(0.35)],
        ]),
      },
    );
  }

  track(camera) {
    this.uniforms.get('uProj').value.copy(camera.projectionMatrix);
    this.uniforms.get('uInvProj').value.copy(camera.projectionMatrixInverse);
    this.uniforms.get('uView').value.copy(camera.matrixWorldInverse);
    this.uniforms.get('uInvView').value.copy(camera.matrixWorld);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Atmosphere

// Air between the camera and what it sees: distance fades toward the sky's colour (aerial perspective), and
// looking toward the sun the air glows (Henyey-Greenstein forward scattering). Subtle, but it is what makes a
// 60 m alley feel 60 m deep. The sky itself is left alone.
export class AtmosphereEffect extends Effect {
  constructor() {
    super(
      'AtmosphereEffect',
      /* glsl */ `
      uniform mat4 uInvProj, uInvView;
      uniform vec3 uSunDir, uSunColor, uAirColor;
      uniform float uDensity, uGlow;
      void mainImage( const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor ) {
        outputColor = inputColor;
        if ( depth >= 0.99999 || uDensity <= 0.0 ) return;
        vec4 v4 = uInvProj * vec4( uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0 );
        vec3 vp = v4.xyz / v4.w;
        float dist = length( vp );
        vec3 dir = normalize( mat3( uInvView ) * vp );
        float t = exp( - dist * uDensity );
        float mu = dot( dir, uSunDir );
        float g = 0.76;
        float hg = ( 1.0 - g * g ) / ( 12.566 * pow( 1.0 + g * g - 2.0 * g * mu, 1.5 ) );
        vec3 air = uAirColor + uSunColor * hg * uGlow;
        outputColor.rgb = inputColor.rgb * t + air * ( 1.0 - t );
      }`,
      {
        attributes: EffectAttribute.DEPTH,
        blendFunction: BlendFunction.SRC,
        uniforms: new Map([
          ['uInvProj', new THREE.Uniform(new THREE.Matrix4())],
          ['uInvView', new THREE.Uniform(new THREE.Matrix4())],
          ['uSunDir', new THREE.Uniform(new THREE.Vector3(0, 1, 0))],
          ['uSunColor', new THREE.Uniform(new THREE.Color(0, 0, 0))],
          ['uAirColor', new THREE.Uniform(new THREE.Color(0.3, 0.35, 0.4))],
          ['uDensity', new THREE.Uniform(0.003)],
          ['uGlow', new THREE.Uniform(0.2)],
        ]),
      },
    );
  }

  set({ sunDir, sunColor, airColor, density, glow }) {
    if (sunDir) this.uniforms.get('uSunDir').value.copy(sunDir);
    if (sunColor) this.uniforms.get('uSunColor').value.copy(sunColor);
    if (airColor) this.uniforms.get('uAirColor').value.copy(airColor);
    if (density != null) this.uniforms.get('uDensity').value = density;
    if (glow != null) this.uniforms.get('uGlow').value = glow;
  }

  track(camera) {
    this.uniforms.get('uInvProj').value.copy(camera.projectionMatrixInverse);
    this.uniforms.get('uInvView').value.copy(camera.matrixWorld);
  }
}
