// The demo: a meadow at golden hour to walk through in first person, with a scythe to mow it, a torch to burn it
// and a ball to roll through it. Everything the grass does comes from src/lib; this file is the player, the
// three tools and the page. On Patch it runs in the block's page, which draws its controls (recipe.json) and
// talks to it through lib/patch-block.js.
import { patchBlock } from 'patch-block';
import * as THREE from 'three';
import recipe from '../../recipe.json';
import { bakeGround, createField, createFrame, loadGroundTextures } from '../lib/index.js';
import { createHorizon } from './horizon.js';
import { createSky } from './sky.js';
import { BLADE, edgeAt, HAFT, HEEL, makeScythe, SNATH } from './scythe.js';
import { createSounds } from './sounds.js';
import { heightAt, paint } from './world.js';

/** Lets the browser have a turn: a message to Patch's page only leaves once the current task ends. */
const turn = () =>
  new Promise((r) => {
    const c = new MessageChannel();
    c.port1.onmessage = () => r();
    c.port2.postMessage(0);
  });
const params = new URLSearchParams(location.search);
const stepped = params.has('step'); // a test drives the clock: nothing moves until it says
const clean = params.has('clean'); // no page furniture, for filming
const $ = (id) => document.getElementById(id);

const canvas = $('view');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: stepped });
} catch {
  $('cover').className = 'message';
  $('cover').textContent = 'This needs WebGL 2, with hardware acceleration on.';
  throw new Error('no WebGL 2');
}
// (a failed shader is found by tools/test.mjs, not by every visitor waiting for each link to be checked)
renderer.debug.checkShaderErrors = stepped;
// Sized by the window's own pixel ratio, which Patch lowers in performance mode
const pixelRatio = () => Math.min(window.devicePixelRatio || 1, params.has('dpr') ? Number(params.get('dpr')) : 1.5);
renderer.setPixelRatio(pixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);

// Patch's page: its controls arrive here. Until the meadow is made they wait.
let loaded = false;
let shown = true;
const waiting = [];
const block = patchBlock({
  ...recipe.block,
  onSet(id, value) {
    if (loaded) setControl(id, value);
    else waiting.push([id, value]);
  },
  onTrigger(id) {
    if (loaded && id === 'reset') reset();
  },
  onVisible(visible) {
    shown = visible;
    if (loaded) run();
  },
});
block.progress(0.05, 'Loading the ground');
// Sound is made ready now, while the first files are still on their way: opening the PC's audio can hold this page's
// thread for a second or more, and here nothing is waiting on it. It only starts playing on the first click.
const sounds = createSounds();
const soundsReady = params.has('nosound') ? null : sounds.load();
// when each step of the load ended, ms from the page's start: for tools/cold.mjs and anyone chasing a slow load
const laps = [];
const lap = (name) => laps.push([name, Math.round(performance.now())]);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 9000);
camera.rotation.order = 'YXZ';

// How much to draw: the page's Quality control, or on Auto whatever Patch's performance mode says
const DENSITY = { high: 1, medium: 0.7, low: 0.45 };
let qualityChoice = params.get('quality') ?? 'auto';
const quality = () => (qualityChoice === 'auto' ? (window.patch?.quality ?? 'high') : qualityChoice);
const textures = await loadGroundTextures(renderer, './textures/');
lap('textures');
const baked = await bakeGround({ heightAt, paint }, (done) => block.progress(0.1 + 0.3 * done, 'Shaping the ground'));
lap('ground');
block.progress(0.42, 'Growing the meadow');
await turn();
const field = createField({ heightAt, paint, baked, textures, density: DENSITY[quality()] ?? 1, seed: 3 });
scene.add(field.group);
lap('field');
const frame = createFrame(renderer, field, { samples: quality() === 'low' ? 0 : 4 });
lap('frame');
block.progress(0.45, 'Forging the scythe');
await turn();
const sky = createSky(field);
scene.add(sky.mesh, ...sky.lights, createHorizon(field));

