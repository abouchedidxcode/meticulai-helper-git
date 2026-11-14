// Demo: a figure built from primitives, animated only with this block.
//  - right arm: TwoBoneIK reaching for a target that follows the mouse (smoothed by SpringVec3)
//  - head: lookAngles + softClamp + SpringQuat (it turns to watch the target, never snaps)
//  - left arm + spine: a LayerStack. Base layer switches between "rest" and "wave" (a looping
//    Timeline) with inertialization; an additive "breath" layer drives the spine from Noise1.
//  - a row of balls on the floor follows the target's x with different half-lives, plus one
//    BouncySpring, to show what the numbers feel like.
import * as THREE from 'three';
import {
  TwoBoneIK, SpringVec3, SpringQuat, Spring, BouncySpring, Noise1,
  LayerStack, ChannelLayout, Timeline, lookAngles, softClamp, quatFromEuler, DEG,
} from '../src/index.js';

// ---------------------------------------------------------------- renderer, scene, camera
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2230);
scene.fog = new THREE.Fog(0x1d2230, 6, 14);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 50);
camera.position.set(0.7, 1.75, 4.1);
camera.lookAt(-0.1, 0.85, 0.5);

scene.add(new THREE.HemisphereLight(0xcfdcff, 0x3a2f28, 1.1));
const sun = new THREE.DirectionalLight(0xfff0dc, 2.4);
sun.position.set(2.5, 4, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
scene.add(sun);

const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshStandardMaterial({ color: 0x3b3f4c, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// ---------------------------------------------------------------- the figure (code-built)
const skin = new THREE.MeshStandardMaterial({ color: 0xe0b48f, roughness: 0.7 });
const cloth = new THREE.MeshStandardMaterial({ color: 0x4f7cac, roughness: 0.8 });
const clothDark = new THREE.MeshStandardMaterial({ color: 0x2f3e5a, roughness: 0.85 });
const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: 0.4 });

function limb(parent, length, radius, mat) {
  // a capsule hanging from the joint along -Y
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.01, length - 2 * radius), 6, 12), mat);
  m.position.y = -length / 2;
  m.castShadow = true;
  parent.add(m);
  return m;
}
function joint(name, parent, x, y, z) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

const root = new THREE.Group();
scene.add(root);
const hips = joint('hips', root, 0, 0.95, 0);
for (const sx of [-1, 1]) {
  const hip = joint('hip', hips, 0.1 * sx, 0, 0);
  limb(hip, 0.95, 0.075, clothDark);
}
const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.12, 6, 12), clothDark);
pelvis.rotation.z = Math.PI / 2;
pelvis.castShadow = true;
hips.add(pelvis);

const spine = joint('spine', hips, 0, 0.08, 0);
const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.28, 8, 16), cloth);
torso.scale.set(1.15, 1, 0.75);
torso.position.y = 0.25;
torso.castShadow = true;
spine.add(torso);
const chest = joint('chest', spine, 0, 0.4, 0);

const head = joint('head', chest, 0, 0.16, 0);
const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 12), skin);
neck.position.y = -0.06;
head.add(neck);
const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 24), skin);
skull.scale.set(0.95, 1.08, 1);
skull.position.y = 0.12;
skull.castShadow = true;
head.add(skull);
for (const sx of [-1, 1]) {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), dark);
  eye.position.set(0.045 * sx, 0.14, 0.118);
  head.add(eye);
}
const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 10), skin);
nose.rotation.x = Math.PI / 2;
nose.position.set(0, 0.1, 0.14);
head.add(nose);

function arm(side) {
  // side: -1 = the figure's right (screen left), +1 = its left
  const upper = joint(`${side < 0 ? 'R' : 'L'}_upper`, chest, 0.23 * side, -0.02, 0);
  limb(upper, 0.29, 0.055, cloth);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), cloth);
  ball.castShadow = true;
  upper.add(ball);
  const lower = joint(`${side < 0 ? 'R' : 'L'}_lower`, upper, 0, -0.29, 0);
  limb(lower, 0.27, 0.045, skin);
  const hand = joint(`${side < 0 ? 'R' : 'L'}_hand`, lower, 0, -0.27, 0);
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), skin);
  palm.scale.set(0.8, 1.2, 0.6);
  palm.position.y = -0.03;
  palm.castShadow = true;
  hand.add(palm);
  return { upper, lower, hand };
}
const armR = arm(-1);
const armL = arm(1);
root.updateMatrixWorld(true);

