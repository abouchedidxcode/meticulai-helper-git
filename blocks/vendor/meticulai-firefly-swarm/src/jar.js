/**
 * A glass jar on an old stump. Glass is faked (no transmission pass): thin tinted body, fresnel edges reflecting the
 * sky, two streaks of afterglow highlight, and when it holds fireflies the walls light up from inside (light gathers
 * in the glass at grazing angles, so the outline glows brightest). The fireflies inside are GPU points drifting in the
 * jar's volume; a soft inner haze sprite fills it with light as it fills up. Its own light reaches the world through
 * the look's fake local lights (writeLights).
 */
import * as THREE from 'three';
import { GLSL_COMMON } from './look.js';

/** Jar height and radius (world units). */
export const JAR_H = 0.36;
export const JAR_R = 0.12;
const MAX_IN = 90;

export class Jar {
  /** @param {import('./look.js').Look} U the shared look uniforms */
  constructor(U) {
    this.U = U;
    this.group = new THREE.Group();
    /** 0..1 how full / bright the jar glows (ease it toward jarGlow(score)). */
    this.glow = 0;
    /** Number of fireflies drawn inside (up to 90). */
    this.count = 0;
    /** A pulse when something drops in (decays by itself). */
    this.pulse = 0;
    this.uni = { uGlow: { value: 0 }, uPulse: { value: 0 }, uCount: { value: 0 } };
    /** World position of the jar's centre (for the release zone and the light). */
    this.center = new THREE.Vector3();
    /** World position of the jar's mouth (fireflies fly to it). */
    this.mouth = new THREE.Vector3();
    // mason-jar profile (radius, height)
    /** @type {THREE.Vector2[]} */
    const prof = [];
    const R = JAR_R, H = JAR_H;
    /** @type {[number, number][]} */
    const pts = [
      [0.0, 0.0], [R * 0.8, 0.0], [R * 0.97, 0.012], [R, 0.04], [R, H * 0.72], [R * 0.96, H * 0.8], [R * 0.8, H * 0.87],
      [R * 0.72, H * 0.9], [R * 0.72, H * 0.97], [R * 0.75, H * 0.985], [R * 0.75, H],
    ];
    for (const [r, h] of pts) prof.push(new THREE.Vector2(r, h));
    const glassGeo = new THREE.LatheGeometry(prof, 48);
    const glassMat = (/** @type {THREE.Side} */ side) => new THREE.ShaderMaterial({
      uniforms: { ...U, ...this.uni },
      transparent: true, depthWrite: false, side,
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vW; varying float vH;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vH = position.y / ${H.toFixed(3)};
          vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL_COMMON}
        uniform float uGlow, uPulse;
        varying vec3 vN; varying vec3 vW; varying float vH;
        void main() {
          vec3 V = normalize(uCamPos - vW);
          vec3 N = normalize(vN);
          if (!gl_FrontFacing) N = -N;
          float ndv = abs(dot(N, V));
          float fr = pow(1.0 - ndv, 3.0);
          vec3 R = reflect(-V, N);
          // the sky reflected in the glass
          vec3 sky = mix(uHorizon, uZenith, smoothstep(-0.05, 0.6, R.y));
          sky += uSunCol * pow(max(dot(R, uSunDir), 0.0), 12.0) * (1.0 - uDusk * 0.7);
          // two vertical window-like streaks of light on the body
          float az = atan(N.x, N.z);
          float streak = smoothstep(0.1, 0.0, abs(az - 0.55)) * 0.8 + smoothstep(0.05, 0.0, abs(az + 0.8)) * 0.35;
          streak *= smoothstep(0.06, 0.15, vH) * (1.0 - smoothstep(0.7, 0.78, vH));
          vec3 col = sky * (0.06 + fr * 0.9) + uSunCol * streak * (0.35 + 0.4 * (1.0 - uDusk)) + vec3(0.6, 0.7, 0.75) * streak * 0.15;
          // light from the fireflies inside, caught in the glass, strongest at grazing angles and the base
          vec3 warm = vec3(1.0, 0.72, 0.34);
          float g = uGlow + uPulse * 0.5;
          col += warm * g * (0.25 + 1.6 * fr + 0.6 * smoothstep(0.12, 0.0, vH)) * (gl_FrontFacing ? 1.0 : 0.6);
          col += localLight(vW, N, 0.5) * 0.25;
          float a = clamp(0.08 + fr * 0.75 + streak * 0.5 + g * 0.18, 0.0, 0.95);
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.glassBack = new THREE.Mesh(glassGeo, glassMat(THREE.BackSide));
    this.glassFront = new THREE.Mesh(glassGeo, glassMat(THREE.FrontSide));
    this.glassBack.renderOrder = 8;
    this.glassFront.renderOrder = 12;

    // brass band around the neck
    const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.78, R * 0.78, H * 0.07, 40, 1, true), new THREE.ShaderMaterial({
      uniforms: { ...U, ...this.uni },
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        ${GLSL_COMMON}
        uniform float uGlow;
        varying vec3 vN; varying vec3 vW;
        void main() {
          vec3 V = normalize(uCamPos - vW); vec3 N = normalize(vN);
          vec3 R = reflect(-V, N);
          vec3 brass = vec3(0.32, 0.26, 0.18);
          vec3 env = mix(uHorizon, uZenith, smoothstep(-0.1, 0.6, R.y)) + uSunCol * pow(max(dot(R, uSunDir), 0.0), 8.0) * (1.0 - uDusk);
          float thread = 0.75 + 0.25 * sin(vW.y * 900.0);
          vec3 col = (brass * env * 0.6 + brass * vec3(1.0, 0.7, 0.35) * uGlow * 0.4 + brass * localLight(vW, N, 0.3) * 1.2) * thread;
          gl_FragColor = vec4(applyHaze(col, vW), 1.0);
        }`,
    }));
    band.position.y = H * 0.935;

    // inner haze: soft light filling the jar
    this.haze = new THREE.Mesh(new THREE.PlaneGeometry(R * 3.4, H * 1.5), new THREE.ShaderMaterial({
      uniforms: { ...this.uni, uTime: U.uTime },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uGlow, uPulse, uTime; varying vec2 vUv;
        void main() {
          vec2 p = (vUv - vec2(0.5, 0.42)) * vec2(1.0, 1.25);
          float r2 = dot(p, p);
          float core = exp(-r2 * 14.0);
          float wide = exp(-r2 * 4.0) * 0.35;
          float g = uGlow * (0.92 + 0.08 * sin(uTime * 1.7)) + uPulse * 0.6;
          vec2 e = smoothstep(vec2(0.0), vec2(0.22), vUv) * smoothstep(vec2(0.0), vec2(0.22), 1.0 - vUv); // no visible quad edge
          gl_FragColor = vec4(vec3(1.0, 0.7, 0.32) * (core * 0.9 + wide) * g * e.x * e.y, 1.0);
        }`,
    }));
    this.haze.position.y = H * 0.45;
    this.haze.renderOrder = 10;

    // fireflies inside
    const pos = new Float32Array(MAX_IN * 3), seed = new Float32Array(MAX_IN * 4);
    let s = 5; const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < MAX_IN; i++) {
      const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * R * 0.72;
      pos.set([Math.cos(a) * rad, 0.03 + r() * H * 0.7, Math.sin(a) * rad], i * 3);
      seed.set([r() * 100, 2 + r() * 3, i, r()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.inside = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { ...this.uni, uTime: U.uTime, uPx: { value: 800 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime, uCount, uPx; attribute vec4 aSeed; varying float vB;
        void main() {
          vec3 p = position;
          float s = aSeed.x;
          p.x += sin(uTime * 0.6 + s) * 0.018; p.z += cos(uTime * 0.5 + s * 1.3) * 0.018;
          p.y += sin(uTime * 0.4 + s * 2.0) * 0.025;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float ph = fract((uTime + s) / aSeed.y);
          vB = (0.35 + (ph < 0.25 ? pow(sin(ph / 0.25 * 3.14159), 2.0) : 0.0) * 0.9) * step(aSeed.z, uCount - 0.5);
          gl_PointSize = min(0.16 * uPx / max(-mv.z, 0.1), 80.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vB;
        void main() {
          vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c) * 4.0;
          if (r2 > 1.0 || vB < 0.01) discard;
          float k = exp(-r2 * 40.0) * 2.6 + exp(-r2 * 6.0) * 0.25;
          gl_FragColor = vec4(vec3(1.0, 0.8, 0.42) * k * vB, 1.0);
        }`,
    }));
    this.inside.renderOrder = 9;
    this.inside.frustumCulled = false;

    // the stump it stands on
    const stump = this.makeStump();

    const jar = new THREE.Group();
    jar.add(this.glassBack, this.inside, this.haze, this.glassFront, band);
    jar.position.y = 0.0;
    jar.rotation.z = -0.02;
    stump.position.y = -0.0;
    this.group.add(stump, jar);
    this.jarGroup = jar;
  }

  /** @returns {THREE.Mesh} */
  makeStump() {
    const U = this.U;
    const geo = new THREE.CylinderGeometry(0.2, 0.27, 1.2, 28, 6);
    geo.translate(0, -0.6, 0);
    // roughen the bark
    const p = geo.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + 0.06 * Math.sin(a * 7 + y * 3) + 0.04 * Math.sin(a * 17);
      if (Math.abs(y) > 0.001) p.setXYZ(i, x * k, y, z * k);
    }
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { ...U, ...this.uni },
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; varying vec3 vL; void main() { vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        ${GLSL_COMMON}
        uniform float uGlow;
        varying vec3 vN; varying vec3 vW; varying vec3 vL;
        void main() {
          vec3 N = normalize(vN);
          float top = smoothstep(0.6, 0.9, N.y);
          float a = atan(vL.z, vL.x);
          float bark = vnoise(vec2(a * 6.0, vL.y * 30.0)) * 0.6 + vnoise(vec2(a * 20.0, vL.y * 4.0)) * 0.4;
          float rings = 0.5 + 0.5 * sin(length(vL.xz) * 140.0 + vnoise(vL.xz * 20.0) * 3.0);
          vec3 alb = mix(vec3(0.06, 0.045, 0.03) * (0.6 + 0.6 * bark), mix(vec3(0.12, 0.085, 0.05), vec3(0.16, 0.115, 0.07), rings) * (0.8 + 0.4 * bark), top);
          vec3 col = alb * (uAmbient * (0.5 + 0.5 * N.y) + 0.02);
          // the jar's own light pooling on the stump top and spilling down the bark
          vec3 jarP = vec3(0.0, 0.12, 0.0);
          float d = length(vL - jarP);
          col += alb * vec3(1.0, 0.68, 0.32) * uGlow * 2.6 / (1.0 + d * d * 40.0);
          col += alb * localLight(vW, N, 0.3) * 2.0;
          gl_FragColor = vec4(applyHaze(col, vW), 1.0);
        }`,
    }));
  }

  /** Stands the jar (on its stump) at world point p. @param {THREE.Vector3} p */
  place(p) {
    this.group.position.copy(p);
    this.group.updateMatrixWorld(true);
    this.center.set(0, JAR_H * 0.45, 0).applyMatrix4(this.jarGroup.matrixWorld);
    this.mouth.set(0, JAR_H, 0).applyMatrix4(this.jarGroup.matrixWorld);
  }

  /** Same pixel scale as FireflyView.setPixelScale. @param {number} px */
  setPixelScale(px) { /** @type {THREE.ShaderMaterial} */ (this.inside.material).uniforms.uPx.value = px; }

  /** @param {number} dt @param {THREE.Camera} camera */
  update(dt, camera) {
    this.pulse = Math.max(0, this.pulse - dt * 1.6);
    this.uni.uGlow.value = this.glow;
    this.uni.uPulse.value = this.pulse;
    this.uni.uCount.value = Math.min(MAX_IN, this.count);
    this.haze.quaternion.copy(camera.quaternion);
  }
}
