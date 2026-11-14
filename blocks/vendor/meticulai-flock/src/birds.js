// Instanced starlings (from Murmur by Meticulai). The flock's Float32Arrays are used directly as instance attributes,
// so there's no per-frame copying: we only flag the live range for upload.
// Orientation + wing flap happen in the vertex shader (patched Lambert so we keep fog + shadows).
import * as THREE from 'three';

function starlingGeometry() {
  // local space: +Z forward, +Y up, +X right. Units: metres (scaled up ~1.4x from life so they read on screen).
  const v = [];
  const wing = []; // 0 at body .. 1 at tip
  const tri = (a, b, c, wa, wb, wc) => { v.push(...a, ...b, ...c); wing.push(wa, wb, wc); };
  const S = 1.0;
  const nose = [0, 0, 0.17], tail = [0, 0.0, -0.11], top = [0, 0.035, 0.02], bot = [0, -0.03, 0.02];
  const sideL = [-0.04, 0, 0.03], sideR = [0.04, 0, 0.03];
  // body: 8 tris (double diamond)
  tri(nose, top, sideR, 0, 0, 0); tri(nose, sideL, top, 0, 0, 0);
  tri(nose, sideR, bot, 0, 0, 0); tri(nose, bot, sideL, 0, 0, 0);
  tri(tail, sideR, top, 0, 0, 0); tri(tail, top, sideL, 0, 0, 0);
  tri(tail, bot, sideR, 0, 0, 0); tri(tail, sideL, bot, 0, 0, 0);
  // tail fan
  const t0 = [0, 0, -0.09], tl = [-0.045, 0, -0.19], tr = [0.045, 0, -0.19];
  tri(t0, tr, tl, 0, 0, 0);
  // wings: starling wings are short, broad at the base and sharply pointed
  for (const s of [-1, 1]) {
    const rootF = [0.03 * s, 0.005, 0.07], rootB = [0.03 * s, 0.005, -0.045];
    const elbF = [0.16 * s, 0, 0.045], elbB = [0.15 * s, 0, -0.06];
    const tip = [0.31 * s, 0, -0.085];
    if (s > 0) {
      tri(rootF, elbF, rootB, 0.05, 0.5, 0.05); tri(rootB, elbF, elbB, 0.05, 0.5, 0.5);
      tri(elbF, tip, elbB, 0.5, 1, 0.5);
    } else {
      tri(rootF, rootB, elbF, 0.05, 0.05, 0.5); tri(rootB, elbB, elbF, 0.05, 0.5, 0.5);
      tri(elbF, elbB, tip, 0.5, 0.5, 1);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v.map((x) => x * S), 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  g.computeVertexNormals();
  return g;
}

const VERT_HEAD = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec4 iMisc;
attribute float aWing;
uniform float uTime;
uniform float uFlapBoost;
mat3 birdBasis(vec3 vel, float bank) {
  vec3 f = normalize(vel + vec3(0.0, 0.0, 1e-4));
  vec3 r = normalize(cross(f, vec3(0.0, 1.0, 0.0)) + vec3(1e-5, 0.0, 0.0));
  vec3 u = cross(r, f);
  float c = cos(bank), s = sin(bank);
  vec3 r2 = r * c + u * s;
  vec3 u2 = -r * s + u * c;
  // columns map local x(right),y(up),z(fwd); local +X is the bird's right wing
  return mat3(-r2, u2, f);
}
vec3 flap(vec3 p, float wing) {
  float seed = iMisc.z;
  float speed = length(iVel);
  // starlings flap in bursts then glide; glide fraction varies per bird
  float burst = smoothstep(-0.2, 0.6, sin(uTime * 0.9 + seed * 3.1) + uFlapBoost);
  float freq = 15.0 + fract(seed * 0.173) * 4.0;
  float ph = uTime * freq + iMisc.x;
  float s = sin(ph);
  // sharper downstroke
  float stroke = s > 0.0 ? s : s * 0.75;
  float amp = mix(0.06, 0.95, burst);
  float side = sign(p.x);
  float lift = stroke * amp * pow(wing, 1.15) * 0.22;
  p.y += lift;
  p.x -= side * abs(lift) * 0.35 * wing; // wings fold in slightly at the extremes
  p.z += cos(ph) * amp * wing * 0.015;
  return p * iMisc.w;
}
uniform vec3 uCamPos;
uniform vec2 uDistScale; // x: distance where birds start growing, y: max growth
// Far birds are drawn bigger (up to 2.4x past 55 m) so the cloud still reads as birds, not dust.
float distScale() {
  float d = distance(iPos, uCamPos);
  return clamp(d / uDistScale.x, 1.0, uDistScale.y);
}
`;

function patch(shader, withNormals) {
  shader.uniforms.uTime = { value: 0 };
  shader.uniforms.uFlapBoost = { value: 0 };
  shader.uniforms.uCamPos = { value: new THREE.Vector3() };
  shader.uniforms.uDistScale = { value: new THREE.Vector2(55, 2.4) };
  shader.vertexShader = VERT_HEAD + shader.vertexShader;
  if (withNormals) {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `mat3 bb = birdBasis(iVel, iMisc.y);
       vec3 objectNormal = bb * normal;
       #ifdef USE_TANGENT
       vec3 objectTangent = vec3(1.0,0.0,0.0);
       #endif`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `vec3 transformed = bb * flap(position, aWing) * distScale() + iPos;`
    );
  } else {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `mat3 bb = birdBasis(iVel, iMisc.y);
       vec3 transformed = bb * flap(position, aWing) * distScale() + iPos;`
    );
  }
  return shader;
}

export class Birds {
  /**
   * @param {import('./flock.js').Flock} flock
   * @param {{ color?: THREE.ColorRepresentation, growFrom?: number, growMax?: number }} [opts] bird colour (near
   *   black against a bright sky), and the distance-based size boost (55 m, 2.4x in the game)
   */
  constructor(flock, opts = {}) {
    this.flock = flock;
    const g = starlingGeometry();
    this.iPos = new THREE.InstancedBufferAttribute(flock.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.iVel = new THREE.InstancedBufferAttribute(flock.vel, 3).setUsage(THREE.DynamicDrawUsage);
    this.iMisc = new THREE.InstancedBufferAttribute(flock.misc, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.iPos);
    g.setAttribute('iVel', this.iVel);
    g.setAttribute('iMisc', this.iMisc);
    g.instanceCount = 0;
    this.geometry = g;

    this.shaders = [];
    this.grow = new THREE.Vector2(opts.growFrom ?? 55, opts.growMax ?? 2.4);
    const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(opts.color ?? new THREE.Color(0.022, 0.02, 0.024)), side: THREE.DoubleSide });
    mat.onBeforeCompile = (s) => { patch(s, true); s.uniforms.uDistScale.value = this.grow; this.shaders.push(s); };
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    depth.onBeforeCompile = (s) => { patch(s, false); s.uniforms.uDistScale.value = this.grow; this.shaders.push(s); };

    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.customDepthMaterial = depth;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.flapBoost = 0;
  }

  /** Call once per frame after flock.step: uploads the live range and sets time (flap) and camera position. */
  update(time, camPos) {
    const n = this.flock.count;
    this.geometry.instanceCount = n;
    for (const a of [this.iPos, this.iVel, this.iMisc]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
    for (const s of this.shaders) { s.uniforms.uTime.value = time; s.uniforms.uFlapBoost.value = this.flapBoost; if (camPos) s.uniforms.uCamPos.value.copy(camPos); }
  }
}
