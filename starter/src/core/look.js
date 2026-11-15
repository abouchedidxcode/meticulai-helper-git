// The game's colours and light, read from palette.json (in the game folder, next to helper.json).
//
// Why this exists: every colour in the game comes from here, by ROLE, so the whole game can be
// restyled by changing one small file (a "vibe" from the kit's vibes/ folder does exactly that).
//
//   import { look } from '../core/look.js';        // or ctx.look inside createGame(ctx)
//   new THREE.MeshStandardMaterial({ color: look.base[0] })
//
// The roles (use them by meaning, not by which colour you fancy):
//   look.base[0..3]   the world: [0] main ground, [1] its darker partner, [2] structures / rock /
//                     walls, [3] paths / secondary structures. Most of the screen is base.
//   look.accent[0..1] things that MATTER to the player: pickups, the goal, the thing to follow.
//                     Keep accents rare, or nothing stands out.
//   look.danger       things that hurt. Only those.
//   look.player       the player's own colour (stands out against base, differs from danger).
//   look.shadow       the dark end: undersides, far silhouettes, drop shadows, deep water.
//   look.light        the bright end: highlights, glows, sparks, foam.
//   look.ink          text and UI lines drawn over the game.
//   look.sky          { top, horizon, below, sun }  colours of the sky dome
//   look.lighting     { sun, sunStrength, ambient, ground, ambientStrength, fog, fogAmount (0..1),
//                       exposure, sunElevation (degrees above the horizon), sunAzimuth (degrees) }
//
// Everything is a '#rrggbb' string (THREE.Color accepts it). Helpers:
//   look.mix(a, b, t)      a colour between two colours
//   look.shade(c, amount)  darker (amount < 0) or lighter (amount > 0), -1..1
//   look.sunDirection()    { x, y, z } unit vector pointing TOWARD the sun
//
// A palette.json only needs "colors" and "light"; everything missing is worked out from them.
// This file has no three.js in it, so tools can read a palette the same way the game does.

// (Outside the game's build, e.g. in a Node tool, there is no palette file to find: the defaults apply.)
// Not `typeof import.meta.glob === 'function' ? ...`: Vite rewrites the glob call itself but not that test, and in
// the browser import.meta.glob is undefined, so the game would always ignore palette.json.
let found = {};
try {
  found = import.meta.glob('../../palette.json', { eager: true, import: 'default' });
} catch {
  /* a Node tool: no import.meta.glob */
}
const file = Object.values(found)[0] ?? {};

export const DEFAULT_PALETTE = {
  name: 'warm dusk',
  colors: {
    base: ['#93ad5e', '#6f8a45', '#b9957a', '#a88462'],
    accent: ['#ffc46b', '#ff7a1f'],
    shadow: '#4a3f5e',
    light: '#ffc08a',
  },
  light: { sun: '#ffc08a', ambient: '#b4c0e6', fog: '#7d6a86', exposure: 1.1 },
};

// --- small colour maths (sRGB strings in, sRGB strings out) ----------------------------------

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function toRgb(hex) {
  let h = String(hex || '').trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = Number.parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]) {
  const p = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}

export function mix(a, b, t) {
  const A = toRgb(a);
  const B = toRgb(b);
  const k = clamp01(t);
  return toHex([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]);
}

export function shade(c, amount) {
  return amount >= 0 ? mix(c, '#ffffff', amount) : mix(c, '#000000', -amount);
}