// ---------------------------------------------------------------- right arm: IK toward a sprung target
const ikR = new TwoBoneIK(armR.upper, armR.lower, armR.hand, new THREE.Vector3(0, 0, -1));
const goal = new THREE.Vector3(-0.35, 1.2, 0.45); // where the mouse points
const target = new SpringVec3(goal, 0.15); // the hand chases it on a critically damped spring
const marker = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 14), new THREE.MeshStandardMaterial({ color: 0xffc35a, emissive: 0xb86a00, emissiveIntensity: 0.9 }));
marker.castShadow = true;
scene.add(marker);

// ---------------------------------------------------------------- head: watch the target on a spring
const headSpring = new SpringQuat(new THREE.Quaternion(), 0.12);
const look = { yaw: 0, pitch: 0 };
const headPos = new THREE.Vector3();
const chestQ = new THREE.Quaternion();
const lookQ = new THREE.Quaternion();

// ---------------------------------------------------------------- left arm + spine: a LayerStack
const layout = new ChannelLayout({ raise: 0, bend: 0, twist: 0 });
const waveTl = new Timeline(layout)
  .key(0, { raise: 2.5, bend: 0.5, twist: 0 })
  .key(0.35, { bend: 1.1, twist: 0.35 })
  .key(0.7, { bend: 0.5, twist: 0 })
  .key(1.05, { bend: 1.1, twist: 0.35 })
  .key(1.4, { raise: 2.5, bend: 0.5, twist: 0 });
const waveBuf = layout.create();
const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
const tmpQ = new THREE.Quaternion();

/** @type {import('../src/layers.js').PoseSource} */
const rest = {
  name: 'rest',
  duration: 4,
  loop: true,
  sample(t, out) {
    const sway = Math.sin((t / 4) * Math.PI * 2);
    out.rot.get('L_upper').setFromAxisAngle(Z, 0.12 + 0.04 * sway).multiply(tmpQ.setFromAxisAngle(X, 0.08 * sway));
    out.rot.get('L_lower').setFromAxisAngle(X, -0.25 - 0.05 * sway);
  },
};
/** @type {import('../src/layers.js').PoseSource} */
const wave = {
  name: 'wave',
  duration: 1.4,
  loop: true,
  sample(t, out) {
    waveTl.sample(t, waveBuf);
    const raise = layout.get(waveBuf, 'raise'), bend = layout.get(waveBuf, 'bend'), twist = layout.get(waveBuf, 'twist');
    out.rot.get('L_upper').setFromAxisAngle(Z, raise).multiply(tmpQ.setFromAxisAngle(X, -0.25));
    out.rot.get('L_lower').setFromAxisAngle(Z, bend).multiply(tmpQ.setFromAxisAngle(X, -twist));
  },
};
const boneNames = ['spine', 'L_upper', 'L_lower'];
const bones = new Map(boneNames.map((n) => [n, root.getObjectByName(n)]));
const stack = new LayerStack(boneNames);
stack.play(rest);
const breath = new Noise1(7, 0.25, 1, 2);
stack.addLayer({
  name: 'breath',
  weight: 1,
  mask: { spine: 1 },
  evaluate(_dt, t, out) {
    const b = Math.sin(t * 1.6) * 0.035 + breath.at(t) * 0.05;
    out.rot.get('spine').setFromAxisAngle(X, b).multiply(tmpQ.setFromAxisAngle(Z, breath.at(t + 30) * 0.04));
  },
});
let nextSwitch = 1.0;
function switchPose() {
  stack.play(stack.playing === rest ? wave : rest, { mode: 'inertial', fade: 0.18 });
}
addEventListener('pointerdown', () => {
  switchPose();
  nextSwitch = time + 3;
});

