// The car you see: a low-poly body made of a few boxes (one mesh) and four wheels, plus the
// "weight" that makes it feel like a car: the body rolls in corners, dips under braking, squats
// under power, the front wheels steer and all four spin. Used for the player, the rivals and the ghost.
//
//   const car = createCarModel({ look, colour: look.player });
//   scene.add(car.root);
//   car.set(pose)        once per step: { x, y, z, yaw, pitch, roll, steer, speed, latAccel, longAccel }
//   car.render(alpha)    every frame (smooths between steps)
//   car.snap()           after a teleport, so it doesn't streak across the map
//
// SWAP THE SHAPE: replace buildBody() with your own boxes, or load a model (see "Swap the car"
// in STARTER.md): put it in `body`, keep it about 1.8 m wide and 4 m long, facing +z.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CAR = { length: 4, width: 1.8, wheelRadius: 0.37, radius: 1.25 /* for bumping into other cars */ };

function box(w, h, l, x, y, z, hex) {
  const g = new THREE.BoxGeometry(w, h, l).translate(x, y, z);
  const colour = new THREE.Color(hex);
  const data = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < data.length; i += 3) colour.toArray(data, i);
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return g;
}

function buildBody(look, colour) {
  const dark = look.mix(colour, look.shadow, 0.55);
  const glass = look.mix(look.shadow, look.light, 0.12);
  const trim = look.shade(look.light, 0.35);
  return mergeGeometries([
    box(1.8, 0.4, 3.9, 0, 0.52, 0, colour), // main body
    box(1.6, 0.16, 1.2, 0, 0.78, 1.25, colour), // bonnet
    box(1.84, 0.14, 4.0, 0, 0.3, 0, dark), // sills and bumpers
    box(1.4, 0.42, 1.7, 0, 0.93, -0.3, glass), // cabin
    box(1.3, 0.07, 1.4, 0, 1.17, -0.35, colour), // roof
    box(0.34, 0.03, 1.2, 0, 0.87, 1.25, trim), // bonnet stripe
    box(1.7, 0.06, 0.4, 0, 1.12, -1.85, dark), // rear wing
    box(0.08, 0.3, 0.2, 0.6, 0.92, -1.8, dark),
    box(0.08, 0.3, 0.2, -0.6, 0.92, -1.8, dark),
    box(0.36, 0.14, 0.06, 0.6, 0.6, 1.96, trim), // headlights
    box(0.36, 0.14, 0.06, -0.6, 0.6, 1.96, trim),
    box(0.4, 0.12, 0.06, 0.6, 0.62, -1.96, look.accent[1]), // tail lights
    box(0.4, 0.12, 0.06, -0.6, 0.62, -1.96, look.accent[1]),
  ]);
}

let wheelGeometry = null;
function buildWheel(look) {
  if (wheelGeometry) return wheelGeometry;
  const tyre = new THREE.CylinderGeometry(CAR.wheelRadius, CAR.wheelRadius, 0.3, 10).rotateZ(Math.PI / 2);
  const colour = new THREE.Color(look.shade(look.shadow, -0.35));
  const data = new Float32Array(tyre.attributes.position.count * 3);
  for (let i = 0; i < data.length; i += 3) colour.toArray(data, i);
  tyre.setAttribute('color', new THREE.BufferAttribute(data, 3));
  // A pale bar across the hub, so you can see the wheel spin.
  wheelGeometry = mergeGeometries([tyre, box(0.32, 0.5, 0.13, 0, 0, 0, look.shade(look.light, 0.2))]);
  return wheelGeometry;
}