// what the blade, the torch and the ball reflect: the sky, blurred. Made again when the hour changes.
const pmrem = new THREE.PMREMGenerator(renderer);
// (with the meadow under it and a line of far hills round it, darker than the haze above them: steel shows green
// below, sky above, and between them something for its own marks to stand against)
const skyOnly = new THREE.Scene();
const skyCopy = sky.mesh.clone();
const meadow = new THREE.Mesh(new THREE.CircleGeometry(0.995, 48), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
meadow.rotation.x = -Math.PI / 2;
meadow.position.y = -0.06;
const hills = new THREE.Mesh(new THREE.CylinderGeometry(0.99, 0.99, 0.2, 48, 1, true), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
hills.position.y = 0.035;
skyOnly.add(skyCopy, meadow, hills);
const ENV_SIZE = 128; // the hour slider remakes it as it moves, and at 256 that showed as a dropped frame
let envTarget = null;
let envDue = 0;
/**
 * Links what the environment map is made with before it is first made: drawn unlinked, the sky's shader and three's
 * two filters each hold up the whole browser at their first draw, the page round the demo included. (After Patch's
 * animals block. It reaches into three's PMREMGenerator, so it goes with the three this repo pins.)
 */
async function prepareEnvironment() {
  const eye = new THREE.PerspectiveCamera();
  const probe = new THREE.WebGLCubeRenderTarget(16, { type: THREE.HalfFloatType });
  renderer.setRenderTarget(probe);
  const sky = renderer.compileAsync(skyOnly, eye);
  renderer.setRenderTarget(null);
  await turn();
  pmrem._setSize(ENV_SIZE);
  pmrem._allocateTargets().dispose();
  // (the filter takes 256 samples a pixel by default; Direct3D's compiler spends a third of a second on that loop,
  // and a smooth sky doesn't need them)
  pmrem._ggxMaterial.defines.GGX_SAMPLES = 64;
  pmrem._ggxMaterial.needsUpdate = true;
  const plane = new THREE.PlaneGeometry();
  const filters = [];
  for (const material of [pmrem._blurMaterial, pmrem._ggxMaterial]) {
    renderer.setRenderTarget(probe);
    filters.push(renderer.compileAsync(new THREE.Mesh(plane, material), eye));
    renderer.setRenderTarget(null);
    await turn();
  }
  await Promise.all([sky, ...filters]);
  plane.dispose();
  probe.dispose();
}
function refreshEnvironment() {
  const disc = sky.mesh.material.uniforms.uDisc.value;
  sky.mesh.material.uniforms.uDisc.value = 0;
  const u = field.uniforms;
  const lit = Math.max(u.uSunDir.value.y, 0.03) * 1.2;
  meadow.material.color.setRGB(0.06 * (u.uSunColor.value.r * lit + u.uSkyColor.value.r), 0.1 * (u.uSunColor.value.g * lit + u.uSkyColor.value.g), 0.024 * (u.uSunColor.value.b * lit + u.uSkyColor.value.b));
  // far hills in the haze: the meadow's colour, darker, a third of the way to the fog's
  hills.material.color.copy(meadow.material.color).multiplyScalar(0.55).lerp(u.uFogColor.value, 0.22);
  const next = pmrem.fromScene(skyOnly, 0.03, 0.1, 100, { size: ENV_SIZE });
  sky.mesh.material.uniforms.uDisc.value = disc;
  scene.environment = next.texture;
  envTarget?.dispose();
  envTarget = next;
}

// ---- the player ----------------------------------------------------------------------------------------------
const EYE = 1.68;
const REACH = 122; // metres from the middle: the part of the meadow that remembers
const player = {
  x: -6,
  z: 4,
  y: 0,
  vy: 0,
  vx: 0,
  vz: 0,
  yaw: -1.25,
  pitch: -0.2,
  onGround: true,
  walked: 0,
  stride: 0,
  foot: 1,
  bob: 0,
  dip: 0,
  roll: 0,
};
player.y = field.heightAt(player.x, player.z);
const keys = new Set();
const input = { use: false, used: false };

function forward() {
  return [-Math.sin(player.yaw), -Math.cos(player.yaw)];
}

function updatePlayer(dt) {
  const [fx, fz] = forward();
  const rx = -fz;
  const rz = fx;
  let mx = 0;
  let mz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  const len = Math.hypot(mx, mz) || 1;
  // mowing is done at a mower's pace: each stroke takes the next strip
  const speed = tool.swing >= 0 ? 1.0 : keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6.6 : 3.3;
  const wantX = ((fx * mz + rx * mx) / len) * speed;
  const wantZ = ((fz * mz + rz * mx) / len) * speed;
  const grip = player.onGround ? 10 : 2;
  player.vx += (wantX - player.vx) * Math.min(1, dt * grip);
  player.vz += (wantZ - player.vz) * Math.min(1, dt * grip);
  player.x += player.vx * dt;
  player.z += player.vz * dt;
  // the meadow goes on, but only this much of it remembers: turn back gently at its edge
  const r = Math.hypot(player.x, player.z);
  if (r > REACH) {
    player.x *= REACH / r;
    player.z *= REACH / r;
  }
  const ground = field.heightAt(player.x, player.z);
  if (player.onGround) {
    player.y = ground;
    if (keys.has('Space')) {
      player.vy = 4.7;
      player.onGround = false;
    }
  } else {
    player.vy -= 12.5 * dt;
    player.y += player.vy * dt;
    if (player.y <= ground) {
      // lands with both feet: the grass under them goes down in a ring
      field.bend(player.x, player.z, 0.55, 0, 0, Math.min(1, -player.vy / 5));
      sounds.step(1);
      player.dip = Math.min(0.12, -player.vy * 0.02);
      player.y = ground;
      player.vy = 0;
      player.onGround = true;
    }
  }
  const moved = Math.hypot(player.vx, player.vz) * dt;
  if (player.onGround && moved > 0) {
    player.walked += moved;
    player.stride += moved;
    const pace = Math.hypot(player.vx, player.vz);
    // each foot presses the grass down the way it's going
    if (player.stride > 0.16) {
      player.stride = 0;
      const side = player.foot * 0.12;
      field.bend(player.x - (player.vz / pace) * side, player.z + (player.vx / pace) * side, 0.27, player.vx, player.vz, 0.8);
    }
    if (player.walked > (pace > 5 ? 1.15 : 0.78)) {
      player.walked = 0;
      player.foot = -player.foot;
      sounds.step(pace > 5 ? 0.8 : 0.5);
    }
    player.bob += moved * (Math.PI / 0.78);
  }
  player.dip *= Math.exp(-dt * 9);
  field.setPusher(0, player.x, player.y + 0.2, player.z, 0.17);
}

function placeCamera() {
  // a test or a film can take the camera off the player: __tg.view = { x, y, z, yaw, pitch }
  const view = window.__tg?.view;
  if (view) {
    camera.position.set(view.x, view.y, view.z);
    camera.rotation.set(view.pitch, view.yaw, 0);
    camera.updateMatrixWorld();
    return;
  }
  const pace = Math.min(1, Math.hypot(player.vx, player.vz) / 6.6);
  const bob = player.onGround ? Math.sin(player.bob) * 0.028 * pace : 0;
  camera.position.set(player.x, player.y + EYE + bob - player.dip, player.z);
  camera.rotation.set(player.pitch, player.yaw, player.roll);
  camera.updateMatrixWorld();
}

// ---- the tools -----------------------------------------------------------------------------------------------
const wood = new THREE.MeshStandardMaterial({ color: 0x4a3524, metalness: 0, roughness: 0.85 });
const wrap = new THREE.MeshStandardMaterial({ color: 0x15100c, metalness: 0, roughness: 0.95, emissive: 0xff5a10, emissiveIntensity: 0.6 });

/** A stick with a wrapped, smouldering head. The flame itself is drawn by the frame. */
function makeTorch() {
  const group = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 1.1, 10), wood);
  stick.position.y = -0.2;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.024, 0.11, 12), wrap);
  head.position.y = 0.36;
  group.add(stick, head);
  return group;
}

