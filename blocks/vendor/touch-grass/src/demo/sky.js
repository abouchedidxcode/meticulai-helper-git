// The demo's sky and the light that goes with it, from one number: the hour. Colours are keyed to how high the sun
// is and blended between; the dome draws a gradient, the sun, a layer of drifting cloud and, at night, stars.
import * as THREE from 'three';
import { COMMON } from '../lib/index.js';

// e: degrees the sun is above the horizon. Colours in linear light.
const KEYS = [
  { e: -14, sun: [0.07, 0.09, 0.15], amb: [0.012, 0.017, 0.032], bounce: [0.004, 0.005, 0.008], zenith: [0.004, 0.007, 0.018], horizon: [0.014, 0.02, 0.04], glow: [0, 0, 0], fog: [0.01, 0.014, 0.027], fogSun: [0.012, 0.016, 0.03], haze: 0.0011, exposure: 2.6, cloudLit: [0.03, 0.04, 0.07], cloudDark: [0.008, 0.011, 0.02], stars: 1, disc: 0 },
  { e: -5, sun: [0.1, 0.07, 0.07], amb: [0.045, 0.055, 0.1], bounce: [0.012, 0.012, 0.018], zenith: [0.02, 0.038, 0.11], horizon: [0.32, 0.13, 0.09], glow: [0.9, 0.3, 0.1], fog: [0.07, 0.065, 0.1], fogSun: [0.5, 0.2, 0.1], haze: 0.0011, exposure: 1.9, cloudLit: [0.55, 0.2, 0.13], cloudDark: [0.03, 0.035, 0.07], stars: 0.35, disc: 0 },
  { e: 1.5, sun: [3.2, 1.3, 0.45], amb: [0.15, 0.19, 0.33], bounce: [0.05, 0.04, 0.03], zenith: [0.055, 0.12, 0.36], horizon: [0.85, 0.42, 0.22], glow: [2.6, 0.95, 0.25], fog: [0.4, 0.3, 0.3], fogSun: [1.9, 0.75, 0.25], haze: 0.001, exposure: 1.2, cloudLit: [1.8, 0.8, 0.38], cloudDark: [0.13, 0.12, 0.2], stars: 0, disc: 26 },
  { e: 9, sun: [6.4, 3.6, 1.6], amb: [0.14, 0.2, 0.36], bounce: [0.09, 0.08, 0.045], zenith: [0.075, 0.185, 0.5], horizon: [0.95, 0.66, 0.42], glow: [2.6, 1.35, 0.5], fog: [0.6, 0.5, 0.46], fogSun: [2.0, 1.2, 0.5], haze: 0.0008, exposure: 0.95, cloudLit: [2.3, 1.6, 0.95], cloudDark: [0.28, 0.27, 0.38], stars: 0, disc: 40 },
  { e: 30, sun: [4.4, 4.0, 3.4], amb: [0.34, 0.47, 0.76], bounce: [0.12, 0.12, 0.07], zenith: [0.07, 0.22, 0.62], horizon: [0.6, 0.74, 0.92], glow: [0.8, 0.7, 0.5], fog: [0.56, 0.68, 0.86], fogSun: [0.95, 0.9, 0.8], haze: 0.0006, exposure: 0.72, cloudLit: [2.4, 2.35, 2.25], cloudDark: [0.42, 0.47, 0.6], stars: 0, disc: 60 },
  { e: 62, sun: [4.6, 4.4, 4.0], amb: [0.36, 0.5, 0.82], bounce: [0.13, 0.13, 0.08], zenith: [0.055, 0.2, 0.64], horizon: [0.52, 0.7, 0.95], glow: [0.5, 0.5, 0.45], fog: [0.55, 0.68, 0.9], fogSun: [0.8, 0.82, 0.85], haze: 0.00055, exposure: 0.68, cloudLit: [2.6, 2.6, 2.6], cloudDark: [0.5, 0.56, 0.7], stars: 0, disc: 60 },
];

function blend(e) {
  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (e >= KEYS[i].e && e <= KEYS[i + 1].e) {
      a = KEYS[i];
      b = KEYS[i + 1];
      break;
    }
  }
  if (e <= KEYS[0].e) b = a;
  if (e >= b.e) a = b;
  const t = a === b ? 0 : (e - a.e) / (b.e - a.e);
  const out = {};
  for (const k of Object.keys(a)) out[k] = Array.isArray(a[k]) ? a[k].map((v, i) => v + (b[k][i] - v) * t) : a[k] + (b[k] - a[k]) * t;
  return out;
}

const vertex = /* glsl */ `
out vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
}
`;

