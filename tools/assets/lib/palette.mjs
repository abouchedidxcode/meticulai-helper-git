// Colours: my-game/palette.json, hex <-> rgb, sRGB <-> linear (glTF stores colours linear), nearest colour in OKLab,
// a small k-means for pulling a palette out of a picture, and plain colour names.
import fs from 'node:fs';
import path from 'node:path';
import { HelperError } from '../../lib/log.mjs';
import { pretty } from '../../lib/paths.mjs';

/**
 * palette.json, the shape the tools read (extra keys are kept and ignored):
 * {
 *   "colors": { "base": ["#93ad5e", ...], "accent": [...], "shadow": "#4a3f5e", "light": "#ffc08a" }
 *     or a flat list: ["#2f3e46", { "hex": "#84a98c", "name": "sage", "use": "grass" }, ...]   (also "colours" / "palette")
 *   "light": { "background": "#cfd8dc", "fog": "#cfd8dc", "fogNear": 30, "fogFar": 160,
 *              "sun": "#fff1d6", "sunIntensity": 2.5, "ambient": "#8fa3b8", "ambientIntensity": 0.8,
 *              "toneMapping": "aces" | "agx" | "neutral" | "none", "exposure": 1.0 }
 * }
 */
export function readPalette(file) {
  if (!file || !fs.existsSync(file)) return null;
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    throw new HelperError(`${pretty(file)} is not valid JSON (${e.message}).`, 'Ask your agent to fix palette.json (a comma or quote is probably missing).', e);
  }
  const src = Array.isArray(j) ? j : (j.colors || j.colours || j.palette || []);
  // a flat list, or groups: { "base": [...], "accent": [...], "shadow": "#..", "light": "#.." }
  const list = Array.isArray(src) ? src
    : Object.entries(src).flatMap(([group, v]) => (Array.isArray(v) ? v : [v]).map((c) => (typeof c === 'string' ? { hex: c, use: group } : { use: group, ...c })));
  const seen = new Set();
  const colors = list.map((c) => {
    const hex = typeof c === 'string' ? c : (c.hex || c.color || c.colour);
    const rgb = hexToRgb(hex);
    if (!rgb || seen.has(rgbToHex(rgb))) return null;
    seen.add(rgbToHex(rgb));
    return { hex: rgbToHex(rgb), rgb, name: (typeof c === 'object' && c.name) || colourName(rgb), use: (typeof c === 'object' && (c.use || c.for)) || '' };
  }).filter(Boolean).map((c, i) => ({ ...c, index: i + 1 }));
  const light = (!Array.isArray(j) && (j.light || j.lighting)) || {};
  // colours for surfaces (recolouring): leave out the light/shadow/sky/fog colours when there are others
  const surf = colors.filter((c) => !/^(light|shadow|sky|fog|sun|ambient|background)$/i.test(c.use));
  return { file, colors, materialColors: surf.length ? surf : colors, light, raw: j };
}

/** The game's palette file: --palette, else my-game/palette.json. */
export function gamePalettePath(gameDir, opt) {
  if (opt) return path.resolve(opt);
  return path.join(gameDir, 'palette.json');
}

export function hexToRgb(h) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h || '').trim());
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
export const rgbToHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

export const srgbToLinear = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const linearToSrgb = (v) => { v = Math.max(0, Math.min(1, v)); return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055); };
export const rgbToLinear = (c) => c.map(srgbToLinear);
export const linearToRgb = (c) => c.map(linearToSrgb);

/** OKLab of an sRGB colour (0..255). */
export function oklab(rgb) {
  const [r, g, b] = rgbToLinear(rgb);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
/** Perceptual distance; hue and colourfulness count more than lightness, so a dark brown texture maps to the
 *  palette's brown rather than to a dark purple of the same lightness. */
export function colourDistance(a, b) {
  const A = oklab(a), B = oklab(b);
  return Math.hypot(0.6 * (A[0] - B[0]), 1.6 * (A[1] - B[1]), 1.6 * (A[2] - B[2]));
}
/** Nearest palette entry to an sRGB colour. */
export function nearest(rgb, colors) {
  let best = null, bd = Infinity;
  for (const c of colors) { const d = colourDistance(rgb, c.rgb); if (d < bd) { bd = d; best = c; } }
  return best;
}

const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
export function hsv([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: mx ? (d / mx) * 100 : 0, v: mx / 2.55 };
}

/** "dark green", "light grey", "brown"... */
export function colourName(rgb) {
  const { h, s, v } = hsv(rgb);
  const tone = v < 18 ? 'very dark ' : v < 40 ? 'dark ' : v > 85 && s < 35 ? 'pale ' : '';
  if (s < 12) return v < 12 ? 'black' : v > 90 ? 'white' : `${tone}grey`.replace('pale grey', 'light grey');
  const names = [[15, 'red'], [40, 'orange'], [65, 'yellow'], [85, 'yellow-green'], [160, 'green'], [190, 'teal'], [250, 'blue'], [280, 'purple'], [330, 'pink'], [360, 'red']];
  let n = names.find(([lim]) => h < lim)[1];
  if ((n === 'orange' && v < 55) || ((n === 'red' || n === 'orange') && v < 60 && s < 65)) n = 'brown';
  return s < 30 ? `${tone}greyish ${n}` : `${tone}${n}`;
}

/** k-means on [r,g,b] pixels, deterministic start spread across brightness. Returns [{ rgb, share }] biggest first. */
export function kmeans(px, k = 8) {
  if (!px.length) return [];
  const byL = [...px].sort((a, b) => luma(a) - luma(b));
  let cent = Array.from({ length: k }, (_, i) => [...byL[Math.floor(((i + 0.5) / k) * byL.length)]]);
  const label = new Int32Array(px.length);
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  for (let it = 0; it < 24; it++) {
    let moved = 0;
    for (let i = 0; i < px.length; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { const d = d2(px[i], cent[c]); if (d < bd) { bd = d; best = c; } }
      if (label[i] !== best) { moved++; label[i] = best; }
    }
    const sum = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < px.length; i++) { const s = sum[label[i]]; s[0] += px[i][0]; s[1] += px[i][1]; s[2] += px[i][2]; s[3]++; }
    cent = cent.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c));
    if (!moved && it) break;
  }
  const count = new Array(k).fill(0);
  for (let i = 0; i < px.length; i++) count[label[i]]++;
  return cent.map((c, j) => ({ rgb: c.map(Math.round), share: count[j] / px.length })).filter((c) => c.share > 0).sort((a, b) => b.share - a.share);
}

export { luma };
