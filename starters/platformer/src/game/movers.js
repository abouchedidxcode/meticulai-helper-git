// Moving platforms. Each one glides between the two ends of its track (the ~ or : run in the level
// text), eases in and out, and WAITS at each end (tuning: mover.wait). The wait is the kindness:
// it is the moment to step on or off.
// A mover is a one-way platform: you can jump up through it and you stand on its top (m.y).
// physics.js carries whatever stands on it. No drawing here (draw/actors.js draws them).

const ease = (u) => u * u * (3 - 2 * u); // smoothstep: gentle start and stop

export const MOVER_W = 3; // tiles wide
export const MOVER_H = 0.45; // how thick it is drawn

export function createMovers(level, tune) {
  const list = level.movers.map((d, i) => ({
    i,
    x0: d.x0, y0: d.y0, x1: d.x1, y1: d.y1,
    dist: Math.hypot(d.x1 - d.x0, d.y1 - d.y0),
    x: d.x0, y: d.y0, prevX: d.x0, prevY: d.y0, vx: 0, vy: 0,
    w: MOVER_W,
    clock: 0,
    waiting: true, // resting at an end right now
  }));

  function place(m, dt) {
    const t = tune.mover;
    const travel = Math.max(0.2, m.dist / Math.max(0.1, t.speed));
    const cycle = 2 * (t.wait + travel);
    const c = m.clock % cycle;
    let u;
    if (c < t.wait) u = 0;
    else if (c < t.wait + travel) u = ease((c - t.wait) / travel);
    else if (c < 2 * t.wait + travel) u = 1;
    else u = 1 - ease((c - 2 * t.wait - travel) / travel);
    m.waiting = u === 0 || u === 1;
    m.prevX = m.x;
    m.prevY = m.y;
    m.x = m.x0 + (m.x1 - m.x0) * u;
    m.y = m.y0 + (m.y1 - m.y0) * u;
    m.vx = dt > 0 ? (m.x - m.prevX) / dt : 0;
    m.vy = dt > 0 ? (m.y - m.prevY) / dt : 0;
  }

  return {
    list,
    reset() {
      for (const m of list) {
        m.clock = 0;
        place(m, 0);
        m.prevX = m.x;
        m.prevY = m.y;
      }
    },
    update(dt) {
      for (const m of list) {
        m.clock += dt;
        place(m, dt);
      }
    },
  };
}
