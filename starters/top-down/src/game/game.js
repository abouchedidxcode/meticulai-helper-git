// THE TOP-DOWN ACTION STARTER: "keep the garden". A small robot hoses down thorn creatures that
// creep in over three waves, then faces Old Bramble. Three hearts. About two minutes.
//
// This file is the RULES and the FLOW: health, score, what a hit does, when a wave starts, when the
// run ends and what the end card says. Each system lives in its own file:
//   arena.js    the map (text), walls, collision, path-finding, scenery
//   player.js   move, aim, shoot, dash            shots.js    water shots and enemy seeds
//   enemies.js  the three kinds and their attacks  waves.js    the wave table and its director
//   boss.js     Old Bramble                        pickups.js  gems and hearts
//   camera.js   the tilted follow camera           fx.js       markers, particles, flowers
//   bot.js      ?bot=1                             shapes.js   small helpers
// Read STARTER.md (next to helper.json) before reshaping it.

import * as THREE from 'three';
import { buildArena } from './arena.js';
import { createFx } from './fx.js';
import { createTopDownCamera } from './camera.js';
import { createShots } from './shots.js';
import { createPlayer } from './player.js';
import { createEnemies } from './enemies.js';
import { createBoss, BOSS } from './boss.js';
import { createPickups } from './pickups.js';
import { createWaves, WAVES } from './waves.js';
import { createBot } from './bot.js';

export const info = {
  tagline: 'Thorn creatures are creeping into the garden. Hose them down: three waves, then Old Bramble.',
  controls: [
    { keys: ['W', 'A', 'S', 'D'], label: 'Move (or arrow keys)' },
    { keys: ['Mouse'], label: 'Aim. Hold the button to hose' },
    { keys: ['Space'], label: 'Dash: nothing can hurt you mid-dash' },
    { keys: ['Gamepad'], label: 'Sticks move and aim, RT hoses, A dashes' },
    { keys: ['Esc'], label: 'Pause' },
    { keys: ['N'], label: 'Leave a note for your agent' },
  ],
};

const MAX_HEALTH = 3;
const CHIME_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; // pentatonic: each pickup in a streak rings higher

