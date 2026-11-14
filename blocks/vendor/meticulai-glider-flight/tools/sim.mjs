#!/usr/bin/env node
// The glider in plain Node, no browser: the same model, air and autopilot as the demo, over the sample world (ground
// and water contact only). For tuning: change a number with --set and see how far the route gets.
// Usage: node tools/sim.mjs [--every 5] [--quiet] [--set key=value ...] [--plan route|handsoff|direct]
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { createGlider, TUNE } from '../src/glider.js';
import { createAutopilot, touchdown } from '../src/autopilot.js';
import { createSampleWorld, SAMPLE_ROUTE } from '../src/sample-world.js';

export function simulate({ plan = SAMPLE_ROUTE, tune = { ...TUNE }, world = createSampleWorld(), every = 0, print = console.log, maxSecs = 600 } = {}) {
  const glider = createGlider(world, tune);
  const pilot = createAutopilot({ glider, world });
  pilot.start(plan);
  const L = world.launch;
  // the launch: a run and a jump off the hill at 15.5 m/s, climbing 2.4 m/s (clear of the stall)
  glider.reset(new THREE.Vector3(L.x, L.y, L.z), L.heading, 15.5 * tune.speedScale, 2.4);
  const STEP = 1 / 120;
  let t = 0, dist = 0, maxAlt = L.y, lastPrint = -1e9, result = null, minLD = Infinity;
  const track = [];
  for (let frame = 0; frame < 60 * maxSecs && !result; frame++) {
    pilot.update(1 / 60);
    for (let k = 0; k < 2; k++) {
      const px = glider.pos.x, pz = glider.pos.z;
      glider.step(STEP, pilot.state);
      dist += Math.hypot(glider.pos.x - px, glider.pos.z - pz);
      t += STEP;
      const kind = touchdown(glider, world);
      if (kind) {
        const g = world.landing;
        result = { kind, t: +t.toFixed(1), x: Math.round(glider.pos.x), z: Math.round(glider.pos.z), fromGoal: Math.round(Math.hypot(glider.pos.x - g.x, glider.pos.z - g.z)), sink: +(-glider.vspeed).toFixed(1), speed: +glider.speed.toFixed(1), flown: Math.round(dist), maxAlt: Math.round(maxAlt) };
        break;
      }
    }
    maxAlt = Math.max(maxAlt, glider.pos.y);
    if (frame % 30 === 0) track.push({ t, x: glider.pos.x, y: glider.pos.y, z: glider.pos.z, speed: glider.speed, vs: glider.vspeed, thermal: glider.info.thermal?.id || null, stall: glider.stallBreak > 0 });
    if (every && t - lastPrint >= every) {
      lastPrint = t;
      const p = glider.pos;
      print(`t ${t.toFixed(0).padStart(4)}  pos ${p.x.toFixed(0).padStart(5)},${p.z.toFixed(0).padStart(5)}  alt ${p.y.toFixed(0).padStart(4)}  agl ${glider.info.agl.toFixed(0).padStart(4)}  spd ${glider.speed.toFixed(1).padStart(5)}  vs ${glider.vspeed.toFixed(1).padStart(5)}  L/D ${(glider.groundSpeed / Math.max(-glider.vspeed, 0.01)).toFixed(1).padStart(5)}  bank ${((glider.bank * 180) / Math.PI).toFixed(0).padStart(4)}  a ${glider.alpha.toFixed(1).padStart(5)}  g ${glider.gLoad.toFixed(2)}  lift ${glider.info.lift.toFixed(1).padStart(5)} ${glider.info.thermal?.id || ''}`);
    }
  }
  return { result, log: pilot.log, track, glider };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const tune = { ...TUNE };
  for (let i = 0; i < args.length; i++) if (args[i] === '--set') { const [k, v] = args[i + 1].split('='); tune[k] = v === 'true' ? true : v === 'false' ? false : +v; }
  const plans = { route: SAMPLE_ROUTE, handsoff: [{ do: 'idle' }], direct: [{ do: 'dive', secs: 1.6 }, { do: 'land' }] };
  const { result, log } = simulate({ plan: plans[opt('plan', 'route')], tune, every: args.includes('--quiet') ? 0 : +opt('every', 5) });
  for (const l of log) console.log(l);
  console.log('RESULT', JSON.stringify(result));
}
