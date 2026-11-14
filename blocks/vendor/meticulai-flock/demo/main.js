// Demo: 3,000 starlings over a field at golden hour. Move the mouse: the cloud follows. Hold the mouse button: it
// gathers into a tight ball. Space or right click: it scatters. A falcon stoops through it every few seconds and
// the birds flee (the ripple you see in real murmurations). Leave the mouse still and the target wanders on its own.
import * as THREE from 'three';
import { Flock, CapsuleCollider } from '../src/index.js';
import { Birds } from '../src/birds.js';

const COUNT = Number(new URLSearchParams(location.search).get('n') || 3000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe7b47a, 120, 520);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 2000);
camera.position.set(0, 14, 78);
camera.lookAt(0, 34, 0);

// Sky: a warm vertical gradient with a low sun glow.
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(900, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sun: { value: new THREE.Vector3(-0.7, 0.06, -0.72).normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 sun;
      void main(){
        float h = clamp(vDir.y, -0.1, 1.0);
        vec3 top = vec3(0.36, 0.52, 0.74), mid = vec3(0.98, 0.74, 0.50), low = vec3(1.0, 0.86, 0.62);
        vec3 c = mix(low, mid, smoothstep(0.0, 0.12, h));
        c = mix(c, top, smoothstep(0.12, 0.75, h));
        float s = max(dot(normalize(vDir), sun), 0.0);
        c += vec3(1.0, 0.72, 0.42) * (pow(s, 8.0) * 0.35 + pow(s, 900.0) * 1.6);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }),
);
scene.add(sky);
scene.add(new THREE.HemisphereLight(0xffe2b8, 0x5a4a2a, 1.4));
const sun = new THREE.DirectionalLight(0xffd6a0, 1.6);
sun.position.set(-50, 30, -80);
scene.add(sun);

// A field and two poplar-like trees (capsules), which are also colliders the birds avoid.
const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshLambertMaterial({ color: 0x9a8442 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const treeMat = new THREE.MeshLambertMaterial({ color: 0x2f3a1e });
const colliders = [];
for (const [x, z, h, r] of [[-62, -40, 30, 4.5], [-50, -55, 24, 3.6], [70, -60, 28, 4.2]]) {
  // A poplar: a tall dark crown on a short trunk. The bird collider is a capsule of the same size.
  const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), treeMat);
  crown.scale.set(r, (h - 3) / 2, r);
  crown.position.set(x, 3 + (h - 3) / 2, z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 4, 8), treeMat);
  trunk.position.set(x, 2, z);
  scene.add(crown, trunk);
  colliders.push(new CapsuleCollider([x, r, z], [x, h - r, z], r));
}

// The flock: hovering (flow 0) instead of travelling along a flyway as in the game.
const flock = new Flock(COUNT + 100, { seed: 7 });
flock.flow = [0, 0, 0];
flock.target = [0, 36, 0];
flock.spawn(COUNT, 0, 36, 0, 14);
const birds = new Birds(flock);
scene.add(birds.mesh);

// A falcon: a dark dart that stoops through the cloud; birds inside its radius flee.
const falcon = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 4).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1a1512 }));
scene.add(falcon);
const pred = { x: 0, y: -1e5, z: 0, r: 11, k: 0 };
let falconT = -4; // seconds into a pass (negative: waiting)
const fFrom = new THREE.Vector3(), fTo = new THREE.Vector3();

// ---------------------------------------------------------------- input
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const aim = new THREE.Vector3(0, 36, 0), mouseAim = new THREE.Vector3();
let lastMove = -10, gatherHeld = false, gatherT = 0, scatterCd = 0, time = 0;
addEventListener('pointermove', (e) => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (ray.ray.intersectPlane(aimPlane, mouseAim)) {
    mouseAim.y = Math.max(14, Math.min(70, mouseAim.y));
    mouseAim.x = Math.max(-70, Math.min(70, mouseAim.x));
    lastMove = time;
  }
});
addEventListener('pointerdown', (e) => { if (e.button === 0) gatherHeld = true; else scatter(); });
addEventListener('pointerup', (e) => { if (e.button === 0) gatherHeld = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('keydown', (e) => { if (e.code === 'Space') scatter(); });
function scatter() {
  if (scatterCd > 0) return;
  flock.burst();
  scatterCd = 2.2; // the game's cooldown
}

// ---------------------------------------------------------------- loop
function update(dt) {
  time += dt;
  if (time - lastMove < 3) aim.lerp(mouseAim, 1 - Math.exp(-dt * 10));
  else aim.set(Math.sin(time * 0.23) * 22, 38 + Math.sin(time * 0.31) * 8, Math.sin(time * 0.17) * 12);
  // Gather eases in fast and out slowly (the game's rates).
  gatherT += ((gatherHeld ? 1 : 0) - gatherT) * Math.min(1, dt * (gatherHeld ? 5 : 2.5));
  flock.tightness = gatherT;
  scatterCd = Math.max(0, scatterCd - dt);
  flock.target[0] = aim.x; flock.target[1] = aim.y; flock.target[2] = aim.z;

  // Falcon: every ~9 s a 2 s stoop from high on one side, through the flock's centre, out the other.
  falconT += dt;
  if (falconT > 2.2) {
    falconT = -6 - (Math.sin(time * 3.7) + 1) * 2;
  }
  if (falconT === 0 || (falconT > 0 && falconT - dt <= 0)) {
    const c = flock.centroid, side = Math.sin(time * 1.9) > 0 ? 1 : -1;
    fFrom.set(c[0] + side * 70, c[1] + 45, c[2] - 20);
    fTo.set(c[0] - side * 60, c[1] - 25, c[2] + 15);
  }
  if (falconT > 0) {
    const u = falconT / 2.2;
    falcon.position.lerpVectors(fFrom, fTo, u);
    falcon.lookAt(fTo);
    falcon.visible = true;
    const near = Math.sin(u * Math.PI); // strongest mid-stoop
    pred.x = falcon.position.x; pred.y = falcon.position.y; pred.z = falcon.position.z;
    pred.k = 260 * near * (1 - gatherT * 0.5); // the game's falcon strength: a gathered flock flees less
  } else {
    falcon.visible = false;
    pred.y = -1e5; pred.k = 0;
  }
  flock.step(Math.min(dt, 1 / 30), { colliders, predators: [pred] });
  birds.flapBoost = gatherT * 0.6 + flock.scatter;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  update(dt);
  birds.update(time, camera.position);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.getElementById('hud').innerHTML = `<b>Flock</b> &middot; ${COUNT.toLocaleString()} starlings &middot; move the mouse to lead &middot; hold to gather &middot; space or right click to scatter`;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

window.__demo = {
  state: () => ({ birds: flock.count, radius: +flock.radius.toFixed(1), centroid: flock.centroid.map((v) => +v.toFixed(1)), gather: +gatherT.toFixed(2) }),
};
