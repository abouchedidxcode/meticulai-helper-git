// RACING STARTER: a three-lap race against three rivals on a low-poly island circuit.
// This file is the rules and the flow: grid -> 3, 2, 1, GO -> race -> finish -> end card.
// The parts it wires together (one file each, all in this folder):
//
//   tracks.js     the tracks as DATA (control points)      track.js     the maths on that data
//   trackMesh.js  road, kerbs, rails, start line, gates    scenery.js   land, water, trees, clouds
//   handling.js   how the player's car drives (the feel)   carModel.js  the car shape and its weight
//   rivals.js     the computer drivers                     race.js      laps, checkpoints, ghost
//   camera.js     the chase camera                         effects.js   speed lines, smoke, skids
//   sound.js      engine, wind, tyres                      hud.js       banner, speed, boost meter
//   bot.js        the ?bot=1 driver                        feedback.js  bumps, scrapes, resets
//   endcard.js    what the end card says
//
// Start with STARTER.md (next to helper.json): it says what is tuned and why, and how to
// make a new track, a time trial, karts with pickups, or boats.

import * as THREE from 'three';
import { createAtmosphere } from '../render/atmosphere.js';
import { TRACKS } from './tracks.js';
import { buildTrack } from './track.js';
import { buildTrackMesh, buildGates } from './trackMesh.js';
import { buildScenery } from './scenery.js';
import { createHandling, clamp } from './handling.js';
import { createCarModel, roadTilt } from './carModel.js';
import { createRivals } from './rivals.js';
import { makeProgress, stepProgress, raceDistance, createGhostRecorder, sampleGhost, ordinal, formatTime } from './race.js';
import { endCard } from './endcard.js';
import { createChaseCamera } from './camera.js';
import { createEffects } from './effects.js';
import { createSound } from './sound.js';
import { createRaceHud } from './hud.js';
import { createDriver, createBot } from './bot.js';
import { createFeedback } from './feedback.js';

export const info = {
  tagline: 'Three laps, three rivals. Drift the corners for a boost and cross the line first.',
  controls: [
    { keys: ['W', 'A', 'S', 'D'], label: 'Accelerate, steer, brake (or arrow keys)' },
    { keys: ['Space'], label: 'Handbrake: hold into a corner to drift, let go for a boost' },
    { keys: ['R'], label: 'Back on the road' },
    { keys: ['Esc'], label: 'Pause' },
    { keys: ['N'], label: 'Leave a note for your agent' },
  ],
};

const ghost = createGhostRecorder(); // lives outside createGame: the best lap survives restarts

