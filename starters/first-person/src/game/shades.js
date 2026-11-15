// The shades: slow dark figures that drift toward you. The danger, and how it stays FAIR.
//
// Each dark lantern has a shade haunting it. Each shade goes through readable phases (game time):
//   rising   it grows out of the ground at the start of the run
//   haunt    it circles its dark lantern, in plain sight from far away      (you choose when to meet it)
//   drift    you came close (or lit its lantern): it glides toward you, slower than you walk
//   windup   close enough: it stops, swells and hisses for a moment         (the warning)
//   lunge    a short fast rush in the direction it warned                   (step aside, or be touched)
//   recover  it hangs still after a lunge                                   (your opening)
//   stunned  hit by a spark: it shrinks, pales and drifts back for a few seconds
//   banished caught inside a lantern's light at the moment it is lit: it dissolves for good   (the payoff)
// The pressure grows by itself: each lit lantern makes the remaining shades notice you from further away
// (by the end they cross the whole garden for you) and a little faster, and so does the deepening dusk.
// Shades cannot enter a lit lantern's circle: they are pushed to its edge.
// They pass through walls (they are smoke). To make them walk round walls instead, steer them along
// findPath() from level.js.
//
// What to change: numbers in tuning.json (group "shades"); the look in build(); who haunts what in
// reset(). For waves that arrive over time instead, call api.place(x, z) from game.js on a timer.

import * as THREE from 'three';
import { glowTexture } from './scenery.js';

const MAX = 6; // meshes are made once, up front
const HAUNT_RADIUS = 2.4; // metres from its lantern while haunting
export const SHADE_CHEST = 1.25; // metres above the ground: where sparks aim

// Is it coming for the player right now? (HUD hints, sound, the bot.)
export const isThreat = (s) => s.active && (s.state === 'drift' || s.state === 'windup' || s.state === 'lunge' || s.state === 'recover');
// Can a spark hit it?
export const canHit = (s) => s.active && (s.state === 'haunt' || isThreat(s));

