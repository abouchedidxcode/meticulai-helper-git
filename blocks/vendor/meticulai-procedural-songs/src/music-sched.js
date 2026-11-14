// =====================================================================
// Procedural songs - swing maths + the look-ahead step clock. Pure (no WebAudio, no DOM): the clock takes a
// `now()` function and calls back with absolute audio times, so Node tests drive it with a fake clock.
//
// Time model: the music lives on a 16th-note grid (4 steps per beat). Steps are placed with SWING: the beat is split
// into two swung 8ths at `split = 0.5 + swing/6` (swing 0 = straight, 1 = full triplet 2:1) and each 8th is halved,
// so the 16ths stay proportional inside the swung 8ths.
// Tempo can change every beat (the beat length is sampled when the beat starts), so tempo glides are click-free.
// =====================================================================

export function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** Where the 8th-note off-beat falls inside the beat (fraction of a beat). */
export function swingSplit(swing) { return 0.5 + clampN(swing, 0, 1) / 6; }

/** Position of 16th `k` (0..3) of a beat as a fraction of the beat. */
export function stepOffset(k, swing) {
  const sp = swingSplit(swing);
  return k === 0 ? 0 : k === 1 ? sp / 2 : k === 2 ? sp : (sp + 1) / 2;
}

/** Absolute time of global step number `n` for a constant tempo (test helper). */
export function stepTimeAt(n, bpm, swing, t0 = 0) {
  const beat = Math.floor(n / 4), k = n - beat * 4;
  return t0 + (beat + stepOffset(k, swing)) * (60 / bpm);
}

export class StepClock {
  /**
   * o.now()            audio-clock seconds (ctx.currentTime)
   * o.getBpm()         current tempo (sampled once per beat)
   * o.getSwing()       swing 0..1 (sampled per beat)
   * o.onStep(t, info)  schedule one 16th at absolute time t. info = { n, k, beatDur, stepDur, late }
   * o.onSkip(n)        n steps were dropped because the clock fell too far behind (tab throttled / suspended)
   */
  constructor(o) {
    this.now = o.now;
    this.getBpm = o.getBpm;
    this.getSwing = o.getSwing || (() => 0.5);
    this.onStep = o.onStep;
    this.onSkip = o.onSkip || (() => {});
    this.ahead = o.ahead ?? 0.4;          // how far ahead of `now` steps are placed
    this.maxAhead = o.maxAhead ?? 1.5;    // upper bound when the host timer is being throttled
    this.maxLate = o.maxLate ?? 0.25;     // behind by more than this => resync instead of bursting
    this.maxSteps = o.maxSteps ?? 32;     // hard cap of steps placed per tick
    this.running = false;
    this.stepCount = 0;
    this.skipped = 0;
    this.resyncs = 0;
    this.aheadEff = this.ahead;
    this._lastNow = null;
    this.beatT0 = 0; this.beatDur = 0.5; this.k = 0; this.swing = 0.5;
  }

  /** Begin with step 0 at absolute time t0. */
  start(t0) {
    this.beatT0 = t0;
    this._beginBeat();
    this.k = 0;
    this.running = true;
    this.stepCount = 0;
    this._lastNow = null;
    this.aheadEff = this.ahead;
  }
  stop() { this.running = false; }

  _beginBeat() {
    const bpm = this.getBpm();
    this.beatDur = 60 / clampN(Number.isFinite(bpm) ? bpm : 120, 40, 260);
    const sw = this.getSwing();
    this.swing = Number.isFinite(sw) ? sw : 0.5;
  }
  /** Time of the step the cursor points at. */
  nextTime() { return this.beatT0 + stepOffset(this.k, this.swing) * this.beatDur; }

  _advance() {
    this.k++;
    this.stepCount++;
    if (this.k >= 4) { this.k = 0; this.beatT0 += this.beatDur; this._beginBeat(); }
  }

  /**
   * Place every step that starts before the horizon. With no argument the horizon is now + (adaptive) look-ahead and the
   * lateness guard is active; with an explicit horizon (offline rendering) the guard is off.
   * Returns the number of steps placed.
   */
  tick(horizon) {
    if (!this.running) return 0;
    const live = horizon === undefined;
    const now = this.now();
    let h = horizon;
    if (live) {
      // adapt the look-ahead to how often the host really calls us (background tabs throttle timers to ~1 Hz)
      let gap = this._lastNow === null ? 0 : Math.max(0, now - this._lastNow);
      this._lastNow = now;
      if (gap > 4) gap = 0;           // a long pause (suspend / tab asleep) is not a throttle pattern: do not balloon the look-ahead
      const want = clampN(gap * 1.7 + 0.12, this.ahead, this.maxAhead);
      this.aheadEff = want > this.aheadEff ? want : this.aheadEff + (want - this.aheadEff) * 0.15;
      h = now + this.aheadEff;
      // way behind (throttled / suspended for a while): drop to the next beat boundary, never burst
      if (this.nextTime() < now - this.maxLate) {
        if (this.k !== 0) { const dropped = 4 - this.k; this.skipped += dropped; this.onSkip(dropped); }
        this.k = 0;
        this.beatT0 = now + 0.05;
        this._beginBeat();
        this.resyncs++;
      }
    }
    let n = 0;
    while (n < this.maxSteps) {
      const t = this.nextTime();
      if (t >= h) break;
      const late = live && t < now;
      this.onStep(late ? now + 0.004 : t, { n: this.stepCount, k: this.k, beatDur: this.beatDur, stepDur: this.beatDur / 4, late });
      this._advance();
      n++;
    }
    return n;
  }
}
