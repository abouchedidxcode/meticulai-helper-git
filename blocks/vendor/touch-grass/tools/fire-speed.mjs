// How fast the fire runs, measured on the CPU with no page: even grass, one point lit, then how far the burnt
// ground reaches before, across and into the wind after a while. `node tools/fire-speed.mjs`
import { FieldState } from '../src/lib/state.js';

function run(speed, dry, seconds = 24) {
  const state = new FieldState({ size: 256, heightAt: () => 0, growthAt: () => 1, dryAt: () => dry, wetAt: () => 0 });
  state.setWind(1, 0, speed);
  state.ignite(0, 0, 0.4);
  const dt = 1 / 30;
  const t0 = performance.now();
  for (let t = 0; t < seconds; t += dt) state.stepFire(dt);
  const ms = (performance.now() - t0) / (seconds / dt);
  let head = 0;
  let back = 0;
  let flank = 0;
  const M = state.M;
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < M; i++) {
      if (!state.fState[i + j * M]) continue;
      const x = state.minX + (i + 0.5) * state.fcell;
      const z = state.minZ + (j + 0.5) * state.fcell;
      if (Math.abs(z) < 0.5) {
        head = Math.max(head, x);
        back = Math.max(back, -x);
      }
      flank = Math.max(flank, Math.abs(z));
    }
  }
  const per = (d) => (d / seconds).toFixed(2);
  console.log(`wind ${String(speed).padStart(2)} dry ${dry}: head ${per(head)} flank ${per(flank)} back ${per(back)} m/s, ${state.activeCount} cells live, ${ms.toFixed(2)} ms a step`);
}

for (const dry of [0.5]) for (const speed of [0, 2, 3.5, 6, 8, 12]) run(speed, dry);
run(3.5, 0);
run(3.5, 1);
