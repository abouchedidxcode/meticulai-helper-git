// Wires the pieces together. Read this file first: it is the map of the whole game.
//
//   core/      the engine bits every game needs (keep these)
//   feel/      hit-stop, shake, flash, slow motion, punch
//   audio/     synth sounds + music, no files needed
//   render/    the three.js renderer setup, and the sky/sun/fog kit (atmosphere.js)
//   look/      the optional drawing style on top (print, pixels, paint...); none by default
//   ui/        title, pause, end card, HUD
//   game/      THE DEMO GAME. Replace it with yours; keep the same small interface:
//
//     export const info = { tagline, controls, pointerLock? }   // pointerLock: true = mouse-look game
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
import { tune, installSettingsPanel, dev } from './core/settings.js';
import { installNotes } from './core/notes.js';
import { createTestMode } from './core/testmode.js';
import { createJuice } from './feel/juice.js';
import { createAudio } from './audio/audio.js';
import { createRenderer } from './render/renderer.js';
import { look, applyLookToUI } from './core/look.js';
import { installLook } from './look/index.js';
import { createUI } from './ui/ui.js';
import { info, createGame } from './game/game.js';

const DEV = import.meta.env.DEV; // true under `npm run dev`, false in a shipped build

installErrorCatcher({ showBanner: flags.test });
document.title = helper.gameName;

applyLookToUI(); // palette.json colours the title, HUD and end card too
const view = createRenderer();
const post = installLook({ view, look, tune, flags });
if (post && !view.post) view.setPost(post);
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

const ctx = { view, input, juice, audio, ui, events, rng, tune, flags, testmode, end, look, dev };
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
  grabMouse();
  audio.music.start();
  events.emit('start', { seed: rng.seed });
}

function pauseRun() {
  if (mode !== 'playing') return;
  mode = 'paused';
  input.unlockPointer();
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
  grabMouse();
}

// Mouse-look games (info.pointerLock): capture the mouse while playing. The browser frees it on Esc,
// which is also the pause key, so losing the mouse pauses the game. Bots and tests play without it.
const wantsMouse = !!info.pointerLock && !flags.bot && !navigator.webdriver;
let grabbedAt = -1;
function grabMouse() {
  if (!wantsMouse) return;
  grabbedAt = performance.now();
  input.lockPointer();
}
if (wantsMouse) {
  document.addEventListener('pointerlockchange', () => {
    // (The dev menu and its free camera also free the mouse; that must not pause the game.)
    if (!input.pointerLocked && mode === 'playing' && performance.now() - grabbedAt > 300 && !dev.holdsMouse()) pauseRun();
  });
  // A click on the game while playing takes the mouse back (the first request can be refused).
  view.canvas.addEventListener('pointerdown', () => {
    if (mode === 'playing' && !input.pointerLocked) grabMouse();
  });
}

// Called by the game. Always give a reason: the end card shows it.
function end({ won, heading, reason, stats }) {
  if (mode !== 'playing') return;
  mode = 'over';
  overTime = 0;
  input.unlockPointer();
  ui.showEnd({ won, heading, reason, stats, onRestart: startRun });
}

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' && e.code !== 'KeyP') return;
  if (e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'INPUT' && e.target.type === 'number') return;
  if (mode === 'playing') {
    // With the mouse captured, the browser itself handles Esc (it frees the mouse, which pauses).
    if (!(e.code === 'Escape' && input.pointerLocked)) pauseRun();
  } else if (mode === 'paused') resumeRun();
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
    view.post?.update?.(dt);
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
    // The dev menu's free camera is a separate camera: the game's own is never touched (see core/dev/tools.js).
    const camera = dev.view(game.camera);
    if (camera === game.camera) juice.applyShake(camera);
    view.draw(game.scene, camera);
    if (camera === game.camera) juice.clearShake(camera);
    checkGL();
  },
});

// --- Dev tools and test hooks ---------------------------------------------------------------

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

// The dev menu (backquote key): every tuning number, plus tools that work on any game (see core/settings.js).
installSettingsPanel({
  enabled: DEV || flags.test,
  canSave: DEV,
  game: { loop, view, input, audio, testmode, notes, flags, pointerLock: !!info.pointerLock, getGame: () => game, getMode: () => mode, restart: startRun },
});

function getState() {
  return { scene: mode, ...game.state() };
}

const hooks = installHooks({
  loop,
  getState,
  errors,
  events,
  skipTo: (name) => testmode.skipTo(name),
  capture: () => view.capture(game.scene, game.camera),
  isReady: () => view.ready,
});
hooks.dev = dev; // window.__game.dev: open(), close(), state() (for tools and tests)

// --- Go -----------------------------------------------------------------------------------------

syncVolumes();
game.render(1);
view.warmUp(game.scene, game.camera); // compile shaders now, not on the first pickup
if (flags.autostart) startRun();
else ui.showTitle(startRun);
loop.start();
