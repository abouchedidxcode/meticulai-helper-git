// THE FIRST-PERSON STARTER: "Lamplighter". The rules and the flow of the demo.
//
// A walled garden at dusk, seen through your own eyes. Light the seven lanterns (look at one, press E
// or click). A shade haunts each dark lantern and comes for you when you get near; its touch costs one
// of three hearts of warmth. A lit lantern makes a circle of light they cannot enter. Click with nothing to use = throw a spark that stuns them.
// Lighting a lantern dissolves any shade caught in its new light. The ones you left behind keep coming,
// and every lit lantern and the deepening dusk make them faster: the pressure grows. Win: every lantern lit.
//
// This file is the rules only. The systems are one file each:
//   level.js    the place, as a text map (edit MAP to build your own)
//   collide.js  capsule-against-boxes collision        player.js   look, walk, sprint, jump, head bob
//   hands.js    the hand and lantern you see            interact.js the forgiving "what am I looking at" cone
//   lanterns.js the usable things                       shades.js   the enemies
//   spark.js    the throw action (the seed of a shooter) hud.js     crosshair, prompt, threat hints
//   scenery.js  sky, light, dusk, grass, far trees      bot.js      ?bot=1 plays through the same input
//
// To make something new USABLE, add an object to `usables` below: { pos, radius, label, enabled(), use() }.
// How long it must be held is tuning use.holdTime (0 = one press).

import * as THREE from 'three';
import { buildLevel } from './level.js';
import { buildScenery } from './scenery.js';
import { createPlayer, BODY } from './player.js';
import { createHands } from './hands.js';
import { createLanterns, LANTERN_HEIGHT } from './lanterns.js';
import { createShades, isThreat } from './shades.js';
import { createSparks } from './spark.js';
import { pickInCone } from './interact.js';
import { createHud } from './hud.js';
import { createBot } from './bot.js';

export const info = {
  tagline: 'Light the seven lanterns before the dusk takes the garden. Shades cannot step into the light.',
  pointerLock: true, // main.js captures the mouse while playing (Esc frees it and pauses)
  controls: [
    { keys: ['Mouse'], label: 'Look around' },
    { keys: ['W', 'A', 'S', 'D'], label: 'Walk (hold Shift to sprint)' },
    { keys: ['E'], label: 'Use: hold to light the lantern you look at' },
    { keys: ['Click'], label: 'Throw a spark (stuns a shade)' },
    { keys: ['Space'], label: 'Jump' },
    { keys: ['Esc'], label: 'Pause' },
    { keys: ['N'], label: 'Leave a note for your agent' },
  ],
};

const MAX_HEALTH = 3;
const CHIME_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]; // pentatonic: each lantern rings a step higher

