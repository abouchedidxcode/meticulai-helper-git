// =====================================================================
// Procedural songs: the music engine (whole songs from a seed, no samples).
//
//   const m = new MusicEngine(ctx, musicBusGainNode);
//   m.start('menu') / m.setMode('game', 0.8) / m.setIntensity(0..1, { tempoMul, sudden }) / m.stop(0.6) / m.dispose()
//   renderMusic(offlineCtx, mode, seconds, opts)      // schedule N seconds for tests / auditioning
//
// Design
//  * Pure, seeded score generation lives in music-gen.js (hook grammar, progressions, drum/bass/arp patterns); instruments
//    in music-voices.js; the swing/look-ahead step clock in music-sched.js. This file wires them to a WebAudio graph.
//  * Sample-accurate scheduling: a 100 ms setInterval wakes the StepClock which places every 16th that starts within the next
//    0.4 s on the audio clock (ctx.currentTime), so timer jitter never moves a note. If the timer is throttled the look-ahead grows
//    (up to 1.5 s); if the clock fell hopelessly behind it resyncs to the next beat instead of bursting.
//  * Layering: every score event carries a [min,max] intensity window. A smoothed intensity (0.7 s) gates events, opens a lowpass
//    on the tonal buses and the host passes tempoMul; `sudden` swaps to a TENSE minor arrangement via a beat-quantised crossfade.
//  * Voice cap (Budget), shared reverb + ping-pong delay, glue compressor + soft-clip safety. Peak stays well below 1.
//  * Never throws into the host: every public method is guarded; a missing/closed/suspended context just makes it a no-op.
// =====================================================================
import { getResources, mulberry32, fillImpulse, clamp, fin } from './util.js';
import { generateSong, locateBar, hashSeed, tonicMid } from './music-gen.js';
import { StepClock } from './music-sched.js';
import { VOICES, Budget, DUCKED, sting } from './music-voices.js';

const MODES = ['menu', 'game', 'results'];
const DEFAULT_INTENSITY = { menu: 0.42, game: 0.3, tense: 0.7, results: 0.5 };
const MASTER = 0.8;

/** bus table: level, destination group, optional filter / pan / reverb + delay sends */
const BUSES = {
  kick: { g: 0.8, to: 'drum' },
  snare: { g: 0.6, to: 'drum', rev: 0.16 },
  clap: { g: 1.4, to: 'drum', rev: 0.22, pan: 0.08, filt: ['bandpass', 1500, 0.9] },
  hat: { g: 0.5, to: 'drum', pan: 0.3, filt: ['highpass', 6800, 0.6] },
  shaker: { g: 0.8, to: 'drum', pan: -0.3, filt: ['bandpass', 5800, 0.8] },
  wood: { g: 0.5, to: 'drum', pan: -0.2, rev: 0.12 },
  cow: { g: 0.4, to: 'drum', pan: 0.3, rev: 0.12, filt: ['bandpass', 1000, 1.2] },
  tom: { g: 0.6, to: 'drum', rev: 0.14 },
  fx: { g: 0.5, to: 'drum', rev: 0.3 },
  bass: { g: 0.4, to: 'duck' },
  stab: { g: 1.55, to: 'duck', pan: -0.18, rev: 0.16 },
  pad: { g: 0.7, to: 'duck', rev: 0.32 },
  arpL: { g: 0.64, to: 'duck', pan: -0.55, rev: 0.22, dly: 0.32 },
  arpR: { g: 0.64, to: 'duck', pan: 0.55, rev: 0.22, dly: 0.32 },
  lead: { g: 0.5, to: 'lp', pan: 0.04, rev: 0.22, dly: 0.2 },
  siren: { g: 0.3, to: 'lp', pan: 0.15, rev: 0.2 },
};
/** per-arrangement mix trims (multiplies the bus table) */
const KIND_TRIM = {
  menu: { kick: 0.9, snare: 0.5, lead: 2.3, bass: 0.78, stab: 1.0, pad: 0.75, hat: 0.9, shaker: 1.0, wood: 1.0 },
  game: {},
  tense: { lead: 0.9, siren: 1.2, pad: 1.2, kick: 1.0 },
  results: { kick: 0.75, snare: 0.7, clap: 0.8, lead: 1.0, bass: 0.9, pad: 1.1 },
};

