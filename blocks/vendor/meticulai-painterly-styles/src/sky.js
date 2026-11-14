// A sky dome that each style repaints: Kite Race's sky (gradient, sun glow, warm horizon band, streaky clouds, sun
// disc, moon and stars at night, the same haze as the world near the horizon), then the style's own painted sky on top
// (stSky: curling contour-line clouds and a scalloped gold sun for the miniature, heaped cumulus with lit tops and
// lilac undersides for the gouache, one smooth gradient with flat pastel clouds for clean).
// Drawn at the far plane (depth 1), so the post pass treats it as sky.
import * as THREE from 'three';
import { STYLE_GLSL, STYLE_SKY } from './style-glsl.js';
import { STYLE_U } from './patch-material.js';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
${STYLE_GLSL}
uniform vec3 uSunDir, uZenith, uHorizon, uSunGlow, uCloudLit, uCloudShade, uFogColor, uFogSun;
uniform float uSunDisk, uCloudCover, uTime, uFogDensity, uFogFalloff, uFogSunPow;
varying vec3 vDir;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * n2(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
// the air's colour along a ray: the haze, warmer toward the sun
vec3 atmoColor(vec3 rd) {
  float s = max(dot(rd, uSunDir), 0.0);
  return mix(uFogColor, uFogSun, pow(s, uFogSunPow));
}
// exponential height haze integrated from the eye over dist metres
float atmoAmount(vec3 ro, vec3 rd, float dist) {
  float b = uFogFalloff;
  float ry = rd.y;
  if (abs(ry) < 1e-3) ry = ry < 0.0 ? -1e-3 : 1e-3;
  float f = (uFogDensity / b) * exp(-max(ro.y, 0.0) * b) * (1.0 - exp(-dist * ry * b)) / ry;
  return 1.0 - exp(-max(f, 0.0));
}
${STYLE_SKY}
void main() {
  vec3 rd = normalize(vDir);
  float y = max(rd.y, 0.0);
  float s = max(dot(rd, uSunDir), 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(y, 0.55));
  col += uSunGlow * (pow(s, 2.0) * 0.28 * (1.0 - uNight) + pow(s, 6.0) * 0.55 + pow(s, 48.0) * 0.9);
  // a low warm band all round the horizon, deepest toward the sun
  col = mix(col, col * vec3(1.05, 0.86, 0.66), (1.0 - smoothstep(0.0, 0.16, y)) * (0.12 + 0.55 * s * s) * (1.0 - uNight));
  // clouds on a plane high up, drawn out into streaks
  if (rd.y > 0.0) {
    vec2 uv = rd.xz / (rd.y + 0.06) * 1.6 * vec2(0.38, 1.0) + vec2(uTime * 0.004, uTime * 0.0017);
    float c = fbm(uv * 0.9);
    float c2 = fbm(uv * 3.1 + 4.0);
    float cov = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.32, c * 0.75 + c2 * 0.35);
    cov *= smoothstep(0.0, 0.12, rd.y);
    float lit = clamp(0.5 + (c2 - 0.5) * 1.4 + pow(s, 4.0) * 0.6, 0.0, 1.0);
    vec3 cc = mix(uCloudShade, uCloudLit, lit);
    cc += uSunGlow * pow(s, 10.0) * 0.8 * (1.0 - cov * 0.6); // silver lining near the sun
    col = mix(col, cc, cov * 0.85);
  }
  // sun disc, or the moon at night
  col += uSunGlow * smoothstep(0.99965, 0.99985, s) * uSunDisk * (1.0 - uNight);
  if (uNight > 0.0) {
    float m = smoothstep(0.99983, 0.99989, s);
    float mott = 0.85 + 0.15 * sin(rd.x * 900.0) * sin(rd.y * 700.0);
    col += vec3(0.95, 0.92, 0.85) * m * 0.85 * mott * uNight + vec3(0.3, 0.32, 0.4) * (pow(s, 2000.0) * 0.35 + pow(s, 120.0) * 0.06) * uNight;
  }
  if (uNight > 0.0 && rd.y > 0.0) {
    vec3 q = rd * 380.0;
    vec3 iq = floor(q);
    float h = fract(sin(dot(iq, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float st = step(0.9989, h) * (0.3 + 0.7 * fract(h * 91.7));
    float tw = 0.7 + 0.3 * sin(uTime * (2.0 + h * 5.0) + h * 40.0);
    st *= smoothstep(0.03, 0.25, rd.y) * tw;
    col += vec3(0.85, 0.9, 1.0) * st * 0.9 * uNight;
  }
  col = stSky(rd, col);
  // the same air as the world, seen from the camera over a long distance; a style paints its own sky, so less haze
  // over it above the horizon band
  float fa = atmoAmount(cameraPosition, rd, 9000.0);
  if (uStyle > 0.5) fa *= mix(1.0, uStyle > 1.5 && uStyle < 2.5 ? 0.35 : 0.6, smoothstep(0.0, 0.08, rd.y));
  col = mix(col, atmoColor(rd), fa * mix(1.0, 0.9, smoothstep(0.0, 0.12, rd.y)) * mix(1.0, 0.5, smoothstep(0.06, 0.45, rd.y)));
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * The sky dome. Its uniforms (`sky.material.uniforms`) are set by applyLook (index.js) from a Look; `uTime` drifts the
 * clouds (set it each frame). Add it to your scene; remove scene.background (or leave it, the dome covers it).
 * @param {{ radius?: number }} [o]
 * @returns {THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>}
 */
export function createStyleSky({ radius = 1000 } = {}) {
  const c = (hex) => ({ value: new THREE.Color(hex) });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...STYLE_U, // shared by reference: switching style switches the sky too
      uSunDir: { value: new THREE.Vector3(0, 0.25, -1).normalize() },
      uZenith: c(0x4f80c0), uHorizon: c(0xf6d6a4), uSunGlow: c(0xffd486),
      uCloudLit: c(0xfff0d6), uCloudShade: c(0xa8a6b4), uFogColor: c(0xdcc6a6), uFogSun: c(0xffc678),
      uSunDisk: { value: 24 }, uCloudCover: { value: 0.5 }, uTime: { value: 0 },
      uFogDensity: { value: 0.0015 }, uFogFalloff: { value: 0.009 }, uFogSunPow: { value: 4 },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), material);
  sky.name = 'painterly-sky';
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  // follow the camera so the dome never clips
  sky.onBeforeRender = (_r, _s, cam) => { sky.position.copy(cam.position); sky.updateMatrixWorld(); };
  return sky;
}
