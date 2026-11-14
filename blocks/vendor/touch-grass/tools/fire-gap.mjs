// Does a strip of bare ground stop the fire? Even dry grass, a strip `gap` metres wide across the wind 6 m
// downwind of where it's lit; then whether anything burnt beyond the strip. `node tools/fire-gap.mjs`
import { FieldState } from '../src/lib/state.js';

function crosses(gap, speed) {
  const state = new FieldState({ size: 256, heightAt: () => 0, growthAt: (x) => (x >= 6 && x < 6 + gap ? 0 : 1), dryAt: () => 0.6, wetAt: () => 0 });
  state.setWind(1, 0, speed);
  state.ignite(0, 0, 0.4);
  for (let t = 0; t < 60; t += 1 / 30) state.stepFire(1 / 30);
  let beyond = 0;
  const M = state.M;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) if (state.fState[i + j * M] && state.minX + (i + 0.5) * state.fcell > 6 + gap + 0.5) beyond++;
  return beyond > 0;
}

for (const speed of [0, 3.5, 8, 12]) {
  console.log(`wind ${String(speed).padStart(4)} m/s: ${[0.25, 0.5, 0.75, 1, 1.5].map((g) => `${g} m ${crosses(g, speed) ? 'crossed' : 'stopped'}`).join(', ')}`);
}
