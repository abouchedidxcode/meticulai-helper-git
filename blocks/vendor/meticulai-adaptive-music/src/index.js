// Adaptive music: a thin adapter over music.js with generic names.
// From Last Drop by Meticulai (meticulai.com). MIT licence.
//
//   import { createAdaptiveMusic } from './index.js';
//   const music = createAdaptiveMusic(audioCtx, musicBusGain);       // after a click (browsers need a gesture)
//   music.setState({ mode: 'play', intensity: 0.6, danger: 0, progress: 0.3 });
//   music.update(dt);                                                 // every frame
//   music.hit('checkpoint');                                          // musical stingers
//
// The music.js score was written for one game (a water drop rolling across a desert). Its own state names were
// speed (m/s), volume (water left), airborne, inPuddle; its events were puddle, bloom, checkpoint, finish, dead.
// This file maps generic names onto them without changing any of the score's numbers.

import { Music } from './music.js';

export { Music };

/** The game's speed range the score was tuned on: intensity 0..1 maps to 2..18 m/s (music.js eases 2 -> 18). */
export const SPEED_LO = 2;
export const SPEED_SPAN = 16;

const clamp01 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/** Generic event names -> the score's own event names. */
export const EVENTS = {
  start: 'start',
  checkpoint: 'checkpoint',
  pickup: 'bloom',
  shimmer: 'puddle',
  win: 'finish',
  lose: 'dead',
};

/**
 * Turn a generic state into the object music.js reads.
 * @param {{ mode?: 'menu'|'play'|'end', intensity?: number, danger?: number, progress?: number,
 *           lift?: boolean, shimmer?: boolean, paused?: boolean, sunlit?: number }} s
 * @returns {object} the score's own state object
 */
export function toScoreState(s = {}) {
  const mode = s.mode === 'play' || s.mode === 'end' ? s.mode : 'menu';
  return {
    mode,
    paused: !!s.paused,
    speed: SPEED_LO + SPEED_SPAN * clamp01(s.intensity),
    volume: 1, // the score's "water left"; danger is given directly instead
    danger: clamp01(s.danger),
    progress: clamp01(s.progress),
    airborne: !!s.lift,
    inPuddle: !!s.shimmer,
    sunlit: s.sunlit === undefined ? 1 : clamp01(s.sunlit),
  };
}

/**
 * Translate a generic event (and its data) into the score's event name and data.
 * @param {string} name start | checkpoint | pickup | shimmer | win | lose
 * @param {object} [data] pickup: { n, of } (n-th of `of`; the last one gets a big run); checkpoint: { ahead }
 * @returns {{ type: string, data: object } | null}
 */
export function toScoreEvent(name, data = {}) {
  const type = EVENTS[name];
  if (!type) return null;
  return { type, data: data || {} };
}

/**
 * Create the adaptive score.
 * @param {BaseAudioContext} ctx an AudioContext (or OfflineAudioContext for tests)
 * @param {AudioNode} [dest] where the music goes (default: a safety chain into ctx.destination)
 * @param {{ timer?: boolean, safetyChain?: boolean }} [opts]
 *   timer: false = no setInterval (offline renders; then call update() often, e.g. every 40 ms of audio time)
 *   safetyChain: true (default when no dest) = the game's master chain: compressor -16 dB 8:1 -> tanh soft clip -> 0.85
 */
export function createAdaptiveMusic(ctx, dest, opts = {}) {
  let out = dest;
  if (!out || opts.safetyChain) out = safetyChain(ctx, out || ctx.destination);
  const music = new Music(ctx, out, { timer: opts.timer !== false });
  let state = toScoreState({});
  let wasShimmer = false;

  return {
    music,
    /** true when the score built (false = no Web Audio: every call is a silent no-op) */
    get ok() { return music.stats.ok; },
    get stats() { return music.stats; },
    /** The section playing now: menu, intro, build, groove, glow, sunset, tension, outro or silence. */
    get section() { return music.stats.section; },
    setState(s) {
      state = toScoreState(s);
      // entering a shimmer zone plays the falling-vibes stinger once
      if (state.inPuddle && !wasShimmer && state.mode === 'play') music.event('puddle');
      wasShimmer = state.inPuddle;
    },
    update(dt) { music.update(state, dt); },
    hit(name, data) {
      const e = toScoreEvent(name, data);
      if (e) music.event(e.type, e.data);
    },
    setMuted(m) { music.setMuted(m); },
    /** Pause scheduling while the tab is hidden (also suspend the AudioContext yourself). */
    setActive(on) { music.setActive(on); },
    /** A frequency (Hz) of the current chord in the bell register, walking up when called quickly: for in-key SFX. */
    noteInKey() { return music.beadFreq(); },
  };
}

/** The game's master chain: compressor (-16 dB, knee 6, 8:1, 3 ms / 250 ms) -> tanh soft clip -> gain 0.85. */
export function safetyChain(ctx, to) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 6; comp.ratio.value = 8;
  comp.attack.value = 0.003; comp.release.value = 0.25;
  const clip = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.2) / Math.tanh(1.2);
  }
  clip.curve = curve;
  const master = ctx.createGain();
  master.gain.value = 0.85;
  const input = ctx.createGain();
  input.connect(comp); comp.connect(clip); clip.connect(master); master.connect(to);
  return input;
}
