// THE ARCHERY BOT, headless: puts numbers on the feel without a browser.
//
// A rider canters along (8 m/s); three enemy riders cross his line of sight at a set distance and speed. For each
// shot the bot does what a person does: put the crosshair on a rider's chest (plus its own aiming error, held for
// the whole draw like a hand that is a little off), hold the button, and let go a human moment after full draw.
// No lead, no hold-over. It goes through the real code: createBow, createAim (track + resolve), aimShot, createFlight.
//   mode = human     about 0.3 degrees of aiming error, lets go 0.05 to 0.25 s after full draw
//          careless  about 0.7 degrees of error, lets go the instant it is ready
//          exact     no error (the ceiling: what the shot model itself does)
//
//   node tools/bot.mjs [--mode human] [--shots 200] [--speed 12.5] [--no-help]
//   import { runBand } from './tools/bot.mjs'   (the tests do)
import { createAim } from '../src/aim.js';
import { createBow, aimShot, BOW_DEFAULTS } from '../src/bow.js';
import { createFlight } from '../src/flight.js';
import { createTargets, bodiesTarget } from '../src/targets.js';
import { Vec3 } from '../src/vec3.js';
import { pathToFileURL } from 'node:url';

export const BANDS = [30, 60, 100, 150];

function rngOf(seed) {
  let s = (seed >>> 0) || 1;
  const r = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  return r;
}

/** One distance band. -> { dist, shots, rider (hits on the one aimed at), any (hits on any rider), meanMiss } */
export function runBand({ dist = 60, speed = 12.5, mode = 'human', shots = 100, seed = 1, help = true, mountSpeed = 8 } = {}) {
  const rng = rngOf(seed * 7919 + dist);
  const SIGMA = mode === 'human' ? 0.005 : mode === 'careless' ? 0.012 : 0;
  const dt = 1 / 60;
  let rider = 0, any = 0;
  for (let s = 0; s < shots; s++) {
    // the world for one shot: the shooter at the origin riding +Z, three riders in a file crossing at `dist`
    const eye = new Vec3(0, 2.4, 0), mountVel = new Vec3(0, 0, mountSpeed);
    const dir0 = rng() < 0.5 ? 1 : -1;
    const bodies = [];
    for (let k = 0; k < 3; k++) {
      const z = dist * 0.3 + (k - 1) * 7 + (rng() - 0.5) * 4, x = dist + (rng() - 0.5) * 4;
      const b = { key: k, alive: true, center: new Vec3(x, 1.95, z), vel: new Vec3(0, 0, dir0 * speed), radius: 0.3, kind: 'body' };
      b.capsule = { a: new Vec3(), b: new Vec3(), r: 0.24 };
      b.horse = { center: new Vec3(), radius: 0.62, kind: 'horse', seekBody: true };
      b.extra = [b.horse];
      bodies.push(b);
    }
    const place = () => { for (const b of bodies) { b.capsule.a.set(b.center.x, 1.45, b.center.z); b.capsule.b.set(b.center.x, 2.25, b.center.z); b.horse.center.set(b.center.x, 1.0, b.center.z); } };
    place();
    const targets = createTargets(); targets.add(bodiesTarget({ bodies: () => bodies }));
    let time = 0;
    const aim = createAim({ targets, options: help ? {} : { assistDeg: 0 }, now: () => time, carrierVel: () => mountVel });
    const bow = createBow(help ? {} : { guideTurn: 0, assistNear: 0 });
    const flight = createFlight({ targets });
    const want = bodies[1];
    // the hand's error: a fixed offset of the crosshair from his chest, in two directions across the line of sight
    const ex = rng.gauss() * SIGMA, ey = rng.gauss() * SIGMA;
    const letGo = mode === 'human' ? 0.05 + 0.2 * rng() : 0;
    const aimDir = new Vec3(), side = new Vec3(), up = new Vec3();
    const pointAt = () => {
      aimDir.subVectors(want.center, eye).normalize();
      side.crossVectors(aimDir, { x: 0, y: 1, z: 0 }).normalize(); up.crossVectors(side, aimDir);
      aimDir.addScaledVector(side, ex).addScaledVector(up, ey).normalize();
    };
    const step = () => { time += dt; eye.addScaledVector(mountVel, dt); for (const b of bodies) b.center.addScaledVector(b.vel, dt); place(); };
    let shot = null, readyFor = 0, tick = 0;
    for (let k = 0; k < 240 && !shot; k++) {
      step(); pointAt();
      if (tick++ % 6 === 0) aim.track(eye, aimDir, time);      // the HUD's look, 10 times a second
      aim.follow(eye);
      if (bow.state.ready) readyFor += dt;
      const held = k > 3 && !(bow.state.ready && readyFor >= letGo);
      shot = bow.update(dt, held);
    }
    if (!shot) continue;
    const s0 = aimShot({ aim, eye, aimDir, from: eye, carry: mountVel, speed: shot.speed, options: bow.options });
    const a = flight.launch({ pos: eye, vel: s0.vel, time, guide: s0.guide, byPlayer: true });
    let res = null;
    for (let k = 0; k < 600 && !res; k++) { step(); res = flight.step(a, time, dt); }
    if (res && res.hit.key !== undefined && res.hit.kind !== 'ground') { any++; if (res.hit.key === want.key) rider++; }
  }
  return { dist, shots, rider: rider / shots, any: any / shots };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
  const mode = arg('mode', 'human'), shots = Number(arg('shots', 200)), speed = Number(arg('speed', 12.5)), help = !process.argv.includes('--no-help');
  console.log(`Bot "${mode}", ${shots} shots a band, riders crossing at ${speed} m/s, shooter at a canter (8 m/s), aim help ${help ? 'on' : 'off'}`);
  console.log(`Bow: full draw ${BOW_DEFAULTS.drawTime} s, ${BOW_DEFAULTS.speedFull} m/s`);
  console.log('distance   hit the one aimed at   hit a rider');
  for (const d of BANDS) {
    const r = runBand({ dist: d, speed, mode, shots, help });
    console.log(`${String(d).padStart(5)} m   ${(r.rider * 100).toFixed(0).padStart(10)} %   ${(r.any * 100).toFixed(0).padStart(12)} %`);
  }
}
