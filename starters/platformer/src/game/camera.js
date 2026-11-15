// The camera: a flat (orthographic) view that follows the player the way good 2D cameras do.
//   - LOOK AHEAD: it leads in the direction you face, so you see more of what is coming than of what
//     you left behind. It swings round slowly (camera.lookAheadSpeed) so a quick turn doesn't whip it.
//   - VERTICAL DEAD ZONE: jumping on the spot doesn't move it at all. It only changes height when you
//     LAND somewhere new (then it catches up smoothly), or when you rise or fall out of the zone.
//   - BOUNDS: it never shows past the edges of the level.
//   - NO JITTER: it moves in the fixed step and is drawn blended between steps, like the player.
// camera.viewHeight is the zoom (tiles from top to bottom). The renderer keeps the sides right for any
// window shape (ctx.view.addCamera, done by main.js).
//
// For a room-by-room game or an auto-scroller, see STARTER.md ("Make it yours").

import * as THREE from 'three';

const damp = (v, target, rate, dt) => target + (v - target) * Math.exp(-rate * dt);
const clamp = (v, lo, hi) => (hi < lo ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));

export function createCamera({ tune }) {
  const h0 = tune.camera.viewHeight / 2;
  const camera = new THREE.OrthographicCamera(-h0 * (16 / 9), h0 * (16 / 9), h0, -h0, 0.1, 300);
  camera.position.set(0, 0, 100);
  const rig = {
    camera,
    x: 0, y: 0, prevX: 0, prevY: 0,
    lead: 0, // the current look-ahead offset
    focusY: 0, // the height being framed (changes on landing, or outside the dead zone)
    view: { x: 0, y: 0, halfW: h0 * (16 / 9), halfH: h0 }, // what was drawn last (the backdrop reads it)
  };
  let bounds = { w: 100, h: 20 };

  function fit() {
    const halfH = tune.camera.viewHeight / 2;
    if (Math.abs(camera.top - halfH) > 1e-6) {
      const aspect = (camera.right - camera.left) / (camera.top - camera.bottom);
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.left = -halfH * aspect;
      camera.right = halfH * aspect;
      camera.updateProjectionMatrix();
    }
  }
  const limitX = (x) => clamp(x, camera.right, bounds.w - camera.right);
  const limitY = (y) => clamp(y, camera.top, Math.max(bounds.h, camera.top * 2) - camera.top);

  rig.setBounds = (level) => {
    bounds = { w: level.w, h: level.h };
  };

  // Jump straight to the player (start of a run, respawn).
  rig.snap = (player) => {
    fit();
    rig.lead = player.facing * tune.camera.lookAhead * 0.5;
    rig.focusY = player.body.y;
    rig.x = rig.prevX = limitX(player.body.x + rig.lead);
    rig.y = rig.prevY = limitY(rig.focusY + tune.camera.height);
  };

  rig.update = (dt, player) => {
    const t = tune.camera;
    const b = player.body;
    fit();
    rig.prevX = rig.x;
    rig.prevY = rig.y;
    if (!player.alive) return; // hold still while the player is away

    const moving = Math.abs(b.vx) > 1;
    rig.lead = damp(rig.lead, player.facing * t.lookAhead * (moving ? 1 : 0.45), t.lookAheadSpeed, dt);
    rig.x = limitX(damp(rig.x, b.x + rig.lead, t.followX, dt));

    if (b.onGround) rig.focusY = b.y; // landed: frame this height from now on
    else if (b.y > rig.focusY + t.deadZoneUp) rig.focusY = b.y - t.deadZoneUp; // rose out of the zone
    else if (b.y < rig.focusY - t.deadZoneDown) rig.focusY = b.y + t.deadZoneDown; // falling: follow at once
    const falling = !b.onGround && b.y < rig.focusY - t.deadZoneDown + 0.01;
    rig.y = limitY(damp(rig.y, rig.focusY + t.height, falling ? t.followY * 3 : t.followY, dt));
  };

  // A slow drift for the title screen.
  rig.drift = (dt, time, player) => {
    fit();
    rig.prevX = rig.x;
    rig.prevY = rig.y;
    rig.x = limitX(damp(rig.x, player.body.x + 5 + Math.sin(time * 0.25) * 3, 1.5, dt));
    rig.y = limitY(damp(rig.y, player.body.y + tune.camera.height, 2, dt));
  };

  rig.render = (alpha) => {
    const x = rig.prevX + (rig.x - rig.prevX) * alpha;
    const y = rig.prevY + (rig.y - rig.prevY) * alpha;
    camera.position.set(x, y, 100);
    rig.view.x = x;
    rig.view.y = y;
    rig.view.halfW = camera.right;
    rig.view.halfH = camera.top;
  };

  return rig;
}
