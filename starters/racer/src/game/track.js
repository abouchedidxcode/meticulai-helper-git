// Track maths: turns a track from tracks.js into evenly spaced samples and answers the
// questions the rest of the game asks: "where on the lap is this point?" (locate) and
// "where in the world is this spot of the lap?" (at). No drawing here (see trackMesh.js),
// and no three.js, so it also runs in plain Node for quick checks.
//
// Words used everywhere in this starter:
//   s     metres along the lap from the start line (0 .. track.length)
//   lat   metres sideways from the middle of the road (+ = to the driver's right)
//   turn  how hard the road bends here, 1 / radius in metres (+ = a right-hand bend)
//
// You rarely need to change this file: new tracks are data in tracks.js.

const SPACING = 2; // metres between samples
const TAU = Math.PI * 2;

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Running average round a closed loop.
function smoothLoop(a, radius, passes = 1) {
  const n = a.length;
  let src = a;
  for (let p = 0; p < passes; p++) {
    const out = new Float32Array(n);
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += src[(k + n * 8) % n];
    for (let i = 0; i < n; i++) {
      out[i] = sum / (radius * 2 + 1);
      sum += src[(i + radius + 1) % n] - src[(i - radius + n * 8) % n];
    }
    src = out;
  }
  return src;
}