const scytheModel = await makeScythe(renderer);
lap('scythe');
const torchModel = makeTorch();
const torchLight = new THREE.PointLight(0xff8a3a, 0, 14, 2);
scene.add(scytheModel, torchModel, torchLight);

const tool = { current: 0, swing: -1, phase: 'rest', from: null, lastPhi: 0, torchDown: 0, sinceLit: 0 };
const TOOLS = ['Scythe', 'Torch', 'Ball'];
const v3 = () => new THREE.Vector3();
const hand = v3();
const dir = v3();
const edge = v3();
const tmp = v3();
const tmp2 = v3();
const basis = new THREE.Matrix4();

/** Puts a tool with its hand at `hand`, pointing along `dir`, its edge (local +X) towards `edge`. */
function pose(model, at, along, towards) {
  const y = tmp.copy(along).normalize();
  const z = tmp2.crossVectors(towards, y).normalize();
  const x = v3().crossVectors(y, z);
  basis.makeBasis(x, y, z);
  model.quaternion.setFromRotationMatrix(basis);
  model.position.copy(at);
}

const ease = (t) => t * t * (3 - 2 * t);

// ---- the scythe ----------------------------------------------------------------------------------------------
const FROM = 1.05; // radians right of straight ahead, where a stroke starts
const TO = -1.15; // where the edge leaves the grass
const PAST = -1.5; // where the follow-through ends, the blade lifting
const TIME = { draw: 0.32, cut: 0.56, back: 0.46, lower: 0.36 };
const STUBBLE = 0.06; // metres left standing
const UP = new THREE.Vector3(0, 1, 0);
const haftCos = Math.cos(HAFT);
const haftSin = Math.sin(HAFT);
const mX = v3();
const mY = v3();
const mZ = v3();
const strokePos = v3();
const strokeQuat = new THREE.Quaternion();
const restPos = v3();
const restQuat = new THREE.Quaternion();
const fromPos = v3();
const fromQuat = new THREE.Quaternion();

