// How the moving things LOOK: the player, the crawlers and the moving platforms.
// Their behaviour lives elsewhere (player.js, enemies.js, movers.js); this file only reads those
// numbers and places shapes, so you can redraw anything here without touching how the game plays.
//
//   - the player: a round body with ears, eyes that look where it is going, two feet that run.
//     Squash and stretch, the lean into a run and the blink after a respawn all happen here.
//   - a crawler: a dome in the danger colour (it hurts) with a soft round top (it can be stomped).
//   - a mover: a pale plank, with a dotted line showing its whole track so the path is never a surprise.
//
// To swap a shape for a sprite or a model: build your mesh in place of the Painter one and keep the
// same update(...) placement. See STARTER.md, "Swapping the shapes for sprites".

import * as THREE from 'three';
import { Painter, flat, outlineFor } from './paint.js';
import { MOVER_H } from '../movers.js';

const Z = { track: 0.5, mover: 1, enemy: 2, player: 3 };
const lerp = (a, b, t) => a + (b - a) * t;

export function createPlayerLook(group, look) {
  const root = new THREE.Group(); // at the player's feet
  const squash = new THREE.Group(); // scaled for squash and stretch (pivot = the feet)
  const flip = new THREE.Group(); // mirrored to face left
  root.add(squash);
  squash.add(flip);
  group.add(root);

  const line = outlineFor(look, look.player);
  const p = new Painter();
  // ears first (behind the body), then the outline, the body and a paler belly
  for (const x of [-0.2, 0.16]) {
    p.tri(x - 0.17, 0.78, x + 0.17, 0.78, x + 0.02, 1.2, line, 0);
    p.tri(x - 0.1, 0.8, x + 0.1, 0.8, x + 0.02, 1.08, look.player, 0.005);
  }
  p.roundRect(0, 0.47, 0.88, 1.0, 0.38, line, 0.01);
  p.roundRect(0, 0.47, 0.76, 0.88, 0.32, look.player, 0.02);
  p.roundRect(0.07, 0.34, 0.46, 0.42, 0.2, look.mix(look.player, look.luminance(look.player) > 0.5 ? look.shadow : look.light, 0.22), 0.03);
  const body = p.mesh();
  flip.add(body);

  const e = new Painter();
  for (const x of [0.06, 0.27]) {
    e.circle(x, 0.6, 0.055, line, 0, 0.095, 12);
    e.circle(x + 0.015, 0.635, 0.018, look.player, 0.005, 0.03, 8);
  }
  const eyes = e.mesh();
  eyes.position.z = 0.05;
  flip.add(eyes);

  const footGeo = new Painter().circle(0, 0, 0.14, line, 0, 0.085, 12).geometry();
  const footMat = flat('#ffffff', { vertexColors: true });
  const feet = [new THREE.Mesh(footGeo, footMat), new THREE.Mesh(footGeo, footMat)];
  feet.forEach((f) => { f.position.z = 0.04; flip.add(f); });

  return {
    root,
    update(player, alpha, time, tune) {
      const b = player.body;
      root.position.set(lerp(player.prevX, b.x, alpha), lerp(player.prevY, b.y, alpha), Z.player);
      root.visible = player.alive && !(player.blink > 0 && Math.floor(time * 14) % 2 === 0);
      flip.scale.x = player.facing;

      const s = player.squash * tune.feel.squash;
      squash.scale.set(1 - s * 0.7, 1 + s, 1);
      const lean = Math.max(-1, Math.min(1, b.vx / tune.run.speed));
      squash.rotation.z = -lean * (b.onGround ? 0.1 : 0.05);

      // eyes: look up when rising, down when falling; blink now and then
      eyes.position.y = Math.max(-0.05, Math.min(0.05, b.vy * 0.004));
      eyes.scale.y = (time % 3.4) < 0.1 ? 0.15 : 1;
      eyes.position.y += 0.6 * (1 - eyes.scale.y); // keep the blink at eye height

      // feet: a run cycle on the ground, tucked up in the air
      const run = player.runCycle * Math.PI;
      const moving = b.onGround && Math.abs(b.vx) > 0.5;
      feet.forEach((f, i) => {
        const ph = run + i * Math.PI;
        if (!b.onGround) f.position.set((i ? 0.2 : -0.16) + (b.vy > 0 ? -0.04 : 0.04), 0.07 + (b.vy > 0 ? 0.02 : 0.1), 0.04);
        else if (moving) f.position.set((i ? 0.17 : -0.17) * 0.3 + Math.sin(ph) * 0.2, 0.05 + Math.max(0, Math.cos(ph)) * 0.12, 0.04);
        else f.position.set(i ? 0.19 : -0.17, 0.05, 0.04);
      });
    },
  };
}

