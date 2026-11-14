// Sound with no audio files: small synth voices made with WebAudio.
// Browsers only allow sound after the player clicks or presses a key, so the audio
// "unlocks" on the first input by itself. Before that, every call is a silent no-op.
//
//   audio.blip({ freq: 660 })            short tone (jump, menu)
//   audio.chime({ note: 4 })             bell; note = semitones above A5 (pickups, rising scale)
//   audio.thud({ vol: 0.8 })             low hit (landing, impact)
//   audio.whoosh({ length: 0.3 })        filtered noise sweep (dash, swing, near miss)
//   const rumble = audio.noiseLoop({ freq: 180 }); rumble.set(0.4); rumble.stop();
//   audio.music.start(); audio.music.stop();   soft procedural pad
//   audio.duck(0.4, 500)                 lower the music for a moment (big events read clearer)
//   audio.setVolume('master' | 'music' | 'sfx', 0..1)
//
// Every voice takes `vary` (semitones of random pitch spread, default small) so repeated
// sounds don't feel like a machine gun. ?mute=1 silences everything.

import { createRandom } from '../core/random.js';
import { flags } from '../core/hooks.js';

const A5 = 880;
const semis = (n) => Math.pow(2, n / 12);

export function createAudio({ muted = flags.mute } = {}) {
  const rand = createRandom((flags.seed ^ 0x5eed) >>> 0); // own stream: sound never shifts gameplay
  let ctx = null;
  let master, musicBus, sfxBus, noiseBuffer;
  const volumes = { master: 0.8, music: 0.5, sfx: 0.8 };
  const readyCallbacks = [];

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor(); // keeps loud moments from clipping
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus.connect(master);
    sfxBus.connect(master);
    master.connect(comp).connect(ctx.destination);
    applyVolumes();

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = rand.next() * 2 - 1;

    for (const fn of readyCallbacks.splice(0)) fn();
  }

  function unlock() {
    init();
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  }
  for (const type of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(type, unlock, { passive: true });
  }

  function applyVolumes() {
    if (!ctx) return;
    master.gain.value = muted ? 0 : volumes.master;
    musicBus.gain.value = volumes.music;
    sfxBus.gain.value = volumes.sfx;
  }

  const ok = () => ctx && ctx.state === 'running';
  // exponentialRamp* throws on 0 or negative targets, so never ramp to less than this.
  const pos = (v) => Math.max(0.0001, Number.isFinite(v) ? v : 0.0001);
  const vary = (amount) => semis((rand.next() * 2 - 1) * amount);

  // One enveloped oscillator. Returns nothing; nodes clean themselves up.
  function tone({ freq, type = 'sine', vol = 0.3, attack = 0.005, length = 0.15, slide = 1, bus = sfxBus, at = 0 }) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(pos(freq * slide), t + length);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(pos(vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + length);
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + attack + length + 0.05);
  }

  function noise({ vol = 0.3, length = 0.3, from = 400, to = 2000, q = 1, attack = 0.02 }) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(pos(to), t + length);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(pos(vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(t, rand.next() * 1.5);
    src.stop(t + length + 0.05);
  }

  // Music: a slow, warm pad cycling through four chords. Replace with your own track later.
  const music = (() => {
    const chords = [
      [50, 57, 61, 64], // D A C# E   (Dmaj9-ish)
      [47, 54, 57, 62], // B F# A D   (Bm7)
      [43, 50, 54, 59], // G D F# B   (Gmaj7)
      [45, 52, 57, 61], // A E A C#   (A)
    ];
    const midi = (m) => 440 * semis(m - 69);
    let timer = 0;
    let index = 0;
    let playing = false;

    function chord() {
      if (!ok() || !playing) return;
      const t = ctx.currentTime;
      const len = 9;
      for (const m of chords[index % chords.length]) {
        for (const detune of [-6, 6]) {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = midi(m);
          osc.detune.value = detune;
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.value = 900;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.035, t + 2.5);
          g.gain.setValueAtTime(0.035, t + len - 3);
          g.gain.exponentialRampToValueAtTime(0.0001, t + len);
          osc.connect(f).connect(g).connect(musicBus);
          osc.start(t);
          osc.stop(t + len + 0.1);
        }
      }
      index++;
    }

    return {
      start() {
        if (playing) return;
        playing = true;
        const begin = () => {
          if (!playing) return;
          chord();
          timer = setInterval(chord, 8000);
        };
        if (ok()) begin();
        else readyCallbacks.push(() => setTimeout(begin, 50));
      },
      stop() {
        playing = false;
        clearInterval(timer);
      },
    };
  })();

  const audio = {
    get ready() {
      return ok();
    },
    get context() {
      return ctx;
    },
    music,
    onReady(fn) {
      if (ctx) fn();
      else readyCallbacks.push(fn);
    },
    setVolume(bus, v) {
      volumes[bus] = Math.max(0, Math.min(1, v));
      applyVolumes();
    },
    blip({ freq = 660, vol = 0.18, length = 0.09, slide = 1.6, type = 'triangle', vary: v = 0.5 } = {}) {
      if (!ok()) return;
      tone({ freq: freq * vary(v), type, vol, length, slide });
    },
    chime({ note = 0, vol = 0.22, vary: v = 0 } = {}) {
      if (!ok()) return;
      const f = A5 * semis(note) * vary(v);
      tone({ freq: f, type: 'sine', vol, length: 0.9, attack: 0.003 });
      tone({ freq: f * 2.01, type: 'sine', vol: vol * 0.35, length: 0.45, attack: 0.003 });
      tone({ freq: f * 3.98, type: 'sine', vol: vol * 0.12, length: 0.2, attack: 0.003 });
    },
    thud({ freq = 120, vol = 0.5, length = 0.18, vary: v = 1 } = {}) {
      if (!ok()) return;
      tone({ freq: freq * vary(v), type: 'sine', vol, length, slide: 0.45, attack: 0.002 });
      noise({ vol: vol * 0.25, length: length * 0.6, from: 900, to: 200, q: 0.8, attack: 0.002 });
    },
    whoosh({ vol = 0.2, length = 0.3, from = 300, to = 2400 } = {}) {
      if (!ok()) return;
      noise({ vol, length, from, to, q: 1.2, attack: length * 0.4 });
    },
    // A sound that keeps going (engine, wind, rolling stone). Silent until set() gives it volume.
    noiseLoop({ freq = 200, q = 0.9 } = {}) {
      let src = null;
      let g = null;
      const start = () => {
        src = ctx.createBufferSource();
        src.buffer = noiseBuffer;
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = freq;
        f.Q.value = q;
        g = ctx.createGain();
        g.gain.value = 0;
        src.connect(f).connect(g).connect(sfxBus);
        src.start();
      };
      audio.onReady(start);
      return {
        set(volume) {
          if (g) g.gain.setTargetAtTime(Math.max(0, volume), ctx.currentTime, 0.08);
        },
        stop() {
          try {
            src?.stop();
          } catch {
            /* already stopped */
          }
        },
      };
    },
    duck(amount = 0.4, ms = 500) {
      if (!ok()) return;
      const t = ctx.currentTime;
      const p = musicBus.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(volumes.music * amount, t + 0.05);
      p.linearRampToValueAtTime(volumes.music, t + 0.05 + ms / 1000);
    },
  };

  if (flags.autostart) init(); // headless tests launched with an autoplay flag get sound too
  return audio;
}
