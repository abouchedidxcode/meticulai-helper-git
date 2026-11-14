// A pond outline: a soft rounded rectangle with a wobbly shore (the game's pond shape), in GLSL for the simulation
// and the water, and in JS for your gameplay (is this point in the water? how deep?).
// From the game Koi by Meticulai (meticulai.com). MIT licence.

/**
 * @param {{ hw?: number, hh?: number, maxDepth?: number, cx?: number, cz?: number }} [o] half width (x), half depth
 *   (z), deepest point (m), centre. The game: 8.5 x 5.2, 1.5 m deep.
 */
export function pondShore({ hw = 8.5, hh = 5.2, maxDepth = 1.5, cx = 0, cz = 0 } = {}) {
  const k = Math.min(hw, hh) * 1.1;
  /** signed distance (approximate, m) to the shore: negative in the water, positive on the bank */
  const sdf = (x, z) => {
    x -= cx; z -= cz;
    const ax = Math.abs(x) / hw, az = Math.abs(z) / hh;
    const r = Math.pow(Math.pow(ax, 3.2) + Math.pow(az, 3.2), 1 / 3.2);
    const a = Math.atan2(z, x);
    const wob = 0.055 * Math.sin(a * 3 + 1.1) + 0.035 * Math.sin(a * 5 + 2.3) + 0.02 * Math.sin(a * 9 + 0.4);
    return (r - 1 - wob) * k;
  };
  /** water depth (positive, below the surface) at a point in the water; 0 on the bank */
  const depthAt = (x, z) => {
    const d = -sdf(x, z);
    if (d <= 0) return 0;
    const bowl = 1 - Math.exp(-d / 1.3);
    return 0.08 + bowl * (maxDepth - 0.08) + 0.08 * Math.sin(x * 0.7 + z * 0.4) * bowl;
  };
  const glsl = /* glsl */ `
float shoreSdf(vec2 p) {
  p -= vec2(${cx.toFixed(4)}, ${cz.toFixed(4)});
  vec2 a = abs(p) / vec2(${hw.toFixed(4)}, ${hh.toFixed(4)});
  float r = pow(pow(a.x, 3.2) + pow(a.y, 3.2), 1.0 / 3.2);
  float ang = atan(p.y, p.x);
  float wob = 0.055 * sin(ang * 3.0 + 1.1) + 0.035 * sin(ang * 5.0 + 2.3) + 0.02 * sin(ang * 9.0 + 0.4);
  return (r - 1.0 - wob) * ${k.toFixed(4)};
}`;
  /** the rectangle to simulate: the pond plus a margin (the game's: 19.2 x 12.4 for an 17 x 10.4 pond) */
  const rect = { x0: cx - hw - 1.1, x1: cx + hw + 1.1, z0: cz - hh - 1.0, z1: cz + hh + 1.0 };
  return { sdf, depthAt, glsl, rect, hw, hh, maxDepth };
}
