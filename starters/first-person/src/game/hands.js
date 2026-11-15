// Presence: the hand you see at the bottom of the view, holding a small lantern.
// It lags a little behind the mouse, swings as you walk, dips when you land, thrusts forward when you
// use something and flicks when you throw. Its flame is also the health meter: it shrinks as warmth goes.
//
// What to change: build() makes the shapes (swap the lantern for a tool, a torch, a camera, a weapon).
// To load a model instead: add it to `rig` in place of the shapes and keep the same update().
// Sway amounts: tuning.json, group "comfort" (handSway, handBob). 0 = a perfectly still hand.
//
// Trick worth keeping: the whole thing is built at real size about half a metre in front of the eyes,
// then shrunk to a fifth and moved a fifth as far. It looks exactly the same, but it now sits inside the
// body's own radius, so it can never poke through a wall you are standing against.

import * as THREE from 'three';
import { glowTexture } from './scenery.js';

const SHRINK = 0.2;
const REST = new THREE.Vector3(0.4, -0.12, -0.72); // where the hand rests, in metres from the eyes

export function createHands({ camera, look, tune }) {
  const root = new THREE.Group(); // shrunk copy of "half a metre in front of the eyes"
  root.scale.setScalar(SHRINK);
  camera.add(root);
  const rig = new THREE.Group(); // the hand: moves and tilts
  root.add(rig);
  const swing = new THREE.Group(); // the lantern hangs from the hand and swings
  swing.position.set(0, 0.02, 0);
  rig.add(swing);

  // Flat colours (MeshBasicMaterial): the hand is so close to its own light that real lighting would
  // burn it white. Two tones per part give it shape instead.
  const flat = (color) => new THREE.MeshBasicMaterial({ color, fog: false });
  const skin = look.mix(look.player, look.shadow, 0.18);
  const skinDark = look.mix(look.player, look.shadow, 0.45);
  const metal = look.mix(look.shadow, look.base[3], 0.35);
  const metalLit = look.mix(metal, look.light, 0.3);

  function build() {
    // A mitten hand and a sleeve running off the bottom of the screen.
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), flat(skin));
    fist.scale.set(1, 0.85, 1.15);
    fist.position.set(0, 0.06, 0);
    const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), flat(skinDark));
    thumb.position.set(-0.06, 0.07, -0.03);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 0.7, 10), flat(look.mix(look.base[1], look.shadow, 0.5)));
    const along = new THREE.Vector3(0.42, -0.62, 0.5).normalize(); // down and out toward the bottom-right corner
    sleeve.position.set(0, 0.05, 0).addScaledVector(along, 0.4);
    sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), along);
    // Knuckles and a cuff: a few darker shapes turn a blob into a hand.
    for (let i = 0; i < 4; i++) {
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), flat(i % 2 ? skin : skinDark));
      knuckle.position.set(-0.045 + i * 0.03, 0.035, -0.065);
      knuckle.scale.set(0.9, 1.5, 1);
      rig.add(knuckle);
    }
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.07, 10), flat(look.mix(look.base[1], look.light, 0.25)));
    cuff.position.set(0, 0.05, 0).addScaledVector(along, 0.1);
    cuff.quaternion.copy(sleeve.quaternion);
    rig.add(fist, thumb, sleeve, cuff);

    // The lantern: handle ring, cap, four posts, base, and the flame.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 14), flat(metalLit));
    ring.position.y = -0.03;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.07, 6), flat(metal));
    cap.position.y = -0.1;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.03, 6), flat(metal));
    base.position.y = -0.33;
    swing.add(ring, cap, base);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.2, 4), flat(i % 2 ? metal : metalLit));
      post.position.set(Math.cos(a) * 0.075, -0.225, Math.sin(a) * 0.075);
      swing.add(post);
    }
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), flat(look.light));
    flame.position.y = -0.24;
    flame.scale.set(1, 1.35, 1);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: look.accent[0], transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
    glow.position.y = -0.23;
    glow.scale.setScalar(0.5);
    swing.add(flame, glow);
    return { flame, glow };
  }
  const { flame, glow } = build();

  // The light the lantern throws on the world. Always in the scene (changing the number of lights
  // recompiles every shader: a visible hitch), only its strength changes.
  const light = new THREE.PointLight(look.mix(look.light, look.accent[0], 0.4), 0, 13, 1.6);
  light.position.set(0.25, -0.15, -0.2);
  camera.add(light);

  const s = { x: 0, y: 0, vx: 0, vy: 0, ang: 0, angVel: 0, use: 0, throwT: 0, warmth: 1, flare: 0, time: 0, reach: 0, reachNow: 0 };

  return {
    root,
    light,
    reset() {
      Object.assign(s, { x: 0, y: 0, vx: 0, vy: 0, ang: 0, angVel: 0, use: 0, throwT: 0, warmth: 1, flare: 0, reach: 0, reachNow: 0 });
    },
    use() { s.use = 1; s.flare = 1; }, // thrust forward: "I did that"
    throwIt() { s.throwT = 1; },
    setWarmth(k) { s.warmth = k; }, // 0..1: the flame is the health meter
    setReach(k) { s.reach = k; }, // 0..1: holding Use lifts the lantern toward the thing
    setVisible(on) { root.visible = on; },

    // player: for look deltas, stride and speed. dusk 0..1: the darker it gets, the more the lantern matters.
    update(dt, player, dusk) {
      s.time += dt;
      const sway = tune.comfort.handSway;
      // Lag behind the view: turning right leaves the hand a little to the left, then it catches up.
      const turnX = player.lookDx / dt; // radians per second
      const turnY = player.lookDy / dt;
      s.vx += (-turnX * 3 * sway - s.x * 120 - s.vx * 18) * dt;
      s.vy += (-turnY * 3 * sway - s.y * 120 - s.vy * 18) * dt;
      s.x = THREE.MathUtils.clamp(s.x + s.vx * dt, -0.12, 0.12);
      s.y = THREE.MathUtils.clamp(s.y + s.vy * dt, -0.1, 0.1);
      // The lantern is a little pendulum pushed by turning and by each footstep.
      s.angVel += (turnX * 1.5 * sway + Math.sin(player.stride) * player.moving * 3 * tune.comfort.handBob - s.ang * 40 - s.angVel * 3.5) * dt;
      s.ang = THREE.MathUtils.clamp(s.ang + s.angVel * dt, -0.6, 0.6);
      s.use = Math.max(0, s.use - dt * 3.2);
      s.throwT = Math.max(0, s.throwT - dt * 4);
      s.flare = Math.max(0, s.flare - dt * 1.6);

      const bob = tune.comfort.handBob * player.moving;
      s.reachNow += (s.reach - s.reachNow) * Math.min(1, 12 * dt);
      const useK = Math.sin(Math.min(1, s.use) * Math.PI) + s.reachNow * 0.7; // out and back, plus the reach while holding
      const thr = Math.sin(s.throwT * Math.PI);
      rig.position.set(
        REST.x + s.x + Math.sin(player.stride) * 0.018 * bob - useK * 0.1,
        REST.y + s.y - Math.cos(player.stride) ** 2 * 0.03 * bob + player.dip * 1.6 + useK * 0.1 + thr * 0.05,
        REST.z - useK * 0.2 - thr * 0.16,
      );
      rig.rotation.set(-thr * 0.5 + useK * 0.2, s.x * 1.5, -s.x * 2);
      swing.rotation.z = s.ang;
      swing.rotation.x = -s.vy * 0.4 + thr * 0.6;

      const flick = 1 + Math.sin(s.time * 13) * 0.05 + Math.sin(s.time * 7.3) * 0.05;
      const size = (0.45 + 0.55 * s.warmth) * flick * (1 + s.flare * 0.8);
      flame.scale.set(size, size * 1.35, size);
      glow.scale.setScalar(0.5 * size + s.flare * 0.5);
      light.intensity = (tune.world.handLight * (0.35 + 0.65 * dusk) * (0.4 + 0.6 * s.warmth) + s.flare * 6) * flick;
    },
  };
}
