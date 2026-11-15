// THE 2D PLATFORMER STARTER: run, jump and stomp from left to right to a glowing door.
// This file is the FLOW and the FEEDBACK: it loads a level, runs the world, and answers everything
// that happens with sound, particles, shake, the HUD and the end card. Read STARTER.md next to
// helper.json for the map of the whole thing. The short version:
//
//   levels.js   the levels, as text you can type            <- add content here
//   world.js    the rules (coins, hearts, checkpoints, what hurts, the stomp, the goal)
//   player.js   how the player moves (the feel)             physics.js   collision
//   movers.js, enemies.js   moving platforms and crawlers   bot.js       the ?bot=1 player
//   camera.js   the follow camera                           draw/        how everything looks
//
// Rules of the demo: three hearts. Spikes, crawlers (from the side) and pits cost one and send you
// back to the last flag within half a second. Reach the door to win; lose every heart and it is over.

import * as THREE from 'three';
import { LEVELS } from './levels.js';
import { createWorld } from './world.js';
import { createCamera } from './camera.js';
import { createBot } from './bot.js';
import { disposeTree } from './draw/paint.js';
import { buildTiles } from './draw/tiles.js';
import { createBackdrop } from './draw/backdrop.js';
import { createThings } from './draw/things.js';
import { createPlayerLook, createEnemyLooks, createMoverLooks } from './draw/actors.js';
import { createFx } from './draw/fx.js';

export const info = {
  tagline: 'Run, jump and stomp your way to the glowing door. Three hearts; flags save your place.',
  controls: [
    { keys: ['A', 'D'], label: 'Run (or arrow keys)' },
    { keys: ['Space'], label: 'Jump: hold for higher (also W or Up)' },
    { keys: ['S', 'Space'], label: 'Drop through a wooden platform' },
    { keys: ['Space'], label: 'Against a wall in the air: wall jump' },
    { keys: ['Esc'], label: 'Pause' },
    { keys: ['N'], label: 'Leave a note for your agent' },
  ],
};

const FIRST_LEVEL = LEVELS[0].id;
const COIN_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; // a rising pentatonic run for coin streaks
const WHY = {
  spikes: 'Spikes took your last heart. Jump a little before them and hold the button: a held jump clears three tiles.',
  enemy: 'A crawler bumped into you. Come down on top of one and it is squashed instead; hold jump as you land to bounce high.',
  fall: 'You fell into a pit. Moving platforms rest at each end of their dotted line: wait for one to stop, then step on.',
  test: 'Skipped to the end (test button).',
};

