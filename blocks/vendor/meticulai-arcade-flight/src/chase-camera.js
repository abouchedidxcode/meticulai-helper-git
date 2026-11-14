// The chase camera from Dragon Aces: behind the flyer, looking along the mouse aim (not the nose), so the flyer swings
// across the frame as it turns toward where you point. Springs are tight along the view and loose sideways and up,
// so turns have weight. The boom stretches with speed and boost, shortens on the brake and when skimming low; the
// view banks a third of the flyer's bank; FOV is a spring that overshoots, so boost and barrel rolls punch; a fine
// tremor comes with boost, low flying and the stall buffet.
// Every number is the live game's. Lengths scale with `boom` (the game draws its dragons 1.4x life size and scales
// the boom to match; springs, rates and FOV never scale).
import * as THREE from 'three';
import { bankOf, rightOf } from './flight.js';

const V3 = THREE.Vector3;
const clamp = THREE.MathUtils.clamp;
const UP = new V3(0, 1, 0);
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _e = new V3(), _f = new V3();
const _r = [0, 0, 0];

// smooth pseudo-random in [-1, 1]: a few detuned sines read as organic shake (white noise just jitters)
const wob = (t, s) => (Math.sin(t + s) * 0.5 + Math.sin(t * 2.17 + s * 1.7) * 0.3 + Math.sin(t * 4.31 + s * 0.6) * 0.2);

/**
 * @param {THREE.PerspectiveCamera} cam
 * @param {{boom?: number, floorAt?: (x:number, z:number) => number}} [opts]
 *   boom: length scale (1.4 in the game, sized for a ~12 m wingspan); floorAt: ground height, so the camera never
 *   goes under it and the "low" and "canyon wall" feel can kick in. Without it the ground is ignored.
 */
