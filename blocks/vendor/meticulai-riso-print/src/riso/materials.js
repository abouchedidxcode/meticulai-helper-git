// Riso ink materials. Every object renders into a small G-buffer instead of colours:
//   R = light/shade, G = ink role id, B = glow, A = facing code (for crease outlines).
// The riso print pass (renderer.js) turns that into overprinted halftone inks.
// These materials ignore scene lights and fog on purpose: shade comes from one fixed print light (inkUniforms.uLight).
import * as THREE from 'three';
import { INK, MODE } from './inks.js';

export { INK, MODE };

/** Shared by every ink material. Change .value, never replace the objects. */
export const inkUniforms = {
  uTime: { value: 0 }, // seconds; animates ZONE hatching
  uPx: { value: 1 }, // pixel ratio; keeps hatching the same size on screen (the renderer sets it)
  uScroll: { value: 0 }, // BELT mode: slats scroll along local x by this (advance it in game time)
  uLight: { value: new THREE.Vector3(0.42, 0.82, 0.36) }, // the print light (normalised in the shader)
  uSunDir: { value: new THREE.Vector3(-0.35, 0.22, -1.0) }, // where SKY mode prints the sun disc
};

const VERT = /* glsl */`
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vL = position;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */`
uniform float uId;
uniform float uMode;
uniform float uGlow;
uniform float uTime;
uniform float uPx;
uniform float uScroll;
uniform vec3 uLight;
uniform vec3 uSunDir;
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;