// ---------------------------------------------------------------- the spring row (what half-life feels like)
const row = [
  { label: 'half-life 0.05 s', color: 0xf26b5b, spring: new Spring(0, 0.05) },
  { label: 'half-life 0.15 s', color: 0xf2b45b, spring: new Spring(0, 0.15) },
  { label: 'half-life 0.40 s', color: 0x7bc47f, spring: new Spring(0, 0.4) },
  { label: 'bouncy 2 Hz, ratio 0.3', color: 0x6fa8ff, spring: new BouncySpring(0, 2, 0.3) },
];
const legend = document.getElementById('legend');
row.forEach((r, i) => {
  r.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 14), new THREE.MeshStandardMaterial({ color: r.color, roughness: 0.4 }));
  r.mesh.position.set(0, 0.06, 0.75 + i * 0.22);
  r.mesh.castShadow = true;
  scene.add(r.mesh);
  legend.insertAdjacentHTML('beforeend', `<div>${r.label}<span class="sw" style="background:#${r.color.toString(16).padStart(6, '0')}"></span></div>`);
});
const goalLine = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.005, 0.95), new THREE.MeshBasicMaterial({ color: 0xffc35a }));
goalLine.position.set(0, 0.003, 1.08);
scene.add(goalLine);

// ---------------------------------------------------------------- input: mouse -> plane in front of the figure
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.45); // z = 0.45
const ndc = new THREE.Vector2();
let lastMove = -10;
addEventListener('pointermove', (e) => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  if (ray.ray.intersectPlane(plane, p)) {
    goal.set(THREE.MathUtils.clamp(p.x, -1.1, 0.6), THREE.MathUtils.clamp(p.y, 0.6, 2.0), 0.45);
    lastMove = time;
  }
});

// ---------------------------------------------------------------- loop (fixed 60 Hz steps)
const DT = 1 / 60;
let time = 0, acc = 0, last = performance.now();
const shoulder = new THREE.Vector3(), pole = new THREE.Vector3();

function step(dt) {
  time += dt;
  // idle: when the mouse is still, the target drifts on its own so the demo is never frozen
  if (time - lastMove > 2) {
    const t = time * 0.55;
    goal.set(-0.3 + Math.sin(t) * 0.38, 1.2 + Math.sin(t * 1.7) * 0.28, 0.45);
  }
  if (time >= nextSwitch) {
    switchPose();
    nextSwitch = time + 2.6;
  }

  // base + additive layers -> spine and left arm
  stack.update(dt).applyTo(bones);
  root.updateMatrixWorld(true);

  // right arm reaches for the sprung target; elbow points down and back
  target.update(dt, goal);
  marker.position.copy(target.x);
  armR.upper.getWorldPosition(shoulder);
  pole.copy(shoulder).add(new THREE.Vector3(-0.35, -0.5, -0.4));
  ikR.solve(target.x, pole, { softness: 0.06 });

  // head watches the target, soft-limited, on a quaternion spring
  head.getWorldPosition(headPos);
  chest.getWorldQuaternion(chestQ);
  lookAngles(headPos, chestQ, target.x, look);
  const yaw = softClamp(look.yaw, -70 * DEG, 70 * DEG, 15 * DEG);
  const pitch = softClamp(look.pitch, -35 * DEG, 35 * DEG, 10 * DEG);
  quatFromEuler(-pitch, yaw, 0, 'YXZ', lookQ);
  head.quaternion.copy(headSpring.update(dt, lookQ));

  // the spring row follows the target's x
  for (const r of row) r.mesh.position.x = r.spring.update(dt, goal.x);
  goalLine.position.x = goal.x;
}

function frame(now) {
  acc = Math.min(acc + (now - last) / 1000, 0.25);
  last = now;
  while (acc >= DT) {
    step(DT);
    acc -= DT;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

window.__demo = {
  state: () => ({
    time: +time.toFixed(2),
    base: stack.playing?.name,
    reach: +ikR.reach.toFixed(3),
    hand: armR.hand.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3)),
    target: target.x.toArray().map((v) => +v.toFixed(3)),
  }),
};
