// The player's movement: run, jump, wall slide and wall jump. This is the heart of the starter.
// Every number comes from tuning.json (groups: run, jump, assist, wall) and is read every step, so the
// dev panel (backquote key) changes the feel while you play. What each part is for:
//
//   RUN    Three different rates, on the ground and in the air: speeding up (accel), letting go (decel)
//          and reversing (turn). Quick to start, quicker to stop, quickest to turn = "tight" controls.
//   JUMP   - variable height: let go early and the rise is cut (jump.cut)
//          - coyote time: you can still jump a moment after running off a ledge (jump.coyote)
//          - buffering: a press just before landing still jumps (jump.buffer)
//          - apex hang: gravity is lighter near the top while jump is held (jump.apexGravity), which
//            gives a beat to aim the landing
//          - heavier falling (jump.fallGravity) and a top fall speed (jump.maxFall)
//   WALL   slide slowly down a wall you push against, and jump off it (wall.enabled turns both off)
//   DROP   down + jump on a one-way platform drops through it
//
// The body is a box (physics.js does the collision). Drawing is in draw/actors.js: this file only keeps
// the numbers the drawing needs (facing, squash, run cycle). No three.js here.

import { makeBuffer } from '../core/input.js';
import { createBody, moveBody, touchingWall } from './physics.js';

export const PLAYER_W = 0.62; // the collision box: a little narrower than the drawing, which is forgiving
export const PLAYER_H = 0.9;

const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

