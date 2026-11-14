// The demo's sound: Timberfall's sound design, filled with CC0 and CC-BY recordings (audio-build/layers.json says which,
// CREDITS.txt who made them, make-audio.mjs how each is cut and mastered). Layers of real recordings by material and
// size, with a little noise and a sub tone under the big ones, through a mix built like a game's:
//
//   layers ──► voice caps per category ──► distance (delay, low-pass, level) ──► sfx bus ─┐
//   reverb send ──► convolver (a few slaps and a short tail) ─────────────────────────────┼► compressor ─► limiter ─► out
//
// The events are designed in layers, scaled by energy and material:
//   cannon:   transient crack · chesty low body · sub thump · recorded shot · breech clack · the report rolling back
//   impact:   material hit · heavy hit when it's big · sub boom · debris tail by what broke
//   collapse: many impacts in one place are one set: crack · body · debris tail · rumble, sized by what fell
//   debris:   each piece that lands sounds like what it is, S a brick, M a clump, L a section

import { LAYERS, TRIM } from './layers.ts';

/** What a piece sounds like when it's hit. */
export type Material = 'brick' | 'wood' | 'metal' | 'glass' | 'concrete';

/** A world position (m, z up). */
export type At = ArrayLike<number>;

/** Debris sizes: S a single piece, M a clump, L a section landing. */
export type Tier = 'S' | 'M' | 'L';

/** Most voices of a category sounding at once: past it the oldest is cut (50 impacts never turn to mush). */
const CAPS: Record<string, number> = { cannon: 3, brick: 5, wood: 4, metal: 4, glass: 3, debris: 6, misc: 8, dS: 6, dM: 5, dL: 3, creak: 2, snap: 4 };
const CATEGORY = (name: string): string =>
  name === 'wood_snap' ? 'snap' : name === 'beam_drop' ? 'dL' : name === 'glass_break' ? 'glass' : name === 'strain' ? 'creak' : name.endsWith('_S') ? 'dS' : name.endsWith('_M') ? 'dM' : name.endsWith('_L') ? 'dL' : name.startsWith('creak') ? 'creak' : name.startsWith('cannon') || name === 'clack' ? 'cannon' : name.startsWith('hit_brick') ? 'brick' : name === 'hit_wood' ? 'wood' : name === 'hit_metal' || name === 'steel_burst' ? 'metal' : name === 'hit_glass' ? 'glass' : name.startsWith('debris') ? 'debris' : 'misc';

/** The recorded layer for debris of `material` and `tier`, and a pitch for it. */
function debrisLayer(material: Material, tier: Tier): [string, number] {
  if (material === 'brick') return [tier === 'S' ? 'brick_S' : tier === 'M' ? 'hit_brick' : 'hit_brick_big', 1];
  if (material === 'glass') return ['hit_glass', tier === 'S' ? 1.35 : tier === 'M' ? 1.1 : 0.95];
  return [`${material}_${tier}`, 1];
}

/** The layer for a single hit on `material`. */
const hitLayer = (m: Material): string => (m === 'concrete' ? 'hit_brick' : `hit_${m}`);

interface PlayOpts {
  rate?: number;
  delay?: number;
  /** Pitch spread (share, each way). */
  spread?: number;
  /** Metres at which the level has halved. */
  dull?: number;
  /** Reverb send (0..1). */
  send?: number;
  /** Seconds to play at most (faded out over the last quarter). */
  dur?: number;
  /** A low-pass at this frequency (Hz), on top of the distance's. */
  lp?: number;
  /** Where it sounds (world m): panned around the listener. Left out for sounds at the listener. */
  at?: At;
  /** The voice category, if not the layer's own. */
  cat?: string;
}

const SPEED_OF_SOUND = 343;