void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 L = normalize(uLight);
  float dif = dot(n, L);
  float s = 0.48 + 0.52 * max(dif, 0.0);
  s -= 0.07 * abs(n.x);
  float glow = uGlow;
  int mode = int(uMode + 0.5);

  if (mode == 1) {
    // floor: printed tile grid
    vec2 g = abs(fract(vW.xz * 0.5) - 0.5);
    float line = smoothstep(0.465, 0.49, max(g.x, g.y));
    vec2 g2 = abs(fract(vW.xz * 0.125) - 0.5);
    float big = smoothstep(0.485, 0.497, max(g2.x, g2.y));
    s = 0.82 - line * 0.42 - big * 0.25;
  } else if (mode == 2 || mode == 14) {
    // walls: ambient occlusion towards the floor + a printed skirting band
    s *= 0.8 + 0.2 * smoothstep(0.0, 1.2, vW.y);
    float band = step(abs(vW.y - 0.18), 0.06);
    s -= band * 0.35;
    if (mode == 14) {
      // paper wall: lattice
      vec2 q = abs(fract(vec2(vW.x + vW.z, vW.y) * vec2(1.6, 1.6)) - 0.5);
      s = max(s, 0.9) - smoothstep(0.44, 0.48, max(q.x, q.y)) * 0.55;
    }
  } else if (mode == 3) {
    // zones: screen-door diagonal hatching, crawling slowly
    float st = fract((gl_FragCoord.x + gl_FragCoord.y) / (9.0 * uPx) - uTime * 0.15);
    float rim = 1.0 - abs(dot(n, normalize(cameraPosition - vW)));
    if (st > 0.22 + rim * 0.25) discard;
    s = 1.0;
  } else if (mode == 4) {
    // mirror: glassy diagonal streaks
    float st = fract((vW.x + vW.y * 0.7 + vW.z) * 0.9);
    s = st < 0.09 ? 1.0 : (st < 0.14 ? 0.15 : 0.45 + 0.25 * max(dif, 0.0));
  } else if (mode == 5) {
    // sky dome (use on a BackSide sphere centred on the world): light toward the zenith, a few horizon bands, a sun
    vec3 d = normalize(vL);
    float h = d.y;
    s = 0.5 + 0.5 * smoothstep(-0.05, 0.55, h);
    float band = sin(h * 70.0 + sin(atan(d.z, d.x) * 3.0) * 2.0);
    s -= smoothstep(0.92, 1.0, band) * (1.0 - smoothstep(0.0, 0.35, h)) * 0.25;
    vec3 sun = normalize(uSunDir);
    float sd = dot(d, sun);
    glow = smoothstep(0.9935, 0.9945, sd);
    glow = max(glow, step(0.988, sd) * step(sd, 0.9895));
  } else if (mode == 6) {
    // drum / roller: glowing stripes round its middle and ends (local y)
    glow = step(abs(vL.y), 0.12) + step(abs(vL.y - 0.38), 0.03) + step(abs(vL.y + 0.38), 0.03);
  } else if (mode == 7) {
    // crate: plank lines
    float pl = abs(fract(vW.y * 2.2) - 0.5);
    s -= smoothstep(0.44, 0.48, pl) * 0.3;
  } else if (mode == 8) {
    // wood: wavy grain on a lighter base
    float gr = abs(fract(vW.y * 7.0 + sin(vW.x * 1.9 + vW.z * 1.3) * 0.7 + sin(vW.x * 7.0) * 0.08) - 0.5);
    s = 0.25 + s * 0.8;
    s -= smoothstep(0.42, 0.5, gr) * 0.16;
  } else if (mode == 9) {
    // checker tiles
    float ch = mod(floor(vW.x) + floor(vW.z), 2.0);
    vec2 g = abs(fract(vW.xz) - 0.5);
    s = 0.92 - ch * 0.3 - smoothstep(0.47, 0.495, max(g.x, g.y)) * 0.3;
  } else if (mode == 10) {
    // tatami: 1 x 2 mats laid in a pinwheel-ish pattern, woven texture
    vec2 c = floor(vW.xz / vec2(1.0, 2.0));
    vec2 f = fract(vW.xz / vec2(1.0, 2.0));
    float flip = mod(c.x + c.y, 2.0);
    vec2 g = flip > 0.5 ? f.yx : f;
    float border = step(0.9, max(abs(g.x - 0.5), abs(g.y - 0.5)) * 2.0);
    float weave = step(0.5, fract((flip > 0.5 ? vW.z : vW.x) * 14.0));
    s = 0.86 - weave * 0.06 - border * 0.45;
  } else if (mode == 11) {
    // carpet: fine dotted pile
    vec2 g = fract(vW.xz * 3.0);
    s = 0.74 + 0.12 * step(0.5, g.x) * step(0.5, g.y);
    vec2 g2 = abs(fract(vW.xz * 0.25) - 0.5);
    s -= smoothstep(0.48, 0.495, max(g2.x, g2.y)) * 0.2;
  } else if (mode == 12) {
    // grate: ribbed metal floor
    s = 0.84 - 0.32 * step(0.82, fract(vW.x * 3.0)) - 0.15 * step(0.94, fract(vW.z * 0.5));
  } else if (mode == 16) {
    // conveyor belt: slats that scroll along local x
    float st = fract(vL.x * 2.2 - uScroll * 2.2);
    s = (n.y > 0.5 ? 0.86 : s) - step(0.8, st) * 0.42 * step(0.5, n.y);
  } else if (mode == 17) {
    // hazard plate: diagonal stripes
    float st = fract((vW.x + vW.z) * 1.4);
    glow = step(0.5, st);
  } else if (mode == 15) {
    // ceiling: pale acoustic tiles, never in deep shadow
    vec2 g = abs(fract(vW.xz * 0.5) - 0.5);
    s = 0.8 - smoothstep(0.46, 0.49, max(g.x, g.y)) * 0.3;
  } else if (mode == 13) {
    // metal panels with seams
    float seam = step(0.96, fract(vW.y * 1.6)) + step(0.98, fract((vW.x + vW.z) * 0.8));
    s -= seam * 0.25;
  }

  float code = dot(n, vec3(0.267, 0.535, 0.802)) * 0.5 + 0.5;
  gl_FragColor = vec4(clamp(s, 0.0, 1.0), uId / 255.0, clamp(glow, 0.0, 1.0), code);
}`;

function shared(u) {
  u.uTime = inkUniforms.uTime;
  u.uPx = inkUniforms.uPx;
  u.uScroll = inkUniforms.uScroll;
  u.uLight = inkUniforms.uLight;
  u.uSunDir = inkUniforms.uSunDir;
  return u;
}

const cache = new Map();

/**
 * The ink material for a role. Cached: the same arguments return the same material.
 * @param {number} id an INK role
 * @param {number} [mode] a MODE surface pattern
 * @param {number} [glow] 0..1, printed as extra ink by some roles (FX, TURRET, MACHINE)
 * @param {number} [side] THREE.FrontSide | BackSide | DoubleSide
 */
export function mat(id, mode = 0, glow = 0, side = THREE.FrontSide) {
  const key = `${id}|${mode}|${glow}|${side}`;
  let m = cache.get(key);
  if (m) return m;
  m = new THREE.ShaderMaterial({
    uniforms: shared({ uId: { value: id }, uMode: { value: mode }, uGlow: { value: glow } }),
    vertexShader: VERT,
    fragmentShader: FRAG,
    side,
  });
  // the view model is drawn first and marks the stencil; the world skips those pixels
  m.stencilWrite = true;
  m.stencilWriteMask = 0x00;
  m.stencilFunc = THREE.NotEqualStencilFunc;
  m.stencilRef = 1;
  cache.set(key, m);
  return m;
}

const decalCache = new Map();
/** Decals sit on surfaces: polygon offset pulls them forward so they never z-fight. */
export function decalMat(id) {
  let m = decalCache.get(id);
  if (m) return m;
  m = mat(id).clone();
  shared(m.uniforms);
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -4;
  m.side = THREE.DoubleSide;
  decalCache.set(id, m);
  return m;
}

const vmCache = new Map();
/**
 * First-person view-model variant of a material (hands, held items): writes stencil = 1 so the world skips
 * those pixels, and swaps PICKUP/ITEM to VM_PICKUP and FX to VM_FX (the post pass gives them a fixed depth).
 */
export function vmMaterial(m) {
  let v = vmCache.get(m);
  if (v) return v;
  v = m.clone();
  shared(v.uniforms);
  const id = v.uniforms.uId.value;
  if (id === INK.PICKUP || id === INK.ITEM) v.uniforms.uId.value = INK.VM_PICKUP;
  if (id === INK.FX) v.uniforms.uId.value = INK.VM_FX;
  v.stencilWrite = true;
  v.stencilWriteMask = 0xff;
  v.stencilFunc = THREE.AlwaysStencilFunc;
  v.stencilZPass = THREE.ReplaceStencilOp;
  v.stencilRef = 1;
  vmCache.set(m, v);
  return v;
}