export function createPlayer({ level, movers, tune, input, emit }) {
  const body = createBody(PLAYER_W, PLAYER_H);
  const jumpBuffer = makeBuffer(0.12);
  const p = {
    body,
    prevX: 0, prevY: 0, // where it was one step ago (drawing blends between the two)
    facing: 1,
    coyote: 0,
    rising: false, // in a jump that can still be cut short
    wallSide: 0, // the wall we last touched (-1 left, 1 right)
    wallGrace: 0, // time left in which a wall jump off that wall still counts
    lock: 0, // just wall-jumped: steering is taken away for a moment so the kick carries
    sliding: false,
    alive: true,
    invuln: 0, // > 0: can't be hurt
    blink: 0, // > 0: drawn blinking (just came back)
    squash: 0, // > 0 stretched tall, < 0 squashed flat; springs back to 0
    squashVel: 0,
    runCycle: 0, // grows with distance run (feet, footsteps)
    skidCool: 0,
    airTime: 0,
    moveX: 0, // what the stick asked for this step
  };

  p.reset = (x, y) => {
    Object.assign(body, { x, y, vx: 0, vy: 0, onGround: false, riding: null, stoodOn: null, dropTimer: 0, hitWall: 0, hitCeil: false });
    p.prevX = x;
    p.prevY = y;
    Object.assign(p, { facing: 1, coyote: 0, rising: false, wallSide: 0, wallGrace: 0, lock: 0, sliding: false, alive: true, invuln: 0, blink: 0, squash: 0, squashVel: 0, runCycle: 0, airTime: 0, moveX: 0 });
    jumpBuffer.clear();
  };

  p.jumpSpeed = () => Math.sqrt(2 * tune.jump.gravity * tune.jump.height);

  p.update = (dt, controlsOn) => {
    const r = tune.run;
    const j = tune.jump;
    const w = tune.wall;
    p.prevX = body.x;
    p.prevY = body.y;

    // --- what the player is asking for
    const stick = controlsOn ? input.move() : { x: 0, y: 0 };
    let mx = Math.abs(stick.x) < 0.25 ? 0 : Math.abs(stick.x) > 0.85 ? Math.sign(stick.x) : stick.x;
    const down = stick.y < -0.5;
    const jumpHeld = controlsOn && input.held('jump');
    const jumpPressed = controlsOn && input.pressed('jump');
    const ground = body.onGround;

    p.invuln = Math.max(0, p.invuln - dt);
    p.blink = Math.max(0, p.blink - dt);
    p.skidCool = Math.max(0, p.skidCool - dt);
    if (p.lock > 0) {
      p.lock -= dt;
      mx = -p.wallSide; // keep kicking away from the wall
    }
    p.moveX = mx;

    // --- run: pick the rate for what is happening, then move the speed towards the wish
    const target = mx * r.speed;
    const turning = mx !== 0 && body.vx !== 0 && Math.sign(mx) !== Math.sign(body.vx);
    let rate;
    if (turning) rate = ground ? r.turn : r.airTurn;
    else if (mx === 0 || Math.abs(body.vx) > Math.abs(target)) rate = ground ? r.decel : r.airDecel;
    else rate = ground ? r.accel : r.airAccel;
    body.vx = approach(body.vx, target, rate * dt);
    if (mx !== 0) p.facing = Math.sign(mx);
    if (ground && turning && Math.abs(body.vx) > r.speed * 0.5 && p.skidCool <= 0) {
      p.skidCool = 0.25;
      emit('skid', { x: body.x, y: body.y, dir: Math.sign(body.vx) });
    }

    // --- walls
    let wallDir = 0;
    if (w.enabled && !ground) wallDir = touchingWall(level, body, 1) ? 1 : touchingWall(level, body, -1) ? -1 : 0;
    if (wallDir) {
      p.wallSide = wallDir;
      p.wallGrace = w.grace;
    } else p.wallGrace = Math.max(0, p.wallGrace - dt);
    p.sliding = wallDir !== 0 && body.vy < 0 && mx * wallDir > 0;

    // --- jump
    p.coyote = ground ? j.coyote : Math.max(0, p.coyote - dt);
    jumpBuffer.window = j.buffer;
    if (jumpPressed) {
      if (ground && down && body.stoodOn === 'oneway') {
        body.dropTimer = 0.22; // drop through the platform instead of jumping
        p.coyote = 0;
        emit('drop', { x: body.x, y: body.y });
      } else jumpBuffer.set();
    }
    if (p.coyote > 0 && jumpBuffer.active) {
      jumpBuffer.take();
      body.vy = p.jumpSpeed() + Math.max(0, body.riding?.vy ?? 0); // a rising lift adds its push
      body.vx += body.riding?.vx ?? 0; // and a sliding platform's speed comes with you
      p.rising = true;
      p.coyote = 0;
      p.squashVel = 5.5;
      emit('jump', { x: body.x, y: body.y, wall: 0 });
    } else if (w.enabled && !ground && p.wallGrace > 0 && jumpBuffer.active) {
      jumpBuffer.take();
      body.vy = p.jumpSpeed() * w.jumpUp;
      body.vx = -p.wallSide * w.jumpAway;
      p.lock = w.lock;
      p.facing = -p.wallSide;
      p.rising = true;
      p.wallGrace = 0;
      p.sliding = false;
      p.squashVel = 5;
      emit('jump', { x: body.x + p.wallSide * body.w * 0.5, y: body.y + 0.3, wall: p.wallSide });
    }
    jumpBuffer.tick(dt);
    // Let go while rising: keep only part of the upward speed (once per jump).
    if (p.rising && body.vy > 0 && !jumpHeld) {
      body.vy *= j.cut;
      p.rising = false;
    }
    if (body.vy <= 0) p.rising = false;

    // --- gravity: lighter at the top of a held jump, heavier on the way down, never faster than maxFall
    let g = j.gravity;
    if (!ground && jumpHeld && Math.abs(body.vy) < j.apexSpeed) g *= j.apexGravity;
    else if (body.vy < 0) g *= j.fallGravity;
    body.vy = Math.max(body.vy - g * dt, -j.maxFall);
    if (p.sliding) body.vy = Math.max(body.vy, -w.slideSpeed);

    // --- move, with collision
    const fallSpeed = -body.vy;
    moveBody(body, dt, level, movers, { nudge: tune.assist.cornerNudge, lift: tune.assist.ledgeLift });

    if (body.onGround) {
      if (!ground && p.airTime > 0.08) {
        p.squashVel = -Math.min(9, 2.5 + fallSpeed * 0.35);
        emit('land', { x: body.x, y: body.y, speed: fallSpeed });
      }
      p.airTime = 0;
      const before = Math.floor(p.runCycle);
      p.runCycle += Math.abs(body.vx) * dt * 1.5;
      if (Math.floor(p.runCycle) !== before && Math.abs(body.vx) > 2) emit('step', { x: body.x, y: body.y });
    } else p.airTime += dt;
    if (body.hitCeil) {
      p.rising = false;
      emit('bonk', { x: body.x, y: body.y + body.h });
    }

    // Squash and stretch: a small spring around 0.
    p.squashVel += (-170 * p.squash - 15 * p.squashVel) * dt;
    p.squash = Math.max(-0.45, Math.min(0.45, p.squash + p.squashVel * dt));
  };

  return p;
}