export class Sounds {
  private ctx: BaseAudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly buffers = new Map<string, AudioBuffer[]>();
  private readonly last = new Map<string, number>();
  private readonly voices = new Map<string, { end: number; stop: () => void }[]>();
  private analyser: AnalyserNode | null = null;
  volume = 0.7;
  /** Where the listener is (world m). */
  readonly ear: [number, number, number] = [0, 0, 1.7];
  /** HRTF voices sounding (end times): up to 3 loud, near ones get it, the rest equal power. */
  private hrtf: number[] = [];
  /** Collapse sets started lately: no new one within 8 m for 0.5 s. */
  private sets: { at: At; t: number }[] = [];
  /** The rubble loop (one, at the centroid of what's moving). */
  private slide: { src: AudioBufferSourceNode; gain: GainNode; pan: PannerNode | null } | null = null;
  /** Counters for tests: voices started, collapse sets. */
  readonly counts = { voices: 0, sets: 0, missing: 0 };

  /**
   * Fetch and decode every take, during the warm-up: an offline context decodes without a click, and its buffers play
   * in the live one, so the first shot has all its layers. Takes that fail to load are left out.
   */
  async load(): Promise<void> {
    const ext = typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a';
    const decoder = new OfflineAudioContext(1, 1, 44100);
    await Promise.all(
      Object.entries(LAYERS).map(async ([name, takes]) => {
        const list = await Promise.all(
          Array.from({ length: takes }, async (_, k) => {
            try {
              const r = await fetch(`audio/${name}_${k + 1}.${ext}`);
              return r.ok ? await decoder.decodeAudioData(await r.arrayBuffer()) : null;
            } catch {
              return null;
            }
          }),
        );
        this.buffers.set(name, list.filter((b): b is AudioBuffer => !!b));
      }),
    );
  }

  /** How many takes are decoded (for tests). */
  get loaded(): number {
    let n = 0;
    for (const l of this.buffers.values()) n += l.length;
    return n;
  }

