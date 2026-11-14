// =====================================================================
// Procedural songs - the instruments. Every voice is built from oscillators + noise (no samples) and scheduled at an
// absolute audio time `t`. A voice function is  voice(V, t, e, vel)  where
//   V   = the voice environment of the running track { ctx, res, rng, budget, bus, vib, sd (seconds per 16th), sr }
//   e   = the score event { s, d, v, n, k, f }   vel = final velocity (0..1.2)
// Voices connect to V.bus.<name> (created by the track) and always stop() every source they start, so nothing leaks.
// `Budget` caps the number of simultaneously sounding sources (low-priority voices are dropped first).
// =====================================================================
import { mtof } from './util.js';

const EPS = 0.0001;

/** Source-count voice cap. take(t, dur, pri, n): pri 2 = essential (kick/bass/lead), 1 = body (stab/pad/clap), 0 = sparkle (hats/arp). */
export class Budget {
  constructor(max = 48) {
    this.max = max;
    this.list = [];
    this.dropped = 0;
    this.total = 0;
    this.peak = 0;
  }
  take(t, dur, pri, n) {
    const L = this.list;
    let w = 0;
    for (let i = 0; i < L.length; i++) if (L[i].e > t - 0.4) L[w++] = L[i];
    L.length = w;
    let c = 0;
    for (let i = 0; i < w; i++) if (L[i].s <= t + 1e-6 && L[i].e > t) c += L[i].n;
    const cap = pri >= 2 ? this.max : pri === 1 ? this.max * 0.8 : this.max * 0.6;
    if (c + n > cap) { this.dropped++; return false; }
    L.push({ s: t, e: t + dur, n });
    this.total++;
    if (c + n > this.peak) this.peak = c + n;
    return true;
  }
}

// ------------------------------------------------------------------ helpers
const fmax = (V) => V.sr * 0.45;
function perc(param, t, peak, decay, attack = 0.001) {
  param.setValueAtTime(EPS, t);
  param.linearRampToValueAtTime(Math.max(peak, EPS * 2), t + attack);
  param.exponentialRampToValueAtTime(EPS, t + attack + decay);
}
/** Sustained envelope: attack -> decay to sustain level -> hold until t+dur -> release. Returns the time the sound ends. */
function adsr(param, t, dur, { a = 0.01, peak = 1, d = 0.08, sus = 0.7, r = 0.06 } = {}) {
  const tEnd = t + Math.max(dur, a + d + 0.005);
  param.setValueAtTime(EPS, t);
  param.linearRampToValueAtTime(Math.max(peak, EPS * 2), t + a);
  param.exponentialRampToValueAtTime(Math.max(peak * sus, EPS * 2), t + a + d);
  param.setValueAtTime(Math.max(peak * sus, EPS * 2), tEnd);
  param.exponentialRampToValueAtTime(EPS, tEnd + r);
  return tEnd + r;
}
function noise(V, t, dur, name = 'white') {
  const buf = V.res.buffer(name);
  const s = V.ctx.createBufferSource();
  s.buffer = buf;
  s.start(t, V.rng() * Math.max(0, buf.duration - dur - 0.02));
  s.stop(t + dur);
  return s;
}
function osc(V, type, f, t, tEnd) {
  const o = V.ctx.createOscillator();
  o.type = type;
  o.frequency.value = Math.min(Math.max(f, 8), fmax(V));
  o.start(t);
  o.stop(tEnd);
  return o;
}
function wave(V, name, f, t, tEnd) {
  const o = V.ctx.createOscillator();
  o.setPeriodicWave(V.res.wave(name));
  o.frequency.value = Math.min(Math.max(f, 8), fmax(V));
  o.start(t);
  o.stop(tEnd);
  return o;
}
function vibrato(V, o, scoopCents = 0, t = 0) {
  if (V.vib) V.vib.connect(o.detune);
  if (scoopCents) {
    o.detune.setValueAtTime(-scoopCents, t);
    o.detune.linearRampToValueAtTime(0, t + 0.045);
  }
}