export function createShades({ scene, look, tune, audio, rng, lanterns }) {
  // Nearly black, leaning toward the danger colour, with a faint danger glow of its own: a dark shape on
  // a bright day AND a readable one on a dark night.
  const bodyCol = look.mix(look.shade(look.shadow, -0.6), look.danger, 0.16);
  const bodyGeo = new THREE.CylinderGeometry(0.2, 0.55, 1.9, 9, 3, true);
  // A ragged hem: push the bottom ring in and out.
  const bp = bodyGeo.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    if (bp.getY(i) < -0.9) {
      const a = Math.atan2(bp.getZ(i), bp.getX(i));
      bp.setY(i, bp.getY(i) + Math.sin(a * 4.5) * 0.14);
    }
  }
  bodyGeo.computeVertexNormals();
  const headGeo = new THREE.SphereGeometry(0.24, 10, 8);
  const eyeGeo = new THREE.SphereGeometry(0.045, 8, 6);

  function build() {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: bodyCol, emissive: look.danger, emissiveIntensity: 0.14, flatShading: true, transparent: true, side: THREE.DoubleSide });
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 1.05;
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 2.05;
    // Eyes and a low halo in the DANGER colour: the part that must read in every palette, day or night.
    const eyeMat = new THREE.MeshBasicMaterial({ color: look.danger, transparent: true });
    const eyes = [-1, 1].map((side) => {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(side * 0.09, 2.08, 0.2);
      return e;
    });
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: look.danger, transparent: true, opacity: 0.4, depthWrite: false }));
    aura.position.y = 1.5;
    aura.scale.set(2.6, 3.8, 1);
    group.add(body, head, ...eyes, aura);
    group.rotation.order = 'YXZ'; // turn to face first, then lean
    group.visible = false;
    scene.add(group);
    return { group, mat, eyeMat, aura };
  }

  const list = Array.from({ length: MAX }, (_, i) => ({
    i, ...build(),
    pos: new THREE.Vector3(), prev: new THREE.Vector3(), dir: new THREE.Vector3(),
    active: false, state: 'idle', t: 0, weave: 0, dist: 99, fade: 0, swell: 0, home: null,
  }));

  const whisper = audio.noiseLoop({ freq: 420, q: 2.5 }); // grows as the nearest shade closes in
  const v = new THREE.Vector3();
  let heartbeat = 0;

  function enter(s, state) {
    const was = s.state;
    s.state = state;
    s.t = 0;
    if (state === 'windup') audio.blip({ freq: 150, slide: 2.4, length: tune.shades.windup, type: 'sawtooth', vol: 0.09, vary: 1 });
    if (state === 'lunge') audio.whoosh({ vol: 0.22, length: 0.3, from: 300, to: 1500 });
    if (state === 'banished') audio.whoosh({ vol: 0.2, length: 0.8, from: 1400, to: 200 });
    if (state === 'drift' && was === 'haunt') audio.blip({ freq: 110, slide: 1.5, length: 0.5, type: 'sawtooth', vol: 0.06 }); // it has noticed you
  }

  const api = {
    list,
    get active() { return list.filter((s) => s.active); },
    nearest: null, // the closest shade that can still hurt, or null

    // A new run: one shade rises beside every dark lantern except the one nearest the player (the first
    // lantern is free: it teaches "use" before it teaches "danger").
    reset(startPos = null) {
      for (const s of list) { s.active = false; s.state = 'idle'; s.group.visible = false; s.home = null; }
      const homes = [...lanterns.list];
      if (startPos) homes.sort((a, b) => a.pos.distanceTo(startPos) - b.pos.distanceTo(startPos)).shift();
      homes.slice(0, Math.min(MAX, tune.shades.maxCount)).forEach((l, k) => {
        const s = list[k];
        s.home = l;
        s.weave = rng.range(0, 6.28);
        s.pos.set(l.pos.x + Math.cos(s.weave) * HAUNT_RADIUS, 0, l.pos.z + Math.sin(s.weave) * HAUNT_RADIUS);
        s.prev.copy(s.pos);
        s.active = true;
        s.fade = 0;
        enter(s, 'rising');
      });
      heartbeat = 0;
      api.nearest = null;
      whisper.set(0);
    },
    // Wake every shade at once (a skip moment: the late game).
    wakeAll() {
      for (const s of list) if (s.active && s.state === 'haunt') { s.home = null; enter(s, 'drift'); }
    },
    mute() { whisper.set(0); },

    stun(s, fromX, fromZ) {
      if (!canHit(s)) return false;
      s.home = null; // once disturbed it never goes back to haunting
      s.dir.set(s.pos.x - fromX, 0, s.pos.z - fromZ);
      if (s.dir.lengthSq() < 1e-4) s.dir.set(1, 0, 0);
      s.dir.normalize();
      enter(s, 'stunned');
      return true;
    },
    // Fresh light: every shade inside the new circle dissolves for good. Returns how many.
    banishFrom(x, z, radius) {
      let n = 0;
      for (const s of list) {
        if (!s.active || s.state === 'banished' || Math.hypot(s.pos.x - x, s.pos.z - z) > radius + 0.5) continue; // radius = Infinity: all of them
        s.home = null;
        enter(s, 'banished');
        n++;
      }
      return n;
    },
    // Put one right in front of the player (a skip moment for testing).
    place(x, z) {
      const s = list.find((it) => !it.active) ?? list[0];
      s.pos.set(x, 0, z);
      s.prev.copy(s.pos);
      s.active = true;
      s.home = null;
      s.fade = 1;
      enter(s, 'drift');
      return s;
    },

    // run: { lit, dusk (0..1), playing }. onTouch(shade) is called when one reaches the player.
    update(dt, time, playerPos, run, onTouch) {
      const t = tune.shades;
      // Always slower than a walking player: being caught is a choice or a mistake, never a certainty.
      const speed = Math.min(tune.move.walkSpeed * 0.85, t.speed * (1 + 0.35 * run.dusk) + run.lit * t.speedPerLantern);
      let nearest = null;

      for (const s of list) {
        if (!s.active) continue;
        s.prev.copy(s.pos);
        s.t += dt;
        v.set(playerPos.x - s.pos.x, 0, playerPos.z - s.pos.z);
        s.dist = v.length();
        if (s.dist > 1e-3) v.multiplyScalar(1 / s.dist);
        s.fade = Math.min(1, s.fade + dt * 0.7);
        let swell = 0;

        if (s.state === 'rising') {
          if (s.t > 1.8) enter(s, s.home ? 'haunt' : 'drift');
        } else if (s.state === 'haunt') {
          // Circle the dark lantern slowly. Wake when the player comes near, or the lantern is lit.
          s.weave += dt * 0.45;
          s.pos.set(s.home.pos.x + Math.cos(s.weave) * HAUNT_RADIUS, 0, s.home.pos.z + Math.sin(s.weave) * HAUNT_RADIUS);
          // Each lit lantern makes the rest more restless: late in the run they come from across the garden.
          if (run.playing && (s.dist < t.wakeRange + run.lit * t.restless || s.home.lit)) { s.home = null; enter(s, 'drift'); }
        } else if (s.state === 'drift') {
          // Glide in with a slow sideways weave, so a group does not arrive as one blob.
          const w = Math.sin(time * 0.7 + s.weave) * 0.45;
          s.pos.x += (v.x - v.z * w) * speed * dt;
          s.pos.z += (v.z + v.x * w) * speed * dt;
          if (run.playing && s.dist < t.lungeRange && !lanterns.safeAt(playerPos.x, playerPos.z)) {
            s.dir.copy(v); // it commits to where you are NOW: sidestep during the hiss and it misses
            enter(s, 'windup');
          }
        } else if (s.state === 'windup') {
          swell = s.t / t.windup;
          if (s.t >= t.windup) enter(s, 'lunge');
        } else if (s.state === 'lunge') {
          s.pos.addScaledVector(s.dir, t.lungeSpeed * dt);
          swell = 1;
          if (s.t >= t.lungeTime) enter(s, 'recover');
        } else if (s.state === 'recover') {
          if (s.t >= t.recover) enter(s, 'drift');
        } else if (s.state === 'banished') {
          if (s.t >= 0.9) { s.active = false; continue; }
        } else if (s.state === 'stunned') {
          s.pos.addScaledVector(s.dir, 5 * Math.max(0, 1 - s.t * 1.2) * dt);
          if (s.t >= t.stunTime) enter(s, 'drift');
        }

        // Lit circles are walls to a shade.
        const r = tune.lanterns.safeRadius;
        for (const l of lanterns.list) {
          if (!l.lit || l.glow < 0.6) continue;
          const dx = s.pos.x - l.pos.x;
          const dz = s.pos.z - l.pos.z;
          const d = Math.hypot(dx, dz);
          if (d < r + 0.3 && s.state !== 'banished') {
            const k = (r + 0.3) / Math.max(d, 0.01);
            s.pos.x = l.pos.x + dx * k;
            s.pos.z = l.pos.z + dz * k;
            if (s.state === 'lunge' || s.state === 'windup') enter(s, 'recover');
          }
        }

        const dangerous = s.state === 'drift' || s.state === 'lunge' || s.state === 'windup';
        if (run.playing && dangerous && s.dist < t.touchRadius) onTouch(s);
        if (isThreat(s) && (!nearest || s.dist < nearest.dist)) nearest = s;
        s.swell = swell;
      }
      api.nearest = nearest;

      // Threat you can HEAR: a whisper that grows with nearness, and a heartbeat when it is close.
      const near = nearest && run.playing ? THREE.MathUtils.clamp(1 - nearest.dist / t.hearRange, 0, 1) : 0;
      whisper.set(near * near * 0.5);
      if (near > 0.45) {
        heartbeat -= dt;
        if (heartbeat <= 0) {
          audio.thud({ freq: 58, vol: 0.12 + 0.3 * near, length: 0.16, vary: 0.3 });
          heartbeat = 1.05 - 0.7 * near;
        }
      } else heartbeat = 0;
    },

    render(alpha, time, camera) {
      for (const s of list) {
        s.group.visible = s.active;
        if (!s.active) continue;
        const g = s.group;
        g.position.lerpVectors(s.prev, s.pos, alpha);
        g.position.y = Math.sin(time * 1.3 + s.weave) * 0.08;
        g.rotation.y = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z); // always facing you
        const rise = s.state === 'rising' ? Math.min(1, s.t / 1.8) : 1;
        const stun = s.state === 'stunned' ? Math.min(1, s.t * 4) * Math.min(1, (tune.shades.stunTime - s.t) * 2) : 0;
        const gone = s.state === 'banished' ? Math.min(1, s.t / 0.9) : 0; // dissolving: it thins, rises and fades
        const wob = (1 + Math.sin(time * 3 + s.weave) * 0.03) * (1 - gone * 0.6);
        g.scale.set(wob * (1 + s.swell * 0.25 - stun * 0.3), Math.max(0.02, rise * (1 + s.swell * 0.12 - stun * 0.35 + gone * 0.5)), wob * (1 + s.swell * 0.25 - stun * 0.3));
        g.rotation.x = s.state === 'lunge' ? 0.35 : s.swell * -0.15;
        s.mat.opacity = (0.94 - stun * 0.4) * s.fade * (1 - gone);
        s.mat.emissiveIntensity = 0.14 + s.swell * 0.5; // it reddens as it winds up
        s.eyeMat.opacity = stun > 0.5 ? 0.25 : 1 - gone;
        s.aura.material.opacity = (0.42 + s.swell * 0.45 + Math.sin(time * 5 + s.i) * 0.04) * s.fade * (1 - stun * 0.7) * (1 - gone);
      }
    },
  };
  return api;
}
