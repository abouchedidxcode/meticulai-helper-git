// A strict in-memory stand-in for the WebAudio API surface the audio modules use.
// It enforces the same rules real browsers do (finite values, exp-ramp targets > 0, non-negative times,
// start/stop ordering) and records the graph so tests can assert: no orphan nodes, every source stopped,
// no runaway scheduling, sane node counts. Not a renderer - it makes no sound.

const BIQUAD_TYPES = ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass'];
const OSC_TYPES = ['sine', 'square', 'sawtooth', 'triangle', 'custom'];

export class FakeParam {
  constructor(owner, name, def = 0) {
    this.owner = owner; this.name = name; this._v = def; this.events = []; this.maxTime = 0;
    this.warnings = owner.ctx.warnings;
  }
  get value() { return this._v; }
  set value(v) { this._check(v, 'value'); this._v = v; }
  _check(v, what) {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`${this.owner.kind}.${this.name}.${what}: non-finite ${v}`);
  }
  _time(t, what) {
    this._check(t, what + ' time');
    if (t < 0) throw new RangeError(`${this.owner.kind}.${this.name}: negative time ${t}`);
    if (t > this.maxTime) this.maxTime = t;
    this.owner.ctx.maxEventTime = Math.max(this.owner.ctx.maxEventTime, t);
  }
  _rec(type, v, t) {
    this.events.push({ type, v, t });
    if (this.name === 'frequency' && (this.owner.kind === 'BiquadFilterNode' || this.owner.kind === 'OscillatorNode')) {
      const ny = this.owner.ctx.sampleRate / 2;
      if (type !== 'target' && (v > ny || v < 0.5) && this.owner.kind === 'BiquadFilterNode') this.warnings.push(`${this.owner.kind}.frequency out of range ${v}`);
    }
    return this;
  }
  setValueAtTime(v, t) { this._check(v, 'v'); this._time(t, 'setValueAtTime'); return this._rec('set', v, t); }
  linearRampToValueAtTime(v, t) { this._check(v, 'v'); this._time(t, 'linearRamp'); return this._rec('lin', v, t); }
  exponentialRampToValueAtTime(v, t) {
    this._check(v, 'v'); this._time(t, 'expRamp');
    if (v <= 0) throw new RangeError(`${this.owner.kind}.${this.name}: exponentialRamp target must be > 0 (got ${v})`);
    return this._rec('exp', v, t);
  }
  setTargetAtTime(v, t, tc) {
    this._check(v, 'v'); this._time(t, 'setTarget'); this._check(tc, 'tc');
    if (tc < 0) throw new RangeError('negative time constant');
    return this._rec('target', v, t);
  }
  setValueCurveAtTime(curve, t, d) {
    if (!curve || curve.length < 2) throw new RangeError('curve too short');
    this._time(t, 'curve'); this._check(d, 'dur');
    if (d <= 0) throw new RangeError('curve duration');
    return this._rec('curve', 0, t);
  }
  cancelScheduledValues(t) { this._time(t, 'cancel'); this.events = this.events.filter((e) => e.t < t); return this; }
  cancelAndHoldAtTime(t) { return this.cancelScheduledValues(t); }
}

export class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx; this.kind = kind; this.out = []; this.id = ctx.nodes.length; ctx.nodes.push(this);
    this.params = [];
  }
  param(name, def) { const p = new FakeParam(this, name, def); this.params.push(p); return p; }
  connect(dest) {
    if (!dest || (!(dest instanceof FakeNode) && !(dest instanceof FakeParam))) throw new TypeError(`${this.kind}.connect: bad destination`);
    const owner = dest instanceof FakeParam ? dest.owner : dest;
    if (owner.ctx !== this.ctx) throw new Error('cross-context connect');
    if (!this.out.includes(owner)) this.out.push(owner);
    this.ctx.edges++;
    return dest;
  }
  disconnect() { this.out.length = 0; }
}

class FakeSource extends FakeNode {
  constructor(ctx, kind) { super(ctx, kind); this.startT = null; this.stopT = null; ctx.sources.push(this); }
  start(when = 0, offset = 0, dur) {
    if (this.startT !== null) throw new Error('InvalidStateError: start called twice');
    if (!Number.isFinite(when) || when < 0) throw new RangeError('start time ' + when);
    if (!Number.isFinite(offset) || offset < 0) throw new RangeError('offset ' + offset);
    this.startT = when; this.offset = offset;
    this.ctx.maxEventTime = Math.max(this.ctx.maxEventTime, when);
    void dur;
  }
  stop(when = 0) {
    if (this.startT === null) throw new Error('InvalidStateError: stop before start');
    if (!Number.isFinite(when) || when < 0) throw new RangeError('stop time ' + when);
    this.stopT = when;
    this.ctx.maxEventTime = Math.max(this.ctx.maxEventTime, when);
  }
}

