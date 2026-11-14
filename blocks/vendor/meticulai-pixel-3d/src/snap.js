// Pure maths for the pixel view (no three.js, so node tests can check it).
// Art pixels are square and crisp because: the target is (screen / k) art pixels, k = device px per art px is an
// integer, the camera is snapped to whole art pixels, and the left-over fraction is applied in the final blit.

/** Rootbound's numbers. */
export const PPU = 12; // art pixels per world unit
export const ZOOMS = [1, 2, 3, 4, 5, 6]; // CSS pixels per art pixel
export const FOLLOW_RATE = 8; // camera easing: 1 - exp(-dt * 8) per step
export const SHAKE_DECAY = 2; // shake units lost per second
export const SHAKE_PX = 3; // art pixels of horizontal jitter at shake = 1

/** Device pixels per art pixel for a zoom level (always a whole number >= 1). */
export function pixelScale(zoom, dpr = 1) {
  return Math.max(1, Math.round(zoom * dpr));
}

/**
 * Size of the art-resolution target for a drawing buffer of dw x dh device pixels.
 * Two spare art pixels each way so the sub-pixel shift never shows an edge; rounded up to even sizes so the
 * frustum's pixel edges sit exactly on the art grid (sprites then land 1:1 on art pixels).
 * @returns {{ k: number, tw: number, th: number, visW: number, visH: number }}
 */
export function artTarget(dw, dh, zoom, dpr = 1) {
  const k = pixelScale(zoom, dpr);
  const even = (n) => n + (n & 1);
  const tw = even(Math.ceil(dw / k) + 2);
  const th = even(Math.ceil(dh / k) + 2);
  return { k, tw, th, visW: dw / k, visH: dh / k };
}

/** Zoom level whose visible height (world units) is closest to h. */
export function zoomFor(h, dh, { zooms = ZOOMS, ppu = PPU, dpr = 1, current = zooms[0] } = {}) {
  let best = current;
  let bd = 1e9;
  for (const z of zooms) {
    const vh = dh / pixelScale(z, dpr) / ppu;
    const d = Math.abs(Math.log(vh / h));
    if (d < bd) {
      bd = d;
      best = z;
    }
  }
  return best;
}

/**
 * Snap a camera coordinate pair (in the camera's own right/up axes, world units) to whole art pixels.
 * Returns the snapped origin (ox, oy) and the fraction of an art pixel left over (fx, fy in 0..1).
 */
export function snapToGrid(x, y, ppu = PPU) {
  const pxX = Math.floor(x * ppu);
  const pxY = Math.floor(y * ppu);
  return { pxX, pxY, ox: pxX / ppu, oy: pxY / ppu, fx: x * ppu - pxX, fy: y * ppu - pxY };
}

/**
 * Blit uniforms: which part of the target the screen shows (scale) and where it starts (offset), in target UV.
 * The screen covers visW x visH art pixels of the tw x th target, centred, shifted by the sub-pixel remainder.
 */
export function blitWindow(tw, th, visW, visH, fx, fy) {
  return {
    scaleX: visW / tw,
    scaleY: visH / th,
    offsetX: (tw - visW) / 2 / tw + fx / tw,
    offsetY: (th - visH) / 2 / th + fy / th,
  };
}

/** Frame-rate independent easing factor toward a goal. */
export function followFactor(dt, rate = FOLLOW_RATE) {
  return 1 - Math.exp(-dt * rate);
}

/**
 * Where a world anchor lands so a sprite's pixels sit exactly on art pixels.
 * u, v: the anchor in the camera's right/up axes (world units); (ax, ay): anchor in canvas pixels from the top-left;
 * (w, h): canvas size. Returns the sprite quad centre in the same axes.
 */
export function snapSprite(u, v, ax, ay, w, h, ppu = PPU) {
  const left = Math.round(u * ppu - ax);
  const top = Math.round(v * ppu + ay);
  return { u: (left + w / 2) / ppu, v: (top - h / 2) / ppu, left, top };
}
