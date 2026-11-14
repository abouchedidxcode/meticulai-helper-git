// Pure maths used by the renderer, kept free of three.js so it can be tested in Node.

/**
 * Depth of field from a real camera: focal length from the vertical field of view and the sensor height,
 * the hyperfocal distance from the f-number and a 30 micrometre circle of confusion, then the near and far
 * limits of acceptable sharpness around the focus distance.
 * @param {{ fovDeg: number, sensorHeight?: number, aperture: number, focusDistance: number, coc?: number }} o
 * @returns {{ focus: number, range: number, near: number, far: number, focalLength: number, hyperfocal: number }}
 */
export function dofFocusRange({ fovDeg, sensorHeight = 0.024, aperture, focusDistance, coc = 0.00003 }) {
  // focal length from the vertical field of view and a full-frame sensor
  const f = sensorHeight / 2 / Math.tan(((fovDeg * Math.PI) / 180) / 2);
  const N = aperture;
  const c = coc; // circle of confusion, 30 µm
  const s = Math.max(focusDistance, 0.1);
  const H = (f * f) / (N * c) + f;
  const near = (s * (H - f)) / (H + s - 2 * f);
  const far = s < H ? (s * (H - f)) / (H - s) : 1e4;
  return { focus: s, range: Math.min(far - near, 500), near, far, focalLength: f, hyperfocal: H };
}

/**
 * Dynamic resolution, one step. If frames take too long the render scale drops (down to 60 %), and it climbs
 * back when there is headroom, so a weaker GPU keeps a steady frame rate instead of the full pixel count.
 * Mutates `state` ({ scale, frameAvg, clock }) and returns true when the scale changed.
 * @param {{ scale?: number, frameAvg?: number, clock?: number }} state
 * @param {number} dt seconds since the last frame
 * @param {{ min?: number, down?: number, up?: number, slowFps?: number, fastFps?: number, every?: number }} [o]
 */
export function adaptScale(state, dt, { min = 0.6, down = 0.1, up = 0.05, slowFps = 38, fastFps = 58, every = 2 } = {}) {
  if (dt <= 0 || dt > 0.25) return false;
  state.frameAvg = state.frameAvg ? state.frameAvg * 0.95 + dt * 0.05 : dt;
  state.clock = (state.clock || 0) + dt;
  if (state.clock < every) return false;
  state.clock = 0;
  const prev = state.scale ?? 1;
  let next = prev;
  if (state.frameAvg > 1 / slowFps) next = Math.max(min, prev - down);
  else if (state.frameAvg < 1 / fastFps) next = Math.min(1, prev + up);
  state.scale = next;
  return next !== prev;
}

/**
 * The exposure the AutoExposureEffect applies for a metered average luminance (mirrors its GLSL):
 * EV = clamp(log2(key / avg), minEV, maxEV) + compensation; the image is multiplied by 2^EV.
 */
export function exposureEV(avgLuminance, { key = 0.16, minEV = -10, maxEV = 8, compensation = 0 } = {}) {
  const ev = Math.min(maxEV, Math.max(minEV, Math.log2(key / Math.max(avgLuminance, 1e-5))));
  return ev + compensation;
}

/** How far the adapted luminance moves toward the target this frame (mirrors AutoExposureEffect.update). */
export function adaptBlend(dt, speed = 1.4) {
  return 1 - Math.exp(-Math.min(dt, 0.25) * speed);
}
