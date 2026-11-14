// A tiny strict stand-in for an AudioContext, enough to run the score's scheduler in Node (no sound).
// The audio clock only moves when a test calls ctx.advance(seconds). AudioParam writes are checked for NaN/Infinity
// (real Web Audio throws on them), and every buffer source started is recorded so tests can count notes.

class FakeParam {
  constructor(v = 0) { this.value = v; this.writes = 0; }
  _chk(...nums) {
    for (const n of nums) if (typeof n !== 'number' || !Number.isFinite(n)) throw new TypeError(`non-finite AudioParam value ${n}`);
    this.writes++;
  }
  setValueAtTime(v, t) { this._chk(v, t); this.value = v; return this; }
  setTargetAtTime(v, t, tau) { this._chk(v, t, tau); this.value = v; return this; }
  linearRampToValueAtTime(v, t) { this._chk(v, t); this.value = v; return this; }
  exponentialRampToValueAtTime(v, t) {
    this._chk(v, t);
    if (v <= 0) throw new RangeError('exponential ramp to a non-positive value');
    this.value = v; return this;
  }
  setValueCurveAtTime(c, t, d) { this._chk(t, d); this.value = c[c.length - 1]; return this; }
  cancelScheduledValues(t) { this._chk(t); return this; }
  cancelAndHoldAtTime(t) { this._chk(t); return this; }
}

const PARAMS = {
  gain: ['gain'],
  biquad: ['frequency', 'Q', 'gain', 'detune'],
  osc: ['frequency', 'detune'],
  panner: ['pan'],
  delay: ['delayTime'],
  src: ['playbackRate', 'detune'],
  comp: ['threshold', 'knee', 'ratio', 'attack', 'release'],
  shaper: [],
};

class FakeNode {
  constructor(ctx, kind) {
    this.context = ctx; this.kind = kind; this.outs = new Set();
    for (const p of PARAMS[kind]) this[p] = new FakeParam(p === 'gain' ? 1 : 0);
    ctx.nodes++;
  }
  connect(to) {
    if (!to || !(to instanceof FakeNode || to instanceof FakeParam)) throw new TypeError('connect to a non-node');
    this.outs.add(to); return to;
  }
  disconnect() { this.outs.clear(); }
}

class FakeSource extends FakeNode {
  constructor(ctx, kind) { super(ctx, kind); this.started = null; this.stopAt = Infinity; this.onended = null; this.loop = false; }
  start(t = 0) {
    if (this.started !== null) throw new Error('start called twice');
    if (!Number.isFinite(t)) throw new TypeError('start time');
    this.started = t;
    this.context.started.push(this);
  }
  stop(t = 0) { if (!Number.isFinite(t)) throw new TypeError('stop time'); this.stopAt = Math.min(this.stopAt, t); }
}

export class FakeAudioContext {
  constructor({ sampleRate = 22050 } = {}) {
    this.sampleRate = sampleRate; this.currentTime = 0; this.state = 'running';
    this.nodes = 0; this.started = [];
    this.destination = new FakeNode(this, 'gain');
  }
  createGain() { return new FakeNode(this, 'gain'); }
  createBiquadFilter() { const n = new FakeNode(this, 'biquad'); n.type = 'lowpass'; return n; }
  createOscillator() { const n = new FakeSource(this, 'osc'); n.type = 'sine'; return n; }
  createStereoPanner() { return new FakeNode(this, 'panner'); }
  createDelay(max = 1) { const n = new FakeNode(this, 'delay'); n.max = max; return n; }
  createWaveShaper() { const n = new FakeNode(this, 'shaper'); n.curve = null; n.oversample = 'none'; return n; }
  createDynamicsCompressor() { return new FakeNode(this, 'comp'); }
  createBufferSource() { const n = new FakeSource(this, 'src'); n.buffer = null; return n; }
  createBuffer(ch, len, sr) {
    const data = Array.from({ length: ch }, () => new Float32Array(len));
    return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: (c) => data[c], copyToChannel: (a, c) => data[c].set(a) };
  }
  /** Move the audio clock; buffer sources whose sample ran out fire onended (as the real clock does). */
  advance(dt) {
    this.currentTime += dt;
    for (const s of this.started) {
      if (s.ended || !s.onended || !s.buffer) continue;
      const end = Math.min(s.stopAt, s.started + s.buffer.duration / Math.max(0.01, s.playbackRate.value || 1));
      if (end <= this.currentTime) { s.ended = true; s.onended(); }
    }
  }
}
