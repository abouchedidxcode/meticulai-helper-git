// Node check (no browser): the bot drives the player's car against the rivals for a whole race.
//   node scripts/race-sim.mjs [track index] [seed] [bot.pace] [verbose] [group.id=value ...]
// No car-to-car bumps here; it is for balancing lap times, drifts, rail hits and the rubber band.
import fs from 'node:fs';
import { TRACKS } from '../src/game/tracks.js';
import { buildTrack } from '../src/game/track.js';
import { createHandling } from '../src/game/handling.js';
import { createRivals } from '../src/game/rivals.js';
import { createDriver } from '../src/game/bot.js';
import { makeProgress, stepProgress, raceDistance } from '../src/game/race.js';
const raw = JSON.parse(fs.readFileSync(new URL('../src/tuning.json', import.meta.url)));
const tune = Object.fromEntries(Object.entries(raw).map(([g, o]) => [g, Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.value]))]));
const [ti = 0, seed = 1, pace, verbose, ...sets] = process.argv.slice(2);
if (pace) tune.bot.pace = Number(pace);
for (const kv of sets) { const [k, v] = kv.split('='); const [g, id] = k.split('.'); tune[g][id] = Number(v); }
let a = Number(seed) >>> 0;
const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rng = { next, range: (lo, hi) => lo + (hi - lo) * next(), chance: (p) => next() < p, sign: () => (next() < 0.5 ? -1 : 1) };
const track = buildTrack(TRACKS[Number(ti)]);
const car = createHandling({ track, tune });
const rivals = createRivals({ track, tune, rng });
const driver = createDriver({ track, tune, rng });
const grid = [0, 1, 2, 3].map((i) => ({ s: track.length - 9 - i * 6.5, lat: i % 2 ? 2.7 : -2.7 }));
rivals.reset(grid, 3);
rivals.list.forEach((r) => (r.progress = makeProgress(track, r.s)));
car.place(grid[3].s, grid[3].lat, 0);
const progress = makeProgress(track, car.loc.s);
const me = { s: 0, lat: 0, v: 0, name: 'You' };
let time = 0, walls = 0, wallCool = 0, drifts = 0, boosts = 0, lead = 0, posLog = [], minV = 99, off = 0, changes = 0, lastPos = 4;
driver.reset();
while (!progress.finished && time < 300) {
  const dt = 1 / 60;
  time += dt;
  const c = driver.think(dt, car);
  const was = car.drifting;
  car.update(dt, c, true);
  if (car.drifting && !was) drifts++;
  if (car.boosted) boosts++;
  wallCool -= dt;
  if (car.wallHit > 1.5 && wallCool <= 0) { walls++; wallCool = 0.6; if (verbose) console.log(`  rail at s=${car.loc.s.toFixed(0)} t=${time.toFixed(1)} into=${car.wallHit.toFixed(1)}`); }
  if (car.offroad) off += dt;
  me.s = car.loc.s; me.lat = car.loc.lat; me.v = car.speed;
  const what = stepProgress(track, progress, car.loc.s, time);
  for (const r of rivals.list) stepProgress(track, r.progress, r.s, time);
  me.distance = raceDistance(track, progress, car.loc.s);
  for (const r of rivals.list) r.distance = raceDistance(track, r.progress, r.s);
  rivals.update(dt, [me, ...rivals.list], (r) => me.distance - r.distance, true);
  const pos = 1 + rivals.list.filter((r) => r.distance > me.distance).length;
  if (pos !== lastPos) { changes++; lastPos = pos; }
  if (pos === 1) lead += dt;
  if (what === 'lap' || what === 'finish') console.log(`lap ${progress.lapTimes.length}: ${progress.last.toFixed(1)} s  pos ${pos}  ${what === 'finish' ? 'finished' : `gaps ${rivals.list.map((r) => `${r.name} ${(r.distance - me.distance).toFixed(0)}m`).join(', ')}`}`);
  if (verbose && Math.round(time * 60) % 120 === 0) console.log(`t=${time.toFixed(0)} s=${car.loc.s.toFixed(0)} v=${(car.speed * 3.6).toFixed(0)} pos=${pos} lat=${car.loc.lat.toFixed(1)} drift=${car.drifting ? 1 : 0}`);
}
const finalPos = 1 + rivals.list.filter((r) => r.progress.finished && r.progress.finishTime < progress.finishTime).length;
console.log(`${track.name} seed ${seed}: finished ${finalPos} in ${time.toFixed(1)} s, best lap ${progress.best.toFixed(1)}, rail hits ${walls}, drifts ${drifts}, boosts ${boosts}, off-road ${off.toFixed(1)} s, led ${lead.toFixed(0)} s, position changes ${changes}`);