export function createGame(ctx) {
  const { view, input, juice, audio, ui, events, rng, tune, flags, testmode, look } = ctx;

  const scene = new THREE.Scene();
  const arena = buildArena(scene, look);
  const fx = createFx(scene, look);
  const rig = createTopDownCamera({ tune, view });
  const shots = createShots({ scene, arena, look, tune, fx, audio });
  const player = createPlayer({ scene, arena, look, tune, input, audio, events, fx, rig, shots, rng });
  const enemies = createEnemies({ scene, arena, look, tune, fx, audio, rng, shots });
  const boss = createBoss({ scene, arena, look, tune, fx, audio, juice, rng, shots, enemies });
  const pickups = createPickups({ scene, look, tune, fx });
  const director = createWaves({ arena, enemies, boss, rng, tune });
  const bot = flags.bot ? createBot({ input, rng, arena }) : null;

  const run = { health: MAX_HEALTH, score: 0, kills: 0, time: 0, ending: 0, endInfo: null, streak: 0, streakTime: 0, pullAll: false };
  const targets = []; // what shots and aiming can hit this step
  const jingle = []; // chimes waiting to play: { t, note, vol }
  const origin = new THREE.Vector3();
  let worldTime = 0;

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const chimes = (notes, gap = 0.09, vol = 0.16) => notes.forEach((note, i) => jingle.push({ t: i * gap, note, vol }));

  function updateHud() {
    ui.hud.set('health', { icon: 'heart', count: run.health, max: MAX_HEALTH });
    ui.hud.set('wave', { icon: 'flag', text: director.wave.boss ? director.wave.name : `Wave ${director.index + 1} of ${WAVES.length - 1}` });
    ui.hud.set('score', { icon: 'spark', text: `${run.score}` });
  }

  function addScore(n) {
    run.score += n;
    updateHud();
    events.emit('score', { score: run.score });
  }

  function reset() {
    Object.assign(run, { health: MAX_HEALTH, score: 0, kills: 0, time: 0, ending: 0, endInfo: null, streak: 0, streakTime: 0, pullAll: false });
    jingle.length = 0;
    fx.reset();
    shots.reset();
    enemies.reset();
    boss.reset();
    pickups.reset();
    director.begin(0);
    player.reset(arena.start.x, arena.start.z);
    rig.snap(arena.start.x, arena.start.z);
    bot?.reset();
    updateHud();
  }

  function finish(won, reason) {
    if (run.ending > 0) return;
    run.ending = won ? 1.8 : 1.1; // let the moment land before the card
    run.endInfo = {
      won,
      heading: won ? 'The garden is in bloom' : 'The thorns took the garden',
      reason,
      stats: [['Score', `${run.score}`], ['Flowers grown', `${fx.flowers}`], ['Time', formatTime(run.time)], ['Hearts', `${run.health}`]],
    };
    if (won) {
      juice.slowmo(0.4, 900);
      juice.flash(look.shade(look.light, 0.3), 400);
      audio.duck(0.3, 1500);
      chimes([0, 4, 7, 12, 16], 0.1, 0.18);
      events.emit('win', { time: run.time, health: run.health, score: run.score });
    } else {
      juice.slowmo(0.35, 800);
      audio.thud({ freq: 70, vol: 0.6, length: 0.5 });
      events.emit('death', { reason });
    }
  }

  // Something reached the player. source: { tip, x, z }. tip becomes the end card's reason.
  function hurt(source) {
    if (run.ending > 0 || player.invuln > 0 || tune.feel.invincible) return;
    run.health -= 1;
    player.hurt(source.x, source.z);
    juice.hitStop(tune.feel.hurtStopMs);
    juice.shake(tune.feel.hurtShake, 260);
    juice.flash(look.danger, 220);
    audio.thud({ freq: 95, vol: 0.7, length: 0.25 });
    audio.whoosh({ vol: 0.12, length: 0.25, from: 1600, to: 300 });
    updateHud();
    ui.hud.punch('health');
    events.emit('hit', { health: run.health, tip: source.tip });
    if (run.health <= 0) finish(false, source.tip);
    else if (run.health === 1) {
      // The last-heart beat: the world slows for a moment so the player takes it in.
      juice.slowmo(tune.feel.lastHeartSlow, tune.feel.lastHeartMs);
      audio.duck(0.3, 900);
      ui.toast('Last heart', 1400);
    }
  }

  function collect(type) {
    run.streak = run.streakTime > 0 ? run.streak + 1 : 0;
    run.streakTime = tune.pickups.streakTime;
    audio.chime({ note: CHIME_SCALE[Math.min(run.streak, CHIME_SCALE.length - 1)], vol: 0.14, vary: 0.05 });
    if (type === 'heart') {
      run.health = Math.min(MAX_HEALTH, run.health + 1);
      chimes([7, 12], 0.08, 0.14);
      ui.hud.punch('health');
    } else {
      ui.hud.punch('score');
    }
    events.emit('pickup', { type, streak: run.streak });
    addScore(type === 'gem' ? tune.pickups.gemScore : 0);
  }

  enemies.onKill = (e) => {
    run.kills++;
    juice.hitStop(tune.feel.killStopMs);
    for (let i = 0; i < e.k.gems; i++) pickups.drop('gem', e.pos.x, e.pos.z);
    if (run.health < MAX_HEALTH && rng.chance(tune.pickups.heartChance)) pickups.drop('heart', e.pos.x, e.pos.z);
    addScore(e.k.score);
    events.emit('kill', { kind: e.kind });
  };

  boss.onDeath = () => {
    for (const e of [...enemies.list]) enemies.damage(e, 99, 0, 0);
    enemies.pending.length = 0;
    shots.theirs.length = 0;
    for (let i = 0; i < 12; i++) pickups.drop('gem', boss.pos.x, boss.pos.z);
    addScore(300);
  };

  const onShotHit = (target, shot) => {
    if (target.isBoss) boss.damage(tune.shooting.damage, shot.dx, shot.dz);
    else enemies.damage(target, tune.shooting.damage, shot.dx, shot.dz);
  };
  const onSeedHit = (seed) => hurt({ tip: seed.tip, x: seed.x - seed.dx, z: seed.z - seed.dz });

  function playStep(dt) {
    run.time += dt;
    run.streakTime = Math.max(0, run.streakTime - dt);
    const on = run.ending === 0;

    targets.length = 0;
    for (const e of enemies.list) targets.push(e);
    if (boss.alive) targets.push(boss);

    if (bot && on) bot.update(dt, { player, enemies, boss, shots, pickups });
    player.update(dt, on, targets);
    shots.update(dt, targets, player, onShotHit, onSeedHit);
    enemies.update(dt, player, hurt, on);
    boss.update(dt, player, hurt);
    pickups.update(dt, player, collect, run.pullAll);

    if (on) {
      const what = director.update(dt, player.pos);
      if (what === 'cleared') {
        run.pullAll = true; // every gem left on the ground flies in
        chimes([4, 7, 12], 0.09);
        ui.toast('Wave cleared', 1500);
        if (run.health < MAX_HEALTH) pickups.drop('heart', arena.start.x, arena.start.z);
      } else if (what === 'next') {
        run.pullAll = false;
        ui.toast(director.wave.boss ? `${BOSS.name} wakes` : `Wave ${director.index + 1}: ${director.wave.name}`, 1800);
        events.emit('wave', { wave: director.index + 1 });
        updateHud();
      } else if (what === 'won') {
        run.pullAll = true;
        finish(true, `You washed away ${run.kills} creatures and ${BOSS.name} in ${formatTime(run.time)}, with ${run.health} ${run.health === 1 ? 'heart' : 'hearts'} left.`);
      }
    }

    // The camera pulls back a little when a crowd (or the boss) is close.
    let crowd = boss.alive ? tune.camera.crowdSize : 0;
    for (const e of enemies.list) if (Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) < tune.camera.crowdRange) crowd++;
    rig.update(dt, player.pos, player.aimPoint, crowd);
  }

  // Skip buttons (?test=1) and __game.skipTo(name).
  function jumpToWave(index) {
    enemies.reset();
    boss.reset();
    shots.reset();
    director.begin(index);
    run.pullAll = false;
    updateHud();
    ui.toast(`Skipped to: ${director.wave.name}`, 1200);
  }
  testmode.add('wave2', 'Wave 2', () => jumpToWave(1));
  testmode.add('wave3', 'Wave 3', () => jumpToWave(2));
  testmode.add('boss', 'Boss', () => jumpToWave(WAVES.length - 1));
  testmode.add('last-heart', 'Last heart', () => { run.health = 1; updateHud(); });
  testmode.add('win', 'Win now', () => {
    enemies.reset();
    boss.reset();
    shots.reset();
    finish(true, `You washed away ${run.kills} creatures in ${formatTime(run.time)} (skipped to the end with the test button).`);
  });
  testmode.add('lose', 'Lose now', () => {
    run.health = 1;
    tune.feel.invincible = false;
    player.invuln = 0;
    hurt({ tip: 'Skipped to the end (test button).', x: player.pos.x, z: player.pos.z - 1 });
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
      ui.toast('Hold the mouse button to hose. Space to dash.', 3000);
    },

    update(dt, mode) {
      worldTime += dt;
      arena.animate(worldTime);
      fx.begin();
      for (let i = jingle.length - 1; i >= 0; i--) {
        jingle[i].t -= dt;
        if (jingle[i].t <= 0) audio.chime(jingle.splice(i, 1)[0]);
      }
      if (mode === 'playing') {
        playStep(dt);
        if (run.ending > 0) {
          run.ending -= dt;
          if (run.ending <= 0) {
            run.ending = 0;
            ctx.end(run.endInfo);
          }
        }
      } else if (mode === 'title') {
        rig.title(worldTime);
        fx.ring(player.pos.x, player.pos.z, 0.72, look.player);
      }
      fx.update(dt);
    },

    render(alpha) {
      rig.render(alpha);
      player.render(alpha, worldTime);
      enemies.render(alpha, worldTime);
      boss.render(alpha, worldTime, rig.camera);
      shots.render(alpha, worldTime);
      pickups.render(worldTime);
      arena.air.follow(rig.camera, origin); // the garden is small: shadows stay centred on it
    },

    state() {
      const r2 = (v) => Math.round(v * 100) / 100;
      return {
        score: run.score,
        health: run.health,
        wave: director.index + 1,
        waves: WAVES.length,
        waveName: director.wave.name,
        waveState: director.state,
        enemies: enemies.list.length,
        arriving: enemies.pending.length,
        bossHealth: boss.alive ? boss.hp : 0,
        bossState: boss.state,
        kills: run.kills,
        flowers: fx.flowers,
        pickups: pickups.list.length,
        shots: shots.mine.length,
        seeds: shots.theirs.length,
        runTime: r2(run.time),
        player: { x: r2(player.pos.x), z: r2(player.pos.z) },
        speed: r2(Math.hypot(player.vel.x, player.vel.z)),
        aim: { x: r2(player.aim.x), z: r2(player.aim.z), mode: player.aimMode },
        dashReady: player.dashCooldown <= 0,
        dashing: player.dashTime > 0,
        safe: player.invuln > 0,
        invincible: tune.feel.invincible,
      };
    },
  };
}
