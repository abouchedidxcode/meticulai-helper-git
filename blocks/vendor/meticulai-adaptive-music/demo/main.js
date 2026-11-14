// Demo: drive the adaptive score with buttons and sliders, and draw what it plays (waveform + level meter).
import { createAdaptiveMusic, safetyChain } from '../src/index.js';

const $ = (id) => document.getElementById(id);
const state = { mode: 'menu', intensity: 0.5, danger: 0, progress: 0, lift: false, shimmer: false, paused: false };
let ctx = null, music = null, analyser = null, muted = false, pickups = 0;

function start() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.connect(ctx.destination);
  // the game's own master chain (compressor + soft clip), then the meter, then the speakers
  music = createAdaptiveMusic(ctx, safetyChain(ctx, analyser));
  music.setState(state);
  ctx.resume();
  $('go').textContent = 'Playing';
  window.__music = music; // for the headless checks
}
$('go').addEventListener('click', start);

for (const b of document.querySelectorAll('[data-mode]')) {
  b.addEventListener('click', () => {
    start();
    state.mode = b.dataset.mode;
    for (const o of document.querySelectorAll('[data-mode]')) o.classList.toggle('on', o === b);
    if (state.mode === 'play' && music.section === 'menu') { pickups = 0; music.hit('start'); }
    music.setState(state);
  });
}
for (const id of ['intensity', 'danger', 'progress']) {
  $(id).addEventListener('input', () => {
    state[id] = Number($(id).value);
    $(id + 'V').textContent = state[id].toFixed(2);
    music?.setState(state);
  });
}
for (const b of document.querySelectorAll('[data-toggle]')) {
  b.addEventListener('click', () => {
    const k = b.dataset.toggle;
    state[k] = !state[k];
    b.classList.toggle('on', state[k]);
    music?.setState(state);
  });
}
for (const b of document.querySelectorAll('[data-hit]')) {
  b.addEventListener('click', () => {
    start();
    const h = b.dataset.hit;
    if (h === 'pickup') music.hit('pickup', { n: ++pickups, of: 6 });
    else if (h === 'pickup-last') { music.hit('pickup', { n: 6, of: 6 }); pickups = 0; }
    else if (h === 'checkpoint') music.hit('checkpoint', { ahead: true });
    else if (h === 'start') { pickups = 0; music.hit('start'); setMode('play'); }
    else if (h === 'win' || h === 'lose') { music.hit(h); setMode('end'); }
  });
}
function setMode(m) {
  state.mode = m;
  for (const o of document.querySelectorAll('[data-mode]')) o.classList.toggle('on', o.dataset.mode === m);
  music.setState(state);
}
$('mute').addEventListener('click', () => {
  muted = !muted;
  music?.setMuted(muted);
  $('mute').classList.toggle('on', muted);
});
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend(); else ctx.resume();
  music.setActive(!document.hidden);
});

// ---------------------------------------------------------------- drawing
const cv = $('scope'), g = cv.getContext('2d');
const W = cv.width, H = cv.height;
let buf = null, level = -90, peakHold = -90, last = performance.now();
const hist = [];

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (music) music.update(dt);
  g.fillStyle = '#0d0b0a';
  g.fillRect(0, 0, W, H);
  // grid
  g.strokeStyle = '#231c17'; g.lineWidth = 2;
  for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo((W * i) / 8, 0); g.lineTo((W * i) / 8, H); g.stroke(); }
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, (H * i) / 4); g.lineTo(W - 120, (H * i) / 4); g.stroke(); }

  let rms = 0, pk = 0;
  if (analyser) {
    buf = buf || new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    for (const v of buf) { rms += v * v; pk = Math.max(pk, Math.abs(v)); }
    rms = Math.sqrt(rms / buf.length);
    // waveform, scaled up so a quiet mix still reads (the scale is printed)
    const gainShown = 4;
    g.lineWidth = 4; g.strokeStyle = '#f0a64a'; g.shadowColor = '#f0a64a'; g.shadowBlur = 16;
    g.beginPath();
    const mid = H * 0.42, span = W - 140;
    for (let i = 0; i < buf.length; i++) {
      const x = 20 + (i / (buf.length - 1)) * span;
      const y = mid - Math.max(-1, Math.min(1, buf[i] * gainShown)) * H * 0.33;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke(); g.shadowBlur = 0;
    // level history strip
    hist.push(rms); if (hist.length > 300) hist.shift();
    g.fillStyle = '#5fc9c0';
    for (let i = 0; i < hist.length; i++) {
      const db = 20 * Math.log10(Math.max(hist[i], 1e-5));
      const h = Math.max(0, (db + 60) / 60) * 130;
      g.fillRect(20 + i * ((W - 160) / 300), H - 30 - h, (W - 160) / 300 - 1, h);
    }
  }
  const db = 20 * Math.log10(Math.max(rms, 1e-5));
  level += (db - level) * 0.2;
  peakHold = Math.max(peakHold - dt * 12, 20 * Math.log10(Math.max(pk, 1e-5)));
  // meter
  const mx = W - 90, mh = H - 60;
  g.fillStyle = '#1d1714'; g.fillRect(mx, 30, 50, mh);
  const fill = Math.max(0, (level + 60) / 60);
  const grd = g.createLinearGradient(0, 30 + mh, 0, 30);
  grd.addColorStop(0, '#5fc9c0'); grd.addColorStop(0.7, '#f0a64a'); grd.addColorStop(1, '#e8553a');
  g.fillStyle = grd; g.fillRect(mx, 30 + mh * (1 - fill), 50, mh * fill);
  g.fillStyle = '#f3e6d4'; g.fillRect(mx - 4, 30 + mh * (1 - Math.max(0, (peakHold + 60) / 60)), 58, 4);
  // labels
  g.fillStyle = '#f3e6d4'; g.font = '600 34px system-ui, sans-serif';
  const st = music ? music.stats : null;
  g.fillText(st ? `${st.section}  ·  ${st.chord}` : 'Press "Start the music"', 28, 52);
  g.font = '24px system-ui, sans-serif'; g.fillStyle = '#a8957e';
  g.fillText(st ? `level ${level.toFixed(1)} dBFS RMS · peak ${peakHold.toFixed(1)} dBFS · voices ${st.voices} · waveform shown x4` : '', 28, 90);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
