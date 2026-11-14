#!/usr/bin/env node
// THE MOVEMENT PROOF, as a command. From TUMEN by Meticulai. Rides scripted scenarios with a herd under the law
// (src/herd.js), looks at every horse after every step (src/checker.js) and exits 1 if any horse ever broke the law.
//
//   node tools/movecheck.mjs                         every scenario (ride, circle, halt, steer, herd), 60 s each
//   node tools/movecheck.mjs --scenario steer --secs 120 --n 80
//   node tools/movecheck.mjs --sabotage all          break the law on purpose, one way at a time: the tool must FAIL
//                                                    each run, with the right check; exits 0 only if all are caught
//   node tools/movecheck.mjs --slide 0.01            a tighter hoof allowance (default 0.03 m)
//
// To prove YOUR game's movement: give createMoveChecker() your own herd (or an object with the same S arrays) and
// call checker.afterStep(dt, t) after every step of your simulation; print formatReport(checker.report()).
import { pathToFileURL } from 'node:url';
import { createHerd, reins, HERO } from '../src/herd.js';
import { createMoveChecker, formatReport } from '../src/checker.js';
import { makeRng } from '../src/rng.js';

export const SCENARIOS = ['ride', 'circle', 'halt', 'steer', 'herd'];
export const SABOTAGE = { drift: ['off-facing'], reverse: ['backward'], teleport: ['jump'], skate: ['hoof slide'], spin: ['turn'], surge: ['accel'], overlap: ['overlap'] };
const SPACING = 160;      // each horse rides its own patch of steppe (the law does not keep horses apart; your steering must)

/** Run one scenario. Returns { report, herd }. */
export function runScenario(kind, { secs = 60, n = 40, seed = 1, sabotage = '', check = {} } = {}) {
  const dt = 1 / 60, steps = Math.round(secs / dt), rnd = makeRng(seed);
  const herd = createHerd({ capacity: n });
  const side = Math.ceil(Math.sqrt(n));
  const home = [];
  for (let k = 0; k < n; k++) {
    const hx = (k % side) * SPACING, hz = Math.floor(k / side) * SPACING;
    home.push([hx, hz]);
    herd.add({ x: hx, z: hz, yaw: rnd() * 6.283, limits: kind === 'steer' && k % 2 === 0 ? HERO : undefined });
  }
  const S = herd.S, chk = createMoveChecker(herd, check);
  // per-horse script state
  const plan = Array.from({ length: n }, () => ({ next: 0, yaw: 0, speed: 0, turn: 0, level: 0, burst: false, tx: 0, tz: 0 }));
  const want = { yaw: 0, speed: 0 };
  let t = 0;
  for (let s = 0; s < steps; s++) {
    t += dt;
    for (let i = 0; i < n; i++) {
      const p = plan[i];
      const dh = Math.hypot(S.x[i] - home[i][0], S.z[i] - home[i][1]), toHome = Math.atan2(home[i][0] - S.x[i], home[i][1] - S.z[i]);
      if (kind === 'ride') {          // straight on, changing pace: walk, trot, canter, gallop, pull up
        if (t >= p.next) { p.speed = [0, 1.6, 3.5, 6.5, 12, 13.5][Math.floor(rnd() * 6)]; p.next = t + 3 + rnd() * 6; p.yaw = dh > 60 ? toHome : S.yaw[i]; }
        herd.step(i, p.yaw, p.speed, dt);
      } else if (kind === 'circle') { // round and round at a steady pace, both ways, tightest the law allows
        if (t >= p.next) { p.speed = [1.6, 3.5, 6.5, 9, 12][Math.floor(rnd() * 5)]; p.turn = rnd() < 0.5 ? 1 : -1; p.next = t + 8 + rnd() * 8; }
        herd.step(i, dh > 70 ? toHome : S.yaw[i] + p.turn, p.speed, dt);
      } else if (kind === 'halt') {   // gallop, halt dead, ask to turn round from the stand, go again
        const ph = (t + i * 0.37) % 12;
        if (ph < 5) herd.step(i, dh > 60 ? toHome : S.yaw[i], 12, dt);
        else if (ph < 8) herd.step(i, S.yaw[i], 0, dt);
        else herd.step(i, S.yaw[i] + Math.PI * 0.9, ph < 10 ? 1.9 : 6.5, dt);
      } else if (kind === 'steer') {  // a player who steers wildly: hard turns both ways at every pace, bursts, halts
        if (t >= p.next) { p.turn = [-1, -1, 0, 1, 1][Math.floor(rnd() * 5)]; p.level = Math.floor(rnd() * 4); p.burst = rnd() < 0.15; p.next = t + 0.3 + rnd() * 2.5; }
        reins(S.yaw[i], dh > 70 ? Math.sign(Math.sin(S.yaw[i] - toHome)) || 1 : p.turn, p.level, p.burst, herd.gaits, want);
        herd.step(i, want.yaw, want.speed, dt);
      } else if (kind === 'herd') {   // go to a point and stop there, again and again (grazing herd)
        if (t >= p.next) { const a = rnd() * 6.283, r = 10 + rnd() * 50; p.tx = home[i][0] + Math.sin(a) * r; p.tz = home[i][1] + Math.cos(a) * r; p.speed = [1.6, 3.5, 6.5, 11][Math.floor(rnd() * 4)]; p.next = t + 4 + rnd() * 8; }
        herd.seek(i, p.tx, p.tz, p.speed, want);
        herd.step(i, want.yaw, want.speed, dt);
      } else throw new Error(`unknown scenario ${kind}`);
    }
    if (sabotage && t > 2) breakTheLaw(sabotage, herd, chk, t, dt);
    chk.afterStep(dt, t);
  }
  return { report: chk.report(), herd };
}