export function createGame(ctx) {
  const { input, juice, audio, ui, events, rng, tune, flags, testmode, look } = ctx;

  // Extra buttons on top of the base input (gamepad: RT = go, LT = brake, A/X = handbrake, Y = reset).
  input.define('gas', ['pad:7']);
  input.define('brake', ['pad:6']);
  input.define('drift', ['Space', 'ShiftLeft', 'pad:0', 'pad:2', 'touch:right']);
  input.define('reset', ['KeyR', 'pad:3']);

  // --- the world ---------------------------------------------------------------------------
  const wanted = Number(new URLSearchParams(location.search).get('track') ?? tune.race.track);
  const track = buildTrack(TRACKS[clamp(Math.round(wanted) || 0, 0, TRACKS.length - 1)]);
  const scene = new THREE.Scene();
  const land = buildScenery(scene, track, look);
  const focus = new THREE.Vector3();
  const air = createAtmosphere(scene, { look, far: 560, focus, shadows: { size: 2048, area: 46, far: 190 } });
  scene.add(buildTrackMesh(track, look));
  const gates = buildGates(track, look);
  scene.add(gates);

  // --- the cars ----------------------------------------------------------------------------
  const car = createHandling({ track, tune });
  const carModel = createCarModel({ look, colour: look.player });
  scene.add(carModel.root);
  const rivals = createRivals({ track, tune, rng });
  // Three shades of the danger colour (rivals are the threat), kept bright enough to read in dark palettes.
  const rivalColours = [look.danger, look.shade(look.danger, -0.22), look.mix(look.danger, look.light, 0.4)];
  const rivalModels = rivals.list.map((r) => createCarModel({ look, colour: rivalColours[r.index % 3] }));
  rivalModels.forEach((m) => scene.add(m.root));
  const ghostModel = createCarModel({ look, colour: look.light, ghost: true });
  ghostModel.root.visible = false;
  scene.add(ghostModel.root);

  const rig = createChaseCamera({ tune, heightAt: land.heightAt });
  const effects = createEffects({ scene, look, tune });
  const sound = createSound({ audio, tune });
  const hud = createRaceHud(look);
  const driver = createDriver({ track, tune, rng });
  const bot = flags.bot ? createBot({ input, driver, rng }) : null;

  const run = {
    phase: 'grid', // 'grid' (countdown) | 'race' | 'done' (player has finished, the card is coming)
    countdown: 0, // seconds until GO
    beat: 0, // which countdown number is showing
    time: 0, // race time
    position: 4, bestPosition: 4, score: 0,
    wallHits: 0, bumps: 0, boosts: 0, resets: 0, drifts: 0, topSpeed: 0,
    pedalAt: -9, pedalDown: false, // for the rocket start
    grace: -1, // seconds left to finish once a rival has won (-1 = nobody has)
    wrongWay: 0, stuck: 0,
    ending: 0, endInfo: null, forced: 0, snap: false,
    order: [],
  };
  let progress = makeProgress(track, 0); // the player's laps and gates
  let worldTime = 0;
  const me = { s: 0, lat: 0, v: 0, name: 'You' }; // the player as the rivals see it
  const tilt = {};
  const sight = new THREE.Vector3(); // camera -> your car, for fading rivals in the way
  const rel = new THREE.Vector3();
  const gpose = {};
  const fb = createFeedback({ ctx, track, car, rivals, effects, rig, hud, run, carModel, getProgress: () => progress });
  const controls = { steer: 0, digital: false, throttle: 0, brake: 0, handbrake: false };
  const notes = []; // chimes waiting to be played: [seconds from now, note]

  function chord(list, gap = 0.09) {
    list.forEach((n, i) => notes.push([i * gap, n]));
  }

  function readControls() {
    const m = input.move();
    const keys = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
    // Keys give full left/right (the handling shapes them); a stick or the bot gives a smooth value.
    controls.digital = keys !== 0 || (Math.abs(m.x) < 0.01 && controls.digital);
    controls.steer = keys !== 0 ? keys : Math.abs(m.x) < 0.01 ? 0 : m.x;
    controls.throttle = input.held('up') || input.held('gas') ? 1 : m.y > 0.35 ? Math.min(1, m.y * 1.2) : 0;
    controls.brake = input.held('down') || input.held('brake') ? 1 : m.y < -0.35 ? Math.min(1, -m.y * 1.2) : 0;
    controls.handbrake = input.held('drift');
    return controls;
  }

  function grid() {
    // Two by two behind the line; the player starts last and has to come through.
    const spots = [];
    for (let i = 0; i <= rivals.live.length; i++) spots.push({ s: track.length - 9 - i * 6.5, lat: i % 2 ? 2.7 : -2.7 });
    return spots;
  }

  function reset() {
    Object.assign(run, {
      phase: 'grid', countdown: tune.race.countBeat * 3, beat: 4, time: 0, score: 0,
      wallHits: 0, bumps: 0, boosts: 0, resets: 0, drifts: 0, topSpeed: 0, pedalAt: -9, pedalDown: false,
      grace: -1, wrongWay: 0, stuck: 0, ending: 0, endInfo: null, forced: 0,
    });
    const spots = grid();
    rivals.reset(spots, tune.race.rivals);
    rivals.list.forEach((r, i) => {
      rivalModels[i].root.visible = rivals.live.includes(r);
      r.progress = makeProgress(track, r.s);
    });
    const mine = spots[rivals.live.length];
    car.place(mine.s, mine.lat, 0);
    progress = makeProgress(track, car.loc.s);
    run.position = run.bestPosition = rivals.live.length + 1;
    ghost.startLap();
    notes.length = 0;
    effects.reset();
    fb.reset();
    driver.reset();
    bot?.reset();
    gates.setNext(progress.next);
    poseCars(1 / 60);
    carModel.snap();
    rivalModels.forEach((m) => m.snap());
    rig.snap(car);
    hud.setBoost(0, false, false);
    updateHud();
  }

  // --- drawing the cars where the simulation says they are ---------------------------------
  function poseCars(dt) {
    roadTilt(car.loc, car.yaw, tilt);
    carModel.set({ x: car.x, y: car.y, z: car.z, yaw: car.yaw, pitch: tilt.pitch, roll: tilt.roll, steer: car.steer, speed: car.speed, latAccel: car.latAccel, longAccel: car.longAccel, shake: run.phase === 'grid' ? car.rev * 2 : 0 }, dt, tune.weight);
    rivals.live.forEach((r) => {
      roadTilt(r.loc, r.yaw, tilt);
      rivalModels[r.index].set({ x: r.x, y: r.y, z: r.z, yaw: r.yaw, pitch: tilt.pitch, roll: tilt.roll, steer: clamp(r.loc.turn * 22, -1, 1), speed: r.v, latAccel: r.latAccel, longAccel: r.longAccel }, dt, tune.weight);
      if (r.smoking) effects.smoke(r.x - Math.sin(r.yaw) * 1.4, r.y, r.z - Math.cos(r.yaw) * 1.4);
    });
  }

  function updateHud() {
    const total = rivals.live.length + 1;
    const lap = clamp(progress.lap + 1, 1, track.laps);
    ui.hud.set('pos', { icon: 'flag', text: total > 1 ? `${ordinal(run.position)} of ${total}` : track.name });
    ui.hud.set('lap', { icon: 'restart', text: `Lap ${lap} / ${track.laps}` });
    const lapTime = progress.lap >= 0 && run.phase !== 'grid' ? run.time - progress.lapStart : 0;
    const best = Number.isFinite(ghost.bestTime) ? `   best ${formatTime(ghost.bestTime)}` : '';
    ui.hud.set('time', { icon: 'clock', text: `${formatTime(progress.finished ? progress.last : lapTime)}${best}` });
    hud.setSpeed(Math.abs(car.speed) * 3.6);
    hud.setOrder(run.order.map((c) => c.name), run.order.indexOf(me));
  }

  // --- positions ---------------------------------------------------------------------------
  function rank() {
    const field = [me, ...rivals.live];
    me.distance = raceDistance(track, progress, car.loc.s);
    for (const r of rivals.live) r.distance = raceDistance(track, r.progress, r.s);
    field.sort((a, b) => b.distance - a.distance);
    run.order = field;
    const now = field.indexOf(me) + 1;
    if (run.phase === 'race' && run.time > 2 && now !== run.position) {
      if (now < run.position) {
        audio.blip({ freq: 620, slide: 1.5, vol: 0.14 });
        if (now < run.bestPosition) {
          run.bestPosition = now;
          run.score += 250;
          events.emit('score', { score: run.score, why: 'overtake', position: now });
        }
      } else audio.blip({ freq: 300, slide: 0.7, vol: 0.1 });
      ui.hud.punch('pos');
    }
    run.position = now;
  }

  function gapTo(step) {
    const other = run.order[run.order.indexOf(me) + step];
    return other && !other.progress?.finished && !progress.finished ? Math.round(Math.abs(other.distance - me.distance)) : null;
  }

  // --- the end -----------------------------------------------------------------------------
  function finish(position, dnf = false) {
    if (run.phase === 'done') return;
    run.phase = 'done';
    run.position = position;
    const winner = run.order.find((c) => c !== me);
    run.endInfo = endCard({ position, dnf, total: rivals.live.length + 1, winner, run, progress, bestLap: ghost.bestTime, winPosition: tune.race.winPosition });
    const { won, reason } = run.endInfo;
    const trial = rivals.live.length === 0;
    run.ending = won ? 2.4 : 1.8;
    hud.hold('');
    if (won) {
      hud.say(trial ? 'FINISH' : ordinal(position).toUpperCase(), 2.2, 'accent');
      juice.slowmo(0.4, 700);
      juice.flash(look.shade(look.light, 0.3), 350);
      audio.duck(0.3, 1500);
      chord([0, 4, 7, 12, 16]);
      events.emit('win', { time: run.time, position, bestLap: progress.best });
    } else {
      hud.say(dnf ? 'TIME' : ordinal(position).toUpperCase(), 1.6);
      audio.thud({ freq: 90, vol: 0.4, length: 0.35 });
      events.emit('death', { reason, position });
    }
  }

  // --- one step of the race ----------------------------------------------------------------
  function countdownStep(dt) {
    const c = readControls();
    if (bot) bot.update(dt, car, run.countdown);
    if (c.throttle > 0.5 && !run.pedalDown) run.pedalAt = run.countdown; // when the pedal went down
    run.pedalDown = c.throttle > 0.5;
    car.update(dt, c, false);
    run.countdown -= dt;
    const beat = Math.ceil(run.countdown / tune.race.countBeat);
    if (beat !== run.beat && beat > 0) {
      run.beat = beat;
      hud.say(String(beat), tune.race.countBeat * 0.8);
      audio.blip({ freq: 330, length: 0.14, slide: 1, vol: 0.2, vary: 0 });
    }
    if (run.countdown <= 0) {
      run.phase = 'race';
      hud.say('GO', 0.8, 'accent');
      audio.blip({ freq: 660, length: 0.3, slide: 1, vol: 0.24, vary: 0 });
      // Rocket start: pedal pressed just before GO (not held the whole time) and still down.
      if (run.pedalDown && run.pedalAt <= tune.race.rocketWindow) {
        car.giveBoost(0.7);
        fb.boosted(0.7, 'Rocket start');
      }
    }
  }

  function raceStep(dt) {
    run.time += dt;
    const racing = run.phase === 'race';
    let c;
    if (racing) {
      if (bot) bot.update(dt, car, 0);
      c = readControls();
    } else c = driver.think(dt, car, { calm: true }); // after the flag the car drives itself round
    const wasDrifting = car.drifting;
    car.update(dt, c, true);
    if (car.drifting && !wasDrifting) run.drifts += 1;
    if (car.boosted) fb.boosted(car.boosted);
    run.topSpeed = Math.max(run.topSpeed, car.speed);

    // Rivals, and cars touching.
    me.s = car.loc.s; me.lat = car.loc.lat; me.v = car.speed;
    const band = progress.finished ? null : (r) => me.distance - r.distance;
    rivals.update(dt, [me, ...rivals.live], band, true);
    fb.contacts(dt);

    // Laps and gates.
    const what = stepProgress(track, progress, car.loc.s, run.time);
    if (progress.lap >= 0 && !progress.finished) ghost.record(run.time - progress.lapStart, car);
    if (what) {
      gates.setNext(progress.next);
      run.score += 100;
      events.emit('score', { score: run.score, why: what, lap: progress.lap });
      audio.chime({ note: what === 'gate' ? 7 : 12, vol: 0.12 });
    }
    if (what === 'lap' || what === 'finish') {
      const best = ghost.finishLap(progress.last, car);
      if (what === 'lap') {
        const last = progress.lap === track.laps - 1;
        hud.say(last ? 'FINAL LAP' : `LAP ${progress.lap + 1}`, 1.6, last ? 'small accent' : 'small', `${formatTime(progress.last)}${best && progress.lapTimes.length > 1 ? '  best lap!' : ''}`);
        chord(last ? [5, 9, 12] : [0, 7]);
        ui.hud.punch('lap');
      }
    }
    for (const r of rivals.live) {
      if (stepProgress(track, r.progress, r.s, run.time) === 'finish' && racing && run.grace < 0 && !progress.finished) {
        run.grace = tune.race.finishGrace;
        ui.toast(`${r.name} has finished. Get to the line!`, 3000);
      }
    }
    rank();
    if (what === 'finish' && racing) finish(run.forced || 1 + rivals.live.filter((r) => r.progress.finished && r.progress.finishTime < progress.finishTime).length);
    if (racing && run.grace >= 0) {
      run.grace -= dt;
      if (run.grace <= 0) finish(rivals.live.length + 1, true);
    }

    if (racing) fb.watch(dt, c); // wrong way, stuck, the reset key
    const sliding = clamp((Math.abs(car.slip) - 0.06) / 0.3, 0, 1) * (Math.abs(car.speed) > 6 ? 1 : 0);
    effects.update(dt, car, rig.camera, sliding);
    sound.update({ share: Math.abs(car.speed) / tune.car.topSpeed, sliding, throttle: c.throttle, scraping: car.scraping });
    hud.setBoost(car.boost > 0 ? 1 : clamp(car.charge / tune.drift.chargeFull, 0, 1), car.charge >= tune.drift.chargeTime, car.boost > 0);
    rig.update(dt, car, { finished: !racing });
  }

  // The ghost car: your best lap of the session, replayed from the start of every lap.
  function showGhost() {
    const on = tune.race.ghost && ghost.best && run.phase === 'race' && progress.lap >= 0;
    const at = on ? sampleGhost(ghost.best, run.time - progress.lapStart, gpose) : null;
    ghostModel.root.visible = !!at;
    if (at) ghostModel.set({ ...at, speed: 20 });
  }

  // --- skip buttons (?test=1) and __game.skipTo(name) ---------------------------------------
  const go = () => {
    if (run.phase === 'grid') { run.countdown = 0; run.phase = 'race'; }
  };
  testmode.add('win', 'Win now', () => { go(); run.forced = 1; progress.finished = true; progress.finishTime = run.time; finish(1); });
  testmode.add('lose', 'Lose now', () => { go(); finish(rivals.live.length + 1); });
  testmode.add('go', 'Skip countdown', go);
  testmode.add('final-lap', 'Final lap', () => {
    go();
    const lastLap = (p, s) => Object.assign(p, makeProgress(track, s), { lap: track.laps - 1, next: 0, lapStart: run.time });
    rivals.live.forEach((r, i) => { r.s = 70 - i * 28; r.v = 24; lastLap(r.progress, r.s); });
    car.place(48, 2.6, 28);
    lastLap(progress, car.loc.s);
    gates.setNext(0);
    run.snap = true;
    rig.snap(car);
  });
  testmode.add('hairpin', 'Tightest corner', () => {
    go();
    let tight = 0;
    for (let i = 0; i < track.n; i++) if (Math.abs(track.turn[i]) > Math.abs(track.turn[tight])) tight = i;
    car.place(tight * track.ds - 85, 0, 32);
    Object.assign(progress, { prevS: car.loc.s, next: track.gates.findIndex((g) => g > car.loc.s) });
    gates.setNext(progress.next);
    run.snap = true;
    rig.snap(car);
  });
  testmode.add('time-trial', 'Time trial', () => {
    tune.race.rivals = tune.race.rivals ? 0 : 3;
    tune.race.ghost = tune.race.rivals === 0;
    reset();
    ui.toast(tune.race.rivals ? 'Race: three rivals' : 'Time trial: no rivals, your best lap as a ghost', 2200);
  });

  reset();
  ui.hud.show(false);
  hud.show(false);

  return {
    scene,
    camera: rig.camera,

    start() {
      reset();
      ui.hud.show(true);
      hud.show(true);
      ui.toast('Hold Space into a corner to drift. Let go for a boost.', 3600);
    },

    update(dt, mode) {
      worldTime += dt;
      land.animate(worldTime);
      for (let i = notes.length - 1; i >= 0; i--) {
        notes[i][0] -= dt;
        if (notes[i][0] <= 0) audio.chime({ note: notes.splice(i, 1)[0][1], vol: 0.16 });
      }
      if (mode === 'title') {
        // Attract mode: the rivals race, the camera glides round the lap.
        rivals.update(dt, rivals.live, null, true);
        rig.flyover(worldTime, track);
        effects.idle(dt);
        sound.mute();
      } else if (run.phase === 'grid') {
        countdownStep(dt);
        rivals.update(dt, rivals.live, null, false);
        sound.update({ share: car.rev * 0.8, throttle: car.rev, grid: true });
        effects.idle(dt);
        rig.update(dt, car);
      } else {
        raceStep(dt);
        if (mode === 'over') sound.mute();
        if (run.ending > 0 && mode === 'playing') {
          run.ending -= dt;
          if (run.ending <= 0) {
            run.ending = 0;
            hud.show(false);
            ctx.end(run.endInfo);
          }
        }
      }
      hud.update(dt);
      poseCars(dt);
      if (run.snap) { // the car was teleported this step (reset, skip): don't smear it across the map
        run.snap = false;
        carModel.snap();
      }
      showGhost();
      if (mode === 'playing') updateHud();
    },

    render(alpha) {
      carModel.render(alpha);
      ghostModel.render(1);
      rig.render(alpha);
      // A rival in the line between the camera and your car would hide you: it fades while it is
      // within camera.seeThrough metres of that line, and is not drawn at all inside 2 m of the camera.
      const cam = rig.camera.position;
      sight.subVectors(carModel.root.position, cam);
      const toMe = sight.length();
      sight.divideScalar(toMe || 1);
      rivals.list.forEach((r, i) => {
        const m = rivalModels[i];
        m.render(alpha);
        rel.subVectors(m.root.position, cam);
        const along = rel.dot(sight);
        const off = Math.sqrt(Math.max(0, rel.lengthSq() - along * along));
        const see = along > 0 && along < toMe + 2 && tune.camera.seeThrough > 0 ? clamp((off - 1.2) / tune.camera.seeThrough, 0, 1) : 1;
        m.root.visible = rivals.live.includes(r) && rel.lengthSq() > 4;
        m.fade(0.25 + 0.75 * see);
      });
      focus.copy(carModel.root.position);
      air.follow(rig.camera, focus);
    },

    state() {
      const r2 = (v) => Math.round(v * 100) / 100;
      return {
        track: track.name, phase: run.phase, countdown: r2(Math.max(0, run.countdown)),
        position: run.position, cars: rivals.live.length + 1,
        lap: clamp(progress.lap + 1, 1, track.laps), laps: track.laps, nextGate: progress.next,
        score: run.score, raceTime: r2(run.time), lastLap: r2(progress.last), bestLap: Number.isFinite(progress.best) ? r2(progress.best) : null,
        speed: Math.round(car.speed * 3.6), s: r2(car.loc.s), lat: r2(car.loc.lat),
        drifting: car.drifting, charge: r2(car.charge), boost: r2(Math.max(0, car.boost)), offroad: car.offroad,
        slipDeg: Math.round((car.slip * 180) / Math.PI), banner: hud.text,
        drifts: run.drifts, boosts: run.boosts, wallHits: run.wallHits, bumps: run.bumps, resets: run.resets,
        topSpeed: Math.round(run.topSpeed * 3.6), wrongWay: run.wrongWay > 0.8, finished: progress.finished,
        ghostSamples: ghost.best?.length ?? 0, ghostShown: ghostModel.root.visible,
        player: { x: r2(car.x), y: r2(car.y), z: r2(car.z) },
        rivals: rivals.live.map((r) => ({ name: r.name, lap: r.progress.lap + 1, s: Math.round(r.s), speed: Math.round(r.v * 3.6), finished: r.progress.finished })),
        order: run.order.map((c) => c.name),
        gapAhead: gapTo(-1), gapBehind: gapTo(1), // metres to the car in front / behind (null = nobody)
      };
    },
  };
}
