// A double pendulum: the classic chaotic system. Tiny differences (one bit in a sin or cos) grow until two copies
// swing completely differently. `M` is the Math to use, so the same code runs with DMath or the built-in Math.
export function makePendulum(M, a1 = 2.2, a2 = 2.6) {
  return { M, a1, a2, w1: 0, w2: 0 };
}

const G = 9.81, L1 = 1, L2 = 1, M1 = 1, M2 = 1;

/** One fixed step (semi-implicit Euler). */
export function stepPendulum(p, dt) {
  const { M } = p;
  const d = p.a1 - p.a2;
  const den = 2 * M1 + M2 - M2 * M.cos(2 * d);
  const acc1 = (-G * (2 * M1 + M2) * M.sin(p.a1) - M2 * G * M.sin(p.a1 - 2 * p.a2)
    - 2 * M.sin(d) * M2 * (p.w2 * p.w2 * L2 + p.w1 * p.w1 * L1 * M.cos(d))) / (L1 * den);
  const acc2 = (2 * M.sin(d) * (p.w1 * p.w1 * L1 * (M1 + M2) + G * (M1 + M2) * M.cos(p.a1)
    + p.w2 * p.w2 * L2 * M2 * M.cos(d))) / (L2 * den);
  p.w1 += acc1 * dt;
  p.w2 += acc2 * dt;
  p.a1 += p.w1 * dt;
  p.a2 += p.w2 * dt;
}

/** Positions of the two bobs (pendulum hangs from 0,0; y down is negative). */
export function bobs(p) {
  const { M } = p;
  const x1 = L1 * M.sin(p.a1), y1 = -L1 * M.cos(p.a1);
  return [x1, y1, x1 + L2 * M.sin(p.a2), y1 - L2 * M.cos(p.a2)];
}
