// Demo: a garden pond. Hover to see where you would touch, hold and drag to trail a finger (a dimple when still, a
// V-shaped wake when moving), double-click to splash; drips fall from a spout. Until you touch it, an invisible
// finger traces a loop by itself.
import * as THREE from 'three';
import { Ripples, createWaterMaterial, UnderPass, applyUnderwater, pondShore } from '../src/index.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3a2c);
const camera = new THREE.PerspectiveCamera(36, 16 / 10, 0.1, 200);
const view = new URLSearchParams(location.search).get('view');
if (view === 'close') { camera.position.set(-1.5, 7.2, 7.4); camera.lookAt(-1.2, 0, 0.4); }
else if (view === 'mid') { camera.position.set(-0.6, 10.5, 9.8); camera.lookAt(-0.6, 0, 0.5); }
else { camera.position.set(0, 15.5, 11.5); camera.lookAt(0, 0, 0.6); }

const time = { value: 0 };
const pond = pondShore();                       // the game's pond: 17 x 10.4 m, 1.5 m deep
const ripples = new Ripples({ rect: pond.rect, quality: 'med', shoreGlsl: pond.glsl });
const sunDir = new THREE.Vector3(-0.5, 0.6, -0.6).normalize();

// light
const sun = new THREE.DirectionalLight(0xffe6c0, 2.6);
sun.position.copy(sunDir).multiplyScalar(30);
scene.add(sun, new THREE.HemisphereLight(0xb8c8e0, 0x4a5a3a, 1.1));

// the bed and the bank: one displaced mesh (pebbly silt under water, moss and gravel above)
function groundHeight(x, z) {
  const sdf = pond.sdf(x, z);
  if (sdf <= 0) {
    const k = Math.min(1, -sdf / 0.55);
    const s = k * k * (3 - 2 * k);
    return 0.07 * (1 - s) - pond.depthAt(x, z) * s;
  }
  const rise = Math.min(1, sdf / 3.5);
  const n2 = Math.sin(x * 0.78 + Math.sin(z * 0.42)) * 0.5 + Math.sin(z * 1.02 + x * 0.24) * 0.5;
  return 0.07 + 0.45 * rise * rise + 0.06 * n2 * Math.min(1, sdf);
}
const geo = new THREE.PlaneGeometry(34, 26, 240, 180).rotateX(-Math.PI / 2);
const P = geo.attributes.position, colors = new Float32Array(P.count * 3);
const c = new THREE.Color();
for (let i = 0; i < P.count; i++) {
  const x = P.getX(i), z = P.getZ(i);
  P.setY(i, groundHeight(x, z));
  const sdf = pond.sdf(x, z);
  const n = Math.sin(x * 9.1) * Math.sin(z * 8.3) * 0.5 + Math.sin(x * 23.7 + z * 17.1) * 0.5;
  const silt = [0.42 + 0.08 * n, 0.38 + 0.06 * n, 0.3 + 0.05 * n];                      // silt and pebbles
  const margin = [0.36 + 0.05 * n, 0.33 + 0.05 * n, 0.27];                              // wet margin
  const moss = [0.2 + 0.05 * n, 0.3 + 0.06 * n, 0.12];                                  // moss
  const k1 = THREE.MathUtils.smoothstep(sdf, -0.4, 0.1), k2 = THREE.MathUtils.smoothstep(sdf, 0.6, 1.6);
  c.setRGB(...[0, 1, 2].map((j) => silt[j] + (margin[j] - silt[j]) * k1 + (moss[j] - margin[j]) * k2));
  colors.set([c.r, c.g, c.b], i * 3);
}
geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
geo.computeVertexNormals();
const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
applyUnderwater(groundMat, ripples, { sunDir, time });
scene.add(new THREE.Mesh(geo, groundMat));

// stones on the bed and the bank, and a few slow fish
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8678, roughness: 0.85 });
applyUnderwater(stoneMat, ripples, { sunDir, time });
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < 26; i++) {
  const a = rnd() * Math.PI * 2, r = 0.25 + rnd() * 0.95;
  const x = Math.cos(a) * pond.hw * r, z = Math.sin(a) * pond.hh * r;
  const s = 0.15 + rnd() * (r > 0.95 ? 0.6 : 0.3);
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), stoneMat);
  m.scale.set(1, 0.55, 1.2);
  m.rotation.y = rnd() * 6;
  m.position.set(x, groundHeight(x, z) + s * 0.2, z);
  scene.add(m);
}
const fishMat = new THREE.MeshStandardMaterial({ color: 0xff7a2a, roughness: 0.5 });
const fishMat2 = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.5 });
applyUnderwater(fishMat, ripples, { sunDir, time });
applyUnderwater(fishMat2, ripples, { sunDir, time });
const fish = [];
for (let i = 0; i < 5; i++) {
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.55, 6, 12).rotateZ(Math.PI / 2), i % 2 ? fishMat2 : fishMat);
  body.scale.set(1, 0.7, 1);
  scene.add(body);
  fish.push({ m: body, r: 2 + i * 0.9, s: (i % 2 ? 1 : -1) * (0.12 + i * 0.02), p: i * 1.3, y: -0.35 - i * 0.08 });
}