  /** Start the audio (browsers only allow it after a click, so it's silent until the first). */
  start(): void {
    if (this.ctx) {
      if (this.ctx instanceof AudioContext && this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) this.attach(new AC());
  }

  /** Build the mix on a context (the live one, or an offline one to render and measure a sequence). */
  attach(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    this.slide = null;
    this.voices.clear();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 8;
    comp.ratio.value = 3;
    comp.attack.value = 0.008;
    comp.release.value = 0.22;
    // The limiter: as hard and fast as the node goes (ratio 20, 1 ms), a little under full scale
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.12;
    const out = ctx.createGain();
    out.gain.value = 0.92;
    this.master.connect(comp).connect(limiter).connect(out).connect(ctx.destination);
    // A meter on the output (tests read it)
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    out.connect(this.analyser);
    // Reverb: a few early slaps and a short, dark tail
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(comp);
    const n = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  /** The reverb's impulse: discrete slaps at 45 to 240 ms, then diffuse noise decaying over ~1 s, low-passed. */
  private impulse(ctx: BaseAudioContext): AudioBuffer {
    const sr = ctx.sampleRate;
    const len = Math.round(sr * 1.4);
    const b = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (const [t, g] of [
        [0.045, 0.5],
        [0.071, 0.35],
        [0.11, 0.42],
        [0.16, 0.25],
        [0.24, 0.18],
      ] as [number, number][]) {
        const at = Math.round((t + (c ? 0.006 : 0)) * sr);
        for (let k = 0; k < 40; k++) d[at + k] += g * (1 - k / 40) * (Math.random() * 2 - 1);
      }
      let lp = 0;
      for (let i = Math.round(0.05 * sr); i < len; i++) {
        const t = i / sr;
        lp += (Math.random() * 2 - 1 - lp) * 0.25;
        d[i] += lp * 0.5 * Math.exp(-t / 0.32);
      }
    }
    return b;
  }

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** A voice of `cat` starts, lasting until `end`: past the category's cap the oldest is cut short. */
  private claim(cat: string, end: number, stop: () => void): void {
    const now = this.now();
    const list = (this.voices.get(cat) ?? []).filter((v) => v.end > now);
    list.push({ end, stop });
    while (list.length > (CAPS[cat] ?? 8)) list.shift()!.stop();
    this.voices.set(cat, list);
  }

  /** Put the listener at the camera (call once a frame, after the camera moves). World and camera are z-up. */
  listen(pos: At, forward: At, up: At): void {
    this.ear[0] = pos[0];
    this.ear[1] = pos[1];
    this.ear[2] = pos[2];
    const l = this.ctx?.listener;
    if (!l) return;
    if (l.positionX) {
      l.positionX.value = pos[0];
      l.positionY.value = pos[1];
      l.positionZ.value = pos[2];
      l.forwardX.value = forward[0];
      l.forwardY.value = forward[1];
      l.forwardZ.value = forward[2];
      l.upX.value = up[0];
      l.upY.value = up[1];
      l.upZ.value = up[2];
    } else {
      l.setPosition(pos[0], pos[1], pos[2]);
      l.setOrientation(forward[0], forward[1], forward[2], up[0], up[1], up[2]);
    }
  }

  /** Metres from the listener to `at`. */
  distanceTo(at: At): number {
    return Math.hypot(at[0] - this.ear[0], at[1] - this.ear[1], at[2] - this.ear[2]);
  }

  /**
   * A panner at `at`: equal power, with no roll-off of its own (level, low-pass and delay already follow distance).
   * HRTF for up to 3 loud voices within 15 m (lasting until `end`).
   */
  private panner(at: At, loud: number, end: number): PannerNode | null {
    const { ctx } = this;
    if (!ctx) return null;
    const p = ctx.createPanner();
    const now = this.now();
    this.hrtf = this.hrtf.filter((t) => t > now);
    const near = this.distanceTo(at) < 15 && loud > 0.3 && this.hrtf.length < 3;
    if (near) this.hrtf.push(end);
    p.panningModel = near ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 3;
    p.rolloffFactor = 0;
    p.maxDistance = 250;
    if (p.positionX) {
      p.positionX.value = at[0];
      p.positionY.value = at[1];
      p.positionZ.value = at[2];
    } else p.setPosition(at[0], at[1], at[2]);
    return p;
  }

  /** Where a layer goes: through a panner at `at` if given, else straight into the mix. */
  private dest(at: At | undefined, loud: number, end: number, hrtf = false): AudioNode {
    const p = at ? this.panner(at, hrtf ? loud : 0, end) : null;
    if (!p) return this.master!;
    p.connect(this.master!);
    return p;
  }

  /**
   * A recorded layer: a take at random (never the same twice running), its pitch and level varied, quieter, duller
   * and later with `distance` m, a reverb send. False if not loaded.
   */
  play(name: string, gain = 1, distance = 0, opts: PlayOpts = {}): boolean {
    const { ctx } = this;
    const list = this.buffers.get(name);
    if (!ctx || !this.master || gain <= 0.001) return false;
    if (!list?.length) {
      this.counts.missing++;
      return false;
    }
    let k = Math.floor(Math.random() * list.length);
    if (list.length > 1 && k === this.last.get(name)) k = (k + 1) % list.length;
    this.last.set(name, k);
    const t = this.now() + (opts.delay ?? 0) + distance / SPEED_OF_SOUND;
    const src = ctx.createBufferSource();
    src.buffer = list[k];
    const spread = opts.spread ?? 0.07;
    src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * spread);
    const g = ctx.createGain();
    const near = 1 / (1 + distance / (opts.dull ?? 25));
    const level = gain * near * (0.86 + Math.random() * 0.2) * 10 ** ((TRIM[`${name}_${k + 1}`] ?? 0) / 20);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(opts.lp ?? 20000, 1800 + 18000 * near * near);
    const length = list[k].duration / src.playbackRate.value;
    const dur = Math.min(length, opts.dur ?? length);
    const out = this.dest(opts.at, level, t + dur, true);
    src.connect(lp).connect(g).connect(out);
    if (opts.send && this.reverb) {
      // (From after the panner: the slaps come back mostly from the side the sound was on)
      const s = ctx.createGain();
      s.gain.value = opts.send;
      (out === this.master ? g : out).connect(s).connect(this.reverb);
    }
    g.gain.setValueAtTime(level, t);
    if (dur < length) {
      g.gain.setValueAtTime(level, t + dur * 0.75);
      g.gain.linearRampToValueAtTime(0, t + dur);
    }
    src.start(t);
    src.stop(t + dur + 0.02);
    this.counts.voices++;
    this.claim(opts.cat ?? CATEGORY(name), t + dur, () => {
      const n = this.now();
      g.gain.cancelScheduledValues(n);
      g.gain.setValueAtTime(g.gain.value, n);
      g.gain.linearRampToValueAtTime(0, n + 0.04);
      try {
        src.stop(n + 0.05);
      } catch {
        // already stopped
      }
    });
    return true;
  }

