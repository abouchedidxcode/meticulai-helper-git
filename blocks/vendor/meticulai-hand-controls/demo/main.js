// Demo: every hand drawn with its pose name, live pose scores, and a log of motion events.
// Three input sources, one engine:
//   camera    (button, needs https or localhost)
//   mouse     (default: the mouse becomes a synthetic hand; hold the button to pinch)
//   synthetic (?synthetic=1 or the button: a scripted pair of hands runs through poses, a swipe, a throw and a clap)
import {
  createHands, drawHand, syntheticHand, SYNTHETIC_POSES as P, POSES, MOTION_INFO, cameraProblem, PinchClick,
} from '../src/index.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage'), canvas = $('overlay'), ctx = canvas.getContext('2d'), video = $('cam');
const poseName = Object.fromEntries(POSES.map((p) => [p.id, p.name]));
const label = (name) => MOTION_INFO[name]?.name ?? poseName[name] ?? name;

const hands = createHands({ video, onFrame: draw });
const events = [];
let flash = { text: '', until: 0 };
window.__demo = { hands, events, get frame() { return hands.frame; }, get source() { return mode; } };

// ------------------------------------------------------------------ inputs
let mode = 'mouse';
const mouse = { x: 0.5, y: 0.55, inside: false, down: false };
stage.addEventListener('pointermove', (e) => {
  const r = stage.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) / r.width; mouse.y = (e.clientY - r.top) / r.height; mouse.inside = true;
});
stage.addEventListener('pointerleave', () => { mouse.inside = false; mouse.down = false; });
stage.addEventListener('pointerdown', () => { mouse.down = true; });
addEventListener('pointerup', () => { mouse.down = false; });
// the mouse fallback goes through the same engine as the camera: one code path for every input
const mouseHands = () => (mouse.inside ? [syntheticHand(mouse.x, mouse.y, mouse.down ? P.pinch : P.relaxed)] : []);

const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
const CYCLE = ['open', 'fist', 'point', 'victory', 'rock', 'thumbs-up', 'gun', 'ok'];
const LEFT = ['three', 'pinch', 'shaka'];
let t0 = 0;
/** A 14 s scripted loop: poses on two hands, then a swipe, a throw and a clap. */
function scripted(now) {
  if (!t0) t0 = now;
  const s = ((now - t0) / 1000) % 14;
  const bob = 0.015 * Math.sin(s * 2.1);
  if (s < 8) {
    return [
      syntheticHand(0.3, 0.6 + bob, P[LEFT[Math.floor(s / 2.67)]], { handedness: 'Left', scale: 0.3 }),
      syntheticHand(0.68, 0.58 - bob, P[CYCLE[Math.floor(s)]], { scale: 0.32 }),
    ];
  }
  if (s < 9.6) return [syntheticHand(lerp(0.3, 0.75, (s - 8.5) / 0.25), 0.5, P.open, { scale: 0.24 })];
  if (s < 11.2) return [syntheticHand(lerp(0.3, 0.72, (s - 10.1) / 0.25), 0.55, s < 10.24 ? P.fist : P.open, { scale: 0.24 })];
  const d = lerp(0.25, 0.04, (s - 12) / 0.2);
  return [syntheticHand(0.5 - d, 0.5, P.open, { handedness: 'Left', scale: 0.22 }), syntheticHand(0.5 + d, 0.5, P.open, { scale: 0.22 })];
}

function useMouse() { mode = 'mouse'; hands.inject(mouseHands); }
function useSynthetic() { mode = 'synthetic'; t0 = 0; hands.engine.reset(); hands.inject(scripted); $('synth').textContent = 'Mouse hand'; }
$('synth').onclick = () => (mode === 'synthetic' ? (useMouse(), ($('synth').textContent = 'Synthetic hands')) : useSynthetic());
$('start').onclick = async () => {
  $('err').textContent = '';
  $('start').textContent = 'Starting...';
  try {
    await hands.startCamera();
    hands.inject(null);
    hands.engine.reset();
    mode = 'camera';
    video.classList.add('on');
    $('start').textContent = `Camera on (${hands.tracker.delegate})`;
  } catch (e) {
    $('err').textContent = cameraProblem(e, 'the mouse');
    $('start').textContent = 'Use my camera';
  }
};
hands.tracker.onEnded = () => { $('err').textContent = cameraProblem({ name: 'NotReadableError' }, 'the mouse'); useMouse(); video.classList.remove('on'); };