export class FakeContext {
  constructor({ sampleRate = 44100 } = {}) {
    this.sampleRate = sampleRate; this.currentTime = 0; this.state = 'running';
    this.nodes = []; this.sources = []; this.warnings = []; this.edges = 0; this.maxEventTime = 0;
    this.destination = new FakeNode(this, 'AudioDestinationNode');
    this.listener = {};
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  createGain() { const n = new FakeNode(this, 'GainNode'); n.gain = n.param('gain', 1); return n; }
  createStereoPanner() { const n = new FakeNode(this, 'StereoPannerNode'); n.pan = n.param('pan', 0); return n; }
  createDelay() { const n = new FakeNode(this, 'DelayNode'); n.delayTime = n.param('delayTime', 0); return n; }
  createOscillator() {
    const n = new FakeSource(this, 'OscillatorNode');
    n.frequency = n.param('frequency', 440); n.detune = n.param('detune', 0);
    let type = 'sine';
    Object.defineProperty(n, 'type', { get: () => type, set: (v) => { if (!OSC_TYPES.includes(v) || v === 'custom') throw new TypeError('bad osc type ' + v); type = v; } });
    n.setPeriodicWave = (w) => { if (!w || !w.__fakeWave) throw new TypeError('bad wave'); type = 'custom'; };
    return n;
  }
  createBufferSource() {
    const n = new FakeSource(this, 'AudioBufferSourceNode');
    n.playbackRate = n.param('playbackRate', 1); n.detune = n.param('detune', 0);
    n.buffer = null; n.loop = false;
    return n;
  }
  createBiquadFilter() {
    const n = new FakeNode(this, 'BiquadFilterNode');
    n.frequency = n.param('frequency', 350); n.Q = n.param('Q', 1); n.gain = n.param('gain', 0); n.detune = n.param('detune', 0);
    let type = 'lowpass';
    Object.defineProperty(n, 'type', { get: () => type, set: (v) => { if (!BIQUAD_TYPES.includes(v)) throw new TypeError('bad biquad type ' + v); type = v; } });
    return n;
  }
  createWaveShaper() { const n = new FakeNode(this, 'WaveShaperNode'); n.curve = null; n.oversample = 'none'; return n; }
  createConvolver() { const n = new FakeNode(this, 'ConvolverNode'); n.buffer = null; return n; }
  createDynamicsCompressor() {
    const n = new FakeNode(this, 'DynamicsCompressorNode');
    for (const [k, d] of [['threshold', -24], ['knee', 30], ['ratio', 12], ['attack', 0.003], ['release', 0.25]]) n[k] = n.param(k, d);
    n.reduction = 0;
    return n;
  }
  createAnalyser() {
    const n = new FakeNode(this, 'AnalyserNode');
    n.fftSize = 2048; n.smoothingTimeConstant = 0.8;
    n.getFloatTimeDomainData = (a) => a.fill(0);
    return n;
  }
  createBuffer(ch, len, sr) {
    if (!(ch >= 1) || !(len >= 1) || !(sr >= 3000 && sr <= 768000)) throw new RangeError('bad buffer args');
    const data = Array.from({ length: ch }, () => new Float32Array(len));
    return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: (i) => data[i] };
  }
  createPeriodicWave(real, imag) {
    if (real.length !== imag.length || real.length < 2) throw new RangeError('bad wave');
    return { __fakeWave: true };
  }

  /** Graph analysis helpers for tests. */
  orphans() {
    // reverse reachability from destination (param edges were folded onto their owner node)
    const rev = new Map();
    for (const n of this.nodes) for (const o of n.out) { if (!rev.has(o)) rev.set(o, []); rev.get(o).push(n); }
    const seen = new Set([this.destination]);
    const q = [this.destination];
    while (q.length) { const n = q.pop(); for (const p of rev.get(n) || []) if (!seen.has(p)) { seen.add(p); q.push(p); } }
    return this.nodes.filter((n) => !seen.has(n));
  }
  unstopped() { return this.sources.filter((s) => s.startT !== null && s.stopT === null); }
  unstarted() { return this.sources.filter((s) => s.startT === null); }
}