// Carried: the blade up across the right of the view, its edge down, the snath running off the bottom of the screen.
const REST = (() => {
  const frame = (x, hint) => {
    const e1 = x.clone().normalize();
    const e2 = hint.clone().addScaledVector(e1, -hint.dot(e1)).normalize();
    return new THREE.Matrix4().makeBasis(e1, e2, v3().crossVectors(e1, e2));
  };
  const model = frame(v3().set(1, 0, 0), SNATH);
  const view = frame(v3().set(-0.72, 0.62, 0.12), v3().set(0.05, -0.85, 0.52));
  return new THREE.Quaternion().setFromRotationMatrix(view.multiply(model.transpose()));
})();

/**
 * The scythe at angle phi of a stroke (radians right of straight ahead), `lift` metres off the ground: its heel
 * out in front, the blade leading the way it travels, lying to the ground under it. Returns the two ends of its
 * axis on the ground and the way its edge faces: [heel x, z, tip x, z, edge x, z].
 */
function strokePose(phi, lift) {
  const [fx, fz] = forward();
  const rx = -fz;
  const rz = fx;
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  // out from the mower, and the way the blade is going: leftwards
  const ox = fx * c + rx * s;
  const oz = fz * c + rz * s;
  const lx = fx * s - rx * c;
  const lz = fz * s - rz * c;
  const hx = player.x + ox * HEEL;
  const hz = player.z + oz * HEEL;
  const tx = hx + (ox * haftCos + lx * haftSin) * BLADE;
  const tz = hz + (oz * haftCos + lz * haftSin) * BLADE;
  // it rides just clear of the stubble it leaves
  strokePos.set(hx, field.heightAt(hx, hz) + STUBBLE + 0.02 + lift, hz);
  mX.set(tx, field.heightAt(tx, tz) + STUBBLE + 0.012 + lift * 0.75, tz).sub(strokePos).normalize();
  // cutting, the edge runs a little lower than the back; lifted clear, it tips up
  mZ.crossVectors(mX, UP);
  mY.copy(UP).addScaledVector(mZ, lift * 1.3 - 0.05);
  mZ.crossVectors(mX, mY).normalize();
  mY.crossVectors(mZ, mX);
  strokeQuat.setFromRotationMatrix(basis.makeBasis(mX, mY, mZ));
  return [hx, hz, tx, tz, -mZ.x, -mZ.z];
}

function begin(phase) {
  tool.phase = phase;
  tool.swing = 0;
  fromPos.copy(scytheModel.position);
  fromQuat.copy(scytheModel.quaternion);
  if (phase === 'cut') {
    tool.lastPhi = FROM;
  }
}

/** How far round a stroke is at time t of it (0 to 1): slow to start, fastest through the middle, carried out. */
const through = (t) => 1 - (1 - t ** 1.5) ** 2;
/** Off the ground at angle phi of the stroke: down in the grass until TO, then rising. */
const liftAt = (phi) => 0.24 * ease(Math.min(1, Math.max(0, (TO - phi) / (TO - PAST))));

