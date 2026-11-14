// Demo: a procedural night meadow, the swarm, a jar, and the mouse as a hand.
// URL switches: ?dusk=0.85 (0 amber .. 1 night), ?jar=12 (start with fireflies in the jar), ?seed=3
import * as THREE from 'three';
import {
  Flies, FireflyView, Jar, JAR_H, FireflyCatcher, PointerHand, createCameraSpace, createLook, setDusk, writeLights,
  GLSL_COMMON, jarGlow, addToJar,
} from '../src/index.js';

const Q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 2000);
const CAM_BASE = new THREE.Vector3(0, 0.95, 5.2);
const LOOK_BASE = new THREE.Vector3(0, 1.12, -10);
camera.position.copy(CAM_BASE);
camera.lookAt(LOOK_BASE);
camera.updateMatrixWorld();

const look = createLook();
let dusk = Number(Q.get('dusk') ?? 0.8);
setDusk(look, dusk);

// ---------------------------------------------------------------- the meadow (demo only: sky, ground, grass)
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
  uniforms: look, side: THREE.BackSide, depthWrite: false,
  vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    ${GLSL_COMMON}
    varying vec3 vD;
    void main() {
      float h = vD.y;
      vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
      c = mix(c, uZenith, smoothstep(0.12, 0.7, h));
      float s = max(dot(vD, uSunDir), 0.0);
      c += uSunCol * pow(s, 6.0) * 0.35 * (1.0 - uDusk * 0.6);
      // stars come out with the night
      vec2 g = vec2(atan(vD.z, vD.x) * 120.0, vD.y * 160.0);
      vec2 f = fract(g) - 0.5 - (vec2(hash12(floor(g) + 7.0), hash12(floor(g) + 9.0)) - 0.5) * 0.6;
      float st = step(0.985, hash12(floor(g))) * smoothstep(0.14, 0.0, length(f)) * smoothstep(0.55, 1.0, uDusk) * smoothstep(0.08, 0.4, h);
      c += vec3(0.8, 0.85, 1.0) * st * 0.6 * (0.6 + 0.4 * sin(uTime * 2.0 + hash12(floor(g) + 3.0) * 30.0));
      gl_FragColor = vec4(c, 1.0);
    }`,
}));
scene.add(sky);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
  uniforms: look,
  vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: /* glsl */ `
    ${GLSL_COMMON}
    varying vec3 vW;
    void main() {
      float n = vnoise(vW.xz * 1.7) * 0.6 + vnoise(vW.xz * 7.0) * 0.4;
      vec3 alb = mix(vec3(0.05, 0.07, 0.035), vec3(0.09, 0.1, 0.05), n);
      vec3 col = alb * (uAmbient * 0.6 + uGround) + alb * localLight(vW, vec3(0.0, 1.0, 0.0), 0.3) * 2.0;
      gl_FragColor = vec4(applyHaze(col, vW), 1.0);
    }`,
}));
scene.add(ground);

// simple instanced grass blades, lit by the fireflies through localLight (fireflies dip behind them)
{
  const N = 14000;
  let s = 7;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const base = new THREE.BufferGeometry();
  base.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0], 3));
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', base.getAttribute('position'));
  const a = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const z = 3.6 - Math.pow(r(), 0.8) * 22;
    const half = 2.5 + (4.2 - z) * 0.5;
    a.set([(r() * 2 - 1) * half, z, 0.18 + r() * 0.42, 0.025 + r() * 0.02], i * 4);
  }
  geo.setAttribute('aI', new THREE.InstancedBufferAttribute(a, 4));
  geo.instanceCount = N;
  const blades = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: look, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec4 aI; uniform float uTime; varying vec3 vW; varying float vT;
      void main() {
        float t = position.y;
        float ph = aI.x * 3.1 + aI.y * 1.7;
        vec3 p = vec3(aI.x + position.x * aI.w * (1.0 - t) + (sin(uTime * 1.3 + ph) * 0.05 + 0.04) * t * t, t * aI.z, aI.y + sin(ph * 2.0) * 0.03 * t);
        vW = p; vT = t;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_COMMON}
      varying vec3 vW; varying float vT;
      void main() {
        vec3 alb = mix(vec3(0.03, 0.05, 0.02), vec3(0.12, 0.16, 0.06), vT);
        vec3 col = alb * (uAmbient * 0.8 + uGround) + alb * localLight(vW, vec3(0.0), 1.0) * 2.6;
        gl_FragColor = vec4(applyHaze(col, vW), 1.0);
      }`,
  }));
  blades.frustumCulled = false;
  scene.add(blades);
}

// ---------------------------------------------------------------- the block
const space = createCameraSpace(camera);
const flies = new Flies(space, Number(Q.get('seed') ?? 3));
const view = new FireflyView(look);
scene.add(view.group);
const jar = new Jar(look);
scene.add(jar.group);

const msgEl = /** @type {HTMLElement} */ (document.getElementById('msg'));
let msgT = 0;
function hint(text, s = 2.2) { msgEl.textContent = text; msgEl.classList.add('on'); msgT = s; }

