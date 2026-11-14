// THE DEMO GAME: "gather the sparks on a floating island at dusk".
// Everything in game/ can be deleted and replaced with your own game, as long as the new
// game keeps the same small interface (see the top of main.js).
//
// What it shows off: a follow camera, a jump with coyote time and buffering, land squash,
// pickups with hit-stop and a rising chime, readable hazards (worn tracks, a wobble before
// moving), an end card that says why, a bot (?bot=1), and skip buttons (?test=1).

import * as THREE from 'three';
import { buildWorld } from './world.js';
import { createPlayer, PLAYER_RADIUS } from './player.js';
import { createSparks } from './sparks.js';
import { createStones, STONE_RADIUS } from './stones.js';
import { createFollowCamera } from './camera.js';
import { createBot } from './bot.js';

export const info = {
  tagline: 'Gather the twelve sparks scattered over a floating island. Mind the rolling stones.',
  controls: [
    { keys: ['W', 'A', 'S', 'D'], label: 'Move (or arrow keys)' },
    { keys: ['Space'], label: 'Jump (hold for higher)' },
    { keys: ['Q', 'E'], label: 'Turn the camera (or drag)' },
    { keys: ['Esc'], label: 'Pause' },
    { keys: ['N'], label: 'Leave a note for your agent' },
  ],
};

const START = new THREE.Vector3(-3, PLAYER_RADIUS, 11);
const MAX_HEALTH = 3;
const CHIME_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26]; // pentatonic, rising per spark

