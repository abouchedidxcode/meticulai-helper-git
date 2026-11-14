// Demo: a seed box, Play/Stop, mode buttons, intensity and tempo sliders, the tense switch, and a live waveform.
import { MusicEngine, generateSong, chordName } from '../src/index.js';

const $ = (id) => document.getElementById(id);
let ctx = null, bus = null, analyser = null, engine = null;
let mode = 'game', sudden = false;

const seedValue = () => {
  const raw = $('seed').value.trim();
  const n = Number(raw);
  if (Number.isFinite(n) && raw !== '') return n >>> 0;
  let h = 2166136261; // any text works as a seed
  for (const ch of raw) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};
const intensity = () => Number($('int').value);
const tempoMul = () => Number($('tempo').value);
const kindNow = () => (mode === 'game' && sudden ? 'tense' : mode);

function ensureAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  bus = ctx.createGain();
  bus.gain.value = 0.9;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  bus.connect(analyser);
  analyser.connect(ctx.destination);
}

function newEngine() {
  if (engine) { engine.stop(0); engine.dispose(); }
  engine = new MusicEngine(ctx, bus, { seed: seedValue() });
  engine.setIntensity(intensity(), { tempoMul: tempoMul(), sudden });
  engine.start(mode);
}

const playing = () => !!engine && engine.running;
function setPlayButton() {
  $('play').textContent = playing() ? 'Stop' : 'Play';
  $('play').classList.toggle('stop', playing());
}

$('play').addEventListener('click', async () => {
  ensureAudio();
  if (ctx.state !== 'running') await ctx.resume().catch(() => {});
  if (playing()) engine.stop(0.4);
  else newEngine();
  setTimeout(setPlayButton, 20);
});
$('random').addEventListener('click', () => {
  $('seed').value = String((Math.random() * 1e6) | 0);
  if (playing()) newEngine();
  showSong();
});
$('seed').addEventListener('change', () => { if (playing()) newEngine(); showSong(); });
for (const b of document.querySelectorAll('#modes [data-mode]')) {
  b.addEventListener('click', () => {
    mode = b.dataset.mode;
    for (const o of document.querySelectorAll('#modes [data-mode]')) o.classList.toggle('on', o === b);
    if (engine) engine.setMode(mode, 0.8);
    showSong();
  });
}
$('tense').addEventListener('click', () => {
  sudden = !sudden;
  $('tense').classList.toggle('on', sudden);
  pushIntensity();
  showSong();
});
function pushIntensity() {
  $('intv').textContent = intensity().toFixed(2);
  $('tempov').textContent = tempoMul().toFixed(2) + 'x';
  if (engine) engine.setIntensity(intensity(), { tempoMul: tempoMul(), sudden });
}
$('int').addEventListener('input', pushIntensity);
$('tempo').addEventListener('input', pushIntensity);

// The score is pure data: show it before anything plays.
function showSong() {
  const song = engine && engine.running && engine.song && engine.song.seed === seedValue() ? engine.song : generateSong(kindNow(), seedValue());
  $('key').textContent = song.key + (song.kind === 'tense' ? '' : song.kind === 'menu' ? ' (menu)' : '');
  $('kind').textContent = song.kind;
  if (!playing()) { $('bpm').textContent = song.bpm + ' bpm'; $('pos').textContent = song.sections.map((s) => s.id).join(' '); }
  const pos = playing() ? engine.position : null;
  const lines = song.sections.map((s, i) => {
    const names = s.chords.map(chordName).join('  ');
    const now = pos && pos.index === i;
    return `<span class="${now ? 'now' : ''}">${s.id.padEnd(3)} ${names}</span>`;
  });
  $('chords').innerHTML = lines.join('\n');
}

// Waveform + live info.
const cv = $('wave'), g = cv.getContext('2d');
const buf = new Float32Array(2048);
const ZOOM = 3; // the mix sits around -18 dBFS: drawn 3x taller so it reads (red only if the real signal nears clipping)
let lastPos = '';
function draw() {
  requestAnimationFrame(draw);
  const W = cv.width, H = cv.height;
  g.fillStyle = '#120f19';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#2b2440';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
  if (!analyser) return;
  analyser.getFloatTimeDomainData(buf);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  g.strokeStyle = peak > 0.98 ? '#ff6b7a' : '#ffb347';
  g.lineWidth = 4;
  g.beginPath();
  for (let i = 0; i < buf.length; i++) {
    const x = (i / (buf.length - 1)) * W, y = H / 2 - Math.max(-1, Math.min(1, buf[i] * ZOOM)) * H * 0.46;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.stroke();
  if (playing()) {
    $('bpm').textContent = engine.bpm.toFixed(0) + ' bpm';
    $('kind').textContent = engine.kind;
    const p = engine.position;
    const s = p ? `${p.section} / ${p.bar + 1}` : '-';
    if (s !== lastPos) { lastPos = s; $('pos').textContent = s; showSong(); }
  }
  setPlayButton();
}
showSong();
pushIntensity();
draw();
window.__demo = { get engine() { return engine; }, get ctx() { return ctx; } };