// ------------------------------------------------------------------ drums
function kick(V, t, e, vel) {
  if (!V.budget.take(t, 0.36, 2, 2)) return;
  const c = V.ctx;
  const o = osc(V, 'sine', 190, t, t + 0.36), g = c.createGain();
  o.frequency.setValueAtTime(185, t);
  o.frequency.exponentialRampToValueAtTime(58, t + 0.08);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.28);
  perc(g.gain, t, 0.95 * vel, 0.26, 0.002);
  o.connect(g); g.connect(V.bus.kick);
  const b = osc(V, 'triangle', 900, t, t + 0.04), gb = c.createGain();   // beater click
  b.frequency.setValueAtTime(900, t);
  b.frequency.exponentialRampToValueAtTime(140, t + 0.025);
  perc(gb.gain, t, 0.22 * vel, 0.022, 0.0005);
  b.connect(gb); gb.connect(V.bus.kick);
}
function snare(V, t, e, vel) {
  if (!V.budget.take(t, 0.26, 2, 2)) return;
  const c = V.ctx;
  const n = noise(V, t, 0.24), hp = c.createBiquadFilter(), g = c.createGain();
  hp.type = 'highpass'; hp.frequency.value = 1500; hp.Q.value = 0.6;
  perc(g.gain, t, 0.75 * vel, 0.17, 0.001);
  n.connect(hp); hp.connect(g); g.connect(V.bus.snare);
  const o = osc(V, 'triangle', 215, t, t + 0.12), go = c.createGain();
  o.frequency.setValueAtTime(235, t);
  o.frequency.exponentialRampToValueAtTime(150, t + 0.06);
  perc(go.gain, t, 0.5 * vel, 0.085, 0.001);
  o.connect(go); go.connect(V.bus.snare);
}
function clap(V, t, e, vel) {
  if (!V.budget.take(t, 0.22, 1, 1)) return;
  const c = V.ctx;
  const n = noise(V, t, 0.22), g = c.createGain(), p = 0.9 * vel;
  g.gain.setValueAtTime(EPS, t);
  for (let k = 0; k < 3; k++) {
    const tk = t + k * 0.011;
    g.gain.linearRampToValueAtTime(p, tk + 0.001);
    g.gain.exponentialRampToValueAtTime(p * 0.18, tk + 0.0095);
  }
  g.gain.linearRampToValueAtTime(p * 0.8, t + 0.035);
  g.gain.exponentialRampToValueAtTime(EPS, t + 0.17);
  n.connect(g); g.connect(V.bus.clap);
}
function hat(V, t, e, vel) {
  const open = e.k === 'o';
  const dur = open ? 0.2 : 0.05;
  if (!V.budget.take(t, dur + 0.02, 0, 1)) return;
  const n = noise(V, t, dur + 0.02), g = V.ctx.createGain();
  perc(g.gain, t, 0.85 * vel, dur, 0.0007);
  n.connect(g); g.connect(V.bus.hat);
}
function shaker(V, t, e, vel) {
  if (!V.budget.take(t, 0.09, 0, 1)) return;
  const n = noise(V, t, 0.09), g = V.ctx.createGain();
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(0.9 * vel, t + 0.011);
  g.gain.exponentialRampToValueAtTime(EPS, t + 0.075);
  n.connect(g); g.connect(V.bus.shaker);
}
function wood(V, t, e, vel) {
  if (!V.budget.take(t, 0.12, 1, 2)) return;
  const f = e.f || 1100, c = V.ctx;
  const o = osc(V, 'sine', f, t, t + 0.1), g = c.createGain();
  o.frequency.setValueAtTime(f * 1.08, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.012);
  perc(g.gain, t, 0.85 * vel, 0.07, 0.0007);
  o.connect(g); g.connect(V.bus.wood);
  const o2 = osc(V, 'sine', f * 2.7, t, t + 0.05), g2 = c.createGain();
  perc(g2.gain, t, 0.28 * vel, 0.03, 0.0005);
  o2.connect(g2); g2.connect(V.bus.wood);
}
function cow(V, t, e, vel) {
  if (!V.budget.take(t, 0.34, 0, 2)) return;
  const c = V.ctx, g = c.createGain(), p = 0.8 * vel;
  const a = osc(V, 'square', 540, t, t + 0.34), b = osc(V, 'square', 810, t, t + 0.34);
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(p, t + 0.001);
  g.gain.exponentialRampToValueAtTime(p * 0.32, t + 0.03);
  g.gain.exponentialRampToValueAtTime(EPS, t + 0.3);
  a.connect(g); b.connect(g); g.connect(V.bus.cow);
}
function tom(V, t, e, vel) {
  if (!V.budget.take(t, 0.3, 1, 1)) return;
  const f = e.f || 180, c = V.ctx;
  const o = osc(V, 'sine', f, t, t + 0.3), g = c.createGain();
  o.frequency.setValueAtTime(f * 1.3, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.62, t + 0.14);
  perc(g.gain, t, 0.85 * vel, 0.25, 0.002);
  o.connect(g); g.connect(V.bus.tom);
}
function fx(V, t, e, vel) {
  const c = V.ctx, k = e.k || 'crash';
  if (k === 'crash') {
    if (!V.budget.take(t, 1.4, 0, 1)) return;
    const n = noise(V, t, 1.4), hp = c.createBiquadFilter(), g = c.createGain();
    hp.type = 'highpass'; hp.frequency.value = 4800; hp.Q.value = 0.5;
    perc(g.gain, t, 0.55 * vel, 1.3, 0.002);
    n.connect(hp); hp.connect(g); g.connect(V.bus.fx);
  } else if (k === 'riser') {
    const dur = Math.max(0.3, e.d * V.sd);
    if (!V.budget.take(t, dur + 0.05, 0, 1)) return;
    const n = V.ctx.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    n.buffer = V.res.buffer('white'); n.loop = true; n.start(t, V.rng()); n.stop(t + dur + 0.05);
    bp.type = 'bandpass'; bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(Math.min(5200, fmax(V)), t + dur);
    g.gain.setValueAtTime(EPS, t);
    g.gain.exponentialRampToValueAtTime(0.5 * vel, t + dur * 0.97);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
    n.connect(bp); bp.connect(g); g.connect(V.bus.fx);
  } else if (k === 'whistle') {          // slide whistle: sine glide with a wobble, ends with a little "pip"
    const dur = Math.max(0.25, e.d * V.sd);
    if (!V.budget.take(t, dur + 0.1, 0, 2)) return;
    const o = osc(V, 'sine', e.f0 || 600, t, t + dur + 0.08), g = c.createGain();
    o.frequency.setValueAtTime(e.f0 || 600, t);
    o.frequency.exponentialRampToValueAtTime(Math.min(e.f1 || 2300, fmax(V)), t + dur);
    if (V.vib) V.vib.connect(o.detune);
    g.gain.setValueAtTime(EPS, t);
    g.gain.linearRampToValueAtTime(0.32 * vel, t + 0.05);
    g.gain.setValueAtTime(0.32 * vel, t + dur - 0.03);
    g.gain.linearRampToValueAtTime(EPS * 2, t + dur + 0.05);
    o.connect(g); g.connect(V.bus.fx);
  } else if (k === 'boom') {
    if (!V.budget.take(t, 0.9, 1, 2)) return;
    const o = osc(V, 'sine', 90, t, t + 0.95), g = c.createGain();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    perc(g.gain, t, 0.9 * vel, 0.85, 0.003);
    o.connect(g); g.connect(V.bus.fx);
  }
}

