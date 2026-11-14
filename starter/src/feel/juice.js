// Game feel: the small reactions that make actions feel solid.
// All durations are in GAME time (fixed steps), so they look the same in a slow test browser.
//
//   juice.hitStop(50)              freeze the world for 50 ms (3 frames) on a hit or pickup
//   juice.shake(0.3, 250)          camera shake: amount in metres, length in ms
//   juice.flash('#ffd27a', 120)    a full-screen colour flash that fades out
//   juice.slowmo(0.35, 600)        world runs at 35% speed for 600 ms
//   juice.punch(mesh, 1.3, 180)    scale a mesh up to 130% and spring back
//
// Rules of thumb (frames at 60 Hz): light hit 2-4, heavy hit 6-10, final blow 12-20.
// Shake: small and short. A shake on every footstep is noise; on a big hit it is weight.
//
// main.js calls juice.update(dt) every step, then skips world updates while juice.frozen,
// and scales the world's dt by juice.timeScale. After positioning the camera each frame it
// calls juice.applyShake(camera) (adds an offset) and juice.clearShake(camera) after drawing.

import * as THREE from 'three';

export function createJuice({ overlayParent = document.body } = {}) {
  let freezeLeft = 0;
  let slowLeft = 0;
  let slowScale = 1;
  let shakeLeft = 0;
  let shakeTotal = 0;
  let shakeAmount = 0;
  let shakeTime = 0;
  const shakeOffset = new THREE.Vector3();
  const punches = new Map(); // object -> { t, length, scale, base }

  const flashEl = document.createElement('div');
  flashEl.className = 'flash';
  overlayParent.appendChild(flashEl);
  let flashLeft = 0;
  let flashTotal = 0;

  const juice = {
    // Read by main.js.
    get frozen() {
      return freezeLeft > 0;
    },
    get timeScale() {
      return slowLeft > 0 ? slowScale : 1;
    },
    enabled: true,

    hitStop(ms) {
      if (!juice.enabled) return;
      freezeLeft = Math.max(freezeLeft, ms / 1000);
    },
    shake(amount, ms) {
      if (!juice.enabled) return;
      // A new shake never makes a stronger one weaker.
      if (amount >= shakeAmount * (shakeLeft / (shakeTotal || 1))) {
        shakeAmount = amount;
        shakeLeft = shakeTotal = ms / 1000;
      }
    },
    flash(color, ms) {
      if (!juice.enabled) return;
      flashEl.style.background = color;
      flashLeft = flashTotal = ms / 1000;
      flashEl.style.opacity = '0.55';
    },
    slowmo(scale, ms) {
      if (!juice.enabled) return;
      slowScale = scale;
      slowLeft = ms / 1000;
    },
    punch(object, scale = 1.25, ms = 180) {
      if (!juice.enabled || !object) return;
      const prev = punches.get(object);
      const base = prev ? prev.base : object.scale.clone();
      punches.set(object, { t: 0, length: ms / 1000, scale, base });
    },

    // Every fixed step, BEFORE the world updates. dt is the real step (not slowed).
    update(dt) {
      if (freezeLeft > 0) freezeLeft = Math.max(0, freezeLeft - dt);
      if (slowLeft > 0) slowLeft = Math.max(0, slowLeft - dt);
      shakeTime += dt;

      if (shakeLeft > 0) {
        shakeLeft = Math.max(0, shakeLeft - dt);
        // Fade out with the square of the time left: strong start, soft end.
        const k = shakeLeft / shakeTotal;
        const a = shakeAmount * k * k;
        // Smooth, deterministic wobble (no random numbers: recordings stay identical).
        shakeOffset.set(
          Math.sin(shakeTime * 71.3) * a,
          Math.sin(shakeTime * 53.9 + 1.7) * a,
          Math.sin(shakeTime * 61.1 + 4.2) * a * 0.5,
        );
      } else {
        shakeOffset.set(0, 0, 0);
        shakeAmount = 0;
      }

      if (flashLeft > 0) {
        flashLeft = Math.max(0, flashLeft - dt);
        flashEl.style.opacity = String(0.55 * (flashLeft / flashTotal));
      }

      for (const [obj, p] of punches) {
        p.t += dt;
        const u = Math.min(1, p.t / p.length);
        // Quick out, springy back: 0 -> peak at 25% -> settle with a small wobble.
        const v = (u - 0.25) / 0.75;
        const bump = u < 0.25 ? u / 0.25 : Math.cos(v * Math.PI * 1.5) * (1 - v);
        const s = 1 + (p.scale - 1) * bump;
        obj.scale.copy(p.base).multiplyScalar(s);
        if (u >= 1) {
          obj.scale.copy(p.base);
          punches.delete(obj);
        }
      }
    },

    applyShake(camera) {
      camera.position.add(shakeOffset);
    },
    clearShake(camera) {
      camera.position.sub(shakeOffset);
    },
    reset() {
      freezeLeft = slowLeft = shakeLeft = flashLeft = 0;
      flashEl.style.opacity = '0';
      for (const [obj, p] of punches) obj.scale.copy(p.base);
      punches.clear();
      shakeOffset.set(0, 0, 0);
    },
  };
  return juice;
}