// the surface
const water = new THREE.Mesh(new THREE.PlaneGeometry(pond.rect.x1 - pond.rect.x0, pond.rect.z1 - pond.rect.z0).rotateX(-Math.PI / 2),
  createWaterMaterial(ripples, { shoreGlsl: pond.glsl, time, light: { sunDir: sunDir.toArray() } }));
water.renderOrder = 1;
scene.add(water);
const under = new UnderPass(renderer);
water.material.uniforms.uUnder.value = under.texture;
const U = water.material.uniforms;
U.uCalm.value = 0.2;

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  U.uRes.value.copy(under.setSize());
}
addEventListener('resize', resize);
resize();

// input: the mouse as a finger
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
let pointer = null, down = false, last = null, auto = true;
const splashes = [];
function toWater(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
}
const inWater = (p) => p && pond.sdf(p.x, p.z) < -0.05;
renderer.domElement.addEventListener('pointermove', (e) => { pointer = toWater(e); auto = false; });
renderer.domElement.addEventListener('pointerdown', (e) => { pointer = toWater(e); down = true; auto = false; });
addEventListener('pointerup', () => { down = false; });
renderer.domElement.addEventListener('dblclick', (e) => splash(toWater(e), 1));
addEventListener('keydown', (e) => { if (e.code === 'KeyC') U.uCalm.value = U.uCalm.value > 0.5 ? 0.2 : 1; });

function splash(p, power) {
  if (!inWater(p)) return;
  ripples.drop(p.x, p.z, 0.55, 0.14 * power);   // the game's splash
  splashes.push({ x: p.x, z: p.z, age: 0, power });
  if (splashes.length > 4) splashes.shift();
}

const timer = new THREE.Timer();
let dripT = 0, autoT = 0;
function frame() {
  timer.update();
  const dt = Math.min(0.05, timer.getDelta());
  time.value += dt;
  // the invisible finger: a slow loop with a quicker pass now and then
  if (auto) {
    autoT += dt;
    const ph = autoT * 0.5 + 0.5 * Math.sin(autoT * 0.3); // ~1-3 m/s, slowing and quickening
    pointer = new THREE.Vector3(Math.cos(ph) * 4.2, 0, Math.sin(ph * 1.6) * 2.4);
    down = true;
  }
  // a finger in the water sits IN the surface (bodies along its path since the last frame)
  const touching = down && inWater(pointer);
  if (touching) {
    if (!last) ripples.drop(pointer.x, pointer.z, 0.3, -0.07);    // touching down: a small plop
    const a = last ?? pointer;
    const speed = last ? a.distanceTo(pointer) / Math.max(dt, 1e-3) : 0;
    ripples.stroke(a.x, a.z, pointer.x, pointer.z, speed);
    last = pointer.clone();
  } else last = null;
  // drips from a spout at the far bank
  dripT -= dt;
  if (dripT <= 0) { ripples.drop(-6.4, -3.1, 0.12, 0.02); dripT = 0.9 + Math.random() * 0.6; }
  // the touch marker: a meniscus when touching, a dotted ring when hovering over the water
  U.uTips.value[0].set(pointer?.x ?? 0, pointer?.z ?? 0, inWater(pointer) && !auto ? 1 : auto ? 1 : 0, touching ? 1 : 3);
  for (let i = 0; i < 4; i++) {
    const s = splashes[i];
    if (s) { s.age += dt; U.uSplashes.value[i].set(s.x, s.z, s.age, s.age < 3 ? s.power : 0); } else U.uSplashes.value[i].set(0, 0, 0, 0);
  }
  for (const f of fish) {
    const a = time.value * f.s + f.p;
    f.m.position.set(Math.cos(a) * f.r * 1.4, f.y, Math.sin(a) * f.r * 0.7);
    f.m.rotation.y = -a + (f.s > 0 ? -Math.PI / 2 : Math.PI / 2) + Math.PI / 2;
  }
  U.uTime.value = time.value;
  ripples.calm = U.uCalm.value;
  ripples.step(renderer);
  under.render(scene, camera, [water]);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
window.__pond = { ripples, splash: (x, z, p = 1) => splash(new THREE.Vector3(x, 0, z), p), setAuto: (v) => { auto = v; } };
requestAnimationFrame(frame);