/** 0 (black) .. 1 (white), the way the eye weighs it. */
export function luminance(c) {
  const [r, g, b] = toRgb(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hueShift(c, degrees, satMul = 1, lightMul = 1) {
  const [r, g, b] = toRgb(c).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const H = (((h + degrees) % 360) + 360) % 360;
  const S = clamp01(s * satMul);
  const L = clamp01(l * lightMul);
  const C = (1 - Math.abs(2 * L - 1)) * S;
  const X = C * (1 - Math.abs(((H / 60) % 2) - 1));
  const m = L - C / 2;
  const [R, G, B] = H < 60 ? [C, X, 0] : H < 120 ? [X, C, 0] : H < 180 ? [0, C, X] : H < 240 ? [0, X, C] : H < 300 ? [X, 0, C] : [C, 0, X];
  return toHex([(R + m) * 255, (G + m) * 255, (B + m) * 255]);
}

const isHex = (v) => typeof v === 'string' && /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v.trim());
const hex = (v, fallback) => (isHex(v) ? toHex(toRgb(v)) : fallback);
const num = (v, fallback, lo = -Infinity, hi = Infinity) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** Fill every role from whatever a palette.json has. Safe on an empty object. */
export function resolvePalette(p = {}) {
  const d = DEFAULT_PALETTE;
  const c = p.colors ?? {};
  const l = p.light ?? {};
  const s = p.sky ?? {};

  const baseIn = (Array.isArray(c.base) ? c.base : []).filter(isHex);
  const b0 = hex(baseIn[0], d.colors.base[0]);
  const b2 = hex(baseIn[2], baseIn.length ? shade(hueShift(b0, 24, 0.7), 0.12) : d.colors.base[2]);
  const base = [b0, hex(baseIn[1], shade(b0, -0.22)), b2, hex(baseIn[3], shade(b2, -0.12))];

  const accIn = (Array.isArray(c.accent) ? c.accent : []).filter(isHex);
  const a0 = hex(accIn[0], d.colors.accent[0]);
  const accent = [a0, hex(accIn[1], shade(hueShift(a0, -18), -0.18))];

  const shadow = hex(c.shadow, d.colors.shadow);
  const light = hex(c.light, d.colors.light);
  const danger = hex(c.danger, '#d6336c');
  const dark = luminance(mix(base[0], shadow, 0.5)) < 0.2; // a dark game: light ink, pale player
  const player = hex(c.player, dark ? shade(light, 0.35) : mix(light, '#ffffff', 0.25));
  const ink = hex(c.ink, luminance(shadow) < 0.35 ? shade(light, 0.7) : shade(shadow, -0.6));

  const sun = hex(l.sun, light);
  const ambient = hex(l.ambient, mix(shadow, '#ffffff', 0.55));
  const fog = hex(l.fog, mix(shadow, ambient, 0.4));
  const lighting = {
    sun,
    sunStrength: num(l.sunStrength, 3, 0, 12),
    ambient,
    ground: hex(l.ground, mix(base[2], shadow, 0.45)),
    ambientStrength: num(l.ambientStrength, 1.6, 0, 8),
    fog,
    fogAmount: num(l.fogAmount, 0.5, 0, 1),
    exposure: num(l.exposure, 1.1, 0.2, 3),
    sunElevation: num(l.sunElevation, 24, -10, 90),
    sunAzimuth: num(l.sunAzimuth, 255, -360, 720),
  };
  const sky = {
    top: hex(s.top, mix(shadow, ambient, 0.25)),
    horizon: hex(s.horizon, mix(fog, sun, 0.45)),
    below: hex(s.below, shadow),
    sun: hex(s.sun, shade(sun, 0.1)),
  };
  return { name: typeof p.name === 'string' ? p.name : d.name, base, accent, danger, player, shadow, light, ink, sky, lighting, notes: p.notes ?? '' };
}

/** Unit vector pointing toward the sun, from elevation and azimuth in degrees (azimuth 0 = +z, 90 = +x). */
export function sunDirection(lighting) {
  const el = (lighting.sunElevation * Math.PI) / 180;
  const az = (lighting.sunAzimuth * Math.PI) / 180;
  return { x: Math.sin(az) * Math.cos(el), y: Math.sin(el), z: Math.cos(az) * Math.cos(el) };
}

export const look = {
  ...resolvePalette(file),
  mix,
  shade,
  luminance,
  sunDirection() {
    return sunDirection(look.lighting);
  },
};

/** Contrast between two colours, 1 (none) .. 21 (black on white). 4.5 is the least for readable text. */
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The colours of the UI cards and their text, worked out so the text is always readable. */
export function uiColors(l = look) {
  // The card is always dark (it sits over a moving picture), tinted by the palette's shadow.
  const card = mix(luminance(l.shadow) < 0.12 ? l.shadow : shade(l.shadow, -0.6), '#000000', 0.25);
  // Text: the palette's ink if it reads on the card, else the palette's light, else near-white.
  const text = [l.ink, shade(l.light, 0.6), '#f6f3ea'].find((c) => contrast(c, card) >= 7) ?? '#f6f3ea';
  const accent = contrast(l.accent[0], card) >= 3 ? l.accent[0] : shade(l.accent[0], 0.45);
  return {
    card,
    text,
    soft: mix(text, card, 0.3),
    accent,
    accentText: luminance(accent) > 0.4 ? shade(accent, -0.8) : shade(accent, 0.85),
    danger: contrast(l.danger, card) >= 3 ? l.danger : shade(l.danger, 0.4),
  };
}

/** Push the palette into the UI's CSS variables (title, HUD, end card). Called once by main.js. */
export function applyLookToUI(root = document.documentElement) {
  const st = root.style;
  const ui = uiColors(look);
  const [r, g, b] = toRgb(ui.card);
  st.setProperty('--ink', ui.text);
  st.setProperty('--ink-soft', ui.soft);
  st.setProperty('--card', `rgba(${r}, ${g}, ${b}, 0.8)`);
  st.setProperty('--accent', ui.accent);
  st.setProperty('--accent-ink', ui.accentText);
  st.setProperty('--moss', look.base[0]);
  st.setProperty('--danger', ui.danger);
  document.body.style.background = mix(ui.card, '#000000', 0.3);
}