function updateScythe(dt) {
  restPos.copy(camera.localToWorld(tmp.set(0.8, -0.2 + Math.sin(player.bob) * 0.006, -1.15)));
  restQuat.copy(camera.quaternion).multiply(REST);
  const held = input.use && tool.current === 0;
  if (tool.phase === 'rest') {
    if (held) begin('draw');
    else {
      scytheModel.position.copy(restPos);
      scytheModel.quaternion.copy(restQuat);
      player.roll *= Math.exp(-dt * 10);
      tool.swing = -1;
      return;
    }
  }
  tool.swing += dt / TIME[tool.phase];
  const t = Math.min(1, tool.swing);
  if (tool.phase === 'draw') {
    // down off the shoulder and out to the right, into the grass
    const k = ease(t);
    strokePose(FROM, 0.3 * (1 - k));
    scytheModel.position.lerpVectors(fromPos, strokePos, k);
    scytheModel.quaternion.slerpQuaternions(fromQuat, strokeQuat, k);
    if (t >= 1) begin('cut');
  } else if (tool.phase === 'cut') {
    const phi = FROM + (PAST - FROM) * through(t);
    // everything the edge has passed over since the last frame is cut, a couple of degrees at a time
    const turn = phi - tool.lastPhi;
    const steps = Math.max(1, Math.ceil(Math.abs(turn) / 0.035));
    // where the stroke lays what it has cut: in a row at its left end
    const [wx, wz] = (() => {
      const [fx, fz] = forward();
      const a = TO - 0.1;
      const r = HEEL + BLADE * 0.5;
      return [player.x + (fx * Math.cos(a) + -fz * Math.sin(a)) * r, player.z + (fz * Math.cos(a) + fx * Math.sin(a)) * r];
    })();
    // strewn a stride and more along the row, most of it within a hand of its middle line
    const [rowX, rowZ] = forward();
    const row = { x: wx, z: wz, dx: rowX, dz: rowZ, along: 0.85, width: 0.17 };
    for (let s = 1; s <= steps; s++) {
      const p = tool.lastPhi + (turn * s) / steps;
      if (p < TO) break;
      const [hx, hz, tx, tz, ex, ez] = strokePose(p, 0);
      // the edge is a curve: heel, middle and tip of it
      const mid = [hx + (tx - hx) * 0.5 + ex * edgeAt(0.5), hz + (tz - hz) * 0.5 + ez * edgeAt(0.5)];
      const ends = [
        [hx + ex * edgeAt(0), hz + ez * edgeAt(0)],
        [tx + ex * edgeAt(1), tz + ez * edgeAt(1)],
      ];
      for (const end of ends) {
        // the blade carries the grass along with it and leaves it where the stroke ends
        field.cutLine(end[0], end[1], mid[0], mid[1], 0.15, STUBBLE, STUBBLE, 0, 0, row);
      }
    }
    tool.lastPhi = phi;
    strokePose(phi, liftAt(phi));
    scytheModel.position.copy(strokePos);
    scytheModel.quaternion.copy(strokeQuat);
    // the body goes with it
    player.roll = 0.03 * Math.sin(Math.PI * Math.min(1, t * 1.25));
    if (t >= 1) begin(held ? 'back' : 'lower');
  } else if (tool.phase === 'back') {
    // carried back over the stubble for the next stroke, and set down as it arrives
    const k = ease(t);
    strokePose(PAST + (FROM - PAST) * k, 0.24 * (1 - k * k) + 0.1 * Math.sin(Math.PI * k));
    scytheModel.position.copy(strokePos);
    scytheModel.quaternion.copy(strokeQuat);
    player.roll *= Math.exp(-dt * 8);
    if (t >= 1) begin(held ? 'cut' : 'lower');
  } else {
    const k = ease(t);
    scytheModel.position.lerpVectors(fromPos, restPos, k);
    scytheModel.quaternion.slerpQuaternions(fromQuat, restQuat, k);
    player.roll *= Math.exp(-dt * 10);
    if (t >= 1) {
      tool.phase = 'rest';
      tool.swing = -1;
    }
  }
}

