// The styles' shared GLSL, exactly as in Kite Race (palettes, the gouache world-space brush, the palette snap, the
// light ramp, the styles' haze, the styles' skies). uStyle: 0 off, 1 miniature, 2 gouache, 3 clean.
// Distances are metres (Kite Race's city was ~4 km across); see fogDistanceScale in index.js for small scenes.
//
// Kept verbatim: only the uniforms the game declared elsewhere (uNight) are declared here, and the sky's helpers
// (n2, fbm) and uniforms live in sky.js.

/** Uniform declarations + helpers + palettes + stPalette / stBrush / stRamp / stFog. */
export const STYLE_GLSL = /* glsl */ `
uniform float uNight;
uniform float uStyle;
float stLum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 stSat(vec3 c, float s) { float l = stLum(c); return max(vec3(0.0), mix(vec3(l), c, s)); }
// nearest palette colour by chroma and value (linear rgb in, linear rgb palette)
vec3 stNearest(vec3 c, vec3 P[12], int n) {
  float best = 1e9; vec3 bc = c;
  float lc = stLum(c);
  vec3 cc = c / max(lc, 1e-3);
  for (int i = 0; i < 12; i++) {
    if (i >= n) break;
    float lp = stLum(P[i]);
    vec3 pc = P[i] / max(lp, 1e-3);
    // hue/chroma counts more than value: a dark ochre wall still reads ochre
    float d = dot(cc - pc, cc - pc) * 0.6 + pow(abs(log2(max(lc, 1e-3) / max(lp, 1e-3))), 1.0) * 0.18;
    if (d < best) { best = d; bc = P[i]; }
  }
  return bc;
}
// ---- miniature: ivory, saffron, vermilion, lapis, malachite, gold, rose sandstone, ochre, umber, leaf, pale sky
const vec3 MINI_P0 = vec3(0.86, 0.79, 0.62);  // ivory
const vec3 MINI_P1 = vec3(0.80, 0.43, 0.10);  // saffron
const vec3 MINI_P2 = vec3(0.60, 0.11, 0.06);  // vermilion
const vec3 MINI_P3 = vec3(0.09, 0.16, 0.42);  // lapis
const vec3 MINI_P4 = vec3(0.10, 0.33, 0.20);  // malachite
const vec3 MINI_P5 = vec3(0.64, 0.45, 0.2);   // soft gold (round 8: was a loud mustard)
const vec3 MINI_P6 = vec3(0.56, 0.22, 0.14);  // red sandstone (the fort, the mosque: a deep Indian red, not orange)
const vec3 MINI_P7 = vec3(0.72, 0.56, 0.38);  // buff ochre
const vec3 MINI_P8 = vec3(0.16, 0.09, 0.05);  // umber
const vec3 MINI_P9 = vec3(0.24, 0.36, 0.09);  // leaf
const vec3 MINI_P10 = vec3(0.55, 0.66, 0.74); // pale lapis wash
const vec3 MINI_P11 = vec3(0.80, 0.60, 0.52); // pink wash
// ---- gouache: earth and sky pigments, mixed only part way
const vec3 GOU_P0 = vec3(0.88, 0.76, 0.56);   // naples yellow
const vec3 GOU_P1 = vec3(0.70, 0.36, 0.20);   // burnt sienna
const vec3 GOU_P2 = vec3(0.54, 0.20, 0.13);   // venetian red
const vec3 GOU_P3 = vec3(0.24, 0.34, 0.52);   // cerulean grey
const vec3 GOU_P4 = vec3(0.24, 0.40, 0.22);   // sap green
const vec3 GOU_P5 = vec3(0.72, 0.56, 0.36);   // raw sienna
const vec3 GOU_P6 = vec3(0.80, 0.72, 0.64);   // warm white
const vec3 GOU_P7 = vec3(0.48, 0.52, 0.62);   // blue grey
const vec3 GOU_P8 = vec3(0.30, 0.22, 0.16);   // umber
const vec3 GOU_P9 = vec3(0.62, 0.44, 0.40);   // rose
float st_h(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float st_n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(st_h(i), st_h(i + vec2(1, 0)), f.x), mix(st_h(i + vec2(0, 1)), st_h(i + vec2(1, 1)), f.x), f.y); }
// gouache: paint on the world itself (world space, so it never swims as the camera moves): broken colour (patches a
// little warmer or cooler, lighter or darker) and the streaks of strokes, along the wall and slanted on the ground;
// gone by ~150 m and wherever a stroke would be smaller than a pixel
vec3 stBrush(vec3 a, vec3 wp) {
  vec3 nw = normalize(cross(dFdx(wp), dFdy(wp)));
  vec3 an = abs(nw);
  bool flat_ = an.y > max(an.x, an.z);
  vec2 uv = flat_ ? wp.xz : (an.x > an.z ? wp.zy : wp.xy);
  vec2 su = flat_ ? vec2(uv.x + uv.y, uv.y - uv.x) * 0.707 : uv;
  float d = length(wp - cameraPosition);
  float fw = max(fwidth(su.y), fwidth(su.x));
  float fade = (1.0 - smoothstep(50.0, 220.0, d));
  float strokeFade = fade * (1.0 - smoothstep(0.04, 0.12, fw));
  float p = st_n(uv * 0.3 + 3.0) * 0.65 + st_n(uv * 0.85 + 7.0) * 0.35;
  float st = st_n(vec2(su.x * 0.7, su.y * 4.0)) * 0.6 + st_n(vec2(su.x * 1.3 + 4.0, su.y * 7.0)) * 0.4;
  vec3 r = a * mix(vec3(0.9, 0.97, 1.1), vec3(1.09, 1.0, 0.86), smoothstep(0.25, 0.75, p));
  r *= 1.0 + (p - 0.5) * 0.24 * fade;
  r *= 1.0 + (smoothstep(0.2, 0.8, st) - 0.5) * 0.3 * strokeFade;
  return mix(a, r, 0.25 + 0.75 * fade);
}
vec3 stPalette(vec3 a, vec3 wp, float kind) {
  if (uStyle < 1.5) {
    vec3 P[12] = vec3[12](MINI_P0, MINI_P1, MINI_P2, MINI_P3, MINI_P4, MINI_P5, MINI_P6, MINI_P7, MINI_P8, MINI_P9, MINI_P10, MINI_P11);
    vec3 n = stNearest(a, P, 12);
    // a flat field of the pigment, keeping a little of the value so neighbouring houses still part
    float k = kind > 1.5 && kind < 2.5 ? 0.35 : kind > 3.5 ? 0.12 : 0.72;
    vec3 r = mix(a, n * mix(1.0, stLum(a) / max(stLum(n), 1e-3), 0.3), k);
    return stSat(r, 1.02);
  }
  if (uStyle < 2.5) {
    vec3 P[12] = vec3[12](GOU_P0, GOU_P1, GOU_P2, GOU_P3, GOU_P4, GOU_P5, GOU_P6, GOU_P7, GOU_P8, GOU_P9, GOU_P0, GOU_P0);
    vec3 n = stNearest(a, P, 10);
    vec3 r = mix(a, n * mix(1.0, stLum(a) / max(stLum(n), 1e-3), 0.6), kind > 1.5 && kind < 2.5 ? 0.15 : 0.3);
    // the paved ground a warm earth, not a grey (the lanes read as sunlit dust)
    if (kind > 3.5) r *= vec3(1.08, 0.98, 0.84);
    return stSat(r, 1.1);
  }
  // clean: pastel, lighter, gently desaturated; a gradient by height (darker and cooler at the foot of a wall, warm
  // and pale at the top), the look of a lit model rather than a painted texture
  if (kind > 1.5 && kind < 2.5) return stSat(a, 1.1);
  vec3 r = stSat(a, 1.05);
  r = mix(r, vec3(0.95, 0.86, 0.76), 0.12);
  if (kind < 0.5 || kind > 2.5) {
    float h = clamp(wp.y / 26.0, 0.0, 1.0);
    r *= mix(vec3(0.74, 0.76, 0.86), vec3(1.08, 1.04, 0.98), smoothstep(0.0, 1.0, h));
  }
  return r;
}
// the share of the direct light a face gets for its N.L (the irradiance factor, replacing N.L itself)
float stRamp(float ndl, float kind) {
  ndl = max(ndl, 0.0);
  if (kind > 1.5 && kind < 2.5) return 0.72 * smoothstep(0.0, 0.05, ndl) + 0.08;   // people: flat
  if (uStyle < 1.5) return 0.62 * smoothstep(0.0, 0.08, ndl) + 0.38 * smoothstep(0.1, 0.65, ndl);  // miniature: gentle
  if (uStyle < 2.5) return smoothstep(-0.05, 0.75, ndl);                                          // gouache: soft wrap
  return 0.78 * smoothstep(0.02, 0.09, ndl) + 0.22 * smoothstep(0.35, 0.6, ndl);                    // clean: toon, 2 steps
}
// the style's haze: col = the lit surface, fc = the haze colour, a = how much haze (rgb), dist = metres from the eye
vec3 stFog(vec3 col, vec3 fc, vec3 a, float dist, vec3 rd) {
  float am = dot(a, vec3(0.333));
  if (uStyle < 1.5) {
    // miniature: painters lay the distance in paler washes, not haze: a gentle lift toward the sky's pale band
    // (round 8: lighter and paler by distance, as the far hills of a miniature are laid in thinner, lighter washes;
    // the near ~100 m untouched)
    float k = smoothstep(90.0, 1100.0, dist);
    vec3 wash = mix(fc, vec3(0.86, 0.83, 0.74), 0.6);
    wash = mix(wash, vec3(0.16, 0.2, 0.36), uNight * 0.85);
    return mix(col, wash, clamp(am * 0.55 + k * 0.5, 0.0, 1.0));
  }
  if (uStyle < 2.5) {
    // gouache: the lane you fly down stays clear (the first ~120 m keep their colour); beyond, the distance melts into
    // the sky in layers of thinner, cooler paint
    float k = smoothstep(180.0, 1400.0, dist);
    float nearClear = mix(0.35, 1.0, smoothstep(60.0, 380.0, dist));
    vec3 far = mix(fc, fc * vec3(0.9, 0.97, 1.1), 0.6);
    return mix(col, far, clamp(am * nearClear + k * 0.45, 0.0, 1.0));
  }
  // clean: layered pastel fog: the haze steps in soft bands by distance (silhouettes stack like stage flats) and
  // turns from peach to lilac with distance
  float L = am * 1.2 + smoothstep(60.0, 1600.0, dist) * 0.5;
  float q = L * 5.0;
  L = (floor(q) + smoothstep(0.42, 0.58, fract(q))) / 5.0;
  vec3 tint = mix(vec3(1.02, 0.94, 0.92), vec3(0.88, 0.88, 1.04), smoothstep(150.0, 1600.0, dist));
  vec3 fcol = mix(fc * tint, fc, uNight);
  return mix(col, fcol, clamp(L, 0.0, 1.0));
}
`;