export function createCarModel({ look, colour, ghost = false }) {
  const material = ghost
    ? new THREE.MeshBasicMaterial({ color: look.light, transparent: true, opacity: 0.32, depthWrite: false })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, flatShading: true });
  const root = new THREE.Group(); // position + heading + the slope of the road
  root.rotation.order = 'YXZ';
  const body = new THREE.Group(); // leans on its springs
  const shell = new THREE.Mesh(buildBody(look, colour), material);
  shell.castShadow = !ghost;
  body.add(shell);
  root.add(body);

  const wheels = [];
  for (const [x, z, front] of [[0.82, 1.3, true], [-0.82, 1.3, true], [0.82, -1.25, false], [-0.82, -1.25, false]]) {
    const pivot = new THREE.Group(); // steers
    pivot.position.set(x, CAR.wheelRadius, z);
    const wheel = new THREE.Mesh(buildWheel(look), material); // spins
    wheel.castShadow = !ghost;
    pivot.add(wheel);
    root.add(pivot);
    wheels.push({ pivot, wheel, front });
  }

  const cur = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  const prev = { ...cur };
  let lean = 0; // body roll (springy)
  let leanV = 0;
  let dip = 0; // body pitch
  let dipV = 0;
  let spin = 0;
  let steer = 0;

  const car = {
    root,
    body,
    /** One step of the look. `feel` = the "weight" group of tuning.json. */
    set(p, dt = 1 / 60, feel = { roll: 0.006, pitch: 0.004, spring: 90, damping: 11, wheelTurn: 0.5 }) {
      Object.assign(prev, cur);
      cur.x = p.x; cur.y = p.y; cur.z = p.z; cur.yaw = p.yaw;
      cur.pitch = p.pitch ?? 0;
      cur.roll = p.roll ?? 0;
      // A damped spring pulls the body toward the lean the forces ask for: it overshoots a
      // little and settles, which reads as weight.
      const wantLean = Math.max(-0.16, Math.min(0.16, -(p.latAccel ?? 0) * feel.roll));
      const wantDip = Math.max(-0.09, Math.min(0.09, -(p.longAccel ?? 0) * feel.pitch));
      leanV += ((wantLean - lean) * feel.spring - leanV * feel.damping) * dt;
      lean += leanV * dt;
      dipV += ((wantDip - dip) * feel.spring - dipV * feel.damping) * dt;
      dip += dipV * dt;
      spin += ((p.speed ?? 0) / CAR.wheelRadius) * dt;
      steer = (p.steer ?? 0) * feel.wheelTurn;
      body.rotation.set(dip, 0, lean);
      body.position.y = (p.shake ?? 0) * Math.sin(spin * 0.7 + cur.x) * 0.02;
      for (const w of wheels) {
        w.wheel.rotation.x = spin;
        if (w.front) w.pivot.rotation.y = -steer;
      }
    },
    /** See-through: 1 = solid, less = faded (used for rivals right in front of the camera). */
    fade(opacity) {
      const see = opacity < 0.99;
      if (material.transparent !== see) {
        material.transparent = see; // depth writing stays on, so only the car's outside shows
        material.needsUpdate = true;
      }
      material.opacity = see ? opacity : 1;
      shell.castShadow = !ghost && opacity > 0.5;
    },
    snap() {
      Object.assign(prev, cur);
      lean = leanV = dip = dipV = 0;
    },
    render(alpha) {
      root.position.set(prev.x + (cur.x - prev.x) * alpha, prev.y + (cur.y - prev.y) * alpha, prev.z + (cur.z - prev.z) * alpha);
      let d = cur.yaw - prev.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      root.rotation.set(prev.pitch + (cur.pitch - prev.pitch) * alpha, prev.yaw + d * alpha, prev.roll + (cur.roll - prev.roll) * alpha);
    },
  };
  return car;
}

/** Nose-up/down and side tilt of the road under a car at track spot `loc`, heading `yaw`. */
export function roadTilt(loc, yaw, out = {}) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const along = fx * loc.tx + fz * loc.tz; // how much the car points along the lap
  const across = fx * loc.rx + fz * loc.rz; // ... and across it
  out.pitch = -Math.atan(loc.slope * along - loc.tanB * across);
  out.roll = Math.atan(loc.slope * across + loc.tanB * along);
  return out;
}