const irCache = new WeakMap();
function reverbIR(ctx) {
  let b = irCache.get(ctx);
  if (!b) {
    const sr = ctx.sampleRate, secs = 0.95;      // short + mono: the convolver is the costliest node in the graph (cost ~ IR length x channels)
    b = ctx.createBuffer(1, Math.floor(sr * secs), sr);
    fillImpulse(b.getChannelData(0), null, mulberry32(311), sr, secs);
    irCache.set(ctx, b);
  }
  return b;
}
const safe = (fn) => { try { return fn(); } catch { return undefined; } };

// ------------------------------------------------------------------ Track = one arrangement (song) with its own buses
class Track {
  constructor(E, kind, song, startBar = 0) {
    this.E = E;
    this.kind = kind;
    this.song = song;
    this.nodes = [];
    this.disposed = false;
    this.muted = E.muted;       // shared Set of instrument names (dev page / tests)
    this.rng = mulberry32(hashSeed(E.seed, 900 + kind.length * 7 + song.bpm));
    this.lastDuck = -1;
    const c = E.ctx;
    const gain = (v) => { const g = c.createGain(); g.gain.value = v; this.nodes.push(g); return g; };
    this.out = gain(0);
    this.out.connect(E.mixIn);
    const drum = gain(1); drum.connect(this.out);
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 0.6; this.lp.frequency.value = 6000;
    this.nodes.push(this.lp); this.lp.connect(this.out);
    this.duckG = gain(1); this.duckG.connect(this.lp);
    const dest = { drum, duck: this.duckG, lp: this.lp };
    const trim = KIND_TRIM[kind] || {};
    this.bus = {};
    for (const [name, cfg] of Object.entries(BUSES)) {
      const g = gain(cfg.g * (trim[name] ?? 1));
      let tail = g;
      if (cfg.filt) {
        const f = c.createBiquadFilter();
        f.type = cfg.filt[0]; f.frequency.value = cfg.filt[1]; f.Q.value = cfg.filt[2];
        this.nodes.push(f); tail.connect(f); tail = f;
      }
      if (cfg.pan && typeof c.createStereoPanner === 'function') {      // very old Safari: skip the panning, keep the music
        const p = c.createStereoPanner(); p.pan.value = cfg.pan;
        this.nodes.push(p); tail.connect(p); tail = p;
      }
      tail.connect(dest[cfg.to]);
      if (cfg.rev) { const s = gain(cfg.rev); tail.connect(s); s.connect(E.revIn); }
      if (cfg.dly) { const s = gain(cfg.dly); tail.connect(s); s.connect(E.dlyIn); }
      this.bus[name] = g;
    }
    // shared vibrato LFO (cents) for the lead voices
    this.lfo = c.createOscillator();
    this.lfo.frequency.value = 5.4;
    this.vib = gain(9);
    this.lfo.connect(this.vib);
    this.lfo.start(Math.max(0, c.currentTime));
    this.V = { ctx: c, res: E.res, rng: this.rng, budget: E.budget, bus: this.bus, vib: this.vib, sd: 0.12, sr: c.sampleRate, arpSide: false };
    // cursor
    const loc = locateBar(song, startBar);
    this.sec = loc.index;
    this.step = loc.bar * 16;
    this.stepsPlayed = 0;
    this.sectionsPlayed = 0;
  }

  get section() { return this.song.sections[this.sec]; }

  setLowpass(f, t, tc = 0.12) {
    safe(() => this.lp.frequency.setTargetAtTime(clamp(fin(f, 6000), 200, this.E.ctx.sampleRate * 0.45), t, tc));
  }

  duck(t, v) {
    if (t - this.lastDuck < 0.09) return;
    this.lastDuck = t;
    const g = this.duckG.gain;
    const depth = 1 - 0.3 * clamp(v, 0, 1);
    g.setValueAtTime(1, Math.max(0, t - 0.006));
    g.linearRampToValueAtTime(depth, t + 0.004);
    g.linearRampToValueAtTime(1, t + 0.17);
  }

  /** advance the cursor by n steps without playing (used after the clock skipped steps) */
  advance(n) {
    const secs = this.song.sections;
    this.step += n;
    this.stepsPlayed += n;
    let guard = 0;
    while (this.step >= secs[this.sec].steps && guard++ < 64) {
      this.step -= secs[this.sec].steps;
      this.sec = this.sec + 1 >= secs.length ? this.song.loopFrom : this.sec + 1;
      this.sectionsPlayed++;
    }
    if (guard >= 64) { this.step = 0; }
  }