export function createEnemyLooks(group, enemies, look) {
  const line = outlineFor(look, look.danger);
  const p = new Painter();
  for (const x of [-0.24, 0.22]) p.circle(x, 0.06, 0.13, line, 0, 0.08, 10); // feet
  p.roundRect(0, 0.36, 0.98, 0.76, 0.36, line, 0.01);
  p.roundRect(0, 0.36, 0.86, 0.64, 0.3, look.danger, 0.02);
  p.roundRect(0, 0.17, 0.8, 0.22, 0.1, look.mix(look.danger, look.shadow, 0.4), 0.03); // darker belly
  for (const x of [0.08, 0.3]) { // eyes, on the side it walks towards
    p.circle(x, 0.44, 0.085, look.shade(look.light, 0.6), 0.04, 0.11, 12);
    p.circle(x + 0.03, 0.43, 0.04, line, 0.05, 0.06, 10);
  }
  p.tri(-0.02, 0.6, 0.4, 0.5, 0.4, 0.58, line, 0.06); // a grumpy brow
  const geometry = p.geometry();
  const material = flat('#ffffff', { vertexColors: true });
  const meshes = enemies.list.map(() => {
    const m = new THREE.Mesh(geometry, material);
    group.add(m);
    return m;
  });

  return {
    update(alpha, tune) {
      enemies.list.forEach((e, i) => {
        const m = meshes[i];
        m.visible = e.alive || e.squish > 0;
        if (!m.visible) return;
        m.position.set(lerp(e.prevX, e.x, alpha), e.y, Z.enemy);
        if (!e.alive) {
          m.scale.set(e.dir * 1.35, 0.22, 1); // squashed flat
        } else if (e.pause > 0) {
          // the tell before turning: a little hop on the spot
          const u = 1 - e.pause / Math.max(0.01, tune.enemy.turnPause);
          m.position.y += Math.sin(u * Math.PI) * 0.14;
          m.scale.set(e.dir, 1, 1);
        } else {
          const wob = Math.sin(e.walk * 7);
          m.scale.set(e.dir * (1 - wob * 0.04), 1 + wob * 0.05, 1);
        }
      });
    },
  };
}

export function createMoverLooks(group, movers, look) {
  const deck = look.mix(look.base[3], look.light, 0.35);
  const under = look.mix(look.base[3], look.shadow, 0.5);
  const line = outlineFor(look, deck);
  const dot = look.mix(look.base[2], look.light, 0.45);

  // The tracks: a dotted line from end to end, drawn once.
  const t = new Painter();
  for (const m of movers.list) {
    const n = Math.max(1, Math.round(m.dist / 0.5));
    for (let i = 0; i <= n; i++) {
      const x = lerp(m.x0, m.x1, i / n);
      const y = lerp(m.y0, m.y1, i / n) - MOVER_H / 2;
      const end = i === 0 || i === n;
      t.circle(x, y, end ? 0.13 : 0.05, dot, 0, end ? 0.13 : 0.05, end ? 12 : 6);
    }
  }
  if (movers.list.length) {
    const tracks = t.mesh({ transparent: true, opacity: 0.55, depthWrite: false });
    tracks.position.z = Z.track;
    tracks.frustumCulled = false;
    group.add(tracks);
  }

  const meshes = movers.list.map((m) => {
    const p = new Painter();
    p.roundRect(0, -MOVER_H / 2, m.w + 0.08, MOVER_H + 0.08, 0.2, line, 0);
    p.roundRect(0, -MOVER_H / 2, m.w, MOVER_H, 0.17, under, 0.01);
    p.roundRect(0, -MOVER_H * 0.32, m.w, MOVER_H * 0.64, 0.14, deck, 0.02);
    p.rect(-m.w / 2 + 0.16, -0.07, m.w - 0.32, 0.05, look.shade(deck, 0.3), 0.03);
    for (const x of [-m.w / 2 + 0.3, m.w / 2 - 0.3]) p.circle(x, -MOVER_H * 0.45, 0.06, line, 0.03, 0.06, 8);
    const mesh = p.mesh();
    group.add(mesh);
    return mesh;
  });

  return {
    update(alpha) {
      movers.list.forEach((m, i) => meshes[i].position.set(lerp(m.prevX, m.x, alpha), lerp(m.prevY, m.y, alpha), Z.mover));
    },
  };
}
