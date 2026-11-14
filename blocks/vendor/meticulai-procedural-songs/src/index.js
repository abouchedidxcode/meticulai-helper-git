// Procedural songs: whole songs from a seed, synthesised live with Web Audio (no samples, no files).
//
//   import { MusicEngine } from './vendor/meticulai-procedural-songs/src/index.js';
//   const music = new MusicEngine(audioCtx, musicBusGain, { seed: 1234 });  // seed optional: omit for a new tune each play
//   music.start('menu');                       // 'menu' | 'game' | 'results'
//   music.setMode('game', 0.8);                // crossfade to another arrangement on the next beat
//   music.setIntensity(0.7, { tempoMul: 1.1, sudden: false });  // 0..1 layers instruments in; sudden = tense minor version
//   music.stop(0.6); music.dispose();
//
//   renderMusic(offlineCtx, 'game', 20, { seed: 7, intensity: 0.8 });  // schedule 20 s offline (tests, auditioning)
//   generateSong('game', 7)                    // the pure score: key, bpm, swing, sections, chords, events
export { MusicEngine, renderMusic } from './music.js';
export {
  generateSong, locateBar, chordName, chordPcs, noteName, pcName, hashSeed, tonicMid,
  KINDS, INSTS, SCALES, CHORDS, KEYS, MODE_STYLE, STEPS_PER_BAR,
} from './music-gen.js';
export { StepClock, stepOffset, stepTimeAt, swingSplit } from './music-sched.js';
export { Budget, VOICES } from './music-voices.js';
