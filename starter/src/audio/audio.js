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
//
// Sound FILES are optional and sit beside the synth voices (get some with `node tools/sounds/add.mjs`,
// how-to in recipes/sound-files.md):
//
//   audio.loadAll(sounds)                            everything in src/audio/sounds.json
//   audio.load('hit', ['a.mp3', 'b.mp3'])            one name, one or several takes
//   audio.play('hit', { vol: 0.8, rate: 1, vary: 0.6, pan: -0.3 })   a random take, never the same twice in a row
//   const rain = audio.loop('rain', { vol: 0.4, fade: 1 }); rain.set(0.2); rain.stop();
//   audio.music.playFile('assets/audio/music/theme.mp3', { fade: 2 }); audio.music.stopFile();
//
// A missing or broken file gives one warning in the console and silence, never an error.

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

  // ---- Sound files: shared helpers ------------------------------------------------------
  const warned = new Set();
  function warnOnce(key, message) {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[audio] ${message}`);
  }
  // Resolves when the audio engine exists (after the first click or key press).
  const whenReady = () => new Promise((resolve) => (ctx ? resolve() : readyCallbacks.push(resolve)));
  async function fetchBytes(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`the server answered ${res.status}`);
    // a dev server answers a missing file with the game's page instead of an error
    if ((res.headers.get('content-type') || '').includes('text/html')) throw new Error('file not found');
    return res.arrayBuffer();
  }
  const decode = (bytes) =>
    new Promise((resolve, reject) => {
      try {
        const p = ctx.decodeAudioData(bytes, resolve, reject);
        if (p && p.catch) p.catch(reject);
      } catch (e) {
        reject(e);
      }
    });

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
    let track = null; // the music file that is playing, if any

    function stopTrack(t, fade) {
      if (!t || t.stopped) return;
      t.stopped = true;
      if (track === t) track = null;
      if (!t.src) return; // still loading: it will see `stopped` and never start
      const now = ctx.currentTime;
      const f = Math.max(0.02, fade);
      t.gain.gain.cancelScheduledValues(now);
      t.gain.gain.setValueAtTime(t.gain.gain.value, now);
      t.gain.gain.linearRampToValueAtTime(0, now + f);
      try {
        t.src.stop(now + f + 0.05);
      } catch {
        /* already stopped */
      }
    }

    function chord() {
      if (!ok() || !playing || track) return; // a music file takes the pad's place
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
      // Play a music file through the music bus (so the music volume and duck() apply). It replaces the synth
      // pad while it plays. loopPoints: [start, end] in seconds for a file made to loop without a click.
      playFile(url, { fade = 1, vol = 1, loop = true, loopPoints = null } = {}) {
        stopTrack(track, fade);
        const t = { stopped: false, src: null, gain: null };
        track = t;
        (async () => {
          try {
            const bytes = await fetchBytes(url);
            await whenReady();
            if (t.stopped) return;
            const buffer = await decode(bytes);
            if (t.stopped) return;
            const now = ctx.currentTime;
            t.src = ctx.createBufferSource();
            t.src.buffer = buffer;
            t.src.loop = !!loop;
            if (loop && loopPoints) {
              t.src.loopStart = loopPoints[0];
              t.src.loopEnd = Math.min(loopPoints[1], buffer.duration);
            }
            t.gain = ctx.createGain();
            t.gain.gain.setValueAtTime(0, now);
            t.gain.gain.linearRampToValueAtTime(Math.max(0, vol), now + Math.max(0.02, fade));
            t.src.connect(t.gain).connect(musicBus);
            t.src.onended = () => {
              if (track === t) track = null;
            };
            t.src.start(now, loop && loopPoints ? loopPoints[0] : 0);
          } catch (e) {
            if (track === t) track = null;
            warnOnce(url, `could not play the music file ${url} (${e?.message || e}). The game goes on without it.`);
          }
        })();
        return { stop: (f = fade) => stopTrack(t, f) };
      },
      stopFile(fade = 1) {
        stopTrack(track, fade);
      },
      get filePlaying() {
        return !!track;
      },
    };
  })();

  // ---- Sound files: one-shots and loops -------------------------------------------------
  const samples = new Map(); // name -> { urls, gain, loop, buffers, ready, last, lastTime, live }
  const voices = []; // one-shots that are playing, oldest first
  const MAX_VOICES = 24; // all file sounds together
  const MAX_SAME = 4; // of one name at once
  const SAME_GAP = 0.03; // seconds between two starts of the same name (30 hits in a frame = one sound)
  const BURST = 6; // new sounds allowed inside one SAME_GAP window, whatever their names
  const sampleStats = { loaded: 0, failed: 0, played: 0, skipped: 0 };
  let sampleBus = null;
  let burstStart = -1;
  let burstCount = 0;

  // File sounds share one limiter in front of the sfx bus, so a pile-up gets squeezed instead of clipping.
  function sampleOut() {
    if (!sampleBus) {
      sampleBus = ctx.createGain();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      sampleBus.connect(limiter).connect(sfxBus);
    }
    return sampleBus;
  }

  function endVoice(voice) {
    if (voice.done) return;
    voice.done = true;
    voice.sample.live--;
    const i = voices.indexOf(voice);
    if (i >= 0) voices.splice(i, 1);
  }
  function stopVoice(voice, fade = 0.03) {
    if (voice.done) return;
    const now = ctx.currentTime;
    const f = Math.max(0.005, fade);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + f);
    try {
      voice.src.stop(now + f + 0.01);
    } catch {
      /* already stopped */
    }
    endVoice(voice);
  }

  function loadSample(name, urls, { gain = 1, loop = null } = {}) {
    const list = (Array.isArray(urls) ? urls : [urls]).filter((u) => typeof u === 'string' && u);
    const sample = { urls: list, gain, loop, buffers: list.map(() => null), ready: null, last: -1, lastTime: -1, live: 0 };
    samples.set(name, sample);
    if (!list.length) warnOnce(`load:${name}`, `load("${name}"): no file was given.`);
    sample.ready = Promise.all(
      list.map(async (url, i) => {
        try {
          const bytes = await fetchBytes(url); // fetched right away; turned into sound once the engine exists
          await whenReady();
          sample.buffers[i] = await decode(bytes);
          sampleStats.loaded++;
        } catch (e) {
          sampleStats.failed++;
          warnOnce(url, `could not load "${name}" from ${url} (${e?.message || e}). The game goes on without it.`);
        }
      }),
    ).then(() => sample.buffers.some(Boolean));
    return sample.ready;
  }

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
    // ---- sound files ----
    // Load one sound: a url, or a list of urls (takes of the same sound; play() picks one at random).
    // opts: { gain: its base volume, loop: [start, end] seconds for loop() }. Resolves true if any take loaded.
    load(name, urls, opts) {
      return loadSample(name, urls, opts);
    },
    // Load everything in a sounds.json written by tools/sounds/add.mjs ({ sounds: { name: { files, gain, loop } } }).
    // `base` goes in front of every file path. Resolves when all are loaded or have failed.
    loadAll(manifest, { base = '' } = {}) {
      const list = manifest?.sounds || manifest || {};
      const jobs = [];
      for (const [name, s] of Object.entries(list)) {
        const files = Array.isArray(s) || typeof s === 'string' ? s : s?.files;
        if (!files) continue;
        jobs.push(loadSample(name, [].concat(files).map((f) => base + f), { gain: s.gain ?? 1, loop: s.loop || null }));
      }
      return Promise.all(jobs);
    },
    // Play a loaded sound once. vol 0..1+, rate (speed and pitch, 1 = as recorded), vary (semitones of random
    // pitch spread), pan (-1 left .. 1 right). Returns { stop(fadeSeconds) }, or null when nothing was played
    // (audio not unlocked yet, file missing or still loading, or the same sound played a moment ago).
    play(name, { vol = 1, rate = 1, vary: v = 0.6, pan = 0 } = {}) {
      if (!ok()) return null;
      const sample = samples.get(name);
      if (!sample) {
        warnOnce(`play:${name}`, `play("${name}"): no sound with that name was loaded. Check src/audio/sounds.json.`);
        return null;
      }
      const ready = [];
      sample.buffers.forEach((b, i) => b && ready.push(i));
      if (!ready.length) return null; // still loading, or missing (already warned)
      const now = ctx.currentTime;
      if (now - burstStart >= SAME_GAP) {
        burstStart = now;
        burstCount = 0;
      }
      if (now - sample.lastTime < SAME_GAP || sample.live >= MAX_SAME || burstCount >= BURST) {
        sampleStats.skipped++;
        return null;
      }
      let pick = ready[Math.floor(rand.next() * ready.length)];
      if (ready.length > 1 && pick === sample.last) pick = ready[(ready.indexOf(pick) + 1) % ready.length];
      sample.last = pick;
      sample.lastTime = now;
      burstCount++;
      while (voices.length >= MAX_VOICES) stopVoice(voices[0], 0.02);

      const src = ctx.createBufferSource();
      src.buffer = sample.buffers[pick];
      src.playbackRate.value = pos(rate) * vary(v);
      const gain = ctx.createGain();
      gain.gain.value = Math.max(0, Number.isFinite(vol) ? vol : 1) * sample.gain;
      src.connect(gain);
      if (pan && ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        gain.connect(panner).connect(sampleOut());
      } else {
        gain.connect(sampleOut());
      }
      const voice = { src, gain, sample, done: false };
      voices.push(voice);
      sample.live++;
      src.onended = () => endVoice(voice);
      src.start(now);
      sampleStats.played++;
      return { stop: (fade) => stopVoice(voice, fade) };
    },
    // A loaded sound that keeps going (rain, wind, an engine). Starts by itself once audio is unlocked and the
    // file is loaded. bus: 'sfx' (default) or 'music'. Returns { set(volume), stop(fadeSeconds), playing }.
    loop(name, { vol = 1, fade = 0.3, rate = 1, bus = 'sfx' } = {}) {
      const sample = samples.get(name);
      let src = null;
      let gain = null;
      let stopped = false;
      let want = Math.max(0, Number.isFinite(vol) ? vol : 1);
      if (!sample) {
        warnOnce(`loop:${name}`, `loop("${name}"): no sound with that name was loaded. Check src/audio/sounds.json.`);
        return { set() {}, stop() {}, playing: false };
      }
      const start = () => {
        if (stopped || src) return;
        const buffer = sample.buffers.find(Boolean);
        if (!buffer) return; // missing (already warned)
        const now = ctx.currentTime;
        src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        if (sample.loop) {
          src.loopStart = sample.loop[0];
          src.loopEnd = Math.min(sample.loop[1], buffer.duration);
        }
        src.playbackRate.value = pos(rate);
        gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(want * sample.gain, now + Math.max(0.02, fade));
        src.connect(gain).connect(bus === 'music' ? musicBus : sfxBus);
        src.start(now, sample.loop ? sample.loop[0] : 0);
      };
      sample.ready.then(whenReady).then(start);
      return {
        set(volume, seconds = 0.08) {
          want = Math.max(0, Number.isFinite(volume) ? volume : 0);
          if (!gain) return;
          const now = ctx.currentTime;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setTargetAtTime(want * sample.gain, now, Math.max(0.005, seconds));
        },
        stop(fadeOut = fade) {
          if (stopped) return;
          stopped = true;
          if (!src) return;
          const now = ctx.currentTime;
          const f = Math.max(0.02, fadeOut);
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(gain.gain.value, now);
          gain.gain.linearRampToValueAtTime(0, now + f);
          try {
            src.stop(now + f + 0.05);
          } catch {
            /* already stopped */
          }
        },
        get playing() {
          return !!src && !stopped;
        },
      };
    },
    // For tests and debugging: how many files loaded or failed, how many plays happened or were held back.
    get sampleStats() {
      return { ...sampleStats, voices: voices.length };
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