  /** The cannon fired, at the listener's ear. */
  cannonFire(): void {
    if (!this.ctx) return;
    // Transient: a few ms of bright noise
    this.hiss(0.55, 1800, 0.035);
    // Chesty low body and the sub thump under it
    this.tone(0.55, 140, 68, 0.2, 'triangle');
    this.tone(1.15, 62, 31, 0.42);
    // The recorded shot, with a little reverb
    this.play('cannon_body', 1.1, 0, { spread: 0.05, send: 0.18 });
    // The breech clack, a beat after
    this.play('clack', 0.32, 0, { delay: 0.06, rate: 1.25, spread: 0.08 });
    // The slap and the report rolling back across the country
    this.play('cannon_report', 0.55, 0, { delay: 0.12, send: 0.5, lp: 3500, spread: 0.04 });
  }

  /** Something hit hard (a cannonball): `energy` 0..1, the material, `broken` pieces' worth, `distance` m, where. */
  impact(material: Material, energy: number, distance: number, broken: number, at?: At): void {
    if (!this.ctx) return;
    const e = Math.max(0, Math.min(1, energy));
    const dly = distance / SPEED_OF_SOUND;
    this.play(hitLayer(material), 0.45 + 0.45 * e, distance, { rate: (1.1 - 0.22 * e) * (material === 'concrete' ? 0.92 : 1), send: 0.15 + 0.15 * e, dull: 30, at });
    if (material === 'concrete') this.play('concrete_M', 0.4 * e, distance, { delay: 0.02, send: 0.15, dull: 30, at });
    if ((material === 'brick' || material === 'concrete') && e > 0.45) this.play('hit_brick_big', 0.35 + 0.6 * (e - 0.45) * 2, distance, { rate: 1.05 - 0.15 * e, send: 0.25, dull: 35, at });
    if (material === 'metal' && e > 0.5) this.play('steel_burst', 0.4 * e, distance, { rate: 1.2, dull: 30, at });
    // Sub boom through the ground, by energy
    const near = 1 / (1 + distance / 30);
    this.tone(0.8 * e * near, 78, 30, 0.35 + 0.3 * e, 'sine', dly, at);
    this.debrisTail(broken, distance, 0.1 + dly, at);
  }

  /** Rubble coming down after `pieces` broke or fell, `distance` m off: more, longer and louder. */
  debrisTail(pieces: number, distance: number, delay = 0, at?: At): void {
    if (!this.ctx || pieces <= 0) return;
    const v = pieces;
    if (v < 50) {
      this.play('debris_small', 0.15 + 0.4 * Math.min(1, v / 50), distance, { delay, spread: 0.12, dull: 25, at });
      return;
    }
    // (The bed under each piece's own hits, not a wash over them)
    const dur = Math.min(6, 1 + v / 900);
    this.play('debris_mid', 0.32 * Math.min(0.85, 0.3 + v / 1500), distance, { delay, dur: Math.min(4, dur), spread: 0.1, send: 0.15, dull: 35, at });
    if (v > 600) {
      this.play('debris_big', 0.32 * Math.min(1, 0.35 + v / 6000), distance, { delay: delay + 0.15, dur, spread: 0.08, send: 0.25, dull: 45, rate: 0.95, at });
      this.rumble(Math.min(0.7, 0.2 + v / 10000) / (1 + distance / 60), 260, 35, Math.min(6, 1.5 + v / 3000), delay + distance / SPEED_OF_SOUND, at);
    }
  }