export function createChaseCamera(cam, opts = {}) {
  const BOOM = opts.boom ?? 1.4;
  const floorAt = opts.floorAt || null;
  const st = {
    t: 0,
    dir: new V3(0, 0, -1), dirInit: false,
    boost: 0, brake: 0, speedN: 0, low: 0, wall: 0, stall: 0,
    roll: 0, fov: 66, fovVel: 0,
    kick: new V3(),
    wasBoost: false, wasDodge: false,
    pos: new V3(), // camera position before shake
    camPos: new V3(), camLook: new V3(), placed: false,
    shake: 0, // trauma 0..1: add to it on hits and explosions (api.addShake)
  };

  return {
    state: st,
    /** Trauma for a hit or a blast (0..1; it is squared, so 0.3 is a nudge and 1 is a slam). */
    addShake(v) { st.shake = Math.min(1, st.shake + v); },
    /** Jump straight to the wanted spot (after a respawn or a cut). */
    cut() { st.placed = false; st.dirInit = false; },
    /**
     * @param {number} dt
     * @param {object} fs flight state
     * @param {number[]|THREE.Vector3} aim world aim direction (pilot.aimDir())
     * @param {{x:number, y:number}} [freeLook] free-look angles (rad), optional
     */
    update(dt, fs, aim, freeLook) {
      const K = (r) => 1 - Math.exp(-r * dt);
      st.t += dt;
      const speed = fs.speed, vy = fs.vel[1], bank = bankOf(fs.q), dodging = fs.dodge > 0, boosting = fs.boosting;
      st.boost += ((boosting ? 1 : 0) - st.boost) * K(boosting ? 8 : 3);
      st.brake += ((fs.braking ? 1 : 0) - st.brake) * K(6);
      st.speedN += (clamp((speed - 60) / 130, 0, 1) - st.speedN) * K(3);
      st.stall += (clamp((50 - speed) / 24, 0, 1) - st.stall) * K(5);
      let lowT = 0, wallT = 0;
      if (floorAt) {
        const fast = clamp((speed - 55) / 70, 0, 1);
        const agl = fs.p[1] - floorAt(fs.p[0], fs.p[2]);
        const ahead = fs.p[1] + fs.vel[1] * 0.6 - floorAt(fs.p[0] + fs.vel[0] * 0.6, fs.p[2] + fs.vel[2] * 0.6);
        lowT = clamp(1 - Math.min(agl, ahead) / 120, 0, 1) * fast;
        // canyon walls beside the wings
        const r = rightOf(fs.q, _r);
        for (let side = -1; side <= 1; side += 2) {
          const h = floorAt(fs.p[0] + r[0] * side * 40, fs.p[2] + r[2] * side * 40);
          wallT = Math.max(wallT, clamp((h - fs.p[1] + 25) / 50, 0, 1));
        }
        wallT *= fast;
      }
      st.low += (lowT - st.low) * K(4);
      st.wall += (wallT - st.wall) * K(6);

      // edge events: boost punch, barrel roll snap
      if (boosting && !st.wasBoost) { st.fovVel += 46; st.shake = Math.min(1, st.shake + 0.22); st.kick.x += -0.01; }
      st.wasBoost = boosting;
      if (dodging && !st.wasDodge) { st.fovVel += 34; st.shake = Math.min(1, st.shake + 0.12); }
      st.wasDodge = dodging;
      st.kick.multiplyScalar(Math.exp(-8 * dt));

      // view direction: the aim (plus free look), smoothed a touch
      const dir = Array.isArray(aim) ? _a.set(aim[0], aim[1], aim[2]) : _a.copy(aim);
      if (freeLook && (freeLook.x || freeLook.y)) {
        dir.applyAxisAngle(_b.set(0, 1, 0), freeLook.x);
        const side = _b.crossVectors(dir, UP).normalize();
        dir.applyAxisAngle(side, freeLook.y);
      }
      if (!st.dirInit) { st.dir.copy(dir); st.dirInit = true; }
      st.dir.lerp(dir, K(30)).normalize();
      const D = st.dir;

      const focus = _d.set(fs.p[0], fs.p[1], fs.p[2]);
      const want = _c;
      const dist = (20.5 + Math.min(13, speed * 0.055) + st.boost * 3.4 - st.brake * 2.2 - st.low * 2.6 + st.stall * 1.5) * BOOM;
      want.copy(focus).addScaledVector(D, -dist);
      want.y += (5.4 - st.low * 1.7 + Math.max(0, D.y) * 3) * BOOM;
      const lookAt = _f.copy(focus).addScaledVector(D, 70);
      const fovT = 65 + st.speedN * 7 + st.boost * 6 + st.low * 3.5 + st.wall * 1.5 + clamp((-vy - 40) / 140, 0, 1) * 3 - st.brake * 3 - st.stall * 4;
      if (!st.placed) { st.camPos.copy(want); st.placed = true; }
      // camera-frame spring: tight along the view, loose sideways and up so turns have weight
      const right = _e.crossVectors(D, UP).normalize();
      const up2 = _b.crossVectors(right, D).normalize();
      const err = _a.copy(st.camPos).sub(want);
      let ef = err.dot(D), er = err.dot(right), eu = err.dot(up2);
      ef *= Math.exp(-17 * dt);
      const kl = Math.exp(-(6.2 + st.stall * 3) * dt);
      er = clamp(er * kl, -7.5, 7.5);
      eu = clamp(eu * kl, -5, 5);
      st.camPos.copy(want).addScaledVector(D, ef).addScaledVector(right, er).addScaledVector(up2, eu);
      if (!isFinite(st.camPos.x)) st.camPos.copy(want);
      // a flick can swing the boom through the wings: never closer than about a wingspan
      const off = _a.copy(st.camPos).sub(focus);
      const od = off.length();
      if (od < 14.5 * BOOM && od > 1e-3) st.camPos.copy(focus).addScaledVector(off, (14.5 * BOOM) / od);
      st.pos.copy(st.camPos);
      if (floorAt) {
        const floorY = floorAt(st.pos.x, st.pos.z) + 3.5;
        if (st.pos.y < floorY) st.pos.y = floorY;
      }

      // orientation
      st.camLook.copy(lookAt);
      cam.position.copy(st.pos);
      cam.up.set(0, 1, 0);
      cam.lookAt(st.camLook);
      // bank with the flyer (sin keeps it smooth through loops); level and steady during a barrel roll
      const rollT = !dodging ? Math.sin(bank) * 0.34 : 0;
      st.roll += (rollT - st.roll) * K(dodging ? 10 : 6);
      let rz = -st.roll + st.kick.z;
      let rx = st.kick.x, ry = st.kick.y;
      // shake: trauma squared, smooth noise
      if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 1.7);
      const tr = Math.min(1, st.shake);
      const amp = tr * tr * 0.05;
      const tt = st.t * 78;
      rx += wob(tt, 1.3) * amp;
      ry += wob(tt * 0.93, 7.1) * amp;
      rz += wob(tt * 0.8, 3.7) * amp * 1.6;
      // fine tremor: boost, low flying between canyon walls, stall buffet
      const trem = st.boost * 0.0016 + st.low * 0.0032 + st.wall * 0.0045 + st.stall * 0.008;
      if (trem > 0) {
        const t2 = st.t * 190;
        rx += wob(t2, 2.2) * trem;
        ry += wob(t2 * 1.1, 5.9) * trem;
        rz += wob(t2 * 0.9, 8.4) * trem * 1.5;
      }
      cam.rotateZ(rz);
      cam.rotateX(rx);
      cam.rotateY(ry);
      // FOV: a spring with a little overshoot, so boost and rolls punch
      st.fovVel += ((fovT - st.fov) * 70 - st.fovVel * 12) * dt;
      st.fov += st.fovVel * dt;
      cam.fov = clamp(st.fov, 40, 105);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
    },
  };
}
