// The palette (from the game Rootbound, hand-tuned there). Everything pixel-art is drawn from it. Ramps run dark -> light and are hue-shifted
// the way a pixel artist would do it by hand: shadows lean cool/purple, highlights lean warm/yellow.
// Every renderer (shaders through the ramp texture, canvas sprite generators through RAMPS/hex) uses these.
// To restyle a game, edit or add ramps here (dark -> light, 2..8 entries). Ramp names become R_<NAME>/L_<NAME> in GLSL.

export const RAMPS = {
  outline: ['#120c10', '#1d1219'],
  // earth, top to bottom of the profile
  topsoil: ['#140c0f', '#22141a', '#331f1d', '#4a2e24', '#5f3d2b'],
  loam: ['#21121a', '#35201c', '#4f2f21', '#6d4428', '#8a5c35'],
  subsoil: ['#2c1519', '#46231d', '#663520', '#8a4c29', '#ab6a38'],
  clay: ['#38161c', '#5a2620', '#813b25', '#a8562e', '#c87a42'],
  sand: ['#4a3024', '#6e4b30', '#93693d', '#b98f55', '#d9b878'],
  deep: ['#1a1220', '#2a1a2c', '#3e2737', '#553742', '#6e4c50'],
  slate: ['#16151f', '#232335', '#36384f', '#51566f', '#767c96', '#a3a8bd'],
  stone: ['#2a2128', '#433639', '#62504c', '#857066', '#ab9686'],
  // things that glow underground
  water: ['#0b1a2c', '#0f3150', '#185778', '#2786a3', '#4fb8c9', '#9ae2e6', '#e8fcf8'],
  gold: ['#33190f', '#5c3012', '#8f5118', '#c27f22', '#e8ae38', '#f8d968', '#fff4b8'],
  bark: ['#2a160f', '#472716', '#6b3f22', '#946033', '#ba8a53', '#dcb882', '#f2dfb4'],
  teal: ['#0c2224', '#123f3e', '#1a6b5f', '#2aa184', '#5ed2a8', '#b4f2d4'],
  violet: ['#20122f', '#3a1f55', '#5e3486', '#8a54b4', '#b888d8', '#e4c6f2'],
  rose: ['#33121f', '#5a1f36', '#8a3552', '#bd5878', '#e88ca2', '#ffd0d8'],
  rot: ['#151410', '#24261a', '#3a3e22', '#5a5c2c'],
  // above ground
  leafSpring: ['#13281a', '#1f4425', '#356a2c', '#559033', '#81b53f', '#b8d85a', '#e6f292'],
  leafSummer: ['#0d2118', '#163a22', '#22592b', '#357a33', '#56a03c', '#8cc450', '#c8e27a'],
  leafAutumn: ['#2e1015', '#541c17', '#86301a', '#b8521e', '#de8228', '#f2b440', '#fadf7a'],
  leafDry: ['#2a2014', '#4a3a1e', '#6e5a2c', '#937e40', '#b8a45a', '#d8c880'],
  trunk: ['#1c100c', '#2f1c13', '#47291a', '#643d25', '#855734', '#a8784c'],
  birch: ['#1f1c1e', '#3e3a3a', '#6e6a66', '#a8a49c', '#d6d2c6', '#f2efe6'],
  grass: ['#122614', '#1d3f1b', '#2f6024', '#4a842d', '#73a83a', '#a8cc52', '#dceb86'],
  grassDry: ['#2a2414', '#4a3e1e', '#70602c', '#988840', '#beae5c', '#e0d488'],
  blossom: ['#8a4a60', '#c87a92', '#f0b4c4', '#fde8ee'],
  fruit: ['#3a0e14', '#6e1a1c', '#a82a22', '#d8482a', '#f27a46'],
  // sky by time of day (horizon -> zenith)
  skyDawn: ['#f4c890', '#eaa478', '#c8848a', '#8a7aa4', '#5a6aa0', '#3a4c88'],
  skyDay: ['#f2dcae', '#d8d4b8', '#aecbd6', '#86b2d8', '#5f90cc', '#4270b4'],
  skyDusk: ['#f8b864', '#e8804a', '#b85250', '#7a3a5e', '#48285a', '#261a44'],
  skyNight: ['#2a2a4c', '#1e2244', '#171c3a', '#121630', '#0e1126', '#0a0c1c'],
  cloud: ['#7a6a8a', '#a894a8', '#d8c4c4', '#f4e6d8', '#fff8ee'],
  hillsFar: ['#8a8cb0', '#a2a2c0', '#bcb8cc'],
  hillsMid: ['#55658a', '#6c7a98', '#8a92aa'],
  hillsNear: ['#2c4a4a', '#3d5e52', '#557460'],
  // interface
  ui: ['#120c10', '#2a1c1a', '#4a3226', '#7a5638', '#b8895a', '#e2c08e', '#f6e6c4'],
};

export const RAMP_ORDER = Object.keys(RAMPS);
export const RAMP_ROW = Object.fromEntries(RAMP_ORDER.map((k, i) => [k, i]));
export const RAMP_W = 8; // entries per row in the ramp texture (shorter ramps repeat their last colour)

export function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Colour from a ramp by fraction 0..1 (nearest entry), as [r, g, b] 0..255.
export function rampColor(name, t) {
  const r = RAMPS[name];
  const i = Math.max(0, Math.min(r.length - 1, Math.round(t * (r.length - 1))));
  return hexToRgb(r[i]);
}
export function rampHex(name, i) {
  const r = RAMPS[name];
  return r[Math.max(0, Math.min(r.length - 1, i))];
}

// Ramp texture data: one row per ramp, RAMP_W texels, sRGB bytes. Shaders index with (row + 0.5) / rows.
export function rampTextureData() {
  const rows = RAMP_ORDER.length;
  const data = new Uint8Array(RAMP_W * rows * 4);
  RAMP_ORDER.forEach((k, row) => {
    const r = RAMPS[k];
    for (let i = 0; i < RAMP_W; i++) {
      const [R, G, B] = hexToRgb(r[Math.min(r.length - 1, i)]);
      const o = (row * RAMP_W + i) * 4;
      data[o] = R;
      data[o + 1] = G;
      data[o + 2] = B;
      data[o + 3] = 255;
    }
  });
  return { data, width: RAMP_W, height: rows };
}

// Length of each ramp (shaders need it to quantise properly).
export const RAMP_LEN = RAMP_ORDER.map((k) => RAMPS[k].length);