const catcher = new FireflyCatcher({
  flies, jar,
  aspect: () => innerWidth / innerHeight,
  onEvent(type, d) {
    if (type === 'catch') hint(d.flies.length > 1 ? `${d.flies.length} at once` : 'Caught. Now let go over the jar.');
    if (type === 'startle') hint('Too quick, they scattered. Close slowly.');
    if (type === 'release') hint('Let go over the jar to keep them.');
    if (type === 'slip') hint('It slipped out. Don\'t hold on too long.');
  },
});

// start with some in the jar (for the preview picture)
const preJar = Number(Q.get('jar') ?? 0);
if (preJar > 0) { addToJar(catcher.stats, Array(preJar).fill('common')); jar.count = catcher.stats.caught; jar.glow = jarGlow(catcher.stats.score); }

/** Where the jar stands: lower right, recomputed on resize so it stays in the corner on any aspect. */
function placeJar() {
  const aspect = innerWidth / innerHeight;
  const sx = aspect < 1 ? 0.74 : 0.8, sy = aspect < 1 ? 0.8 : 0.76;
  const p = space.screenToWorld(sx, sy, 2.55);
  p.y = Math.max(0.25, p.y - JAR_H * 0.45);
  jar.place(p);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const px = renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan((camera.fov * Math.PI) / 360));
  view.setPixelScale(px);
  jar.setPixelScale(px);
  placeJar();
}
addEventListener('resize', resize);
resize();

// the hand: a soft ring that tightens as it closes and glows when it holds fireflies
const pointer = new PointerHand(renderer.domElement);
const PLANE_D = 3.0; // the hand sits this far in front of the camera
const handWorld = new THREE.Vector3();
const ringMat = new THREE.ShaderMaterial({
  uniforms: { uClose: { value: 0 }, uGlow: { value: 0 } },
  transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform float uClose, uGlow; varying vec2 vUv;
    void main() {
      float d = length(vUv - 0.5) * 2.0;
      float rr = mix(0.85, 0.35, uClose);
      float ring = exp(-pow((d - rr) / 0.05, 2.0)) * 0.35;
      float glow = exp(-d * d * 9.0) * uGlow * 0.9;
      gl_FragColor = vec4(vec3(1.0, 0.9, 0.75) * ring + vec3(1.0, 0.62, 0.3) * glow, 1.0);
    }`,
});
const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), ringMat);
ring.renderOrder = 30;
scene.add(ring);

for (let i = 0; i < 9; i++) flies.spawn('common');

const duskInput = /** @type {HTMLInputElement} */ (document.getElementById('dusk'));
duskInput.value = String(dusk);
duskInput.addEventListener('input', () => { dusk = Number(duskInput.value); setDusk(look, dusk); });
const statsEl = /** @type {HTMLElement} */ (document.getElementById('stats'));

let t = 0;
let last = performance.now();
const camLook = new THREE.Vector3();
const tmp = new THREE.Vector3();
function frame() {
  const nowMs = performance.now();
  const dt = Math.min(0.05, (nowMs - last) / 1000);
  last = nowMs;
  t += dt;
  look.uTime.value = t;
  // a slow breathing camera drift
  camera.position.copy(CAM_BASE).add(tmp.set(Math.sin(t * 0.071) * 0.14, Math.sin(t * 0.113) * 0.045, Math.sin(t * 0.05) * 0.08));
  camLook.copy(LOOK_BASE).add(tmp.set(Math.sin(t * 0.043) * 0.25, Math.sin(t * 0.061) * 0.08, 0));
  camera.lookAt(camLook);
  camera.updateMatrixWorld();
  look.uCamPos.value.copy(camera.position);
  sky.position.copy(camera.position);
  space.project(jar.center, catcher.jarScreen);

  const openness = pointer.update(dt);
  const hands = [];
  if (pointer.seen) {
    space.screenToWorld(pointer.x, pointer.y, PLANE_D, handWorld);
    hands.push({ id: 0, screen: { x: pointer.x, y: pointer.y }, world: handWorld, openness });
  }
  catcher.populate(dt, dusk, { rares: false });
  catcher.update(dt, t, hands);
  jar.glow += (jarGlow(catcher.stats.score) - jar.glow) * (1 - Math.exp(-dt * 1.5));
  jar.update(dt, camera);
  view.update(flies.list);
  writeLights(look, { flies: flies.list, camera, jar, fists: catcher.fists() });

  ring.visible = pointer.seen;
  ring.position.copy(handWorld);
  ring.quaternion.copy(camera.quaternion);
  ringMat.uniforms.uClose.value = 1 - openness;
  ringMat.uniforms.uGlow.value = Math.min(1.7, catcher.hands.get(0)?.glow ?? 0);

  statsEl.textContent = `In the jar: ${catcher.stats.caught}  (startled ${catcher.stats.startles}, slipped ${catcher.stats.slips})`;
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) msgEl.classList.remove('on'); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// for tests and screenshots
Object.assign(window, { __demo: { flies, catcher, pointer, jar, look } });