export function createGame(ctx) {
  const { input, juice, audio, ui, events, rng, tune, flags, testmode, look } = ctx;
  // Jump is Space, and also W / Up, which is where many people's fingers go in a side-on game.
  input.define('jump', [...new Set([...(input.actions.jump ?? ['Space']), 'KeyW', 'ArrowUp'])]);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(look.sky.horizon);
  const rig = createCamera({ tune });
  const fxLayer = new THREE.Group();
  scene.add(fxLayer);
  const fx = createFx(fxLayer);
  const bot = flags.bot ? createBot({ input, rng }) : null;
  const slideSound = audio.noiseLoop({ freq: 1400, q: 0.6 });

  const dust = look.mix(look.light, look.base[3], 0.3);
  let world = null; // the rules for the level being played (world.js)
  let view = null; // its drawing
  let time = 0; // a clock for animation that never resets
  let ending = 0; // > 0: the run is over, counting down to the end card
  let endInfo = null;
  let nextLevel = null; // { id, in }: the goal of a linked level was reached
  let coinStreak = 0;
  let sinceCoin = 9;
  let slideDust = 0;
  const bank = { coins: 0, total: 0 }; // coins from earlier levels of this run
  const later = []; // things to do in a moment, counted in game time: { in, fn }
  const after = (seconds, fn) => later.push({ in: seconds, fn });
  const dustOn = () => tune.feel.dust;

  // --- levels ---------------------------------------------------------------------------------

  // Build a level's world and drawing. keep = hearts, score... carried over from the level before.
  function loadLevel(id, keep = null) {
    if (view) disposeTree(view.group);
    const def = LEVELS.find((l) => l.id === id) ?? LEVELS[0];
    world = createWorld({ def, tune, input, emit: onWorld });
    if (keep) world.reset(keep);
    const group = new THREE.Group();
    scene.add(group);
    view = {
      group,
      backdrop: createBackdrop(group, world.level, look, tune.camera.viewHeight),
      tiles: buildTiles(group, world.level, look),
      things: createThings(group, world, look),
      movers: createMoverLooks(group, world.movers, look),
      enemies: createEnemyLooks(group, world.enemies, look),
      player: createPlayerLook(group, look),
    };
    rig.setBounds(world.level);
    rig.snap(world.player);
    fx.clear();
    updateHud();
  }

  // The level this one's goal leads to (its `next` in levels.js), or null if the goal wins the game.
  const nextId = () => {
    const next = LEVELS.find((l) => l.id === world.level.id)?.next;
    return next && LEVELS.some((l) => l.id === next) ? next : null;
  };
  const coinsNow = () => bank.coins + world.run.coins;
  const coinsTotal = () => bank.total + world.coins.length;

  function updateHud() {
    ui.hud.set('sparks', { icon: 'spark', text: `${coinsNow()} / ${coinsTotal()}` });
    ui.hud.set('health', { icon: 'heart', count: Math.max(0, world.run.hearts), max: tune.rules.hearts });
  }

  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // --- everything that happens in the world, answered ---------------------------------------------

  function onWorld(name, d) {
    const run = world.run;
    switch (name) {
      case 'jump':
        audio.blip({ freq: d.wall ? 640 : 500, vol: 0.13, slide: 1.55, length: 0.1 });
        if (dustOn()) fx.puff(d.x, d.y, { n: 5, color: dust, speed: 2.2, up: 0.5, dir: d.wall || 0 });
        events.emit('jump', { x: d.x, y: d.y, wall: !!d.wall });
        break;
      case 'land':
        audio.thud({ freq: 150, vol: Math.min(0.32, 0.08 + d.speed * 0.012), length: 0.09 });
        if (dustOn()) fx.puff(d.x, d.y, { n: d.speed > 12 ? 8 : 5, color: dust, speed: 1.6 + d.speed * 0.1, up: 0.35 });
        events.emit('land', { x: d.x, y: d.y, speed: d.speed });
        break;
      case 'step':
        if (tune.feel.footsteps) audio.blip({ freq: 170, vol: 0.022, length: 0.03, slide: 0.7, type: 'sine', vary: 3 });
        break;
      case 'skid':
        audio.whoosh({ vol: 0.05, length: 0.12, from: 2400, to: 900 });
        if (dustOn()) fx.puff(d.x, d.y, { n: 5, color: dust, speed: 3, up: 0.35, dir: d.dir });
        break;
      case 'drop':
        audio.blip({ freq: 420, vol: 0.1, slide: 0.6, length: 0.08 });
        break;
      case 'bonk':
        audio.thud({ freq: 220, vol: 0.12, length: 0.05 });
        break;
      case 'coin':
        coinStreak = sinceCoin < 1.1 ? coinStreak + 1 : 0;
        sinceCoin = 0;
        audio.chime({ note: COIN_SCALE[Math.min(coinStreak, COIN_SCALE.length - 1)], vol: 0.16 });
        fx.puff(d.x, d.y, { n: 5, color: look.accent[0], speed: 2.6, up: 1, size: 0.14, life: 0.35 });
        fx.puff(d.x, d.y, { n: 2, color: look.shade(look.light, 0.5), speed: 1.5, up: 1.4, size: 0.1, life: 0.45 });
        updateHud();
        ui.hud.punch('sparks');
        events.emit('pickup', { index: d.index, coins: coinsNow(), total: coinsTotal() });
        events.emit('score', { score: run.score });
        break;
      case 'stomp':
        juice.hitStop(tune.feel.stompStopMs);
        audio.thud({ freq: 130, vol: 0.4, length: 0.12 });
        audio.blip({ freq: 720, vol: 0.14, slide: 1.8, length: 0.12 });
        fx.puff(d.x, d.y, { n: 9, color: look.danger, speed: 4, up: 0.8, size: 0.18, life: 0.45, gravity: 9 });
        fx.puff(d.x, d.y, { n: 4, color: dust, speed: 2.5, up: 0.4 });
        events.emit('stomp', { x: d.x, y: d.y, stomps: run.stomps });
        events.emit('score', { score: run.score });
        break;
      case 'checkpoint':
        [0, 4, 7].forEach((n, i) => after(i * 0.08, () => audio.chime({ note: n + 5, vol: 0.15 })));
        fx.puff(d.x, d.y + 2, { n: 10, color: look.accent[0], speed: 3, up: 1, size: 0.14, life: 0.5 });
        if (d.healed) ui.hud.punch('health');
        updateHud();
        events.emit('checkpoint', { index: d.index, healed: d.healed });
        break;
      case 'hurt':
        juice.hitStop(tune.feel.hurtStopMs);
        juice.shake(tune.feel.hurtShake, 260);
        juice.flash(look.danger, 170);
        audio.thud({ freq: 95, vol: 0.55, length: 0.22 });
        audio.whoosh({ vol: 0.1, length: 0.25, from: 1800, to: 300 });
        fx.puff(d.x, d.y + 0.4, { n: 12, color: look.player, speed: 5, up: 1, size: 0.2, life: 0.5, gravity: 12 });
        updateHud();
        ui.hud.punch('health');
        events.emit('hit', { by: d.by, health: d.hearts });
        break;
      case 'respawn':
        rig.snap(world.player);
        audio.whoosh({ vol: 0.08, length: 0.2, from: 500, to: 2200 });
        fx.puff(d.x, d.y + 0.4, { n: 8, color: look.shade(look.light, 0.4), speed: 2.5, up: 1, size: 0.16, life: 0.4 });
        world.player.squashVel = 5;
        break;
      case 'lose':
        finish(false, d.by);
        break;
      case 'goal':
        fx.puff(d.x, d.y + 1, { n: 16, color: look.accent[0], speed: 5, up: 1.2, size: 0.18, life: 0.7 });
        if (nextId()) {
          [0, 4, 7, 12].forEach((n, i) => after(i * 0.08, () => audio.chime({ note: n, vol: 0.16 })));
          nextLevel = { id: nextId(), in: 0.9 };
          events.emit('level', { from: world.level.id, to: nextLevel.id });
        } else finish(true);
        break;
    }
  }

  function finish(won, by = '') {
    if (ending > 0) return;
    const run = world.run;
    ending = won ? 1.5 : 0.9; // let the moment land before the card
    const missed = coinsTotal() - coinsNow();
    endInfo = {
      won,
      heading: won ? 'You made it home' : 'Out of hearts',
      reason: won
        ? `You reached the door in ${clock(run.time)} with ${run.hearts} ${run.hearts === 1 ? 'heart' : 'hearts'} left.${missed > 0 ? ` ${missed} coins are still out there: look up, at the wooden platforms and between the two towers.` : ' And every single coin!'}`
        : (WHY[by] ?? WHY.test),
      stats: [
        ['Coins', `${coinsNow()} / ${coinsTotal()}`],
        ['Time', clock(run.time)],
        ['Score', `${run.score}`],
      ],
    };
    if (won) {
      juice.slowmo(0.4, 800);
      juice.flash(look.shade(look.light, 0.3), 420);
      audio.duck(0.3, 1400);
      [0, 4, 7, 12, 16].forEach((n, i) => after(i * 0.07, () => audio.chime({ note: n, vol: 0.18 })));
      world.player.squashVel = 6;
      events.emit('score', { score: run.score });
      events.emit('win', { time: run.time, health: run.hearts, coins: coinsNow() });
    } else {
      juice.slowmo(0.45, 600);
      audio.duck(0.4, 900);
      after(0.15, () => audio.thud({ freq: 70, vol: 0.5, length: 0.45 }));
      events.emit('death', { by, reason: endInfo.reason });
    }
  }

  // --- skip buttons (?test=1) and __game.skipTo(name) -----------------------------------------------

  function toCheckpoint(i) {
    const cp = world.checkpoints[Math.min(i, world.checkpoints.length - 1)];
    if (!cp || world.run.done) return;
    for (const c of world.checkpoints) if (c.i <= cp.i) c.reached = true;
    world.run.checkpoint = cp.i;
    world.run.spawn = { x: cp.x, y: cp.y };
    world.place(cp.x, cp.y);
    rig.snap(world.player);
  }
  testmode.add('win', 'Win now', () => {
    if (world.run.done || !world.goal) return;
    world.place(world.goal.x, world.goal.y);
    rig.snap(world.player);
  });
  testmode.add('lose', 'Lose now', () => {
    tune.rules.invincible = false;
    world.run.hearts = 1;
    world.player.invuln = 0;
    if (!world.player.alive) world.place(world.run.spawn.x, world.run.spawn.y);
    world.hurt('test');
  });
  testmode.add('invincible', 'Invincible', () => {
    tune.rules.invincible = !tune.rules.invincible;
    ui.toast(tune.rules.invincible ? 'Invincible: on' : 'Invincible: off', 1200);
  });
  testmode.add('spikes', 'Part 2: spikes', () => toCheckpoint(0));
  testmode.add('platforms', 'Part 3: platforms', () => toCheckpoint(1));
  testmode.add('home', 'Part 4: last stretch', () => toCheckpoint(2));
  testmode.add('walls', 'Wall-jump towers', () => {
    if (world.level.id !== FIRST_LEVEL || world.run.done) return;
    world.place(107.5, 5); // just left of the two towers in part 2 (see levels.js)
    rig.snap(world.player);
  });
  testmode.add('level2', 'Level 2', () => {
    if (!LEVELS[1]) return;
    bank.coins = bank.total = 0;
    loadLevel(LEVELS[1].id);
    bot?.reset();
  });

  // --- the game interface main.js expects ----------------------------------------------------------

  loadLevel(FIRST_LEVEL);
  ui.hud.show(false);

  return {
    scene,
    camera: rig.camera,

    start() {
      ending = 0;
      endInfo = null;
      nextLevel = null;
      later.length = 0;
      coinStreak = 0;
      bank.coins = bank.total = 0;
      if (world.level.id !== FIRST_LEVEL) loadLevel(FIRST_LEVEL);
      else world.reset();
      rig.snap(world.player);
      fx.clear();
      bot?.reset();
      updateHud();
      ui.hud.show(true);
      ui.toast('Reach the glowing door. Land on crawlers; mind the spikes.', 3200);
    },

    update(dt, mode) {
      time += dt;
      sinceCoin += dt;
      for (let i = later.length - 1; i >= 0; i--) {
        later[i].in -= dt;
        if (later[i].in <= 0) later.splice(i, 1)[0].fn();
      }

      if (mode === 'playing') {
        if (bot && ending === 0) bot.update(dt, world);
        world.update(dt, true);
        rig.update(dt, world.player);

        if (nextLevel) {
          nextLevel.in -= dt;
          if (nextLevel.in <= 0) {
            const { hearts, score, stomps, time: t } = world.run;
            bank.coins += world.run.coins;
            bank.total += world.coins.length;
            const id = nextLevel.id;
            nextLevel = null;
            loadLevel(id, { hearts, score, stomps, time: t });
            bot?.reset();
          }
        }
        if (ending > 0) {
          ending -= dt;
          if (ending <= 0) {
            ending = 0;
            slideSound.set(0);
            ctx.end(endInfo);
          }
        }
      } else if (mode === 'title') {
        world.update(dt, false);
        rig.drift(dt, time, world.player);
      } else {
        world.update(dt, false);
        rig.update(dt, world.player);
      }

      // Wall slide: a soft hiss and a trickle of dust while it lasts.
      const p = world.player;
      const sliding = mode === 'playing' && p.alive && p.sliding;
      slideSound.set(sliding ? 0.05 : 0);
      slideDust -= dt;
      if (sliding && slideDust <= 0 && dustOn()) {
        slideDust = 0.07;
        fx.puff(p.body.x + p.wallSide * p.body.w * 0.5, p.body.y + 0.5, { n: 1, color: dust, speed: 0.8, up: 1, size: 0.14, life: 0.3 });
      }
      // The door breathes out a sparkle now and then.
      if (world.goal && Math.floor(time * 3) !== Math.floor((time - dt) * 3)) {
        fx.puff(world.goal.x, world.goal.y + 0.4, { n: 1, color: look.shade(look.light, 0.5), speed: 0.9, up: 2.2, size: 0.11, life: 1.1, spread: 4 });
      }

      view.things.update(time, dt);
      fx.update(dt);
    },

    render(alpha) {
      view.player.update(world.player, alpha, time, tune);
      view.enemies.update(alpha, tune);
      view.movers.update(alpha);
      view.tiles.update(time);
      rig.render(alpha);
      view.backdrop.update(rig.view, time);
      fx.render(alpha);
    },

    state() {
      const { run, player, level } = world;
      const b = player.body;
      const r2 = (v) => Math.round(v * 100) / 100;
      return {
        level: level.id,
        score: run.score,
        coins: coinsNow(),
        coinsTotal: coinsTotal(),
        stomps: run.stomps,
        health: Math.max(0, run.hearts),
        checkpoint: run.checkpoint,
        progress: r2(b.x / level.w), // 0 = the start, 1 = the far end
        runTime: r2(run.time),
        speed: r2(Math.hypot(b.vx, b.vy)),
        grounded: b.onGround,
        standingOn: b.stoodOn,
        wallSliding: player.sliding,
        alive: player.alive,
        player: { x: r2(b.x), y: r2(b.y), vx: r2(b.vx), vy: r2(b.vy), facing: player.facing },
        camera: { x: r2(rig.x), y: r2(rig.y) },
        enemiesLeft: world.enemies.list.filter((e) => e.alive).length,
        invincible: tune.rules.invincible,
      };
    },
  };
}