function updateTorch(dt, t) {
  const restHand = camera.localToWorld(v3().set(0.33, -0.5, -0.6));
  const restDir = v3().set(-0.06, 0.95, -0.25).transformDirection(camera.matrixWorld);
  const down = input.use && tool.current === 1;
  tool.torchDown += ((down ? 1 : 0) - tool.torchDown) * Math.min(1, dt * 9);
  const k = ease(tool.torchDown);
  // lowered, its head goes into the grass a stride ahead
  const [fx, fz] = forward();
  const tx = player.x + fx * 1.25;
  const tz = player.z + fz * 1.25;
  const tip = v3().set(tx, field.heightAt(tx, tz) + 0.2, tz);
  const lowDir = v3().set(fx * 0.8, -0.55, fz * 0.8).normalize();
  const lowHand = tip.clone().addScaledVector(lowDir, -0.41);
  hand.copy(restHand).lerp(lowHand, k);
  dir.copy(restDir).lerp(lowDir, k).normalize();
  pose(torchModel, hand, dir, tmp2.set(1, 0, 0).transformDirection(camera.matrixWorld));
  const head = v3().copy(hand).addScaledVector(dir, 0.41);
  const flick = 1 + 0.12 * Math.sin(t * 11) + 0.08 * Math.sin(t * 27 + 1);
  frame.torch.position.copy(head);
  frame.torch.size = 0.36;
  torchLight.position.copy(head).y += 0.15;
  torchLight.intensity = 9 * flick;
  field.setLamp(head.x, head.y + 0.15, head.z, 0.9 * flick);
  tool.sinceLit += dt;
  if (tool.torchDown > 0.8 && tool.sinceLit > 0.08) {
    tool.sinceLit = 0;
    field.ignite(head.x, head.z, 0.3);
  }
}

// ---- the ball ------------------------------------------------------------------------------------------------
const BALL = 0.2;
const ballGeometry = new THREE.SphereGeometry(BALL, 40, 28);
{
  // six gores, three colours and white between, so you can see it turn
  const position = ballGeometry.attributes.position;
  const colours = new Float32Array(position.count * 3);
  const palette = [
    [0.72, 0.05, 0.04],
    [0.85, 0.83, 0.78],
    [0.85, 0.55, 0.03],
    [0.85, 0.83, 0.78],
    [0.04, 0.16, 0.5],
    [0.85, 0.83, 0.78],
  ];
  for (let i = 0; i < position.count; i++) {
    const a = Math.atan2(position.getZ(i), position.getX(i)) / (Math.PI * 2) + 0.5;
    colours.set(palette[Math.min(5, Math.floor(a * 6))], i * 3);
  }
  ballGeometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
}
const ballMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
const balls = [];
const MAX_BALLS = 5;
const heldBall = new THREE.Mesh(ballGeometry, ballMaterial);
scene.add(heldBall);

function throwBall() {
  let ball = balls.length < MAX_BALLS ? null : balls.shift();
  if (!ball) {
    ball = { mesh: new THREE.Mesh(ballGeometry, ballMaterial), p: v3(), v: v3(), rolled: 0, still: 0 };
    scene.add(ball.mesh);
  }
  balls.push(ball);
  const look = camera.getWorldDirection(v3());
  ball.p.copy(camera.position).addScaledVector(look, 0.55).y -= 0.18;
  ball.v.copy(look).multiplyScalar(11).add(tmp.set(player.vx, 2.6, player.vz));
  ball.still = 0;
}

const normal = v3();
function updateBalls(dt) {
  balls.forEach((ball, i) => {
    const { p, v } = ball;
    if (ball.still < 1) {
      v.y -= 9.81 * dt;
      p.addScaledVector(v, dt);
      const g = field.heightAt(p.x, p.z);
      if (p.y < g + BALL) {
        normal.set(field.heightAt(p.x - 0.4, p.z) - field.heightAt(p.x + 0.4, p.z), 0.8, field.heightAt(p.x, p.z - 0.4) - field.heightAt(p.x, p.z + 0.4)).normalize();
        p.y = g + BALL;
        const into = v.dot(normal);
        if (into < 0) {
          const hit = -into;
          // grass takes most of a bounce; a hard landing leaves a dent
          v.addScaledVector(normal, -into * (hit > 1 ? 1.4 : 1));
          if (hit > 2.2) {
            field.bend(p.x, p.z, BALL * 2.2, 0, 0, Math.min(1, hit / 6));
          }
        }
        // rolling through standing grass is slow going; mown or burnt ground lets it run
        const here = field.stateAt(p.x, p.z);
        const drag = here.inside && (here.cut < 0.2 || here.burnt > 0.5 || here.growth < 0.3) ? 0.5 : 1.9;
        v.multiplyScalar(Math.exp(-drag * dt));
        const pace = Math.hypot(v.x, v.z);
        ball.rolled += pace * dt;
        if (ball.rolled > 0.07 && pace > 0.05) {
          ball.rolled = 0;
          field.bend(p.x, p.z, BALL * 1.25, v.x, v.z, 0.92);
        }
        // it turns as it rolls
        if (pace > 1e-3) ball.mesh.rotateOnWorldAxis(tmp.set(v.z, 0, -v.x).normalize(), (pace / BALL) * dt);
        ball.still = pace < 0.08 && Math.abs(v.y) < 0.3 ? ball.still + dt * 2 : 0;
      } else ball.still = 0;
      ball.mesh.position.copy(p);
    }
    field.setPusher(1 + i, p.x, p.y, p.z, BALL * 1.05);
  });
}

