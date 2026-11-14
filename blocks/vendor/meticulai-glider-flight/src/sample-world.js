// A small example world for the glider (pure maths, no three.js): a launch hill in the west, a ridge facing the
// breeze, a lake to cross and a landing field in the east, with four thermals on the line between them.
// The demo draws it, the tests and tools/sim.mjs fly over it. Replace it with your own world object:
//   { heightAt(x, z), wind: { x, z }, thermals: [...], seaLevel, landing: { x, z, ground }, launch: { x, y, z, heading } }
// Units are metres; heading is degrees (0 = -Z, 90 = +X: east).
import { noise2, smoothstep } from './util.js';

const gauss = (d, w) => Math.exp(-(d * d) / (w * w));

export function createSampleWorld() {
  const LAKE = { x: 1450, z: 60, rx: 380, rz: 760 };
  const heightAt = (x, z) => {
    // rolling farmland
    let h = 14 + (noise2(x * 0.004, z * 0.004, 3) - 0.5) * 30 + (noise2(x * 0.013, z * 0.013, 4) - 0.5) * 8;
    // the launch hill, steepest on its east face (into the breeze)
    h += 175 * gauss(Math.hypot((x + 120) * (x > -120 ? 1.25 : 0.8), z), 260);
    // a long ridge across the line
    h += 120 * gauss(x - 760, 130) * (1 - smoothstep(500, 1200, Math.abs(z - 200))) * (0.85 + 0.3 * noise2(z * 0.006, 1, 7));
    // a lake: the ground dips under the water
    const e = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
    h = h + (-12 - h) * (1 - smoothstep(0.82, 1.0, e));
    // a flat field to land on
    const f = Math.hypot((x - 2600) / 220, (z + 40) / 160);
    h = h + (8 - h) * (1 - smoothstep(0.8, 1.2, f));
    return h;
  };
  return {
    heightAt,
    seaLevel: 0,
    wind: { x: -2.2, z: 0.4 }, // a light easterly breeze (m/s): the launch hill's east face and the ridge's east face are windward
    // id, centre, radius (m), strength (m/s up in the core), top (m); low: works from just above water or ground
    thermals: [
      { id: 'hill', x: 330, z: -120, r: 85, strength: 10.5, top: 212 },
      { id: 'ridge', x: 980, z: 330, r: 80, strength: 8.5, top: 190 },
      { id: 'lake', x: 1690, z: -40, r: 80, strength: 9.0, top: 95, low: true },
      { id: 'field', x: 2050, z: -250, r: 60, strength: 4.0, top: 120 },
    ],
    warmthAt: (x, z) => 0.3 + 0.4 * noise2(x * 0.003, z * 0.003, 11), // fields warm unevenly
    launch: { x: -40, y: heightAt(-40, 0) + 2.5, z: 0, heading: 90 },
    landing: { x: 2600, z: -40, ground: 8 },
    lake: LAKE,
  };
}

/** The autopilot's route over the sample world: up the hill thermal, over the ridge, a skim across the lake into the
 * low thermal on the far side, and a landing on the field. */
export const SAMPLE_ROUTE = [
  { do: 'dive', secs: 1.4 },
  { do: 'climb', thermal: 'hill', alt: 205 },
  { do: 'goto', x: 980, z: 330, within: 60, alt: 175, slope: 0.1 },
  { do: 'climb', thermal: 'ridge', alt: 185 },
  { do: 'goto', x: 1690, z: -40, within: 45, alt: 4, slope: 0.145, lead: 230, skim: true },
  { do: 'climb', thermal: 'lake', alt: 60 },
  { do: 'land' },
];