if (new URLSearchParams(location.search).has('synthetic')) useSynthetic(); else useMouse();

// ------------------------------------------------------------------ events
const pinch = new PinchClick();
hands.engine.on('*', (e) => {
  if (e.kind === 'pose' || e.name === 'hold') return; // poses are shown on the hands and in the bars
  events.unshift({ name: e.name, kind: e.kind, t: e.t });
  events.length = Math.min(events.length, 12);
  flash = { text: label(e.name), until: performance.now() + 1100 };
  $('log').innerHTML = events.map((x) => `<li class="${x.kind === 'two-hand' ? 'two' : ''}"><b>${label(x.name)}</b><span>${x.kind}</span></li>`).join('');
});

// ------------------------------------------------------------------ drawing
const poseRows = new Map();
for (const p of POSES) {
  const row = document.createElement('div');
  row.className = 'pose';
  row.innerHTML = `<span>${p.name}</span><div class="bar"><i></i></div>`;
  $('poses').append(row);
  poseRows.set(p.id, row);
}
const COLORS = ['#f2b25c', '#8cc7c9', '#e7866a', '#a8c97f'];

function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.round(stage.clientWidth * dpr), h = Math.round(stage.clientHeight * dpr);
  if (w < 2 || h < 2) return false; // a hidden pane reports 0x0
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return true;
}

function draw(frame) {
  if (!resize()) return;
  const W = canvas.width, H = canvas.height, k = W / 1000;
  ctx.clearRect(0, 0, W, H);
  for (const h of frame.hands) {
    const col = COLORS[h.id % COLORS.length];
    drawHand(ctx, h.landmarks, W, H, { color: col, lineWidth: 3.2 * k, jointRadius: 3.6 * k });
    // pinch ring between thumb and index tips: fills as the pinch closes
    const a = h.landmarks[4], b = h.landmarks[8];
    const px = ((a.x + b.x) / 2) * W, py = ((a.y + b.y) / 2) * H;
    ctx.beginPath();
    ctx.arc(px, py, (10 + 8 * (1 - h.pinch)) * k, -Math.PI / 2, -Math.PI / 2 + h.pinch * Math.PI * 2);
    ctx.strokeStyle = '#efe6d8'; ctx.lineWidth = 2.2 * k; ctx.stroke();
    // pose name above the hand
    const top = Math.min(...h.landmarks.map((p) => p.y)) * H;
    const cx = h.features.center.x * W;
    const text = h.pose ? poseName[h.pose] ?? h.pose : '...';
    ctx.font = `600 ${Math.round(22 * k)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = '#16130fcc';
    ctx.beginPath(); ctx.roundRect(cx - tw / 2 - 10 * k, top - 44 * k, tw + 20 * k, 32 * k, 8 * k); ctx.fill();
    ctx.fillStyle = col;
    ctx.fillText(text, cx, top - 21 * k);
    ctx.font = `${Math.round(13 * k)}px system-ui, sans-serif`;
    ctx.fillStyle = '#a59c8e';
    ctx.fillText(`${h.handedness} hand`, cx, top - 50 * k);
  }
  if (frame.hands.length === 0 && mode === 'mouse') {
    ctx.font = `${Math.round(18 * k)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#a59c8e';
    ctx.fillText('Move the mouse here', W / 2, H / 2);
  }
  // first hand's pose scores
  const first = frame.hands[0];
  for (const [id, row] of poseRows) {
    const s = first?.scores[id] ?? 0;
    row.querySelector('i').style.width = `${Math.round(s * 100)}%`;
    row.classList.toggle('on', first?.pose === id);
  }
  if (first && pinch.update(first.pinch)) { /* a game would click here */ }
  $('big').innerHTML = performance.now() < flash.until ? `<b>${flash.text}</b>` : mode === 'synthetic' ? 'Synthetic hands' : mode === 'camera' ? 'Camera' : 'Mouse hand';
}
