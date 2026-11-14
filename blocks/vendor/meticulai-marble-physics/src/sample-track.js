// A small seeded marble run built from the physics primitives: a pegged chute with a spinner, a banked helix
// turn that drops as it goes round, a narrower chute and a coin-funnel bowl with a drain. It is an example of how
// to build a course (and what the demo and tests run); a game builds its own.
import { makeCollider, matYPR, matApply } from './physics.js';

/** mulberry32: a tiny seeded random generator (public domain). Returns () => [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WOOD = { bounce: 0.25, friction: 0.15 };
const RUBBER = { bounce: 0.6, friction: 0.3 };

/**
 * A straight plank chute. `start` is the middle of the floor's top edge where it begins; it heads along `yaw`
 * (forward = (sin yaw, 0, cos yaw)) and tips down by `pitch` radians. Returns { cols, end, R }.
 */
export function chute({ start, yaw = 0, pitch = 0.2, length = 20, width = 6, wall = 1.2, mat = WOOD, tag = null }) {
  const R = matYPR(yaw, pitch);
  const at = (lx, ly, lz) => {
    const d = matApply(R, lx, ly, lz);
    return [start[0] + d[0], start[1] + d[1], start[2] + d[2]];
  };
  const cols = [];
  cols.push(makeCollider('box', { c: at(0, -0.25, length / 2), R, hx: width / 2, hy: 0.25, hz: length / 2, mat, tag }));
  for (const s of [-1, 1]) {
    cols.push(makeCollider('box', { c: at(s * (width / 2 + 0.15), wall / 2 - 0.25, length / 2), R, hx: 0.15, hy: wall / 2 + 0.25, hz: length / 2, mat: WOOD, tag: 'wall' }));
  }
  return { cols, end: at(0, 0, length), R, at };
}

/**
 * Builds the sample run. Returns { colliders, spawn(i) -> [x,y,z], killY, bowl: { c, rim }, parts }.
 * @param {number} seed
 */
export function buildSampleTrack(seed = 1) {
  const rnd = mulberry32(seed);
  const colliders = [];
  const parts = {};

  // 1. Pegged chute heading +z.
  const pitch1 = 0.17 + rnd() * 0.05;
  const c1 = chute({ start: [0, 20, 0], yaw: 0, pitch: pitch1, length: 26, width: 6 });
  colliders.push(...c1.cols);
  // Back wall so the marbles start in a pen.
  colliders.push(makeCollider('box', { c: c1.at(0, 0.6, -0.15), R: c1.R, hx: 3.3, hy: 0.85, hz: 0.15, mat: WOOD, tag: 'wall' }));
  // Pegs: a seeded field in staggered rows. Gaps (between pegs, and peg to wall) stay wider than a marble, or
  // marbles wedge there for good.
  parts.pegs = [];
  for (let row = 0; row < 4; row++) {
    const lz = 7 + row * 2.4;
    for (let k = 0; k < 3; k++) {
      if (rnd() < 0.25) continue;
      const lx = -1.6 + k * 1.6 + (row % 2 ? 0.8 : 0) + (rnd() - 0.5) * 0.2;
      if (Math.abs(lx) > 1.7) continue;
      const peg = makeCollider('cyl', { c: c1.at(lx, 0.6, lz), R: c1.R, radius: 0.22, hh: 0.6, mat: RUBBER, tag: 'peg' });
      colliders.push(peg);
      parts.pegs.push(peg);
    }
  }
  // A spinner bar turning about the floor normal near the bottom of the chute.
  const n = [c1.R[1], c1.R[4], c1.R[7]];
  const spinner = makeCollider('box', {
    c: c1.at(0, 0.35, 19.5), R: c1.R, hx: 2.1, hy: 0.3, hz: 0.18, mat: { bounce: 0.4, friction: 0.15 }, tag: 'spinner',
    motion: { type: 'spin', axis: n, speed: 1.4 + rnd() * 0.6, phase: rnd() * 6.28 },
  });
  colliders.push(spinner);
  parts.spinner = spinner;

  // 2. A 180-degree banked turn that drops 1.5 as it goes round (a helix shell). Chute 1 ends on its -x side
  //    (phi = pi), chute 2 leaves from its +x side (phi = 0) heading -z.
  const e1 = c1.end;
  const drop = 1.5;
  const turnC = [e1[0] + 5, e1[1] - drop, e1[2]];
  // Profile (radius, height) of the shell's mid-line; the shell is 0.35 thick each side, so a floor at y = -0.35 has
  // its top at 0. Inner lip, flat floor, then the outer wall banking up.
  const turn = makeCollider('helix', {
    c: turnC, profile: [[2, 0.9], [2, -0.35], [7.6, -0.35], [9.0, 1.2], [9.4, 3.2]],
    a0: 0, a1: Math.PI, rise: drop, mat: WOOD, tag: 'turn',
  });
  colliders.push(turn);
  colliders.push(makeCollider('cyl', { c: [turnC[0], turnC[1] + 0.5, turnC[2]], radius: 2.2, hh: 2.5, mat: WOOD, tag: 'post' }));
  parts.turn = turn;

  // 3. Chute 2 heading back along -z, narrower, into the bowl.
  const c2 = chute({ start: [turnC[0] + 5, turnC[1], turnC[2]], yaw: Math.PI, pitch: 0.14 + rnd() * 0.04, length: 18, width: 5 });
  colliders.push(...c2.cols);

  // 4. The bowl: a coin funnel (the game's whirlpool profile: slope A + K / r^2, gentle near the rim, steep
  //    toward the drain), a full lathe. Its centre sits so chute 2's line meets it at radius ~8, tangentially, so the
  //    marbles orbit a few times before they spiral into the drain.
  const e2 = c2.end;
  const RIM = 10.6, DRAIN = 2.0, A = 0.06, K = 14;
  const height = (r) => -(A * (RIM - r) + K * (1 / r - 1 / RIM));
  const prof = [[RIM + 0.35, 1.2], [RIM, 0]];
  for (let i = 1; i <= 16; i++) {
    const r = RIM * Math.pow(DRAIN / RIM, i / 16);
    prof.push([r, height(r)]);
  }
  prof.push([DRAIN, height(DRAIN) - 1.5], [DRAIN, height(DRAIN) - 3]);
  // The profile is the shell's mid-line: shift it down by the shell so the riding surface is height(r).
  for (const p of prof) p[1] -= 0.35;
  // The rim sits low enough to pass under chute 2 where the chute crosses it.
  const bowlC = [e2[0] - 8, e2[1] - 1.6, e2[2] - 2.5];
  const bowl = makeCollider('lathe', { c: bowlC, profile: prof, mat: { bounce: 0.25, friction: 0.35 }, tag: 'slick' });
  colliders.push(bowl);
  parts.bowl = bowl;

  // 5. A catch tray under the drain (the demo respawns marbles that reach it).
  colliders.push(makeCollider('box', { c: [bowlC[0], bowlC[1] - 13, bowlC[2]], hx: 4, hy: 0.25, hz: 4, mat: WOOD, tag: 'tray' }));

  const start = c1.at(0, 0, 0);
  /** Spawn slot i: a staggered grid in the pen at the top of chute 1. */
  function spawn(i) {
    const col = i % 5, row = Math.floor(i / 5);
    return c1.at(-2.2 + col * 1.1 + (row % 2) * 0.4, 0.55 + 0.02 * row, 0.8 + row * 1.1);
  }
  return { colliders, spawn, start, killY: bowlC[1] - 10, bowl: { c: bowlC, rim: RIM }, parts };
}
