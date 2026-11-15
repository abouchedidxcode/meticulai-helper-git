// The lanterns: the things you USE. Each one is a post with a cage; lighting it makes a safe circle
// of light on the ground that shades cannot enter.
//
// Where they stand comes from the map (the L and A squares in level.js). This file only knows how a
// lantern looks, how it lights up, and where the safe circles are. The rule "all lit = win" is in game.js.
//
// What to change: the shapes in build(); the size of the circle (tuning: lanterns.safeRadius);
// to make a different usable thing (a lever, a door, a note), copy the small "usable" object in game.js.

import * as THREE from 'three';
import { makeCyl } from './collide.js';
import { glowTexture } from './scenery.js';

export const LANTERN_HEIGHT = 1.45; // metres from the floor to the flame: about eye level, easy to look at
const REAL_LIGHTS = 3; // real lights are costly: only the nearest lit lanterns get one

export function createLanterns({ scene, spots, solids, look, tune }) {
  const postCol = look.mix(look.shadow, look.base[3], 0.4);
  const postMat = new THREE.MeshLambertMaterial({ color: postCol, flatShading: true });
  const unlitCol = new THREE.Color(look.mix(look.accent[1], look.shadow, 0.35));
  const litCol = new THREE.Color(look.light);
  const ringGeo = new THREE.RingGeometry(0.965, 1, 56);
  const discGeo = new THREE.CircleGeometry(1, 40);
  const postGeo = new THREE.CylinderGeometry(0.06, 0.1, 1, 6);
  const cageGeo = new THREE.CylinderGeometry(0.2, 0.16, 0.36, 6, 1, true);
  const capGeo = new THREE.ConeGeometry(0.28, 0.2, 6);
  const coreGeo = new THREE.SphereGeometry(0.11, 10, 8);
  const beamGeo = new THREE.CylinderGeometry(0.03, 0.13, 10, 6, 1, true);

  const list = spots.map((spot, i) => {
    const group = new THREE.Group();
    group.position.set(spot.x, spot.y, spot.z);
    const post = new THREE.Mesh(postGeo, postMat);
    post.scale.y = LANTERN_HEIGHT - 0.2;
    post.position.y = (LANTERN_HEIGHT - 0.2) / 2;
    post.castShadow = true;
    const cage = new THREE.Mesh(cageGeo, new THREE.MeshLambertMaterial({ color: postCol, flatShading: true, wireframe: true }));
    cage.position.y = LANTERN_HEIGHT;
    const cap = new THREE.Mesh(capGeo, postMat);
    cap.position.y = LANTERN_HEIGHT + 0.28;
    cap.castShadow = true;
    const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: unlitCol }));
    core.position.y = LANTERN_HEIGHT;
    // A halo you can spot across the garden: small and pulsing while unlit, big and steady when lit.
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: look.accent[0], transparent: true, opacity: 0.5, depthWrite: false }));
    halo.position.y = LANTERN_HEIGHT;
    // The safe circle: a soft pool of light and a crisp edge, so "inside" and "outside" are never in doubt.
    const pool = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: look.mix(look.light, look.accent[0], 0.5), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.03 - spot.y; // on the ground even when the lantern stands on a step
    const edge = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: look.accent[0], transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.04 - spot.y;
    // A thin beam above a dark lantern: "there is one over there", readable across the whole garden.
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: look.accent[0], transparent: true, opacity: 0.22, depthWrite: false }));
    beam.position.y = LANTERN_HEIGHT + 5.4;
    group.add(post, cage, cap, core, halo, pool, edge, beam);
    scene.add(group);
    solids.push(makeCyl(spot.x, spot.z, 0.14, spot.y, spot.y + LANTERN_HEIGHT - 0.2)); // you bump into the post (it stops below the flame, so it never hides it from the use-cone)

    return {
      i,
      pos: new THREE.Vector3(spot.x, spot.y + LANTERN_HEIGHT, spot.z), // the flame: what you look at to use it
      lit: false,
      glow: 0, // 0..1, eases up after lighting (the circle spreads out with it)
      group, core, halo, pool, edge, beam,
    };
  });

  // A fixed number of real lights, moved to the nearest lit lanterns (never added or removed: see gotchas).
  const lights = Array.from({ length: REAL_LIGHTS }, () => {
    const l = new THREE.PointLight(look.mix(look.light, look.accent[0], 0.35), 0, 15, 1.5);
    scene.add(l);
    return l;
  });

  const api = {
    list,
    get lit() { return list.filter((l) => l.lit).length; },
    reset() {
      for (const l of list) { l.lit = false; l.glow = 0; }
      api.update(0, 0, null);
    },
    light(l) { l.lit = true; },
    // The lit lantern whose safe circle holds this point (or null).
    safeAt(x, z, margin = 0) {
      const r = tune.lanterns.safeRadius;
      for (const l of list) {
        if (l.lit && l.glow > 0.6 && Math.hypot(x - l.pos.x, z - l.pos.z) < r * l.glow + margin) return l;
      }
      return null;
    },
    update(dt, time, eye) {
      const r = tune.lanterns.safeRadius;
      for (const l of list) {
        l.glow = l.lit ? Math.min(1, l.glow + dt * 1.8) : 0;
        const g = l.glow;
        const ease = 1 - (1 - g) ** 3; // fast out, soft landing: the light "arrives"
        const pulse = 0.5 + 0.5 * Math.sin(time * 2.4 + l.i * 1.7);
        l.core.material.color.copy(unlitCol).lerp(litCol, ease);
        l.core.scale.setScalar(l.lit ? 1.2 + Math.sin(time * 9 + l.i) * 0.05 + (1 - g) * 0.8 : 0.8 + pulse * 0.25);
        l.halo.scale.setScalar(l.lit ? 1.1 + ease * 0.7 : 0.9 + pulse * 0.6);
        l.halo.material.opacity = l.lit ? 0.45 : 0.4 + pulse * 0.35;
        l.pool.scale.setScalar(Math.max(0.001, r * ease));
        l.edge.scale.setScalar(Math.max(0.001, r * ease));
        l.pool.material.opacity = 0.16 * ease + (1 - g) * 0.3;
        l.edge.material.opacity = 0.55 * ease;
        l.beam.material.opacity = l.lit ? 0 : 0.3 + pulse * 0.2;
      }
      // Hand the real lights to the nearest lit lanterns; fade with distance so a swap never pops.
      if (!eye) { for (const lt of lights) lt.intensity = 0; return; }
      const near = list.filter((l) => l.lit).map((l) => ({ l, d: l.pos.distanceTo(eye) })).sort((a, b) => a.d - b.d);
      lights.forEach((lt, k) => {
        const n = near[k];
        if (!n) { lt.intensity = 0; return; }
        lt.position.copy(n.l.pos).y += 0.3;
        lt.intensity = tune.lanterns.brightness * n.l.glow * THREE.MathUtils.clamp((30 - n.d) / 12, 0, 1);
      });
    },
  };
  return api;
}