export function createGame(ctx) {
  const { input, juice, audio, ui, events, rng, tune, flags, testmode, look } = ctx;

  const scene = new THREE.Scene();
  const level = buildLevel(scene, look);
  const player = createPlayer({ solids: level.solids, tune, input, events, audio, juice });
  const camera = player.camera;
  scene.add(camera); // the hand is a child of the camera, so the camera must be in the scene
  const scenery = buildScenery(scene, look, player.pos);
  const lanterns = createLanterns({ scene, spots: level.things.lantern, solids: level.solids, look, tune });
  const shades = createShades({ scene, look, tune, audio, rng, lanterns });
  const sparks = createSparks({ scene, solids: level.solids, look, tune, audio, shades, onStun });
  const hands = createHands({ camera, look, tune });
  const hud = createHud({ look, count: shades.list.length });
  const bot = flags.bot ? createBot({ input, rng, tune }) : null;
  const start = level.things.start[0] ?? { x: 0, y: 0, z: 0 };

  // Everything the player can USE. The cone in interact.js picks among the enabled ones.
  const usables = lanterns.list.map((l) => ({
    pos: l.pos,
    radius: 0.45, // metres: how big it counts as when you stand close
    label: 'Hold to light the lantern',
    enabled: () => !l.lit,
    use: () => lightLantern(l),
  }));

  const run = { health: MAX_HEALTH, score: 0, time: 0, dusk: 0, invuln: 0, stuns: 0, ending: 0, endInfo: null, focus: null, hold: 0, holdOn: null, banished: 0 };
  let worldTime = 0;
  const timers = []; // { t, fn }: small delayed things, counted in game time (never setTimeout)
  const later = (seconds, fn) => timers.push({ t: seconds, fn });
  const eye = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const threats = [];

  function updateHud() {
    ui.hud.set('sparks', { icon: 'spark', text: `${lanterns.lit} / ${lanterns.list.length}` });
    ui.hud.set('health', { icon: 'heart', count: run.health, max: MAX_HEALTH });
    hands.setWarmth(run.health / MAX_HEALTH);
  }

  function reset() {
    Object.assign(run, { health: MAX_HEALTH, score: 0, time: 0, dusk: 0, invuln: 0, stuns: 0, ending: 0, endInfo: null, focus: null, hold: 0, holdOn: null, banished: 0 });
    timers.length = 0;
    lanterns.reset();
    sparks.reset();
    hands.reset();
    player.reset(start.x, start.y, start.z, 0);
    shades.reset(player.pos);
    scenery.setDusk(0);
    bot?.reset();
    updateHud();
  }

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function finish(won, reason) {
    if (run.ending > 0) return;
    run.ending = won ? 1.6 : 1.1; // let the moment land before the card
    run.endInfo = {
      won,
      heading: won ? 'The garden is lit' : 'The dusk took the garden',
      reason,
      stats: [['Lanterns', `${lanterns.lit} / ${lanterns.list.length}`], ['Time', formatTime(run.time)], ['Shades banished', `${run.banished}`]],
    };
    if (won) {
      juice.slowmo(0.4, 900);
      audio.duck(0.3, 1400);
      [0, 4, 7, 12, 16].forEach((n, i) => later(0.25 + i * 0.1, () => audio.chime({ note: n, vol: 0.16 })));
      events.emit('win', { time: run.time, health: run.health });
    } else {
      juice.slowmo(0.4, 700);
      audio.thud({ freq: 70, vol: 0.6, length: 0.5 });
      events.emit('death', { reason });
    }
  }

  // The USE action's answer: sound, light, a push of the hand, and the shades thrown back.
  function lightLantern(l) {
    if (l.lit) return;
    lanterns.light(l);
    const n = lanterns.lit;
    run.score += 100;
    const banished = shades.banishFrom(l.pos.x, l.pos.z, tune.lanterns.safeRadius); // shades caught in the new light are gone for good
    run.banished += banished;
    run.score += banished * 50;
    hands.use();
    hud.kick();
    juice.hitStop(tune.feel.lightStopMs);
    juice.flash(look.light, 140);
    audio.whoosh({ vol: 0.14, length: 0.35, from: 400, to: 2200 });
    audio.chime({ note: CHIME_SCALE[(n - 1) % CHIME_SCALE.length] });
    later(0.12, () => audio.chime({ note: CHIME_SCALE[(n - 1) % CHIME_SCALE.length] + 7, vol: 0.12 }));
    updateHud();
    ui.hud.punch('sparks');
    events.emit('pickup', { index: l.i, remaining: lanterns.list.length - n });
    events.emit('score', { score: run.score });
    const left = lanterns.list.length - n;
    if (left === 0) shades.banishFrom(l.pos.x, l.pos.z, Infinity); // the last light clears the garden
    if (left === 0) finish(true, `You lit all ${n} lanterns in ${formatTime(run.time)} with ${run.health} warmth left.`);
    else if (left === 1) ui.toast('One lantern left');
  }

  function onStun() {
    run.stuns++;
    run.score += 10;
    audio.chime({ note: -5, vol: 0.12, vary: 1 });
    audio.thud({ freq: 160, vol: 0.2, length: 0.1 });
    events.emit('score', { score: run.score });
    events.emit('stun', { stuns: run.stuns });
  }

  // A shade reached the player.
  function onTouch(shade) {
    if (run.invuln > 0 || run.ending > 0) return;
    run.invuln = 1.6; // a breath of safety: one mistake never costs two hearts
    run.hold = 0; // a touch breaks what you were doing
    shades.stun(shade, player.pos.x, player.pos.z); // it recoils, so you can get away
    const away = new THREE.Vector3(player.pos.x - shade.pos.x, 0, player.pos.z - shade.pos.z).normalize();
    player.vel.addScaledVector(away, 5);
    juice.hitStop(tune.feel.hitStopMs);
    juice.shake(tune.feel.hitShake, 280);
    juice.flash(look.danger, 220);
    audio.thud({ freq: 85, vol: 0.7, length: 0.3 });
    audio.whoosh({ vol: 0.14, length: 0.3, from: 1800, to: 250 });
    if (!tune.feel.invincible) run.health -= 1;
    events.emit('hit', { by: 'shade', health: run.health });
    updateHud();
    ui.hud.punch('health');
    if (run.health <= 0) {
      finish(false, 'A shade took your last warmth. They hiss and swell before they rush: step aside, throw a spark (click), or stand in a lit lantern\'s circle, where they cannot follow.');
    }
  }

  function playStep(dt) {
    const controlsOn = run.ending === 0;
    if (controlsOn) run.time += dt;
    run.invuln = Math.max(0, run.invuln - dt);
    run.dusk = Math.min(1, run.time / tune.world.duskSeconds);
    scenery.setDusk(run.dusk * tune.world.duskDepth);

    if (bot && controlsOn) bot.update(dt, { player, lanterns, shades, sparks, focus: run.focus });
    player.update(dt, controlsOn);
    player.eye(eye);
    player.forward(fwd);
    right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

    // What would "use" act on? The nearest usable thing near the centre of the view.
    run.focus = controlsOn
      ? pickInCone(eye, fwd, usables.filter((u) => u.enabled()), { range: tune.use.range, degrees: tune.use.coneDegrees, solids: level.solids })
      : null;

    if (controlsOn) {
      const use = input.pressed('use');
      const act = input.pressed('action');
      const holding = input.held('use') || input.held('action'); // click also uses: one less thing to learn
      if (run.focus !== run.holdOn) { run.holdOn = run.focus; run.hold = 0; }
      if (run.focus) {
        // Hold to use: the bar fills while you hold and drains slowly if you let go (never all at once).
        const need = tune.use.holdTime;
        if (holding) {
          const before = run.hold;
          run.hold += dt;
          if (Math.floor(run.hold / 0.12) > Math.floor(before / 0.12) || use || act) {
            audio.blip({ freq: 330 + 500 * Math.min(1, run.hold / Math.max(need, 0.01)), slide: 1.1, length: 0.05, vol: 0.06, vary: 0 }); // a rising tick
          }
          if (run.hold >= need) { run.focus.use(); run.hold = 0; run.focus = null; }
        } else run.hold = Math.max(0, run.hold - dt * 0.6);
      } else if (act) {
        if (sparks.throwSpark(eye, fwd, right)) { hands.throwIt(); hud.kick(); }
      } else if (use) audio.blip({ freq: 240, slide: 0.8, length: 0.05, vol: 0.05 }); // nothing here: still answer the press
    }
    const progress = run.focus ? Math.min(1, run.hold / Math.max(tune.use.holdTime, 0.01)) : 0;
    hands.setReach(progress);

    sparks.update(dt, eye, fwd);
    shades.update(dt, worldTime, player.pos, { lit: lanterns.lit, dusk: run.dusk, playing: controlsOn }, onTouch);
    hands.update(dt, player, run.dusk * tune.world.duskDepth);

    // Threat hints for the HUD: where is each dangerous shade, relative to where I look?
    threats.length = 0;
    for (const s of shades.list) {
      if (!isThreat(s)) continue; // only the ones coming for you
      const dx = s.pos.x - player.pos.x;
      const dz = s.pos.z - player.pos.z;
      threats.push({ angle: Math.atan2(dx * right.x + dz * right.z, dx * fwd.x + dz * fwd.z), dist: Math.hypot(dx, dz), urgent: s.state === 'windup' || s.state === 'lunge' });
    }
    const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    hud.setThreats(dt, threats, tune.shades.hintRange, halfFov);
    hud.setAim(run.focus, !run.focus && sparks.ready && !!sparks.target, progress);
  }

  // Skip buttons (?test=1) and __game.skipTo(name).
  const winNow = () => { for (const l of lanterns.list) lightLantern(l); };
  testmode.add('win', 'Win now', winNow);
  testmode.add('lose', 'Lose now', () => {
    run.health = 1;
    run.invuln = 0;
    tune.feel.invincible = false;
    onTouch(shades.place(player.pos.x + 0.5, player.pos.z));
  });
  testmode.add('last-lantern', 'Last lantern', () => {
    const keep = lanterns.list.find((l) => !l.lit);
    if (!keep) return;
    for (const l of lanterns.list) if (l !== keep && !l.lit) { lanterns.light(l); run.score += 100; }
    player.reset(keep.pos.x, keep.pos.y - LANTERN_HEIGHT, keep.pos.z + 5, 0);
    updateHud();
  });
  testmode.add('deep-dusk', 'Deep dusk', () => {
    run.time = Math.max(run.time, tune.world.duskSeconds); // full dark, every shade awake
    shades.wakeAll();
  });
  testmode.add('shade-close', 'Shade ahead', () => {
    player.forward(fwd);
    const d = Math.hypot(fwd.x, fwd.z) || 1;
    shades.place(player.pos.x + (fwd.x / d) * 7, player.pos.z + (fwd.z / d) * 7);
  });
  testmode.add('invincible', 'Invincible', () => {
    tune.feel.invincible = !tune.feel.invincible;
    ui.toast(tune.feel.invincible ? 'Invincible: on' : 'Invincible: off', 1200);
  });

  reset();
  ui.hud.show(false);
  hud.show(false);
  hands.setVisible(false);
  const titleTarget = new THREE.Vector3();

  return {
    scene,
    camera,

    start() {
      reset();
      ui.hud.show(true);
      hud.show(true);
      hands.setVisible(true);
      ui.toast('Light the lanterns. Shades cannot step into the light.', 3200);
    },

    update(dt, mode) {
      worldTime += dt;
      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].t -= dt;
        if (timers[i].t <= 0) timers.splice(i, 1)[0].fn();
      }
      scenery.animate(worldTime);
      if (mode === 'playing') {
        playStep(dt);
        lanterns.update(dt, worldTime, eye);
        if (run.ending > 0) {
          run.ending -= dt;
          if (run.ending <= 0) {
            run.ending = 0;
            shades.mute();
            hud.show(false);
            ctx.end(run.endInfo);
          }
        }
      } else if (mode === 'title') {
        // A slow glide over the garden for the title screen.
        const a = worldTime * 0.05;
        player.pos.set(Math.sin(a) * 9, 2.9, Math.cos(a) * 7 + 2); // above the walls
        player.prev.copy(player.pos);
        player.yaw = a + Math.PI * 0.62;
        player.pitch = -0.22;
        titleTarget.set(-Math.sin(a) * 9, 0, -Math.cos(a) * 7);
        shades.update(dt, worldTime, titleTarget, { lit: 0, dusk: 0, playing: false }, () => {});
        shades.mute();
        lanterns.update(dt, worldTime, player.eye(eye));
      } else {
        shades.mute();
        lanterns.update(dt, worldTime, eye);
      }
    },

    render(alpha) {
      player.render(alpha);
      shades.render(alpha, worldTime, camera);
      sparks.render(alpha, worldTime);
      scenery.air.follow(camera, player.pos);
    },

    state() {
      const r2 = (v) => Math.round(v * 100) / 100;
      const near = shades.nearest;
      return {
        score: run.score,
        lanterns: lanterns.lit,
        lanternsTotal: lanterns.list.length,
        health: run.health,
        runTime: r2(run.time),
        dusk: r2(run.dusk),
        player: { x: r2(player.pos.x), y: r2(player.pos.y), z: r2(player.pos.z), yaw: r2(player.yaw), pitch: r2(player.pitch), speed: r2(player.speed) },
        grounded: player.grounded,
        sprinting: player.sprinting,
        walked: r2(player.walked),
        focus: run.focus ? run.focus.label : '',
        useProgress: r2(run.focus ? run.hold / Math.max(tune.use.holdTime, 0.01) : 0),
        aimLock: !!sparks.target,
        sparksThrown: sparks.thrown,
        stuns: run.stuns,
        banished: run.banished,
        shades: shades.active.map((s) => ({ x: r2(s.pos.x), z: r2(s.pos.z), state: s.state, dist: r2(s.dist) })),
        nearestShade: near ? r2(near.dist) : null,
        inLight: !!lanterns.safeAt(player.pos.x, player.pos.z),
        invincible: tune.feel.invincible,
        drawCalls: ctx.view.renderer.info.render.calls, // the last frame's cost, for performance checks
        triangles: ctx.view.renderer.info.render.triangles,
      };
    },
  };
}