export function buildTrack(data) {
  const pts = data.points.map((p) => [p[0], p[2] ?? 3, p[1], p[3] ?? 13, p[4] ?? 0]); // x, y, z, width, bank
  const P = pts.length;

  // 1. A dense smooth curve through the points.
  const SUB = 28;
  const dense = [];
  for (let k = 0; k < P; k++) {
    const a = pts[(k - 1 + P) % P];
    const b = pts[k];
    const c = pts[(k + 1) % P];
    const d = pts[(k + 2) % P];
    for (let j = 0; j < SUB; j++) {
      const t = j / SUB;
      dense.push([0, 1, 2, 3, 4].map((f) => catmull(a[f], b[f], c[f], d[f], t)));
    }
  }
  const D = dense.length;
  const cum = [0];
  for (let i = 0; i < D; i++) {
    const a = dense[i];
    const b = dense[(i + 1) % D];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[2] - a[2]));
  }
  const length = cum[D];

  // 2. Even samples every ~2 m.
  const n = Math.round(length / SPACING);
  const ds = length / n;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const pz = new Float32Array(n);
  const half = new Float32Array(n);
  const bankDeg = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * ds;
    while (cum[j + 1] < s) j++;
    const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const a = dense[j];
    const b = dense[(j + 1) % D];
    px[i] = a[0] + (b[0] - a[0]) * t;
    py[i] = a[1] + (b[1] - a[1]) * t;
    pz[i] = a[2] + (b[2] - a[2]) * t;
    half[i] = (a[3] + (b[3] - a[3]) * t) / 2;
    bankDeg[i] = a[4] + (b[4] - a[4]) * t;
  }

  // 3. Direction, slope and bend at each sample.
  const tx = new Float32Array(n);
  const tz = new Float32Array(n);
  const rx = new Float32Array(n);
  const rz = new Float32Array(n);
  const slope = new Float32Array(n);
  let turn = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    const dx = px[b] - px[a];
    const dz = pz[b] - pz[a];
    const len = Math.hypot(dx, dz) || 1;
    tx[i] = dx / len;
    tz[i] = dz / len;
    rx[i] = -tz[i]; // the driver's right
    rz[i] = tx[i];
    slope[i] = (py[b] - py[a]) / len;
  }
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    turn[i] = (tx[a] * tz[b] - tz[a] * tx[b]) / (2 * ds); // + = bending right
  }
  turn = smoothLoop(turn, 3, 2);

  // 4. Banking: corners lean into the bend by themselves, plus any bank written on a point.
  const tanB = new Float32Array(n); // + = the right side is lower (a right-hand bend)
  const autoBank = data.autoBank ?? 6;
  for (let i = 0; i < n; i++) {
    const auto = autoBank * Math.max(-1, Math.min(1, turn[i] * 32));
    tanB[i] = Math.tan(((auto + bankDeg[i]) * Math.PI) / 180);
  }

  // 5. A racing line: outside before the corner, inside at the apex, outside again.
  // (sharp average minus wide average of the bend gives exactly that shape)
  const sharp = smoothLoop(turn, 8, 3);
  const wide = smoothLoop(turn, 30, 2);
  const line = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const want = (2 * sharp[i] - wide[i]) * 190;
    const room = half[i] - 1.8;
    line[i] = Math.max(-room, Math.min(room, want));
  }

  // 6. Checkpoints: K gates, the last one is the finish line at s = 0 (= length).
  const K = Math.max(2, data.checkpoints ?? 6);
  const gates = [];
  for (let k = 1; k <= K; k++) gates.push((k * length) / K);

  const track = {
    name: data.name, laps: data.laps ?? 3, data, length, n, ds,
    px, py, pz, tx, tz, rx, rz, slope, half, tanB, turn, line, gates,
    verge: data.verge ?? 5,
    kerb: 1.1, // kerb width, painted outside the road edge in corners

    wrap(s) {
      return ((s % length) + length) % length;
    },
    // Shortest signed distance from s0 to s1 round the loop (-length/2 .. length/2).
    delta(s0, s1) {
      let d = (s1 - s0) % length;
      if (d > length / 2) d -= length;
      if (d < -length / 2) d += length;
      return d;
    },
    /** How far a car's centre may go sideways before it touches the rail. */
    limit(i) {
      return half[i] + track.verge;
    },

    /** The world at lap position s, `lat` metres off the centre line. Fills and returns `out`. */
    at(s, lat = 0, out = {}) {
      const f = track.wrap(s) / ds;
      const i = Math.floor(f) % n;
      const k = (i + 1) % n;
      const a = f - Math.floor(f);
      const lerp = (arr) => arr[i] + (arr[k] - arr[i]) * a;
      out.i = i;
      out.s = track.wrap(s);
      out.lat = lat;
      out.tx = lerp(tx);
      out.tz = lerp(tz);
      const tl = Math.hypot(out.tx, out.tz) || 1;
      out.tx /= tl;
      out.tz /= tl;
      out.rx = -out.tz;
      out.rz = out.tx;
      out.half = lerp(half);
      out.tanB = lerp(tanB);
      out.turn = lerp(turn);
      out.slope = lerp(slope);
      out.line = lerp(line);
      out.cy = lerp(py);
      out.x = lerp(px) + out.rx * lat;
      out.z = lerp(pz) + out.rz * lat;
      out.y = out.cy - lat * out.tanB;
      return out;
    },

    /** The nearest sample to a world point. hint = a sample index to search around (-1 = everywhere). */
    nearest(x, z, hint = -1, reach = 16) {
      let best = 0;
      let bestD = Infinity;
      if (hint < 0) {
        for (let i = 0; i < n; i++) {
          const d = (px[i] - x) ** 2 + (pz[i] - z) ** 2;
          if (d < bestD) { bestD = d; best = i; }
        }
      } else {
        for (let k = -reach; k <= reach; k++) {
          const i = (hint + k + n) % n;
          const d = (px[i] - x) ** 2 + (pz[i] - z) ** 2;
          if (d < bestD) { bestD = d; best = i; }
        }
      }
      return best;
    },

    /** Where on the lap is world point (x, z)? Fills out like at(), with s and lat worked out. */
    locate(x, z, hint = -1, out = {}) {
      const i = track.nearest(x, z, hint);
      const along = (x - px[i]) * tx[i] + (z - pz[i]) * tz[i];
      const s = i * ds + Math.max(-ds, Math.min(ds, along));
      track.at(s, 0, out);
      const lat = (x - out.x) * out.rx + (z - out.z) * out.rz;
      out.lat = lat;
      out.x = x;
      out.z = z;
      out.y = out.cy - lat * out.tanB;
      out.i = i;
      return out;
    },
  };
  return track;
}

/** Did a car that moved from lap position s0 to s1 (a small step forward) pass gate position g? */
export function crossed(track, s0, s1, g) {
  const d = track.delta(s0, s1);
  if (d <= 0 || d > 40) return false;
  const toGate = track.wrap(g - s0);
  return toGate > 0 && toGate <= d;
}

export { TAU };