/**
 * The light-loop line that applies the style's light ramp: the direct light is scaled so N.L becomes the style's ramp.
 * Inserted after each directional (and, in this block, point and spot) light's info in lights_fragment_begin.
 */
export const STYLE_RAMP = /* glsl */ `
if (uStyle > 0.5) { float stNdl = dot(geometryNormal, directLight.direction); directLight.color *= stRamp(stNdl, float(ST_KIND)) / max(stNdl, 0.04); }`;

/**
 * The styles' skies (stSky(rd, col0)): by day each style paints its own, at night (uNight) a painted night shows.
 * Needs uSunDir, uHorizon, uZenith, uSunGlow, uCloudLit, uCloudCover, uTime, uNight, n2(), fbm() (sky.js has them).
 */
export const STYLE_SKY = /* glsl */ `
// the painted night (miniature and gouache): a deep lapis vault, a warm lamp-glow over the city at the horizon, gold
// stars (few, round, a little glow), a flat ivory moon with a soft ring
vec3 stNightSky(vec3 rd, vec3 col0) {
  float y = max(rd.y, 0.0);
  float s = max(dot(rd, uSunDir), 0.0);
  vec3 c = mix(vec3(0.075, 0.09, 0.22), vec3(0.016, 0.026, 0.1), smoothstep(0.0, 0.55, pow(y, 0.7)));
  c += vec3(0.16, 0.08, 0.03) * (1.0 - smoothstep(0.0, 0.1, y));
  if (rd.y > 0.0) {
    vec3 q = rd * 50.0;
    vec3 iq = floor(q), fq = fract(q) - 0.5;
    float h = fract(sin(dot(iq, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    vec3 off = (vec3(fract(h * 13.1), fract(h * 71.7), fract(h * 29.3)) - 0.5) * 0.5;
    float d = length(fq - off);
    float r = 0.07 + 0.07 * fract(h * 5.3);
    float st = step(0.955, h) * (smoothstep(r, r * 0.4, d) + 0.25 * smoothstep(r * 3.0, 0.0, d));
    st *= smoothstep(0.04, 0.2, rd.y);
    c += mix(vec3(1.0, 0.78, 0.38), vec3(1.0, 0.92, 0.7), fract(h * 3.7)) * st * 0.9;
  }
  float moon = smoothstep(0.99955, 0.99965, s);
  c = mix(c, vec3(0.95, 0.9, 0.76), moon);
  c += vec3(0.2, 0.22, 0.32) * (pow(s, 600.0) * 0.5 + pow(s, 60.0) * 0.12) * (1.0 - moon);
  return c;
}
vec3 stSky(vec3 rd, vec3 col0) {
  if (uStyle < 0.5) return col0;
  float y = max(rd.y, 0.0);
  float s = max(dot(rd, uSunDir), 0.0);
  vec3 col = col0;
  if (uStyle < 1.5) {
    // miniature: a pale flat wash that deepens to lapis only high up; stylised curling clouds: flat ivory shapes
    // with a gold-brown edge and curls drawn inside them as contour lines
    col = mix(uHorizon * vec3(1.02, 0.99, 0.94), uZenith, smoothstep(0.0, 0.6, pow(y, 0.7)));
    col += uSunGlow * (pow(s, 6.0) * 0.22 + pow(s, 60.0) * 0.4);
    if (rd.y > 0.0) {
      vec2 uv = rd.xz / (rd.y + 0.12) * 0.9 * vec2(0.55, 1.0) + vec2(uTime * 0.003, 0.0);
      float a = fbm(uv * 0.35 + 3.0) * 6.2832;
      vec2 w = uv + 0.55 * vec2(cos(a), sin(a));
      float c = fbm(w * 0.8);
      float t = 0.86 - uCloudCover * 0.5;
      float band = smoothstep(0.03, 0.09, rd.y) * (1.0 - smoothstep(0.3, 0.6, rd.y));
      c = c * mix(0.55, 1.08, band);
      float fill = smoothstep(t, t + 0.012, c);
      float edge = (smoothstep(t - 0.022, t - 0.004, c)) * (1.0 - fill);
      float lines = (1.0 - smoothstep(0.0, 0.12, abs(fract((c - t) * 16.0) - 0.5) * 2.0 - 0.8)) * smoothstep(t + 0.02, t + 0.05, c);
      vec3 cc = vec3(0.98, 0.95, 0.88) * (0.97 + 0.06 * pow(s, 3.0));
      cc = mix(cc, vec3(0.82, 0.62, 0.32), lines * 0.45);
      col = mix(col, cc, fill);
      col = mix(col, vec3(0.6, 0.4, 0.16), edge * 0.8);
    }
    // the sun as a painter draws it: a flat gold disc in a scalloped vermilion-gold corona, a fine ink rim
    {
      float sd = acos(clamp(dot(rd, uSunDir), -1.0, 1.0));
      if (sd < 0.08) {
        vec3 t1 = normalize(cross(uSunDir, vec3(0.0, 1.0, 0.0)) + 1e-4), t2 = cross(t1, uSunDir);
        float ang = atan(dot(rd, t2), dot(rd, t1));
        float aa = fwidth(sd) * 1.2;
        float disc = 1.0 - smoothstep(0.02 - aa, 0.02 + aa, sd);
        float rim = 1.0 - smoothstep(0.0, aa * 1.2, abs(sd - 0.0205));
        float rr = 0.029 + 0.009 * pow(0.5 + 0.5 * cos(ang * 14.0), 1.5);
        float corona = (1.0 - smoothstep(rr - aa, rr + aa, sd)) * (1.0 - disc);
        float cRim = (1.0 - smoothstep(0.0, aa * 1.2, abs(sd - rr))) * step(0.021, sd);
        col = mix(col, vec3(0.95, 0.55, 0.2), corona * 0.85);
        col = mix(col, vec3(1.0, 0.82, 0.36), disc);
        col = mix(col, vec3(0.5, 0.26, 0.08), max(rim, cRim) * 0.7);
      }
    }
  } else if (uStyle < 2.5) {
    // gouache: a picture-book sky: deep blue overhead, a warm glow low toward the sun, and a bank of big soft
    // cumulus over the horizon, lit on the sun's side and cool lilac underneath (the brush pass paints the edges)
    col = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, pow(y, 0.75)));
    col += uSunGlow * (pow(s, 5.0) * 0.35 + pow(s, 40.0) * 0.5) * (1.0 - uNight);
    if (rd.y > 0.0) {
      // big cumulus heaped over the horizon, thinning upward: flat painted shapes with lit tops (warm, toward the
      // sun brightest) and lilac-grey undersides, a soft wet edge
      vec2 uv = rd.xz / (rd.y + 0.16) * 0.62 * vec2(0.75, 1.0) + vec2(uTime * 0.003, 0.0);
      float band = smoothstep(0.0, 0.05, rd.y) * (1.0 - smoothstep(0.3, 0.62, rd.y));
      float c = fbm(uv * 0.5 + 11.0) * mix(0.62, 1.13, band);
      float th = 0.66 - uCloudCover * 0.2;
      float cov = smoothstep(th, th + 0.03, c);
      if (cov > 0.0) {
        // what is above this point: clear above = the cloud's lit top; deep inside = its shade
        vec3 ru = normalize(rd + vec3(0.0, 0.045, 0.0));
        vec2 uu = ru.xz / (ru.y + 0.16) * 0.62 * vec2(0.75, 1.0) + vec2(uTime * 0.003, 0.0);
        float bu = smoothstep(0.0, 0.05, ru.y) * (1.0 - smoothstep(0.3, 0.62, ru.y));
        float cu = fbm(uu * 0.5 + 11.0) * mix(0.62, 1.13, bu);
        float lit = 1.0 - smoothstep(th - 0.05, th + 0.09, cu);
        lit = clamp(lit * 0.8 + 0.25 + pow(s, 3.0) * 0.35, 0.0, 1.0);
        vec3 shade = mix(uZenith, vec3(0.8, 0.72, 0.84), 0.65) * 0.96;
        vec3 cc = mix(shade, mix(uCloudLit, uSunGlow, 0.3) * 1.06, smoothstep(0.25, 0.75, lit));
        // a wet edge: a touch darker just inside the rim
        cc *= 1.0 - 0.07 * (1.0 - smoothstep(th + 0.01, th + 0.05, c));
        col = mix(col, cc, cov);
      }
    }
  } else {
    // clean: one big smooth gradient, a wide soft sun glow, a few flat pastel clouds with soft edges
    col = mix(uHorizon, uZenith, smoothstep(0.0, 0.7, pow(y, 0.6)));
    col += uSunGlow * (pow(s, 4.0) * 0.3 + pow(s, 24.0) * 0.35) + uSunGlow * smoothstep(0.99955, 0.9997, s) * 1.6;
    if (rd.y > 0.0) {
      vec2 uv = rd.xz / (rd.y + 0.05) * vec2(0.12, 1.4) + vec2(uTime * 0.002, 0.0);
      float c = n2(uv * 1.1) * 0.6 + n2(uv * 2.7 + 5.0) * 0.4;
      float cov = smoothstep(0.66, 0.7, c) * smoothstep(0.03, 0.08, rd.y) * (1.0 - smoothstep(0.18, 0.4, rd.y));
      col = mix(col, mix(uCloudLit, uHorizon, 0.3) * 1.04, cov * 0.7);
    }
  }
  return mix(col, uStyle < 2.5 ? stNightSky(rd, col0) : col0, uNight);
}
`;
