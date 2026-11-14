// Helpers for replays, rollback and desync checks: hash the exact bits of every marble, and copy bodies.

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);
const FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz'];

/**
 * 32-bit FNV-1a hash over the exact float bits of each body's position and velocity (and its `active` flag).
 * Two machines that ran the same inputs must print the same hash; if not, they have drifted apart.
 * @param {Array<object>} bodies
 * @returns {string} 8 hex digits
 */
export function stateHash(bodies) {
  let h = 0x811c9dc5;
  const mix = (w) => {
    for (let k = 0; k < 4; k++) {
      h ^= (w >>> (k * 8)) & 0xff;
      h = Math.imul(h, 0x01000193);
    }
  };
  for (const b of bodies) {
    mix(b.active ? 1 : 0);
    for (const f of FIELDS) {
      f64[0] = b[f];
      mix(u32[0]);
      mix(u32[1]);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** A plain copy of a body (every field). Use it to snapshot state for rollback or a replay checkpoint. */
export function copyBody(b) {
  return { ...b };
}

/** Writes a snapshot made by copyBody back into a live body object. */
export function restoreBody(dst, snap) {
  Object.assign(dst, snap);
  return dst;
}
