// The world's RULES: everything that happens in a level, with no drawing and no sound.
//   coins, checkpoints, the goal, hearts, what hurts, the stomp, falling out, coming back.
// game.js owns the flow (title, end card), listens to what happens here through `emit(name, data)` and
// answers with sound, particles, shake and the HUD. Keeping the rules apart from the show means you can
// change either without breaking the other, and the whole world can run without a browser.
//
// Things emit() says: jump land step skid drop bonk (from player.js), coin, stomp, checkpoint,
// hurt { by: 'spikes' | 'enemy' | 'fall' }, respawn, goal, lose.

import { parseLevel } from './level.js';
import { createMovers } from './movers.js';
import { createEnemies } from './enemies.js';
import { createPlayer } from './player.js';

export function createWorld({ def, tune, input, emit }) {
  const level = parseLevel(def);
  const movers = createMovers(level, tune);
  const enemies = createEnemies(level, tune);
  const player = createPlayer({ level, movers: movers.list, tune, input, emit });
  const body = player.body;
  const coins = level.coins.map((c, i) => ({ i, x: c.x, y: c.y, taken: false }));
  const checkpoints = level.checkpoints.map((c, i) => ({ i, x: c.x, y: c.y, reached: false }));
  const goal = level.goal ? { x: level.goal.x, y: level.goal.y } : null;

  const run = {
    hearts: 3,
    coins: 0,
    stomps: 0,
    score: 0,
    time: 0,
    checkpoint: -1, // index of the last checkpoint touched
    spawn: { x: level.start.x, y: level.start.y },
    respawn: 0, // > 0: the player is gone, coming back when this runs out
    cause: '', // what hurt last
    done: null, // 'won' | 'lost' once the level is over
  };

  const world = { level, movers, enemies, player, coins, checkpoints, goal, run };

  // Start the level over. keep = { hearts, coins, score, stomps, time } carries a run into the next level.
  world.reset = (keep = null) => {
    movers.reset();
    enemies.reset();
    for (const c of coins) c.taken = false;
    for (const c of checkpoints) c.reached = false;
    Object.assign(run, { hearts: tune.rules.hearts, coins: 0, stomps: 0, score: 0, time: 0 }, keep ?? {}, { checkpoint: -1, respawn: 0, cause: '', done: null });
    run.spawn = { x: level.start.x, y: level.start.y };
    player.reset(run.spawn.x, run.spawn.y);
  };

  // Put the player somewhere (skip buttons, respawn).
  world.place = (x, y) => {
    player.reset(x, y);
    run.respawn = 0;
  };

  world.hurt = (by) => {
    if (run.done || !player.alive) return;
    if (player.invuln > 0 && by !== 'fall') return;
    run.cause = by;
    if (!tune.rules.invincible) run.hearts -= 1;
    else if (by !== 'fall') return; // invincible: only a fall still sends you back
    emit('hurt', { by, x: body.x, y: Math.max(body.y, 0.5), hearts: run.hearts });
    player.alive = false;
    if (run.hearts <= 0) {
      run.done = 'lost';
      emit('lose', { by });
    } else run.respawn = tune.rules.respawnTime;
  };

  function touchCheckpoint(c) {
    c.reached = true;
    run.checkpoint = c.i;
    run.spawn = { x: c.x, y: c.y };
    let healed = false;
    if (tune.rules.checkpointHeals && run.hearts < tune.rules.hearts) {
      run.hearts += 1;
      healed = true;
    }
    emit('checkpoint', { index: c.i, x: c.x, y: c.y, healed });
  }

  world.update = (dt, controlsOn) => {
    movers.update(dt);
    enemies.update(dt);
    if (run.respawn > 0) {
      run.respawn -= dt;
      if (run.respawn <= 0) {
        player.reset(run.spawn.x, run.spawn.y);
        player.invuln = player.blink = tune.rules.invulnTime;
        emit('respawn', { x: run.spawn.x, y: run.spawn.y });
      }
      return;
    }
    if (!player.alive) return;
    player.update(dt, controlsOn && !run.done);
    if (run.done) return;
    if (controlsOn) run.time += dt;

    const left = body.x - body.w / 2;
    const right = body.x + body.w / 2;
    const top = body.y + body.h;

    // Coins: generous, the whole body plus a little reach.
    const reach = tune.rules.coinReach;
    for (const c of coins) {
      if (c.taken) continue;
      const nx = Math.max(left, Math.min(c.x, right));
      const ny = Math.max(body.y, Math.min(c.y, top));
      if (Math.hypot(c.x - nx, c.y - ny) < reach) {
        c.taken = true;
        run.coins += 1;
        run.score += 100;
        emit('coin', { index: c.i, x: c.x, y: c.y, count: run.coins, total: coins.length });
      }
    }

    for (const c of checkpoints) {
      if (!c.reached && Math.abs(body.x - c.x) < 0.9 && body.y > c.y - 0.6 && body.y < c.y + 3) touchCheckpoint(c);
    }

    // Enemies: land on one and it is squashed; touch it any other way and it hurts.
    // The stomp is generous on purpose: wider than the enemy, and anything from its middle up counts.
    const e = tune.enemy;
    for (const en of enemies.list) {
      if (!en.alive) continue;
      const dx = Math.abs(body.x - en.x);
      const feetOver = Math.max(body.y, player.prevY) - en.y; // how far the feet are (or just were) above its feet
      const falling = body.vy <= 1;
      if (falling && dx < (body.w + en.w) / 2 + e.stompGrace && feetOver > en.h * 0.4 && body.y < en.y + en.h + 0.15) {
        en.alive = false;
        en.squish = 0.4;
        const held = input.held('jump');
        body.vy = held ? e.stompBounceHeld : e.stompBounce;
        body.onGround = false;
        player.rising = false;
        player.squashVel = 4;
        player.invuln = Math.max(player.invuln, 0.15);
        run.stomps += 1;
        run.score += 200;
        emit('stomp', { x: en.x, y: en.y + en.h, index: en.i });
      } else if (dx < (body.w + en.w) / 2 - e.hurtShrink && body.y < en.y + en.h - e.hurtShrink && top > en.y + e.hurtShrink) {
        world.hurt('enemy');
        if (!player.alive) return;
      }
    }

    // Spikes: only the inner part of the tile hurts, so brushing past a corner is forgiven.
    const s = tune.rules.spikeShrink;
    for (let cy = Math.floor(body.y); cy <= Math.floor(top); cy++) {
      for (let cx = Math.floor(left); cx <= Math.floor(right); cx++) {
        if (!level.hazard(cx, cy)) continue;
        if (right > cx + s && left < cx + 1 - s && body.y < cy + 0.62 - s * 0.5 && top > cy) {
          world.hurt('spikes');
          if (!player.alive) return;
        }
      }
    }

    if (body.y < -1.5) {
      world.hurt('fall');
      return;
    }

    if (goal && Math.abs(body.x - goal.x) < 0.9 && body.y > goal.y - 0.6 && body.y < goal.y + 2.5) {
      run.done = 'won';
      run.score += run.hearts * 500;
      emit('goal', { x: goal.x, y: goal.y });
    }
  };

  world.reset();
  return world;
}
