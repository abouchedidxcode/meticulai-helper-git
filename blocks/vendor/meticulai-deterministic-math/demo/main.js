// Demo: three double pendulums start from exactly the same angles. Two use DMath (separate copies of the state)
// and stay identical to the last bit forever. One uses the built-in Math: its sin/cos differ from DMath's by a bit
// now and then, and in a chaotic system that tiny gap grows until it swings completely differently. The bottom
// graph is the gap on a log scale. The panel also runs selfCheck(): do this browser's DMath bits match Node's?
import { DMath, selfCheck, bitsHex } from '../src/index.js';
import { makePendulum, stepPendulum, bobs } from './pendulum.js';

const SPEED = 6; // simulated seconds per real second
const DT = 1 / 240;
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const panel = document.getElementById('panel');

const sims = [
  { p: makePendulum(DMath), color: '#f2a65a', name: 'DMath', trail: [] },
  { p: makePendulum(DMath), color: '#ffffff', name: 'DMath again', trail: [] },
  { p: makePendulum(Math), color: '#5aa9f2', name: 'built-in Math', trail: [] },
];
const check = selfCheck();
const vsBuiltin = selfCheck(Math);
let steps = 0, firstDiff = -1, twinSame = true;
const gaps = []; // [time, log10 gap]

function resize() {
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
}
resize();
addEventListener('resize', resize);

function advance(n) {
  for (let i = 0; i < n; i++) {
    for (const s of sims) stepPendulum(s.p, DT);
    steps++;
    const a = sims[0].p, b = sims[2].p;
    if (firstDiff < 0 && (a.a1 !== b.a1 || a.a2 !== b.a2)) firstDiff = steps;
    if (steps % 24 === 0) {
      const g = Math.abs(a.a1 - b.a1) + Math.abs(a.a2 - b.a2);
      gaps.push([steps * DT, Math.log10(Math.max(g, 1e-17))]);
      for (const s of sims) {
        const [, , x2, y2] = bobs(s.p);
        s.trail.push(x2, y2);
        if (s.trail.length > 2 * 220) s.trail.splice(0, 2);
      }
    }
  }
  const t0 = sims[0].p, t1 = sims[1].p;
  if (bitsHex(t0.a1) + bitsHex(t0.a2) + bitsHex(t0.w1) + bitsHex(t0.w2) !== bitsHex(t1.a1) + bitsHex(t1.a2) + bitsHex(t1.w1) + bitsHex(t1.w2)) twinSame = false;
}

function draw() {
  const W = canvas.width, H = canvas.height, s = devicePixelRatio;
  ctx.fillStyle = '#14161c';
  ctx.fillRect(0, 0, W, H);
  const graphH = Math.min(170 * s, H * 0.26);
  const cx = W * 0.62, cy = (H - graphH) * 0.32, scale = Math.min(W * 0.3, (H - graphH - cy - 24 * s) / 2.05);
  // Pivot.
  ctx.fillStyle = '#888';
  ctx.beginPath(); ctx.arc(cx, cy, 4 * s, 0, 7); ctx.fill();
  for (let k = sims.length - 1; k >= 0; k--) {
    const sim = sims[k];
    const t = sim.trail;
    ctx.strokeStyle = sim.color;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = (k === 1 ? 1 : 2) * s;
    ctx.beginPath();
    for (let i = 0; i < t.length; i += 2) {
      const x = cx + t[i] * scale, y = cy - t[i + 1] * scale;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    const [x1, y1, x2, y2] = bobs(sim.p);
    ctx.lineWidth = (k === 1 ? 1.5 : 4) * s;
    if (k === 1) ctx.setLineDash([5 * s, 5 * s]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + x1 * scale, cy - y1 * scale);
    ctx.lineTo(cx + x2 * scale, cy - y2 * scale);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = sim.color;
    for (const [x, y] of [[x1, y1], [x2, y2]]) {
      ctx.beginPath();
      ctx.arc(cx + x * scale, cy - y * scale, (k === 1 ? 5 : 11) * s, 0, 7);
      k === 1 ? ctx.stroke() : ctx.fill();
    }
  }
  // Graph: log10 of the gap between DMath and the built-in Math.
  const gx = 40 * s, gy = H - graphH - 14 * s, gw = W - 80 * s, gh = graphH - 30 * s;
  ctx.strokeStyle = '#333a46';
  ctx.lineWidth = 1 * s;
  ctx.strokeRect(gx, gy, gw, gh);
  ctx.fillStyle = '#9aa3b2';
  ctx.font = `${12 * s}px system-ui, sans-serif`;
  const yOf = (l) => gy + gh - ((l + 17) / 18) * gh;
  for (const l of [-15, -10, -5, 0]) {
    ctx.fillText(`1e${l}`, gx - 34 * s, yOf(l) + 4 * s);
    ctx.strokeStyle = '#222833';
    ctx.beginPath(); ctx.moveTo(gx, yOf(l)); ctx.lineTo(gx + gw, yOf(l)); ctx.stroke();
  }
  ctx.fillText('gap between the DMath and built-in Math pendulums (radians, log scale) over simulated time', gx + 8 * s, gy + 16 * s);
  const tMax = Math.max(60, gaps.length ? gaps[gaps.length - 1][0] : 0);
  ctx.strokeStyle = '#5aa9f2';
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  gaps.forEach(([t, l], i) => {
    const x = gx + (t / tMax) * gw, y = yOf(l);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}

function updatePanel() {
  const a = sims[0].p, b = sims[2].p;
  const gap = Math.abs(a.a1 - b.a1) + Math.abs(a.a2 - b.a2);
  const ok = check.failed.length === 0;
  panel.innerHTML = `<h1>Deterministic math</h1>
    <div class="row">Simulated ${(steps * DT).toFixed(1)} s at ${SPEED}x speed, ${steps.toLocaleString()} steps</div>
    <div class="row"><span class="k" style="background:#f2a65a"></span>DMath and <span class="k" style="border:1px dashed #fff"></span>DMath again:
      <b class="${twinSame ? 'ok' : 'bad'}">${twinSame ? 'identical bits' : 'DIFFERENT'}</b></div>
    <div class="row"><span class="k" style="background:#5aa9f2"></span>Built-in Math: ${firstDiff < 0 ? 'still the same' : `first bit apart at step ${firstDiff.toLocaleString()}, now ${gap < 1e-3 ? gap.toExponential(1) : gap.toFixed(2)} rad apart`}</div>
    <div class="row">This browser vs the recorded bits: <b class="${ok ? 'ok' : 'bad'}">${ok ? `all ${check.total} match` : `${check.failed.length} of ${check.total} differ`}</b>
      (the built-in Math here differs on ${vsBuiltin.failed.length})</div>`;
}

let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000) * SPEED;
  last = now;
  const n = Math.floor(acc / DT);
  acc -= n * DT;
  advance(n);
  draw();
  updatePanel();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__demo = {
  state: () => ({ steps, firstDiff, twinSame, goldenOk: check.failed.length === 0, builtinDiffers: vsBuiltin.failed.length }),
};
