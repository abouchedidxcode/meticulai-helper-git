// Wires the pieces together. Read this file first: it is the map of the whole game.
//
//   core/      the engine bits every game needs (keep these)
//   feel/      hit-stop, shake, flash, slow motion, punch
//   audio/     synth sounds + music, no files needed
//   render/    the three.js renderer setup
//   ui/        title, pause, end card, HUD
//   game/      THE DEMO GAME. Replace it with yours; keep the same small interface:
//
//     export const info = { tagline, controls }
//     export function createGame(ctx) -> {
//       scene, camera,
//       start(),            // reset everything and begin a run
//       update(dt, mode),   // one fixed step; mode is 'title' | 'playing' | 'over'
//       render(alpha),      // place things for drawing (alpha: 0..1 between steps)
//       state(),            // plain object for window.__game.state
//     }
//     The game calls ctx.end({ won, heading, reason, stats }) when a run is over.

import helper from '../helper.json';
import { flags, installHooks } from './core/hooks.js';
import { errors, installErrorCatcher, watchWebGL } from './core/errors.js';
import { events } from './core/events.js';
import { rng } from './core/random.js';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { tune, installSettingsPanel } from './core/settings.js';
import { installNotes } from './core/notes.js';
import { createTestMode } from './core/testmode.js';
import { createJuice } from './feel/juice.js';
import { createAudio } from './audio/audio.js';
import { createRenderer } from './render/renderer.js';
import { createUI } from './ui/ui.js';
import { info, createGame } from './game/game.js';

const DEV = import.meta.env.DEV; // true under `npm run dev`, false in a shipped build

installErrorCatcher({ showBanner: flags.test });
document.title = helper.gameName;

const view = createRenderer();
const input = createInput({ canvas: view.canvas });
const juice = createJuice();
const audio = createAudio();
const testmode = createTestMode({ enabled: flags.test });
const ui = createUI({
  gameName: helper.gameName,
  tagline: info.tagline,
  controls: info.controls,
  alwaysShowControls: flags.test,
});

let mode = 'title'; // 'title' | 'playing' | 'paused' | 'over'
let overTime = 0;

const ctx = { view, input, juice, audio, ui, events, rng, tune, flags, testmode, end };
const game = createGame(ctx);
view.addCamera(game.camera);

// --- Flow: title -> playing <-> paused -> over -> playing ------------------------------

function startRun() {
  ui.hideScreens();
  juice.reset();
  rng.reset(); // same seed, same run: recordings and bug reports can be replayed
  game.start();
  input.clear();
  mode = 'playing';
  loop.resume();
  view.canvas.focus({ preventScroll: true });
  audio.music.start();
  events.emit('start', { seed: rng.seed });
}

function pauseRun() {
  if (mode !== 'playing') return;
  mode = 'paused';
  loop.pause();
  ui.showPause({ onResume: resumeRun, onRestart: startRun });
  events.emit('pause', {});
}

function resumeRun() {
  if (mode !== 'paused') return;
  ui.hideScreens();
  mode = 'playing';
  input.clear();
  loop.resume();
  view.canvas.focus({ preventScroll: true });
}

// Called by the game. Always give a reason: the end card shows it.
function end({ won, heading, reason, stats }) {
  if (mode !== 'playing') return;
  mode = 'over';
  overTime = 0;
  ui.showEnd({ won, heading, reason, stats, onRestart: startRun });
}

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' && e.code !== 'KeyP') return;
  if (e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'INPUT' && e.target.type === 'number') return;
  if (mode === 'playing') pauseRun();
  else if (mode === 'paused') resumeRun();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseRun(); // switching tabs never costs a life
});

// --- The loop ---------------------------------------------------------------------------

const volumes = {};
function syncVolumes() {
  for (const bus of ['master', 'music', 'sfx']) {
    if (volumes[bus] !== tune.audio[bus]) {
      volumes[bus] = tune.audio[bus];
      audio.setVolume(bus, tune.audio[bus]);
    }
  }
}

const checkGL = watchWebGL(view.renderer);

const loop = createLoop({
  tick(dt) {
    input.beginTick();
    juice.update(dt);
    if (!juice.frozen) game.update(dt * juice.timeScale, mode === 'paused' ? 'playing' : mode);
    input.endTick();
    syncVolumes();

    // The bot starts the next run by itself, so a recording can run for any length.
    if (mode === 'over' && flags.bot) {
      overTime += dt;
      if (overTime > 4) startRun();
    }
  },
  render(alpha) {
    game.render(alpha);
    juice.applyShake(game.camera);
    view.draw(game.scene, game.camera);
    juice.clearShake(game.camera);
    checkGL();
  },
});

// --- Dev tools and test hooks ---------------------------------------------------------------

installSettingsPanel({ enabled: DEV || flags.test, canSave: DEV });
const notes = installNotes({
  enabled: DEV,
  loop,
  capture: () => view.capture(game.scene, game.camera),
  getState: () => getState(),
});

testmode.add('start', 'Skip intro', () => {
  if (mode !== 'playing') startRun();
});
if (notes.enabled) testmode.addButton('Leave a note (N)', () => notes.open());

function getState() {
  return { scene: mode, ...game.state() };
}

installHooks({
  loop,
  getState,
  errors,
  events,
  skipTo: (name) => testmode.skipTo(name),
  capture: () => view.capture(game.scene, game.camera),
  isReady: () => view.ready,
});

// --- Go -----------------------------------------------------------------------------------------

syncVolumes();
game.render(1);
view.warmUp(game.scene, game.camera); // compile shaders now, not on the first pickup
if (flags.autostart) startRun();
else ui.showTitle(startRun);
loop.start();
