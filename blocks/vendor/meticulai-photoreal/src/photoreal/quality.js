// Graphics presets. `?q=low|medium|high|ultra` in the page URL forces one.
export const QUALITY = {
  low: {
    ssr: 0, // screen-space reflection steps (0 = off)
    maxPixelRatio: 1,
    renderScale: 0.75,
    msaa: 0,
    shadowSize: 2048,
    probeSize: 128,
    ao: { samples: 8, denoise: 4, half: true },
    dof: null,
    motionBlur: 0,
    grain: 0.035,
    aperture: 5.6,
    pom: false,
    maxAnisotropy: 4,
  },
  medium: {
    ssr: 28, // screen-space reflection steps (0 = off)
    maxPixelRatio: 1,
    renderScale: 1,
    msaa: 0,
    shadowSize: 4096,
    probeSize: 256,
    ao: { samples: 12, denoise: 8, half: true },
    dof: { bokeh: 1.5, scale: 0.5 },
    motionBlur: 8,
    grain: 0.04,
    aperture: 4,
    pom: true,
    maxAnisotropy: 8,
  },
  high: {
    ssr: 40, // screen-space reflection steps (0 = off)
    maxPixelRatio: 1.5,
    renderScale: 1,
    msaa: 4,
    shadowSize: 4096,
    probeSize: 256,
    ao: { samples: 16, denoise: 8, half: false },
    dof: { bokeh: 2, scale: 0.5 },
    motionBlur: 10,
    grain: 0.045,
    aperture: 4,
    pom: true,
    maxAnisotropy: 16,
  },
  ultra: {
    ssr: 56, // screen-space reflection steps (0 = off)
    maxPixelRatio: 2,
    renderScale: 1,
    msaa: 4,
    shadowSize: 8192,
    probeSize: 512,
    ao: { samples: 16, denoise: 12, half: false },
    dof: { bokeh: 2.5, scale: 0.75 },
    motionBlur: 14,
    grain: 0.045,
    aperture: 4,
    pom: true,
    maxAnisotropy: 16,
  },
};

// Picks a preset: `?q=` in the URL wins, phones and tablets get low, 8+ CPU cores get high, else medium.
// env lets tests (or a game's own settings screen) pass the facts in instead of reading the browser.
export function pickQuality(env = {}) {
  const search = env.search ?? (typeof location !== 'undefined' ? location.search : '');
  const forced = search && new URLSearchParams(search).get('q');
  if (forced && QUALITY[forced]) return forced;
  const ua = env.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua || '');
  if (mobile) return 'low';
  const cores = env.cores ?? ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4);
  return cores >= 8 ? 'high' : 'medium';
}