  /**
   * A piece of debris struck something at `at`: `tier` S, M or L, `dv` the speed it lost (m/s), `size` its size
   * against one brick. S at -24 dB, M -16, L -8, up to 6 dB more by how hard it hit; bigger pieces lower; L adds a sub.
   */
  debrisHit(material: Material, tier: Tier, dv: number, size: number, at: At): void {
    if (!this.ctx) return;
    const distance = this.distanceTo(at);
    const db = (tier === 'S' ? -24 : tier === 'M' ? -16 : -8) + 6 * Math.max(0, Math.min(1, (dv - 3) / 12));
    const [layer, pitch] = debrisLayer(material, tier);
    const ref = tier === 'S' ? 1 : tier === 'M' ? 8 : 300;
    const rate = pitch * Math.max(0.78, Math.min(1.25, (Math.max(1, size) / ref) ** (-1 / 3)));
    // (Somewhere in the 100 ms since the last readback, not all on its beat; small pieces short)
    const delay = Math.random() * 0.1;
    this.play(layer, 10 ** (db / 20), distance, { rate, delay, dur: tier === 'S' ? 0.22 : tier === 'M' ? 0.5 : undefined, spread: 0.07, send: tier === 'S' ? 0.05 : tier === 'M' ? 0.12 : 0.25, dull: 30, at, cat: `d${tier}` });
    if (tier === 'L') this.tone(0.32 / (1 + distance / 40), 60, 30, 0.45, 'sine', distance / SPEED_OF_SOUND, at);
    if (material === 'glass' && tier !== 'L') this.glassTinkle(tier === 'S' ? 2 : 5, distance, at);
  }

  /**
   * Many impacts at once in one place (a wall coming apart): one designed set instead of each piece, a crack, a body,
   * the debris tail, a rumble, sized by `pieces`. None within 8 m of the last for 0.5 s. True if it played.
   */
  collapseSet(material: Material, pieces: number, at: At): boolean {
    if (!this.ctx) return false;
    const now = this.now();
    this.sets = this.sets.filter((s) => now - s.t < 0.5);
    if (this.sets.some((s) => Math.hypot(s.at[0] - at[0], s.at[1] - at[1], s.at[2] - at[2]) < 8)) return false;
    this.sets.push({ at, t: now });
    this.counts.sets++;
    const distance = this.distanceTo(at);
    const level = Math.min(1, 0.35 + 0.65 * Math.sqrt(pieces / 150));
    const dly = distance / SPEED_OF_SOUND;
    this.hiss((0.4 * level) / (1 + distance / 40), 2200, 0.03, dly, at);
    const [body, rate] = material === 'brick' ? ['hit_brick_big', 1] : debrisLayer(material, 'L');
    this.play(body, 0.5 * level, distance, { rate: rate * (0.97 + 0.06 * Math.random()), send: 0.25, dull: 35, at, cat: 'dL' });
    this.debrisTail(pieces, distance, 0.08, at);
    this.rumble((0.45 * level) / (1 + distance / 60), 120, 30, Math.min(4, 0.8 + pieces / 400), dly, at);
    return true;
  }

  /**
   * The rubble loop: one looping slide of rubble whose level follows how much is moving (√(moving/400), at most
   * -10 dB) and sits at the centroid of what moves. Call every readback; 0 fades it out.
   */
  rubble(moving: number, at: At | null): void {
    const { ctx } = this;
    if (!ctx || !this.master) return;
    const list = this.buffers.get('slide_rubble');
    if (!list?.length) return;
    const t = this.now();
    if (!this.slide && moving > 0 && at) {
      const src = ctx.createBufferSource();
      src.buffer = list[Math.floor(Math.random() * list.length)];
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = this.panner(at, 0, 0);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 9000;
      src.connect(lp).connect(gain);
      if (pan) gain.connect(pan).connect(this.master);
      else gain.connect(this.master);
      src.start(t, Math.random() * 3);
      this.slide = { src, gain, pan };
    }
    const s = this.slide;
    if (!s) return;
    const want = moving > 0 && at ? Math.min(0.316, Math.sqrt(moving / 400)) / (1 + this.distanceTo(at) / 35) : 0;
    s.gain.gain.setTargetAtTime(want, t, want > s.gain.gain.value ? 0.12 : 0.5);
    if (at && s.pan?.positionX) {
      s.pan.positionX.setTargetAtTime(at[0], t, 0.15);
      s.pan.positionY.setTargetAtTime(at[1], t, 0.15);
      s.pan.positionZ.setTargetAtTime(at[2], t, 0.15);
    }
  }