  playStep(t, info, I) {
    const sec = this.section;
    const list = sec.byStep[this.step];
    const V = this.V;
    V.sd = info.stepDur;
    for (let q = 0; q < list.length; q++) {
      const { inst, e } = list[q];
      if (I < e.i || I > e.x || this.muted.has(inst)) continue;
      const vel = e.v * (0.95 + this.rng() * 0.1);
      try {
        const before = this.E.budget.dropped;
        VOICES[inst](V, t, e, vel);
        if (this.E.budget.dropped !== before) this.E.dropBy[inst] = (this.E.dropBy[inst] || 0) + 1;
        if (inst === 'kick') this.duck(t, e.v);
      } catch (err) { this.E.errors++; this.E.lastError = err; }
    }
    this.advance(1);
  }

  fadeTo(target, t, tc) {
    safe(() => {
      const g = this.out.gain;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(target, t, Math.max(0.005, tc));
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    safe(() => this.lfo.stop(Math.max(0, this.E.ctx.currentTime)));
    for (const n of this.nodes) safe(() => n.disconnect());
    safe(() => this.lfo.disconnect());
    this.nodes.length = 0;
  }
}

// ------------------------------------------------------------------ the engine
export class MusicEngine {
  /**
   * @param {BaseAudioContext} ctx
   * @param {AudioNode} destination the music bus
   * @param {object} [opts] { seed, manual (no timer, for offline rendering), tickMs, ahead, timers }
   */
  constructor(ctx, destination, opts = {}) {
    this.ctx = ctx || null;
    this.dest = destination || null;
    this.opts = opts;
    this.mode = null;
    this.running = false;
    this.disposed = false;
    this.manual = !!opts.manual;
    this.tickMs = opts.tickMs ?? 100;
    this.fixedSeed = opts.seed !== undefined && opts.seed !== null ? (opts.seed >>> 0) : null;
    this.seed = this.fixedSeed ?? ((Math.random() * 4294967296) >>> 0);
    this.errors = 0;
    this.lastError = null;
    this.iTarget = DEFAULT_INTENSITY.game;
    this.iSm = this.iTarget;
    this._iTouched = false;
    this.tempoMul = 1;
    this.sudden = false;
    this.bpmCur = 120;
    this.track = null;
    this._pending = null;       // { kind, fade, startBar } waiting for the next beat to crossfade
    this._retiring = [];
    this._songs = new Map();
    this._timer = null;
    this._haltTimer = null;
    this._stopAt = null;
    this._graph = false;
    this._outLinked = false;
    this._lastDly = 0;
    this._lastLp = 0;
    this.budget = new Budget(opts.maxVoices ?? 64);
    this.dropBy = {};
    this.muted = new Set(opts.muted || []);
    this.t0 = 0;
    this.stepsPlayed = 0;
    this.ticks = 0;
    const timers = opts.timers || {};
    this._setInterval = timers.setInterval || (typeof setInterval === 'function' ? setInterval.bind(globalThis) : null);
    this._clearInterval = timers.clearInterval || (typeof clearInterval === 'function' ? clearInterval.bind(globalThis) : null);
    this._setTimeout = timers.setTimeout || (typeof setTimeout === 'function' ? setTimeout.bind(globalThis) : null);
    this._clearTimeout = timers.clearTimeout || (typeof clearTimeout === 'function' ? clearTimeout.bind(globalThis) : null);
    this.clock = null;
    if (this.ctx) {
      safe(() => {
        this.res = getResources(this.ctx);
        this.clock = new StepClock({
          now: () => this.ctx.currentTime,
          getBpm: () => this._nextBpm(),
          getSwing: () => (this.track ? this.track.song.swing : 0.5),
          onStep: (t, info) => this._onStep(t, info),
          onSkip: (n) => { if (this.track) this.track.advance(n); },
          ahead: opts.ahead ?? 0.4,
        });
      });
    }
  }

  // ---------------------------------------------------------------- public API
  /** Begin playing `mode` ('menu' | 'game' | 'results'). A second argument { startBar } is for tests. */
  start(mode = 'menu', extra = {}) {
    if (this.disposed || !this.ctx || !this.clock) return;
    try {
      if (!MODES.includes(mode)) mode = 'game';
      if (this.running) { this.setMode(mode, 0.6); return; }     // already playing (maybe mid fade-out): just follow the mode
      if (this.ctx.state === 'closed') return;
      this._cancelHalt();
      if (!this.running) {
        // a fresh play-through gets a fresh tune (unless the seed is pinned)
        if (this.fixedSeed === null) { this.seed = (Math.random() * 4294967296) >>> 0; this._songs.clear(); }
        if (!this._iTouched) { this.iTarget = DEFAULT_INTENSITY[mode]; this.iSm = this.iTarget; }
      }
      this._buildGraph();
      this._linkOut(true);
      this.mode = mode;
      this.running = true;
      this._stopAt = null;
      const now = this.ctx.currentTime;
      const kind = this._kind();
      this.track = new Track(this, kind, this._song(kind), extra.startBar || 0);
      this.bpmCur = this.track.song.bpm * this.tempoMul;
      this.t0 = now + (extra.lead ?? 0.08);
      this.clock.start(this.t0);
      this.track.fadeTo(1, now, 0.04);
      this.track.setLowpass(this._lpFor(this.iSm), now, 0.001);
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setTargetAtTime(MASTER, now, 0.08);
      this._startTimer();
      this.tick();
    } catch (e) { this._fail(e); }
  }

  /** Fade out and halt. Safe to call repeatedly. */
  stop(fadeSec = 0.6) {
    if (this.disposed || !this.ctx) return;
    try {
      if (!this.running) return;
      fadeSec = Math.max(0, fin(fadeSec, 0.6));
      if (fadeSec <= 0.001) { this._halt(); return; }
      const now = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setTargetAtTime(0, now, fadeSec / 4);
      this._stopAt = now + fadeSec * 1.25 + 0.05;
      this._pending = null;
      if (this._setTimeout && !this.manual) {
        this._cancelHaltTimer();
        this._haltTimer = this._setTimeout(() => { this._haltTimer = null; if (this._stopAt !== null) this._halt(); }, (fadeSec * 1.25 + 0.4) * 1000 + 300);
      }
    } catch (e) { this._fail(e); }
  }

  /** Crossfade to another arrangement ('menu' | 'game' | 'results'). */
  setMode(mode, fadeSec = 0.8) {
    if (this.disposed) return;
    try {
      if (!MODES.includes(mode)) return;
      if (!this.running) { this.mode = mode; return; }
      if (this._stopAt !== null) this._resume();           // changed our mind during a fade-out
      if (mode === this.mode && !this._pending) return;
      // a new round (menu -> game) gets a fresh tune; game -> results -> menu stay in the same family (same seed => same key)
      if (this.fixedSeed === null && mode === 'game' && this.mode !== 'game') { this.seed = (Math.random() * 4294967296) >>> 0; this._songs.clear(); }
      this.mode = mode;
      this._requestKind(this._kind(), fadeSec);
    } catch (e) { this._fail(e); }
  }

  /**
   * x 0..1 drives layers / filter; tempoMul scales the tempo (1 .. ~1.25); sudden=true swaps the game groove for the tense one.
   * Safe to call every frame.
   */
  setIntensity(x, { tempoMul = 1, sudden = false } = {}) {
    if (this.disposed) return;
    try {
      this.iTarget = clamp(fin(x, this.iTarget), 0, 1);
      this.tempoMul = clamp(fin(tempoMul, 1), 0.6, 1.5);
      if (!this.running || !this._iTouched) this.iSm = this.iTarget;
      this._iTouched = true;
      const was = this.sudden;
      this.sudden = !!sudden;
      if (this.running && this._stopAt === null && this.mode === 'game' && was !== this.sudden) {
        this._requestKind(this._kind(), this.sudden ? 0.3 : 1.1);
      }
    } catch (e) { this._fail(e); }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this._clearTimers();
      this.running = false;
      this._pending = null;
      if (this.clock) this.clock.stop();
      if (this.track) { this.track.dispose(); this.track = null; }
      for (const r of this._retiring) r.track.dispose();
      this._retiring.length = 0;
      for (const n of this._graphNodes || []) safe(() => n.disconnect());
      this._graphNodes = [];
      this._outLinked = false;
    } catch (e) { this._fail(e); }
  }

  // ---------------------------------------------------------------- introspection (tests / dev page)
  get bpm() { return this.bpmCur; }
  get kind() { return this.track ? this.track.kind : null; }
  get song() { return this.track ? this.track.song : null; }
  get position() { return this.track ? { section: this.track.section.id, index: this.track.sec, step: this.track.step, bar: Math.floor(this.track.step / 16) } : null; }
  get stats() {
    const c = this.clock;
    return {
      steps: c ? c.stepCount : 0, skipped: c ? c.skipped : 0, resyncs: c ? c.resyncs : 0, ticks: this.ticks,
      voices: this.budget.total, dropped: this.budget.dropped, dropBy: { ...this.dropBy }, peakVoices: this.budget.peak, errors: this.errors,
    };
  }
  /** Offline rendering: schedule everything that starts before `untilTime` (audio-clock seconds). */
  renderUntil(untilTime) {
    if (!this.running || !this.clock) return 0;
    let total = 0;
    for (let guard = 0; guard < 4000; guard++) {
      const n = this.clock.tick(untilTime);
      total += n;
      if (!n) break;
    }
    return total;
  }

  // ---------------------------------------------------------------- internals
  _fail(e) { this.errors++; this.lastError = e; }

  _kind() { return this.mode === 'game' && this.sudden ? 'tense' : (this.mode || 'menu'); }

  _song(kind) {
    let s = this._songs.get(kind);
    if (!s) { s = generateSong(kind, this.seed); this._songs.set(kind, s); }
    return s;
  }

  _nextBpm() {
    // called by the clock at the start of every beat: glide toward the target tempo (3 beats ~ 70 %)
    const target = (this.track ? this.track.song.bpm : 120) * this.tempoMul;
    this.bpmCur += (target - this.bpmCur) * 0.3;
    return this.bpmCur;
  }

  _lpFor(i) { return 2400 * Math.pow(2, clamp(i, 0, 1) * 2.7); }

  _buildGraph() {
    if (this._graph) return;
    const c = this.ctx;
    const nodes = (this._graphNodes = []);
    const gain = (v) => { const g = c.createGain(); g.gain.value = v; nodes.push(g); return g; };
    this.mixIn = gain(0.52);
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -17; this.comp.knee.value = 12; this.comp.ratio.value = 3.2;
    this.comp.attack.value = 0.008; this.comp.release.value = 0.2;
    this.shaper = c.createWaveShaper();
    this.shaper.curve = this.res.curve('softclip');
    this.out = gain(0);
    nodes.push(this.comp, this.shaper);
    this.mixIn.connect(this.comp); this.comp.connect(this.shaper); this.shaper.connect(this.out);
    // reverb
    this.revIn = gain(1);
    const conv = c.createConvolver();
    conv.buffer = reverbIR(c);
    nodes.push(conv);
    const revOut = gain(0.5);
    this.revIn.connect(conv); conv.connect(revOut); revOut.connect(this.mixIn);
    // tempo-synced ping-pong delay
    this.dlyIn = gain(1);
    const lpD = c.createBiquadFilter(); lpD.type = 'lowpass'; lpD.frequency.value = 3000; nodes.push(lpD);
    this.dL = c.createDelay(2); this.dR = c.createDelay(2);
    this.dL.delayTime.value = 0.34; this.dR.delayTime.value = 0.34;
    nodes.push(this.dL, this.dR);
    const fbL = gain(0.36), fbR = gain(0.36), dlyOut = gain(0.5);
    const hasPan = typeof c.createStereoPanner === 'function';
    const pL = hasPan ? c.createStereoPanner() : gain(1), pR = hasPan ? c.createStereoPanner() : gain(1);
    if (hasPan) { pL.pan.value = -0.6; pR.pan.value = 0.6; nodes.push(pL, pR); }
    this.dlyIn.connect(lpD); lpD.connect(this.dL);
    this.dL.connect(pL); pL.connect(dlyOut);
    this.dL.connect(fbL); fbL.connect(this.dR);
    this.dR.connect(pR); pR.connect(dlyOut);
    this.dR.connect(fbR); fbR.connect(this.dL);
    dlyOut.connect(this.mixIn);
    this._graph = true;
  }

  _linkOut(on) {
    if (!this.out || !this.dest) return;
    if (on && !this._outLinked) { safe(() => this.out.connect(this.dest)); this._outLinked = true; }
    else if (!on && this._outLinked) { safe(() => this.out.disconnect()); this._outLinked = false; }
  }

  _startTimer() {
    if (this.manual || this._timer !== null || !this._setInterval) return;
    this._timer = this._setInterval(() => this.tick(), this.tickMs);
  }
  _clearTimers() {
    if (this._timer !== null && this._clearInterval) this._clearInterval(this._timer);
    this._timer = null;
    this._cancelHaltTimer();
  }
  _cancelHaltTimer() {
    if (this._haltTimer !== null && this._clearTimeout) this._clearTimeout(this._haltTimer);
    this._haltTimer = null;
  }
  _cancelHalt() { this._cancelHaltTimer(); this._stopAt = null; }
  _resume() {
    this._cancelHalt();
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(MASTER, now, 0.08);
  }

  /** timer entry point (also callable by hand from tests) */
  tick() {
    if (this.disposed || !this.running || !this.clock) return;
    try {
      this.ticks++;
      const now = this.ctx.currentTime;
      if (this.ctx.state === 'closed') { this._halt(); return; }
      if (this._stopAt !== null && now >= this._stopAt) { this._halt(); return; }
      this.clock.tick();
      this._sweep(now);
    } catch (e) { this._fail(e); }
  }

  _sweep(now) {
    if (!this._retiring.length) return;
    let w = 0;
    for (const r of this._retiring) {
      if (now >= r.at) r.track.dispose();
      else this._retiring[w++] = r;
    }
    this._retiring.length = w;
  }

  _halt() {
    this._clearTimers();
    this.running = false;
    this._stopAt = null;
    this._pending = null;
    if (this.clock) this.clock.stop();
    if (this.track) { this.track.dispose(); this.track = null; }
    for (const r of this._retiring) r.track.dispose();
    this._retiring.length = 0;
    if (this.out) safe(() => { this.out.gain.cancelScheduledValues(0); this.out.gain.value = 0; });
    this._linkOut(false);
  }

  /** ask for a different arrangement; it takes over on the next beat boundary (equal-ish power crossfade) */
  _requestKind(kind, fade) {
    if (this.track && this.track.kind === kind) { this._pending = null; return; }
    this._pending = { kind, fade: Math.max(0.05, fin(fade, 0.8)) };
  }

  _commit(t) {
    const p = this._pending;
    this._pending = null;
    if (!p) return;
    const old = this.track;
    const song = this._song(p.kind);
    const next = new Track(this, p.kind, song, 0);
    const tc = p.fade / 4;
    next.fadeTo(1, t, tc);
    next.setLowpass(this._lpFor(this.iSm), t, 0.001);
    if (old) {
      old.fadeTo(0, t, tc);
      this._retiring.push({ track: old, at: this.ctx.currentTime + p.fade * 1.6 + 0.8 + Math.max(0, t - this.ctx.currentTime) });
    }
    this.track = next;
    this.bpmCur = song.bpm * this.tempoMul;
    if (p.kind === 'tense') {
      const root = tonicMid(song.rootPc);
      safe(() => sting(next.V, t, 38 + ((root - 38) % 12 + 12) % 12));
    }
  }

  _onStep(t, info) {
    // quantised crossfade: switch exactly on a beat
    if (this._pending && info.k === 0) this._commit(t);
    const tr = this.track;
    if (!tr) return;
    // smooth the intensity, open/close the tonal filter
    this.iSm += (this.iTarget - this.iSm) * (1 - Math.exp(-info.stepDur / 0.7));
    const lpf = this._lpFor(this.iSm);
    if (Math.abs(Math.log(lpf / (this._lastLp || 1))) > 0.03) { this._lastLp = lpf; tr.setLowpass(lpf, t, 0.15); }
    // keep the delay locked to the tempo
    const dl = 0.75 * info.beatDur;
    if (Math.abs(dl - this._lastDly) > 0.02 * dl) {
      this._lastDly = dl;
      safe(() => { this.dL.delayTime.setTargetAtTime(dl, t, 0.25); this.dR.delayTime.setTargetAtTime(dl, t, 0.25); });
    }
    this.stepsPlayed++;
    tr.playStep(t, info, this.iSm);
  }
}

// ------------------------------------------------------------------ offline rendering helper
/**
 * Schedule `seconds` of music onto `ctx` (an OfflineAudioContext, or any context) and return info about it.
 * opts: { intensity=0.5, tempoMul=1, sudden=false, seed=1, startBar=0, destination=ctx.destination, lead }
 * Call ctx.startRendering() afterwards. Deterministic for a given seed.
 */
export function renderMusic(ctx, mode, seconds, opts = {}) {
  const o = { intensity: 0.5, tempoMul: 1, sudden: false, seed: 1, startBar: 0, ...opts };
  const eng = new MusicEngine(ctx, o.destination || ctx.destination, { seed: o.seed, manual: true, maxVoices: o.maxVoices });
  eng.setIntensity(o.intensity, { tempoMul: o.tempoMul, sudden: o.sudden });
  eng.start(mode, { startBar: o.startBar, lead: o.lead ?? 0.05 });
  const until = eng.t0 + seconds;
  eng.renderUntil(until);
  return { engine: eng, song: eng.song, bpm: eng.bpm, kind: eng.kind, stats: eng.stats, t0: eng.t0 };
}