export function createGame(ctx) {
  const { input, juice, audio, ui, events, rng, tune, flags, testmode } = ctx;

  const scene = new THREE.Scene();
  const world = buildWorld(scene);
  const rig = createFollowCamera({ tune, input });
  const player = createPlayer({ scene, solids: world.solids, tune, input, events, audio, juice });
  const sparks = createSparks(scene);
  const stones = createStones({ scene, lanes: world.lanes, tune, audio });
  const bot = flags.bot ? createBot({ input, rng }) : null;

  const run = {
    health: MAX_HEALTH,
    score: 0,
    time: 0, // seconds of play in this run
    ending: 0, // > 0: counting down to the end card
    endInfo: null,
    lastCause: '',
  };
  let worldTime = 0;
  const wish = new THREE.Vector3();

  function updateHud() {
    ui.hud.set('sparks', { icon: 'spark', text: `${sparks.list.length - sparks.remaining} / ${sparks.list.length}` });
    ui.hud.set('health', { icon: 'heart', count: run.health, max: MAX_HEALTH });
  }

  function reset() {
    run.health = MAX_HEALTH;
    run.score = 0;
    run.time = 0;
    run.ending = 0;
    run.endInfo = null;
    sparks.reset();
    stones.reset();
    player.reset(START.x, START.y, START.z);
    rig.snap(player.pos, 0);
    bot?.reset();
    updateHud();
  }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }

  function finish(won, reason) {
    if (run.ending > 0) return;
    run.ending = won ? 1.3 : 1.0; // let the moment land before the card
    const taken = sparks.list.length - sparks.remaining;
    run.endInfo = {
      won,
      heading: won ? 'Every spark gathered' : 'The island won this time',
      reason,
      stats: [
        ['Sparks', `${taken} / ${sparks.list.length}`],
        ['Time', formatTime(run.time)],
        ['Hearts', `${run.health}`],
      ],
    };
    if (won) {
      juice.slowmo(0.35, 900);
      juice.flash('#ffd9a0', 400);
      audio.duck(0.3, 1200);
      [0, 4, 7, 12].forEach((n, i) => setTimeout(() => audio.chime({ note: n, vol: 0.18 }), i * 90));
      events.emit('win', { time: run.time, health: run.health });
    } else {
      juice.slowmo(0.4, 700);
      audio.thud({ freq: 80, vol: 0.6, length: 0.4 });
      events.emit('death', { reason });
    }
  }

  function hurt(cause, reason) {
    if (tune.feel.invincible) return false;
    run.health -= 1;
    run.lastCause = cause;
    updateHud();
    ui.hud.punch('health');
    if (run.health <= 0) finish(false, reason);
    return true;
  }

  function collect(s) {
    sparks.take(s, rng);
    const n = sparks.list.length - sparks.remaining;
    run.score = n * 100;
    juice.hitStop(tune.feel.pickupStopMs);
    juice.punch(player.mesh, 1.18, 160);
    audio.chime({ note: CHIME_SCALE[(n - 1) % CHIME_SCALE.length], vary: 0.05 });
    updateHud();
    ui.hud.punch('sparks');
    events.emit('pickup', { index: s.i, remaining: sparks.remaining });
    events.emit('score', { score: run.score });
    if (sparks.remaining === 0) finish(true, `You lit all ${sparks.list.length} sparks in ${formatTime(run.time)} with ${run.health} ${run.health === 1 ? 'heart' : 'hearts'} left.`);
    else if (sparks.remaining === 1) ui.toast('One spark left');
  }

  function playStep(dt) {
    run.time += dt;
    const controlsOn = run.ending === 0;

    if (bot && controlsOn) bot.update(dt, { player, sparks, stones, rig, solids: world.solids });
    const stick = controlsOn ? input.move() : { x: 0, y: 0 };
    rig.toWorld(stick, wish);
    player.update(dt, wish, controlsOn);
    stones.update(dt, worldTime, player.pos);
    rig.update(dt, player.pos, controlsOn);

    if (!controlsOn) return;

    // Pickups.
    for (const s of sparks.list) {
      if (!s.taken && s.group.position.distanceTo(player.pos) < PLAYER_RADIUS + 0.45) collect(s);
    }

    // Stones.
    for (const s of stones.list) {
      if (player.invuln > 0) break;
      const d = s.pos.distanceTo(player.pos);
      if (d < PLAYER_RADIUS + STONE_RADIUS * 0.92) {
        const away = new THREE.Vector3().subVectors(player.pos, s.pos).setY(0);
        if (away.lengthSq() < 1e-4) away.copy(s.dir).multiplyScalar(-s.heading);
        away.normalize();
        player.vel.copy(away).multiplyScalar(tune.stones.knockback).setY(7);
        player.invuln = 1.5;
        juice.hitStop(tune.feel.hitStopMs);
        juice.shake(tune.feel.hitShake, 300);
        juice.flash('#ff8a5c', 180);
        audio.thud({ freq: 95, vol: 0.7, length: 0.25 });
        audio.whoosh({ vol: 0.12, length: 0.25, from: 1600, to: 300 });
        events.emit('hit', { by: 'stone', health: run.health - (tune.feel.invincible ? 0 : 1) });
        hurt('stone', 'A rolling stone knocked you off your feet. Watch the worn tracks: stones wobble before they roll.');
      }
    }

    // Fell off the island.
    if (player.pos.y < -9) {
      juice.flash('#2c3a63', 300);
      audio.whoosh({ vol: 0.2, length: 0.5, from: 2000, to: 200 });
      events.emit('hit', { by: 'fall', health: run.health - (tune.feel.invincible ? 0 : 1) });
      const lost = hurt('fall', 'You fell off the edge of the island. The blob under you shows where you will land.');
      if (!lost || run.health > 0) {
        player.reset(player.lastSafe.x, player.lastSafe.y + 0.5, player.lastSafe.z);
        player.invuln = 1;
        rig.snap(player.pos, rig.yaw);
      }
    }
  }

  // Skip buttons (?test=1) and __game.skipTo(name).
  testmode.add('last-spark', 'Last spark', () => {
    const keep = sparks.list.find((s) => !s.taken && s.i === 0) ?? sparks.list.find((s) => !s.taken);
    if (!keep) return;
    for (const s of sparks.list) if (s !== keep && !s.taken) { s.taken = true; s.group.visible = false; }
    run.score = (sparks.list.length - 1) * 100;
    player.reset(keep.base.x + 2.5, PLAYER_RADIUS, keep.base.z + 2.5);
    rig.snap(player.pos, rig.yaw);
    updateHud();
  });
  testmode.add('end', 'Win now', () => {
    for (const s of sparks.list) if (!s.taken) collect(s);
  });
  testmode.add('lose', 'Lose now', () => {
    run.health = 1;
    tune.feel.invincible = false;
    hurt('test', 'Skipped to the end (test button).');
  });
  testmode.add('invincible', 'Invincible', () => {
    tune.feel.invincible = !tune.feel.invincible;
    ui.toast(tune.feel.invincible ? 'Invincible: on' : 'Invincible: off', 1200);
  });

  reset();
  ui.hud.show(false);

  return {
    scene,
    camera: rig.camera,

    start() {
      reset();
      ui.hud.show(true);
      ui.toast('Gather the sparks. Stones roll along the worn tracks.', 3200);
    },

    update(dt, mode) {
      worldTime += dt;
      world.animate(worldTime);
      sparks.update(dt, worldTime);
      if (mode === 'playing') {
        playStep(dt);
        if (run.ending > 0) {
          run.ending -= dt;
          if (run.ending <= 0) {
            run.ending = 0;
            stones.mute();
            ctx.end(run.endInfo);
          }
        }
      } else if (mode === 'title') {
        rig.orbit(worldTime);
        stones.update(dt, worldTime, rig.pos);
        stones.list.forEach((s) => s.rumble.set(0));
      } else {
        stones.mute();
      }
    },

    render(alpha) {
      player.render(alpha);
      stones.render(alpha);
      rig.render(alpha);
      world.skyMesh.position.copy(rig.camera.position);
    },

    state() {
      return {
        score: run.score,
        sparks: sparks.list.length - sparks.remaining,
        sparksTotal: sparks.list.length,
        health: run.health,
        runTime: Math.round(run.time * 100) / 100,
        grounded: player.grounded,
        player: {
          x: Math.round(player.pos.x * 100) / 100,
          y: Math.round(player.pos.y * 100) / 100,
          z: Math.round(player.pos.z * 100) / 100,
        },
        invincible: tune.feel.invincible,
      };
    },
  };
}