// ------------------------------------------------------------------ bass
function bass(V, t, e, vel) {
  const dur = Math.max(0.09, e.d * V.sd * 0.92);
  if (!V.budget.take(t, dur + 0.12, 2, 2)) return;
  const c = V.ctx, f = mtof(e.n);
  const tEnd = t + dur + 0.1;
  const sine = osc(V, 'sine', f, t, tEnd + 0.05), saw = osc(V, e.k === 'soft' ? 'triangle' : 'sawtooth', f, t, tEnd + 0.05);
  const lp = c.createBiquadFilter(), g = c.createGain(), sg = c.createGain();
  lp.type = 'lowpass'; lp.Q.value = 2.2;
  lp.frequency.setValueAtTime(Math.min(Math.max(f * 8, 450), 2400), t);
  lp.frequency.exponentialRampToValueAtTime(Math.min(Math.max(f * 2.2, 160), 900), t + 0.15);
  sg.gain.value = 0.8;
  if (e.k === 'b') {    // cartoon "boing" scoop into the note
    for (const o of [sine, saw]) {
      o.frequency.setValueAtTime(f * 0.7, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
    }
  }
  adsr(g.gain, t, dur, { a: 0.004, peak: 0.9 * vel, d: 0.14, sus: 0.55, r: 0.05 });
  const sineG = c.createGain(); sineG.gain.value = 0.6;
  saw.connect(sg); sg.connect(lp); lp.connect(g); sine.connect(sineG); sineG.connect(g);
  g.connect(V.bus.bass);
}

// ------------------------------------------------------------------ chord stabs / comping
function stab(V, t, e, vel) {
  const notes = e.n;
  if (!notes || !notes.length) return;
  const dur = Math.max(0.06, e.d * V.sd * 0.9);
  const c = V.ctx;
  if (e.k === 'ep') return epChord(V, t, e, vel, dur);
  if (!V.budget.take(t, dur + 0.3, 1, notes.length)) return;
  const brass = e.k === 'brass';
  const g = c.createGain(), lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 1.1;
  const top = brass ? 3200 : 2500;
  lp.frequency.setValueAtTime(top, t);
  lp.frequency.exponentialRampToValueAtTime(brass ? 1400 : 650, t + (brass ? 0.35 : 0.2));
  const tEnd = brass ? adsr(g.gain, t, dur, { a: 0.02, peak: 0.34 * vel, d: 0.1, sus: 0.8, r: 0.1 }) : (() => {
    g.gain.setValueAtTime(EPS, t);
    g.gain.linearRampToValueAtTime(0.4 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.1 * vel, t + 0.07);
    g.gain.exponentialRampToValueAtTime(EPS, t + Math.max(dur, 0.1) + 0.06);
    return t + Math.max(dur, 0.1) + 0.08;
  })();
  const per = 1 / Math.sqrt(notes.length);
  notes.forEach((m, k) => {
    const o = (k % 2 === 0 || brass) ? osc(V, 'sawtooth', mtof(m), t, tEnd + 0.02) : wave(V, 'pulse25', mtof(m), t, tEnd + 0.02);
    o.detune.value = ((k * 7) % 11 - 5) * (brass ? 1.4 : 1);
    const og = c.createGain();
    og.gain.value = per * 0.75;
    o.connect(og); og.connect(g);
  });
  g.connect(lp); lp.connect(V.bus.stab);
}
/** mellow electric-piano chord (menu / results) */
function epChord(V, t, e, vel, dur) {
  const notes = e.n;
  if (!V.budget.take(t, 0.9, 1, notes.length * 2)) return;
  const c = V.ctx, g = c.createGain();
  const tail = Math.min(0.9, 0.35 + dur * 1.3);
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(0.42 * vel, t + 0.004);
  g.gain.exponentialRampToValueAtTime(EPS, t + tail);
  const per = 1 / Math.sqrt(notes.length);
  for (const m of notes) {
    const f = mtof(m);
    const a = osc(V, 'sine', f, t, t + tail + 0.02);
    const og = c.createGain(); og.gain.value = 0.8 * per;
    a.connect(og); og.connect(g);
    const b = osc(V, 'sine', f * 2, t, t + 0.3);
    const bg = c.createGain();
    perc(bg.gain, t, 0.3 * per, 0.22, 0.002);
    b.connect(bg); bg.connect(g);
  }
  g.connect(V.bus.stab);
}

// ------------------------------------------------------------------ lead
function marimba(V, t, f, vel, dur, bus, light = false) {
  const c = V.ctx;
  const tail = light ? 0.38 : Math.min(1.5, 0.45 + dur * 1.2 + (f < 500 ? 0.2 : 0));
  const o = osc(V, 'sine', f, t, t + tail + 0.03), g = c.createGain();
  perc(g.gain, t, 0.8 * vel, tail, 0.002);
  o.connect(g); g.connect(bus);
  if (f * 4 < fmax(V)) {
    const o2 = osc(V, 'sine', f * 4.02, t, t + 0.25), g2 = c.createGain();
    perc(g2.gain, t, 0.3 * vel, 0.14, 0.001);
    o2.connect(g2); g2.connect(bus);
  }
  if (!light && f * 10 < fmax(V)) {
    const o3 = osc(V, 'sine', f * 9.9, t, t + 0.08), g3 = c.createGain();
    perc(g3.gain, t, 0.08 * vel, 0.05, 0.0005);
    o3.connect(g3); g3.connect(bus);
  }
}
function bell(V, t, f, vel, dur, bus) {
  const c = V.ctx, tail = 1.3;
  const parts = [[1, 0.7, tail], [2.76, 0.28, 0.7], [5.4, 0.1, 0.35]];
  for (const [r, a, d] of parts) {
    if (f * r > fmax(V)) continue;
    const o = osc(V, 'sine', f * r, t, t + d + 0.03), g = c.createGain();
    perc(g.gain, t, a * vel, d, 0.002);
    o.connect(g); g.connect(bus);
  }
  void c; void dur;
}
function lead(V, t, e, vel) {
  const dur = Math.max(0.07, e.d * V.sd * 0.95);
  const k = e.k, f = mtof(e.n), c = V.ctx;
  const pri = e.g ? 1 : 2;
  if (k === 'marimba') { if (V.budget.take(t, 1.6, pri, 3)) marimba(V, t, f, vel, dur, V.bus.lead); return; }
  if (k === 'bell') { if (V.budget.take(t, 1.4, pri, 3)) bell(V, t, f, vel, dur, V.bus.lead); return; }
  if (!V.budget.take(t, dur + 0.15, pri, 2)) return;
  const g = c.createGain();
  if (k === 'hi') {            // airy octave doubling
    const tEnd = adsr(g.gain, t, dur, { a: 0.008, peak: 0.36 * vel, d: 0.08, sus: 0.7, r: 0.06 });
    const o = osc(V, 'triangle', f, t, tEnd + 0.02), o2 = osc(V, 'sine', f * 2, t, tEnd + 0.02);
    const g2 = c.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2); g2.connect(g); vibrato(V, o); vibrato(V, o2);
    g.connect(V.bus.lead);
    return;
  }
  if (k === 'brass') {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 1.4;
    lp.frequency.setValueAtTime(Math.min(f * 2.2, 2400), t);
    lp.frequency.exponentialRampToValueAtTime(Math.min(f * 7, 5200), t + 0.09);
    const tEnd = adsr(g.gain, t, dur, { a: 0.022, peak: 0.5 * vel, d: 0.1, sus: 0.82, r: 0.09 });
    for (const dt of [-7, 7]) {
      const o = osc(V, 'sawtooth', f, t, tEnd + 0.02);
      o.detune.value = dt; vibrato(V, o);
      o.connect(g);
    }
    g.connect(lp); lp.connect(V.bus.lead);
    return;
  }
  if (k === 'edge') {          // tense lead: detuned saw + square through a growling lowpass
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(Math.min(f * 5, 3000), t);
    lp.frequency.exponentialRampToValueAtTime(Math.min(f * 2.4, 1800), t + Math.max(dur, 0.1));
    const tEnd = adsr(g.gain, t, dur, { a: 0.006, peak: 0.42 * vel, d: 0.07, sus: 0.78, r: 0.05 });
    const a = osc(V, 'sawtooth', f, t, tEnd + 0.02), b = osc(V, 'square', f, t, tEnd + 0.02);
    a.detune.value = 9; b.detune.value = -9;
    const bg = c.createGain(); bg.gain.value = 0.45;
    vibrato(V, a); vibrato(V, b);
    a.connect(g); b.connect(bg); bg.connect(g);
    g.connect(lp); lp.connect(V.bus.lead);
    return;
  }
  // default: toy pulse lead with a little scoop + vibrato
  const tEnd = adsr(g.gain, t, dur, { a: 0.007, peak: 0.6 * vel, d: 0.09, sus: 0.8, r: 0.055 });
  const o = wave(V, 'pulse25', f, t, tEnd + 0.02), o2 = osc(V, 'triangle', f, t, tEnd + 0.02);
  const g2 = c.createGain(); g2.gain.value = 0.55;
  vibrato(V, o, e.g ? 0 : 28, t); vibrato(V, o2);
  o.connect(g); o2.connect(g2); g2.connect(g);
  g.connect(V.bus.lead);
}