const fragment = /* glsl */ `
${COMMON}
layout(location = 0) out vec4 outC;
in vec3 vDir;
uniform vec3 uZenith, uHorizon, uGlow, uCloudLit, uCloudDark, uLightDir;
uniform float uStars, uDisc, uCover;

float cloud(vec2 p) {
  return texture(tNoiseHi, p).r * 0.52 + texture(tNoiseHi, p * 2.9 + 0.31).g * 0.27 + texture(tNoiseHi, p * 7.3 + 0.7).b * 0.14 + texture(tNoiseHi, p * 19.0 + 0.2).a * 0.07;
}

void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, 1.0 - exp(-5.0 * h));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uGlow * (pow(sd, 7.0) * 0.28 + pow(sd, 70.0) * 0.8 + pow(sd, 900.0) * 3.0) * (1.0 - 0.5 * h);
  col += uSunColor * uDisc * smoothstep(0.99990, 0.99996, dot(d, uSunDir));
  if (uStars > 0.0 && d.y > 0.0) {
    // one star to a cell of the sky, a soft point somewhere inside it
    vec2 sp = vec2(atan(d.z, d.x) * 150.0, asin(d.y) * 150.0);
    vec2 g = floor(sp);
    float s = hash12(g);
    vec2 off = sp - g - 0.5 - (vec2(hash12(g + 11.0), hash12(g + 23.0)) - 0.5) * 0.6;
    col += vec3(0.8, 0.86, 1.0) * step(0.93, s) * exp(-dot(off, off) * 55.0) * uStars * (0.3 + 2.2 * hash12(g + 3.0) * hash12(g + 5.0)) * smoothstep(0.02, 0.25, d.y);
  }
  if (d.y > 0.004) {
    // a flat layer of cloud high up, drifting with the wind
    vec2 p = d.xz / (d.y + 0.13) * 0.06 + uWindScroll * 0.00018;
    float n = cloud(p);
    float cover = smoothstep(uCover, uCover + 0.17, n);
    if (cover > 0.0) {
      // brighter on the side the light comes from
      float towards = cloud(p + uLightDir.xz * 0.016);
      float lit = smoothstep(0.0, 1.0, 0.5 + (n - towards) * 3.2) * (1.0 - 0.35 * cover);
      vec3 c = mix(uCloudDark, uCloudLit, lit) + uGlow * pow(sd, 4.0) * 0.5 * (1.0 - cover * 0.6);
      col = mix(col, c, cover * smoothstep(0.004, 0.09, d.y) * 0.88);
    }
  }
  col = mix(mix(uFogColor, uFogSunColor, pow(sd, 6.0)), col, smoothstep(-0.02, 0.07, d.y));
  outC = vec4(col, 1.0);
}
`;

export function createSky(field) {
  const uniforms = {
    ...field.uniforms,
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uCloudLit: { value: new THREE.Color() },
    uCloudDark: { value: new THREE.Color() },
    uLightDir: { value: new THREE.Vector3() },
    uStars: { value: 0 },
    uDisc: { value: 60 },
    uCover: { value: 0.53 },
  };
  const material = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vertex, fragmentShader: fragment, uniforms, side: THREE.BackSide, depthWrite: false, depthTest: true });
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;

  const sun = new THREE.DirectionalLight(0xffffff, 1);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  const sunDir = new THREE.Vector3();
  const sky = {
    mesh,
    lights: [sun, hemi],
    hour: 19.3,
    exposure: 1,
    sunDir,
    elevation: 0,
    /** hour: 4 to 23. The sun rises in the east at 6, is highest at 13 and sets at 20. */
    setHour(hour) {
      sky.hour = hour;
      const day = (hour - 6) / 14;
      const e = day >= 0 && day <= 1 ? 62 * Math.sin(Math.PI * day) : -Math.min(14, 62 * Math.sin(Math.PI * Math.min(Math.abs(day < 0 ? day : day - 1), 0.5)) * 1.0);
      sky.elevation = e;
      const azimuth = THREE.MathUtils.degToRad(-100 + 200 * THREE.MathUtils.clamp(day, -0.2, 1.2));
      const el = THREE.MathUtils.degToRad(e);
      sunDir.set(Math.cos(el) * Math.sin(azimuth), Math.sin(el), -Math.cos(el) * Math.cos(azimuth));
      const k = blend(e);
      // at night the light comes from the moon, the other way and higher
      const lightDir = e > -3 ? sunDir.clone() : new THREE.Vector3(-sunDir.x, 0.55, -sunDir.z).normalize();
      if (lightDir.y < 0.035) lightDir.setY(0.035).normalize();
      uniforms.uLightDir.value.copy(lightDir);
      field.setLight({
        sunDir: lightDir,
        sunColor: new THREE.Color(...k.sun),
        skyColor: new THREE.Color(...k.amb),
        bounceColor: new THREE.Color(...k.bounce),
        fogColor: new THREE.Color(...k.fog),
        fogSunColor: new THREE.Color(...k.fogSun),
        fogDensity: k.haze,
        cloudShade: e > 4 ? 0.5 : 0.5 * Math.max(0, (e + 3) / 7),
      });
      // the dome wants the real sun for its disc and glow even when the moon lights the ground
      uniforms.uZenith.value.setRGB(...k.zenith);
      uniforms.uHorizon.value.setRGB(...k.horizon);
      uniforms.uGlow.value.setRGB(...k.glow);
      uniforms.uCloudLit.value.setRGB(...k.cloudLit);
      uniforms.uCloudDark.value.setRGB(...k.cloudDark);
      uniforms.uStars.value = k.stars;
      uniforms.uDisc.value = k.disc;
      sky.exposure = k.exposure;
      sun.position.copy(lightDir).multiplyScalar(50);
      sun.color.setRGB(...k.sun);
      sun.intensity = Math.PI;
      hemi.color.setRGB(...k.amb);
      hemi.groundColor.setRGB(...k.bounce);
      hemi.intensity = 3.2;
    },
  };
  sky.setHour(sky.hour);
  return sky;
}