  /** A structure under load says so: wood and steel creak, at `r` 0.8..1 of what it can carry (-14 dB at 0.8, -6 dB at 1). */
  creak(kind: 'wood' | 'steel', r: number, at: At): void {
    if (!this.ctx) return;
    const db = -14 + 8 * Math.max(0, Math.min(1, (r - 0.8) / 0.2));
    this.play(`creak_${kind}`, 10 ** (db / 20), this.distanceTo(at), { spread: 0.1, send: 0.2, dull: 30, at });
  }

  /** Windows shattering (`panes` of them) from `distance` m: the recorded break, and shards tinkling down. */
  glass(panes: number, distance: number, at?: At): void {
    const size = Math.min(1, panes / 12);
    this.play('hit_glass', 0.35 + 0.4 * size, distance, { send: 0.2, dull: 30, at });
    if (panes > 3) this.play('hit_glass', 0.3 * size, distance, { delay: 0.07, rate: 0.9, dull: 30, at });
    this.glassTinkle(Math.round(4 + 18 * size), distance, at, 0.3, 1.7);
  }

  /** Shards tinkling down: `n` little bright pings over `spread` s, from `after` s on. */
  private glassTinkle(n: number, distance: number, at?: At, after = 0.05, spread = 0.5): void {
    const near = 1 / (1 + distance / 30);
    const dull = 1 / (1 + distance / 80);
    for (let k = 0; k < n; k++) {
      const when = after + Math.random() ** 0.7 * spread;
      const f = (2600 + Math.random() * 6500) * (0.6 + 0.4 * dull);
      this.tone((0.015 + Math.random() * 0.035) * near, f, f * (0.97 + Math.random() * 0.02), 0.04 + Math.random() * 0.12, Math.random() < 0.5 ? 'sine' : 'triangle', when, at);
    }
  }

  /** Noise through a low-pass falling from `from` to `to` Hz over `seconds`, at `gain`. */
  private rumble(gain: number, from: number, to: number, seconds: number, delay = 0, at?: At): void {
    const { ctx } = this;
    if (!ctx || !this.master || !this.noise || gain <= 0.0005) return;
    const t = this.now() + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = seconds > 2.5;
    src.playbackRate.value = 0.6 + Math.random() * 0.2;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(from, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(to, 20), t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(lp).connect(g).connect(this.dest(at, gain, t + seconds));
    src.start(t, Math.random() * 1.5);
    src.stop(t + seconds + 0.1);
  }

  private tone(gain: number, from: number, to: number, seconds: number, type: OscillatorType = 'sine', delay = 0, at?: At): void {
    const { ctx } = this;
    if (!ctx || !this.master || gain <= 0.0005) return;
    const t = this.now() + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(g).connect(this.dest(at, gain, t + seconds));
    osc.start(t);
    osc.stop(t + seconds + 0.05);
  }

  /** Noise through a high-pass (from `cut` Hz), sharp attack, gone over `seconds`. */
  private hiss(gain: number, cut: number, seconds: number, delay = 0, at?: At): void {
    const { ctx } = this;
    if (!ctx || !this.master || !this.noise || gain <= 0.0005) return;
    const t = this.now() + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.3;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = cut;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(hp).connect(g).connect(this.dest(at, gain, t + seconds));
    src.start(t, Math.random() * 2);
    src.stop(t + seconds + 0.1);
  }

  /** The output's level now: sample peak and RMS (linear). */
  meter(): { peak: number; rms: number } {
    const a = this.analyser;
    if (!a) return { peak: 0, rms: 0 };
    const d = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(d);
    let peak = 0;
    let sum = 0;
    for (const x of d) {
      peak = Math.max(peak, Math.abs(x));
      sum += x * x;
    }
    return { peak, rms: Math.sqrt(sum / d.length) };
  }
}