// ------------------------------------------------------------------ arp / pad / siren
function arp(V, t, e, vel) {
  const f = mtof(e.n), c = V.ctx;
  if (e.k === 'marimba') {
    if (!V.budget.take(t, 0.42, 0, 2)) return;
    marimba(V, t, f, vel * 0.7, 0.1, (V.arpSide = !V.arpSide) ? V.bus.arpL : V.bus.arpR, true);
    return;
  }
  if (!V.budget.take(t, 0.13, 0, 1)) return;
  const bus = (V.arpSide = !V.arpSide) ? V.bus.arpL : V.bus.arpR;
  const g = c.createGain();
  if (e.k === 'sharp') {
    const o = osc(V, 'square', f, t, t + 0.1);
    perc(g.gain, t, 0.3 * vel, 0.085, 0.002);
    o.connect(g); g.connect(bus);
    return;
  }
  const o = wave(V, 'pulse12', f, t, t + 0.12);
  perc(g.gain, t, 0.55 * vel, 0.1, 0.002);
  o.connect(g); g.connect(bus);
}
function pad(V, t, e, vel) {
  if (!e.n || !e.n.length) return;
  const notes = e.n.length > 3 ? [e.n[0], e.n[1], e.n[e.n.length - 1]] : e.n;     // root, third, top (7th / 5th): enough colour for 6 sources
  const dur = Math.max(0.2, e.d * V.sd);
  const k = e.k;
  if (!V.budget.take(t, dur + 0.7, 2, notes.length * 2)) return;
  const c = V.ctx, g = c.createGain(), lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 0.7;
  lp.frequency.value = k === 'dark' ? 900 : k === 'bright' ? 2600 : k === 'soft' ? 1500 : 1700;
  const a = k === 'bright' ? 0.04 : 0.28;
  const tEnd = adsr(g.gain, t, dur, { a, peak: 0.36 * vel, d: 0.3, sus: 0.85, r: 0.45 });
  const type = k === 'soft' ? 'triangle' : 'sawtooth';
  const per = 1 / Math.sqrt(notes.length * 1.5);
  for (const m of notes) {
    for (const dt of [-6, 6]) {
      const o = osc(V, type, mtof(m), t, tEnd + 0.02);
      o.detune.value = dt;
      const og = c.createGain(); og.gain.value = per * 0.7;
      o.connect(og); og.connect(g);
    }
  }
  g.connect(lp); lp.connect(V.bus.pad);
}
function siren(V, t, e, vel) {
  const dur = Math.max(0.1, e.d * V.sd * 0.92);
  if (!V.budget.take(t, dur + 0.1, 0, 2)) return;
  const c = V.ctx, f = mtof(e.n);
  const g = c.createGain(), lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 2100; lp.Q.value = 1.5;
  const tEnd = adsr(g.gain, t, dur, { a: 0.01, peak: 0.5 * vel, d: 0.05, sus: 0.85, r: 0.04 });
  const o = osc(V, 'sawtooth', f, t, tEnd + 0.02);
  o.frequency.setValueAtTime(f * 0.93, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
  const o2 = osc(V, 'square', f * 1.005, t, tEnd + 0.02);
  const g2 = c.createGain(); g2.gain.value = 0.3;
  o.connect(g); o2.connect(g2); g2.connect(g);
  g.connect(lp); lp.connect(V.bus.siren);
}

/** Impact + falling cluster played at the moment the music snaps into sudden death. */
export function sting(V, t, rootMidi = 50) {
  const c = V.ctx;
  if (!V.budget.take(t, 1.2, 2, 6)) return;
  const boom = osc(V, 'sine', 100, t, t + 1.1), bg = c.createGain();
  boom.frequency.setValueAtTime(110, t);
  boom.frequency.exponentialRampToValueAtTime(36, t + 0.5);
  perc(bg.gain, t, 0.95, 1.0, 0.003);
  boom.connect(bg); bg.connect(V.bus.fx);
  const g = c.createGain(), lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 2;
  lp.frequency.setValueAtTime(3200, t);
  lp.frequency.exponentialRampToValueAtTime(500, t + 0.7);
  perc(g.gain, t, 0.32, 0.8, 0.004);
  for (const iv of [0, 6, 12, 19]) {
    const o = osc(V, 'sawtooth', mtof(rootMidi + 12 + iv), t, t + 0.85);
    o.detune.value = iv * 3 - 8;
    o.connect(g);
  }
  g.connect(lp); lp.connect(V.bus.fx);
  fx(V, t, { k: 'crash' }, 0.9);
}

export const VOICES = { kick, snare, clap, hat, shaker, wood, cow, tom, fx, bass, stab, lead, arp, pad, siren };
/** instruments that duck on every kick (pumping groove) */
export const DUCKED = new Set(['bass', 'stab', 'pad', 'arp']);