// ---- the page ------------------------------------------------------------------------------------------------
const wind = { angle: 0.5, speed: 3.5 };
field.setWind(wind.angle, wind.speed);

const TOOL_IDS = ['scythe', 'torch', 'ball'];
// Each of these changes the demo; with `tell`, a change made here (a key, the wheel) is told to Patch's page too.
function setTool(n, tell = true) {
  tool.current = (n + TOOLS.length) % TOOLS.length;
  if (tell && loaded) block.state({ tool: TOOL_IDS[tool.current] });
}
function setHour(hour, tell = true) {
  sky.setHour(Math.min(23, Math.max(4, hour)));
  envDue = performance.now() + 120;
  if (tell && loaded) block.state({ time: sky.hour });
}
function setWind(speed, tell = true) {
  wind.speed = Math.min(12, Math.max(0, speed));
  field.setWind(wind.angle, wind.speed);
  if (tell && loaded) block.state({ wind: wind.speed });
}
function setQuality() {
  field.setDensity(DENSITY[quality()] ?? 1);
}
function setControl(id, value) {
  if (id === 'tool') setTool(TOOL_IDS.indexOf(value), false);
  else if (id === 'time') setHour(value, false);
  else if (id === 'wind') setWind(value, false);
  else if (id === 'regrow') field.state.regrow = value ? 60 : 0;
  else if (id === 'quality') {
    qualityChoice = value;
    setQuality();
  }
}
window.patch?.addEventListener?.('qualitychange', setQuality);
function reset() {
  field.reset();
  frame.particles.clear();
  for (const ball of balls) scene.remove(ball.mesh);
  balls.length = 0;
  for (let i = 1; i < 6; i++) field.setPusher(i, 0, 0, 0, 0);
}