// Break the law on purpose (horses 0..2), each in one way: the checker must notice.
function breakTheLaw(kind, herd, chk, t, dt) {
  const S = herd.S;
  for (let i = 0; i < 3; i++) {
    const c = Math.cos(S.yaw[i]), s = Math.sin(S.yaw[i]);
    if (kind === 'drift') { S.x[i] += c * 0.01; S.z[i] -= s * 0.01; }                       // sideways (a strafing sprite)
    else if (kind === 'reverse' && t > 4) { const d = S.speed[i] * dt * 2 + 0.02; S.x[i] -= s * d; S.z[i] -= c * d; }      // backward (a moonwalk)
    else if (kind === 'teleport' && Math.abs(t - 3) < dt / 2) { S.x[i] += s * 1.5; S.z[i] += c * 1.5; }
    else if (kind === 'skate') S.phase[i] += 0.01;                                          // legs out of step with the ground
    else if (kind === 'spin') S.yaw[i] += 0.05;                                             // a pivot like a sprite
    else if (kind === 'surge' && Math.abs(t - 3) < dt / 2) { S.speed[i] += 3; S.x[i] += s * 3 * dt; S.z[i] += c * 3 * dt; }
    else if (kind === 'overlap' && i === 1) { S.mx[1] = S.mx[0] + 0.2; S.mz[1] = S.mz[0]; S.myaw[1] = S.myaw[0]; }
  }
}

async function main() {
  const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const secs = +opt('secs', 60), n = +opt('n', 40), sab = opt('sabotage', ''), check = {};
  if (opt('slide')) check.slide = +opt('slide');
  if (opt('angle')) check.angleDeg = +opt('angle');
  const scen = opt('scenario', 'all') === 'all' ? SCENARIOS : opt('scenario').split(',');
  let exit = 0;
  if (sab) {
    const kinds = sab === 'all' ? Object.keys(SABOTAGE) : [sab], rows = [];
    for (const k of kinds) {
      const { report } = runScenario(scen.length === SCENARIOS.length ? 'ride' : scen[0], { secs: Math.min(secs, 10), n, sabotage: k, check });
      const caught = !report.ok, right = (SABOTAGE[k] || []).every((w) => report.failed.includes(w));
      rows.push(`  ${k.padEnd(9)} ${caught ? 'CAUGHT' : 'MISSED'}  checks that failed: ${report.failed.join(', ') || '-'}${right ? '' : '  (expected ' + SABOTAGE[k].join(', ') + ')'}`);
      if (!caught || !right) exit = 1;
    }
    console.log('=== sabotage (the tool is only worth something if it fails when the law is broken)\n' + rows.join('\n'));
    console.log(exit ? '\nSOME SABOTAGE WAS NOT CAUGHT' : '\nEvery sabotage was caught.');
  } else {
    const sum = [];
    for (const k of scen) {
      const t0 = Date.now(), { report } = runScenario(k, { secs, n, check });
      console.log(`\n=== ${k}: ${n} horses, ${secs} s, ${((Date.now() - t0) / 1000).toFixed(1)} s to run`);
      console.log(formatReport(report));
      sum.push(`  ${k.padEnd(7)} ${report.ok ? 'ok' : 'FAIL: ' + report.failed.join(', ')}`);
      if (!report.ok) exit = 1;
    }
    console.log('\n=== summary\n' + sum.join('\n'));
    console.log(exit ? '\nMOVEMENT LAW BROKEN' : '\nEvery horse obeyed the movement law in every step.');
  }
  process.exit(exit);
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