if (clean) document.body.classList.add('clean');
canvas.addEventListener('click', () => {
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock()?.catch?.(() => {});
});
window.addEventListener('blur', () => {
  keys.clear();
  input.use = false;
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  document.body.classList.toggle('playing', locked);
  if (locked) sounds.start();
  else {
    keys.clear();
    input.use = false;
  }
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.min(1.45, Math.max(-1.45, player.pitch - e.movementY * 0.0022));
});
document.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas || e.button !== 0) return;
  input.use = true;
  input.used = false;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.use = false;
});
document.addEventListener('wheel', (e) => {
  if (document.pointerLockElement === canvas) setTool(tool.current + Math.sign(e.deltaY));
});
document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  keys.add(e.code);
  if (e.code === 'Digit1') setTool(0);
  if (e.code === 'Digit2') setTool(1);
  if (e.code === 'Digit3') setTool(2);
  if (e.code === 'KeyR') reset();
  if (e.code === 'BracketLeft') setWind(wind.speed - 1);
  if (e.code === 'BracketRight') setWind(wind.speed + 1);
  if (e.code === 'Comma') setHour(sky.hour - 0.25);
  if (e.code === 'Period') setHour(sky.hour + 0.25);
  if (e.code === 'Space') e.preventDefault();
});
document.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('resize', () => {
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ---- the loop ------------------------------------------------------------------------------------------------
let time = 0;
function tick(dt) {
  time += dt;
  updatePlayer(dt);
  placeCamera();
  scytheModel.visible = tool.current === 0;
  torchModel.visible = tool.current === 1;
  heldBall.visible = tool.current === 2;
  // (a view that asks to keep the tools leaves them where the player holds them)
  if ((tool.current === 0 || tool.swing >= 0) && !window.__tg?.view?.tools) {
    scytheModel.visible = true;
    updateScythe(dt);
    placeCamera();
  }
  if (tool.current === 1) updateTorch(dt, time);
  else {
    tool.torchDown = 0;
    frame.torch.size = 0;
    torchLight.intensity = 0;
    field.setLamp(0, 0, 0, 0);
  }
  if (tool.current === 2) {
    heldBall.position.copy(camera.localToWorld(tmp.set(0.46, -0.44, -0.95)));
    if (input.use && !input.used) {
      input.used = true;
      throwBall();
    }
  }
  if (window.__tg?.view && !window.__tg.view.tools) scytheModel.visible = torchModel.visible = heldBall.visible = false;
  updateBalls(dt);
  field.update(dt, camera);
  frame.update(dt, camera);
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(4000);
  if (envDue && performance.now() > envDue) {
    envDue = 0;
    refreshEnvironment();
  }
  frame.exposure = sky.exposure;
  frame.render(scene, camera);
}

// ---- loading -------------------------------------------------------------------------------------------------
// Everything a visitor could meet a first time is met here, under the cover: every shader linked, then every
// program drawn once, with the GPU given time to finish each. On Windows a program's first draw can hold up the
// whole page, Patch's included, so none is left for after "ready".
const gl = renderer.getContext();
/** Resolves once the GPU has done everything sent so far: JavaScript finishing isn't the GPU finishing. */
async function gpuDone() {
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  for (let i = 0; i < 600; i++) {
    const state = gl.clientWaitSync(sync, 0, 0);
    if (state !== gl.TIMEOUT_EXPIRED) break;
    await new Promise((r) => setTimeout(r, 4));
  }
  gl.deleteSync(sync);
}

setTool(0, false);
setHour(params.has('hour') ? Number(params.get('hour')) : recipe.block.controls.find((c) => c.id === 'time').default, false);
setWind(params.has('wind') ? Number(params.get('wind')) : recipe.block.controls.find((c) => c.id === 'wind').default, false);
placeCamera();
lap('page');
block.progress(0.55, 'Lighting it');
await prepareEnvironment();
lap('light shaders');
refreshEnvironment();
envDue = 0;
await gpuDone();
lap('light');
field.update(0, camera);
block.progress(0.65, 'Building shaders');
scytheModel.visible = torchModel.visible = heldBall.visible = true;
await Promise.all([frame.compile(scene, camera, (done, of) => (lap(`step ${done}/${of}`), block.progress(0.65 + 0.17 * (done / of), 'Building shaders'))), soundsReady]);
lap('shaders');
block.progress(0.82, 'Warming up');
{
  // a little of everything, in view: a stroke's worth of cut grass, a fire, a thrown ball, each tool in hand
  const [fx, fz] = forward();
  const [ax, az] = [player.x + fx * 3, player.z + fz * 3];
  field.cutLine(ax - fz, az + fx, ax + fz, az - fx, 0.6, 0.06, 0.06, 0, 0, { x: ax, z: az, dx: fx, dz: fz, along: 0.5, width: 0.2 });
  field.ignite(player.x + fx * 7, player.z + fz * 7, 1.6);
  throwBall();
  for (let i = 0; i < 24; i++) {
    tool.current = i < 6 ? 0 : i < 20 ? 1 : 2;
    tick(1 / 30);
    lap(`draw ${i}`);
    await gpuDone();
    lap(`gpu ${i}`);
    if (i % 6 === 5) {
      block.progress(0.82 + 0.16 * (i / 24), 'Warming up');
      await turn();
    }
  }
  reset();
  tool.current = 0;
  tool.phase = 'rest';
  tool.swing = -1;
  tick(1 / 60);
  await gpuDone();
}

// for tests and filming: everything the page is made of, and a clock to drive by hand
window.__tg = { view: null, wind, THREE, renderer, scene, camera, field, frame, sky, player, tool, input, keys, balls, tick, setTool, setHour, setWind, reset, throwBall, ready: true };

// ---- the loop's switch ----------------------------------------------------------------------------------------
let last = 0;
let running = false;
/** Draws while the page says the demo can be seen, and not at all while it can't. */
function run() {
  const want = shown && !stepped;
  if (want === running) return;
  running = want;
  last = performance.now();
  renderer.setAnimationLoop(
    want
      ? (now) => {
          const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
          last = now;
          tick(dt);
        }
      : null,
  );
}

loaded = true;
for (const [id, value] of waiting.splice(0)) setControl(id, value);
run();
$('cover').remove();
block.ready();
// for the measuring tools: the controls as the page sets them, and a stroke, a fire and a reset on request
lap('ready');
window.__block = {
  ready: true,
  block,
  laps,
  set(id, value) {
    if (id === 'mow') {
      setTool(0);
      input.use = true;
      setTimeout(() => (input.use = false), 900);
    } else if (id === 'burn') {
      const [fx, fz] = forward();
      field.ignite(player.x + fx * 6, player.z + fz * 6, 1);
    } else if (id === 'reset') reset();
    else setControl(id, value);
  },
};
