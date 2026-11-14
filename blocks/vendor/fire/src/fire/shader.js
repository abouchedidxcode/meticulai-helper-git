// The fire, all shader math: a raymarched flame and smoke volume, GPU embers and a flicker curve. No textures, no
// sprites. Everything is a function of phase = t / LOOP, so phase 0 and phase 1 are the same frame.

export const LOOP = 16;

const TAU = Math.PI * 2;

// Integer harmonics only, so it's periodic in phase. Top harmonic is about 3 Hz, no strobing.
export function flicker(phase) {
  const s = (k, a) => Math.sin(TAU * k * phase + a);
  return 1 + 0.075 * s(5, 0.6) + 0.06 * s(13, 2.1) + 0.04 * s(29, 4.4) + 0.025 * s(47, 1.3);
}

// How far the wind pushes something sideways at height y, per metre of wind. Used by the flame and the embers.
export const windBend = (y) => y * (0.2 + 0.3 * y);

// The volume in "flame space": base at the origin, about 1.9 m tall, +Y up. uFireA and uFireB map the fire's local
// metres into it, so one set of tuned numbers makes every type.
export const fireGLSL = /* glsl */ `
const float F_TAU = 6.28318531;

uniform vec4 uFireA;     // width, height, spread of the tongues, heat (-1 cold to 1 roaring)
uniform vec4 uFireB;     // wind x, wind z, smoke, top of the volume
uniform vec3 uFireBound; // centre x, centre z, radius of a cylinder holding the bent volume
uniform float uFirePx;   // how wide a fire pixel is, per metre away
uniform vec4 uFireC;     // held to an object: 0 or 1, the radius it keeps to, the height it keeps to it, how much it widens going up
uniform vec4 uFireD;     // the object's footprint, half width and half depth; tongues repeating along x every so far; calm, 0 to 1
uniform vec4 uFireE;     // licks climbing the object, 0 to 1; gas blue; blue at the foot; soot in the smoke
uniform float uFireG;    // the body's width above an object, against the radius
uniform vec4 uFireH;     // kept inside a stack or box: how far apart its rows are (0 for not), where the rows open on its x and z faces, how far flames push out of them
uniform vec4 uFuelA[6];  // the fuel it attaches to: one end of each piece and its radius, in flame space
uniform vec4 uFuelB[6];  // the other end
uniform int uFuelN;

// Five tongues, computed once per ray. a = base x, base z, radius, height. b = sway x, sway z, pulse
// phase, pulse frequency along v.
struct FireState { vec4 a[5]; vec4 b[5]; float phase; float fl; float spread; vec2 s1; vec2 s2; vec2 s3; };

// How close to the nearest piece of fuel: positive on it. Flames rise off the top of a log and hardly reach under it,
// so the distance is stretched above and squeezed below.
float fFuel(vec3 q) {
  float best = -1e3;
  for (int i = 0; i < uFuelN; i++) {
    vec3 a = uFuelA[i].xyz, ab = uFuelB[i].xyz - a;
    float k = clamp(dot(q - a, ab) / dot(ab, ab), 0.0, 1.0);
    vec3 d = q - (a + ab * k);
    d.y *= d.y > 0.0 ? 0.5 : 1.7;
    // none off the very ends of a piece, which would hang out beside it as round lumps
    best = max(best, (uFuelA[i].w + 0.03) * smoothstep(0.0, 0.16, k) * smoothstep(1.0, 0.84, k) - length(d));
  }
  return best;
}

// How far outside the object's footprint, in flame space: a rectangle, a line or, with no extent, a point
float fFoot(vec2 xz) { return length(max(abs(xz) - uFireD.xy, 0.0)); }

uvec3 fPcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}

vec3 fGrad(float x, float y, float z) {
  uvec3 h = fPcg3d(uvec3(ivec3(int(x), int(y), int(z))));
  return vec3(h >> 16u) / 32767.5 - 1.0;
}

// Gradient noise whose lattice wraps every P cells in y. Scrolling by exactly P per loop is seamless.
float fNoise(vec3 p, float P) {
  vec3 i = floor(p), f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float y0 = mod(i.y, P), y1 = mod(i.y + 1.0, P);
  float x1 = i.x + 1.0, z1 = i.z + 1.0;
  float a = dot(fGrad(i.x, y0, i.z), f);
  float b = dot(fGrad(x1, y0, i.z), f - vec3(1, 0, 0));
  float c = dot(fGrad(i.x, y1, i.z), f - vec3(0, 1, 0));
  float d = dot(fGrad(x1, y1, i.z), f - vec3(1, 1, 0));
  float e = dot(fGrad(i.x, y0, z1), f - vec3(0, 0, 1));
  float g = dot(fGrad(x1, y0, z1), f - vec3(1, 0, 1));
  float h = dot(fGrad(i.x, y1, z1), f - vec3(0, 1, 1));
  float k = dot(fGrad(x1, y1, z1), f - vec3(1, 1, 1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}

float fSmax(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return max(a, b) + h * h * k * 0.25;
}

FireState fireState(float phase, float fl) {
  FireState S;
  S.phase = phase;
  S.fl = fl;
  float sp = uFireA.z;
  S.spread = sp;
  float wide = mix(1.0, sp, 0.5);
  float w = F_TAU * phase;
  float grow = 1.0 + (fl - 1.0) * 0.55;
  // heights breathe on integer harmonics, each tongue on its own
  float h0 = 2.0 * grow * (1.0 + 0.10 * sin(w * 19.0 + 0.4) + 0.05 * sin(w * 37.0 + 2.0));
  // a narrow fire draws up into one point: its outer tongues stay short
  float side = mix(0.3, 1.0, clamp(sp, 0.0, 1.0));
  float second = mix(0.62, 1.0, clamp(sp, 0.0, 1.0));
  float h1 = 1.6 * side * grow * (1.0 + 0.17 * sin(w * 23.0 + 1.9) + 0.07 * sin(w * 41.0 + 0.7));
  float h2 = 1.45 * side * grow * (1.0 + 0.20 * sin(w * 29.0 + 3.7) + 0.08 * sin(w * 17.0 + 5.1));
  float h3 = 1.75 * second * grow * (1.0 + 0.15 * sin(w * 31.0 + 5.2) + 0.07 * sin(w * 13.0 + 1.1));
  float h4 = 1.3 * side * grow * (1.0 + 0.24 * sin(w * 27.0 + 0.9) + 0.09 * sin(w * 43.0 + 3.3));
  // the tongues stand across the footprint
  float sx = uFireD.z > 0.0 ? sp : sp + uFireD.x / 0.27;
  float sz = sp + uFireD.y / 0.27;
  S.a[0] = vec4( 0.03 * sx,  0.02 * sz, 0.27 * wide, h0);
  S.a[1] = vec4( 0.25 * sx,  0.10 * sz, 0.20 * wide, h1);
  S.a[2] = vec4(-0.12 * sx,  0.26 * sz, 0.19 * wide, h2);
  S.a[3] = vec4(-0.26 * sx, -0.08 * sz, 0.20 * wide, h3);
  S.a[4] = vec4( 0.08 * sx, -0.27 * sz, 0.18 * wide, h4);
  S.b[0] = vec4(0.05 * cos(w * 3.0 + 0.3), 0.05 * sin(w * 4.0 + 1.0), w * 29.0 + 0.2, 13.0);
  S.b[1] = vec4(0.10 + 0.07 * cos(w * 5.0 + 2.2), 0.03 + 0.07 * sin(w * 3.0 + 0.5), w * 23.0 + 1.7, 15.0);
  S.b[2] = vec4(-0.05 + 0.08 * cos(w * 4.0 + 4.0), 0.10 + 0.07 * sin(w * 6.0 + 2.9), w * 31.0 + 3.1, 14.0);
  S.b[3] = vec4(-0.11 + 0.07 * cos(w * 3.0 + 5.6), -0.03 + 0.08 * sin(w * 5.0 + 4.1), w * 27.0 + 4.6, 16.0);
  S.b[4] = vec4(0.03 + 0.08 * cos(w * 7.0 + 1.4), -0.11 + 0.07 * sin(w * 4.0 + 5.5), w * 37.0 + 0.9, 15.0);
  S.s1 = 0.35 * vec2(cos(w * 2.0), sin(w * 2.0));
  S.s2 = 0.45 * vec2(cos(w * 3.0 + 1.0), sin(w * 3.0 + 1.0));
  S.s3 = 0.60 * vec2(cos(w * 5.0 + 2.5), sin(w * 5.0 + 2.5));
  return S;
}

// A gas jet is one cone, not tongues: its radius at height y, and the axis, still but for a shiver near the tip.
float fJetR(float y, float ph) {
  float tip = uFireC.z;
  float u = clamp(y / tip, 0.0, 1.0);
  float w = F_TAU * ph;
  float hiss = 1.0 + 0.016 * sin(w * 211.0 + y * 31.0) + 0.012 * sin(w * 347.0 - y * 47.0);
  return uFireC.y * hiss * (1.0 + 0.14 * sin(3.14159 * min(u / 0.28, 1.0))) * pow(max(1.0 - u, 0.0), 0.72);
}
vec2 fJetAxis(float y, float ph) {
  float u = clamp(y / uFireC.z, 0.0, 1.0);
  float w = F_TAU * ph;
  return 0.016 * u * u * vec2(sin(w * 53.0 + y * 8.0), cos(w * 67.0 + y * 7.0));
}
// x = density, y = temperature, z = the field: a thin bright front round a clear blue cone, and a tight bright cone inside at the nozzle
vec3 fireJet(vec3 p, float ph) {
  float y = p.y;
  if (y < -0.02) return vec3(0.0, 0.0, -0.1);
  float d = length(p.xz - fJetAxis(y, ph));
  float f = fJetR(y, ph) - d;
  if (f <= 0.0) return vec3(0.0, 0.0, f);
  float u = clamp(y / uFireC.z, 0.0, 1.0);
  float inner = uFireC.y * 0.66 * pow(max(1.0 - u / 0.36, 0.0), 0.85) - d;
  float front = 1.0 - smoothstep(0.0, 0.05, f);
  float dens = smoothstep(0.0, 0.01, f) * mix(0.22 + 0.34 * front, 1.0, smoothstep(-0.008, 0.012, inner)) * (1.0 - 0.75 * smoothstep(0.82, 1.0, u));
  float T = mix(0.3 + 0.24 * front - 0.14 * u, 0.98, smoothstep(-0.008, 0.012, inner));
  return vec3(dens, T, f);
}

// Signed distance-ish field in metres: positive inside the union of tongues, no noise.
float fireShape(vec3 p, float v, in FireState S) {
  float y = p.y;
  if (uFireE.y > 0.5) return fJetR(max(y, 0.0), S.phase) - length(p.xz - fJetAxis(max(y, 0.0), S.phase));
  // a wide fire keeps a slim body, so its tongues stand apart instead of making a dome
  float bodyR = (0.33 - max(y, 0.0) * 0.40) * (S.spread < 1.0 ? mix(1.0, S.spread, 0.8) : 1.0 + 0.3 * (S.spread - 1.0));
  // on an object, the body is its width all the way up it, then draws in to the tip
  if (uFireC.x > 0.0) {
    float tip = S.a[0].w * 0.92;
    float up = clamp((y - uFireC.z * 0.75) / max(tip - uFireC.z * 0.75, 0.1), 0.0, 1.0);
    bodyR = (uFireC.y * uFireG + 0.05) * (1.0 - up) * sqrt(1.0 - up) * (1.0 + 0.9 * up);
  }
  float s = bodyR - fFoot(p.xz);
  // along a line, the same tongues repeat, each stretch at its own height and in its own time
  vec2 xz = p.xz;
  float tall = 1.0, late = 0.0;
  if (uFireD.z > 0.0) {
    float n = floor(uFireD.x / uFireD.z);
    float cell = clamp(floor(p.x / uFireD.z + 0.5), -n, n);
    xz.x -= cell * uFireD.z;
    float rnd = fract(sin(cell * 12.9898 + 1.7) * 43758.5453);
    tall = (0.68 + 0.6 * rnd) * (1.0 - 0.35 * smoothstep(n - 1.0, n, abs(cell)));
    late = cell * 2.1;
  }
  for (int i = 0; i < 5; i++) {
    vec4 a = S.a[i], b = S.b[i];
    float w = a.w * tall;
    float u = max(y, 0.0) / w;
    vec2 c = a.xy * (1.0 - 0.62 * min(y, 1.0)) + b.xy * y * min(y, 1.3);
    float r = u < 1.0
      ? a.z * (1.0 - u) * sqrt(1.0 - u) * (1.0 + 1.2 * u) * (1.0 + (0.08 + 0.26 * u) * sin(b.w * v - b.z + late))
      : -(y - w);
    s = fSmax(s, r - length(xz - c), 0.06);
  }
  return s;
}

// x = density, y = temperature, z = the field, negative outside. Spends at most 5 noise calls.
vec3 fireFlame(vec3 p, float v, float h, float footprint, float s0, in FireState S) {
  float ph = S.phase;
  // 1: warp, one noise turned into a direction. Wind stirs it harder.
  float wn = fNoise(vec3(p.x * 1.7 + S.s1.x, v * 1.1 - 22.0 * ph, p.z * 1.7 + S.s1.y), 22.0);
  float ang = wn * F_TAU * 1.3;
  float wild = 1.0 - uFireD.w;
  vec2 w = vec2(cos(ang), sin(ang)) * mix(0.012, 0.20, h * h) * (1.0 + 0.9 * length(uFireB.xy)) * wild;
  vec3 q = vec3(p.x + w.x, p.y, p.z + w.y);
  float s = fireShape(q, v, S);

  // 2 and 3: tongues and licks. Vertically stretched, faster with each octave.
  // a fire off a wide object draws in as it rises, so it ends in points and not a flat top
  float drawIn = uFireD.z > 0.0 ? 1.0 : 1.0 - smoothstep(min(uFireC.z * 0.9, 1.5), 1.75, q.y);
  float n2 = fNoise(vec3(q.x * 2.8 + S.s2.x, v * 1.6 - 34.0 * ph, q.z * 2.8 + S.s2.y), 34.0);
  float n3 = fNoise(vec3(q.x * 6.5 + S.s3.x, v * 3.6 - 90.0 * ph, q.z * 6.5 + S.s3.y), 90.0);
  float f = s
    + wild * mix(0.10, 0.24, h) * n2
    + wild * mix(0.11, 0.14, h) * mix(n3 * 1.3, 0.45 - abs(n3) * 2.4, smoothstep(0.12, 0.55, h))
    - 0.03 - 0.10 * h * h
    - 0.25 * max(q.y - 1.5, 0.0)
    - (0.7 + 1.5 * smoothstep(1.2, 1.8, q.y)) * max(length(max(abs(q.xz) - uFireD.xy * drawIn, 0.0)) - (0.60 - 0.26 * q.y) * mix(1.0, S.spread, 0.85), 0.0);

  // no plane at the bottom: the flame's foot closes up raggedly, whatever it stands on
  f -= 0.24 * (1.0 - smoothstep(0.0, 0.17, p.y + 0.11 * n2 + 0.05 * n3));
  // burning on a head: separate licks climbing its sides, held close to it, that gather into the flame above it
  float along = uFireE.x * (1.0 - smoothstep(uFireC.z * 0.25, uFireC.z * 1.0, q.y));
  if (uFireC.x > 0.0) {
    f += along * (0.5 * n3 + 0.26 * n2 - 0.015);
    // flush with the object at its foot, widening as the licks climb
    float hold = uFireC.y * (0.98 + uFireC.w * smoothstep(0.0, uFireC.z, q.y)) + 0.02;
    if (uFireH.x > 0.0) {
      // inside a stack or a box: wood in front stays clean, and flames only push out where a row of it is open
      vec2 open = max(cos(F_TAU * (q.y - uFireH.yz) / uFireH.x), vec2(0.0));
      vec2 extent = uFireD.xy + uFireH.w * open * open * smoothstep(-0.03, 0.12, n2);
      f -= (1.0 - smoothstep(uFireC.z * 0.97, uFireC.z * 1.22, q.y)) * 6.0 * max(length(max(abs(q.xz) - extent, 0.0)) - hold, 0.0);
    } else {
      f -= (1.0 - smoothstep(uFireC.z * 0.7, uFireC.z * 1.3, q.y)) * 3.0 * max(fFoot(q.xz) - hold, 0.0);
    }
    // and the licks start as points low on the sides, not as a curtain hanging down
    f -= 0.16 * uFireE.x * (1.0 - smoothstep(0.0, uFireC.z * 0.5, q.y));
  }

  // flames attached to the fuel: short licks off the top and up the sides of each piece, wherever the noise lets them
  if (uFuelN > 0) {
    float fuel = fFuel(q);
    // ragged where it touches the wood, drawn out into points as it leaves it
    f = max(f, fuel + mix(0.15 * n3 + 0.08 * n2 - 0.03, 0.05 - abs(n3) * 0.75 + 0.09 * n2, smoothstep(0.03, -0.08, fuel)));
  }

  // 4: one fine octave, the ragged edge and the fine streaks
  float rag = mix(0.034, 0.06, h) * wild;
  if (f < -rag * 1.6) return vec3(0.0, 0.0, f);
  // ...unless its cells are too small to draw: then it's only speckle, and it isn't worth paying for
  float fineK = smoothstep(2.5, 6.0, 0.0417 / footprint);
  float n4 = fineK > 0.0 ? fNoise(vec3(q.x * 24.0, v * 5.0 - 150.0 * ph, q.z * 24.0), 150.0) : 0.0;
  f += rag * n4 * fineK;
  if (f <= 0.0) return vec3(0.0, 0.0, f);

  // 5: licking streaks through the body, bent by the licks so they curl
  float st = fNoise(vec3((q.x + n2 * 0.12) * 10.0 - S.s3.y, v * 1.6 - 54.0 * ph, (q.z - n2 * 0.12) * 10.0 + S.s3.x), 54.0);
  float streak = 1.0 - min(abs(st) * 3.4, 1.0);
  streak = min(streak * sqrt(streak) + fineK * 0.7 * (1.0 - min(abs(n4) * 4.5, 1.0)) * (0.3 + streak), 1.0);

  float skin = smoothstep(0.0, mix(0.016, 0.024, h), f);
  float gaps = mix(mix(0.34, 1.0, streak), 1.0, uFireD.w);
  float dens = skin * mix(1.0, gaps, smoothstep(0.015, 0.07, f)) * (1.0 - 0.8 * smoothstep(1.5, 2.1, p.y));
  // thin down there, so the head shows through its own flames
  dens *= 1.0 - 0.3 * along;
  // the warp folds now and then and leaves a lump hanging well off any tongue: those don't get drawn
  dens *= 1.0 - smoothstep(0.14, 0.3, -s0);
  dens *= 1.0 - smoothstep(1.0, 1.5, p.y) * smoothstep(0.06, 0.24, fFoot(p.xz) - max(0.60 - 0.26 * p.y, 0.0) * mix(1.0, S.spread, 0.85));
  if (dens <= 0.0) return vec3(0.0, 0.0, f);

  float cool = 1.0 - smoothstep(0.02, 1.75, p.y);
  // seen through the gaps of a stack, the inside shouldn't be a flat bright bar
  float T = (uFireH.x > 0.0 ? mix(0.1, 0.18, h) : 0.18) + 0.34 * cool * (uFireH.x > 0.0 ? 0.78 : 1.0) + mix(0.42 * (streak - 0.3) + 0.10 * n3, 0.34, uFireD.w) + 0.09 * uFireA.w;
  T *= mix(0.40, 1.0, smoothstep(0.0, mix(0.03, 0.05, h), f));
  T += 0.05 * smoothstep(0.05, 0.22, f) * cool;
  float r2 = dot(p.xz, p.xz);
  float dy = p.y - 0.12;
  T = mix(T, T * 0.82, along);
  T += 0.42 * (1.0 - uFireC.x) * (1.0 - uFireE.y) * exp(-(r2 / 0.02 + dy * dy / 0.02));
  return vec3(dens, T, f);
}

vec3 fireRamp(float T) {
  // dark red -> red -> orange -> yellow -> white-hot, linear HDR
  vec3 c = mix(vec3(0.05, 0.002, 0.0), vec3(0.42, 0.028, 0.002), smoothstep(0.0, 0.25, T));
  c = mix(c, vec3(1.1, 0.13, 0.008), smoothstep(0.25, 0.45, T));
  c = mix(c, vec3(1.6, 0.34, 0.018), smoothstep(0.45, 0.65, T));
  c = mix(c, vec3(2.25, 0.9, 0.07), smoothstep(0.65, 0.85, T));
  c = mix(c, vec3(5.0, 3.6, 1.6), smoothstep(0.85, 1.1, T));
  return c;
}

// x = absorption density, y = glow from below, z = how far outside the plume, 0 inside its reach
vec3 fireSmoke(vec3 p, float ph) {
  float y = p.y;
  float top = 1.0 - smoothstep(3.0, 4.1, y);
  // along a line the flames are low, so its smoke starts low
  float low = smoothstep(0.95, 1.7, y + (uFireD.z > 0.0 ? 0.55 : 0.0));
  if (top * low <= 0.0) return vec3(0.0, 0.0, 1.0);
  float lean = 0.6 + 0.5 * y;
  vec2 c = lean * vec2(0.10 * sin(y * 2.3 + F_TAU * ph * 2.0), 0.10 * cos(y * 1.9 + F_TAU * ph * 3.0));
  float R = (0.13 + 0.16 * smoothstep(1.0, 2.0, y) + 0.24 * smoothstep(1.8, 4.0, y)) * (uFireD.z > 0.0 ? 1.3 : 1.0);
  // a wide fire's smoke gathers in from its footprint; along a line it rises in separate columns
  vec2 at = p.xz - c;
  if (uFireD.z > 0.0) {
    float every = uFireD.z * 2.7;
    float col = floor(p.x / every + 0.5);
    at.x = p.x - col * every - c.x * (1.0 + sin(col * 3.7));
  }
  float sd = R - (uFireD.z > 0.0 ? length(at) : length(max(abs(at) - uFireD.xy * 0.35, 0.0)));
  if (sd < -0.3) return vec3(0.0, 0.0, -sd - 0.3);
  float n = fNoise(vec3(p.x * 2.4, y * 1.2 - 24.0 * ph, p.z * 2.4), 24.0);
  n += 0.5 * fNoise(vec3(p.x * 5.5 + n, y * 2.6 - 52.0 * ph, p.z * 5.5 - n), 52.0);
  float d = smoothstep(0.0, 0.2, sd + 0.6 * n);
  return vec3(d * top * low, 1.0 - smoothstep(1.1, 2.9, y), 0.0);
}

// The ray in the fire's local metres (base at the origin, +Y up), the distance to the nearest opaque surface, and a
// per-pixel jitter in [0, 1). Returns premultiplied colour: composite with scene * (1 - a) + rgb.
vec4 marchFire(vec3 ro, vec3 rd, float tMax, float phase, float flicker, float jitter) {
  float W = uFireA.x, H = uFireA.y;
  float windLen = length(uFireB.xy);
  float top = uFireB.w;
  // the bounding cylinder
  vec2 rc = ro.xz - uFireBound.xy;
  float A = dot(rd.xz, rd.xz), B = dot(rc, rd.xz), C = dot(rc, rc) - uFireBound.z * uFireBound.z;
  float t0 = 0.0, t1 = tMax;
  if (A > 1e-6) {
    float disc = B * B - A * C;
    if (disc <= 0.0) return vec4(0.0);
    disc = sqrt(disc);
    t0 = max(t0, (-B - disc) / A);
    t1 = min(t1, (-B + disc) / A);
  } else if (C > 0.0) return vec4(0.0);
  if (abs(rd.y) > 1e-5) {
    float a = (-0.05 - ro.y) / rd.y, b = (top - ro.y) / rd.y;
    t0 = max(t0, min(a, b));
    t1 = min(t1, max(a, b));
  } else if (ro.y < -0.05 || ro.y > top) return vec4(0.0);
  if (t1 <= t0) return vec4(0.0);

  FireState S = fireState(phase, flicker);
  vec3 col = vec3(0.0);
  float Tr = 1.0;
  float t = t0;
  bool entered = false;
  float bright = (1.0 + (flicker - 1.0) * 0.5) * (1.0 + 0.35 * uFireA.w);
  float ds = min(W, H);

  for (int i = 0; i < 64; i++) {
    if (t >= t1 || Tr < 0.01) break;
    vec3 pr = ro + rd * t;
    float yr = max(pr.y, 0.0);
    // into flame space: bent by the wind, then stretched by the type. lip keeps the steps safe through both.
    vec2 bend = uFireB.xy * yr * (0.2 + 0.3 * yr);
    vec3 p = vec3((pr.x - bend.x) / W, pr.y / H, (pr.z - bend.y) / W);
    float lip = ds / (1.0 + windLen * (0.2 + 0.6 * yr));
    float y = max(p.y, 0.0);
    float v = pow(y + 0.25, 0.6);
    float h = min(y / 1.6, 1.0);
    float fine = max(0.011 * ds, t * 0.0034) * (1.0 + 1.2 * (1.0 - Tr));
    // Round a head the field falls off about four times as fast, and the flame is a thin layer with something dark behind
    // it: longer steps would jump over it on some pixels and not others, which shows as a dot pattern.
    float nearHead = uFireC.x * (1.0 - smoothstep(uFireC.z * 0.7, uFireC.z * 1.4, y));
    fine *= 1.0 - 0.55 * nearHead;
    float blueFoot = uFireE.z * (1.0 - smoothstep(0.0, 0.45, y));
    float dt;

    float s0 = fireShape(p, v, S);
    if (uFuelN > 0) s0 = max(s0, fFuel(p));
    float gap = -s0 - (0.03 + mix(0.07, 0.42, h));
    if (gap > 0.0) {
      dt = max(fine, gap * 0.85 * lip * (1.0 - 0.5 * nearHead));
      entered = false;
    } else {
      if (!entered) {
        entered = true;
        t += fine * jitter;
        pr = ro + rd * t;
        yr = max(pr.y, 0.0);
        bend = uFireB.xy * yr * (0.2 + 0.3 * yr);
        p = vec3((pr.x - bend.x) / W, pr.y / H, (pr.z - bend.y) / W);
      }
      vec3 fl = uFireE.y > 0.5 ? fireJet(p, phase) : fireFlame(p, v, h, t * uFirePx / ds, s0, S);
      // the field is close to a distance in metres, so empty space inside the envelope can be skipped
      dt = max(fine, -fl.z * 0.32 * lip * (1.0 - 0.75 * nearHead));
      if (fl.x > 0.0) {
        float foot = smoothstep(-0.05, 0.0, p.y);
        // a step that would pass the surface behind only counts up to it
        float a = 1.0 - exp(-mix(6.0, 58.0, fl.x) * fl.x * foot * (1.0 - 0.72 * blueFoot) * min(dt, t1 - t) / ds);
        vec3 c = fireRamp(fl.y);
        float blue = max(uFireE.y, blueFoot);
        if (blue > 0.0) {
          vec3 g = mix(vec3(0.012, 0.035, 0.42), vec3(0.14, 0.42, 2.3), smoothstep(0.12, 0.62, fl.y));
          c = mix(c, mix(g, vec3(1.25, 1.75, 3.4), smoothstep(0.66, 1.0, fl.y)), blue);
        }
        col += Tr * a * c * bright;
        Tr *= 1.0 - a;
      }
    }

    if (uFireB.z > 0.0 && y > 0.9 && y < 4.15) {
      vec3 sm = fireSmoke(p, phase);
      dt = min(dt, max(0.075 * ds, sm.z * 0.85 * lip));
      if (sm.x > 0.0) {
        float a = 1.0 - exp(-2.7 * (1.0 + 1.6 * uFireE.w) * uFireB.z * sm.x * dt / ds);
        vec3 lit = vec3(0.036, 0.038, 0.044) * (1.0 - 0.8 * uFireE.w) + vec3(0.24, 0.078, 0.018) * sm.y * sm.y * bright;
        col += Tr * a * lit;
        Tr *= 1.0 - a;
      }
    }
    // along a line, the field only knows the stretch it's in, so never step further than the next one
    if (uFireD.z > 0.0) dt = min(dt, max(fine, uFireD.z * 0.42 * W));
    // a different offset every step, so the steps never line up into contours on the flame's skin
    float d = fract(jitter + float(i) * 0.61803399) - 0.5;
    t += dt * (1.0 + d * (dt > fine * 1.01 ? 0.4 : 0.0));
  }
  return vec4(col, 1.0 - Tr);
}
`;

export const MAX_EMBERS = 640;

export const emberVertex = /* glsl */ `
in vec4 seed;
uniform float uPhase;
uniform float uFlicker;
uniform float uScale;
uniform float uWorld;
uniform vec3 uShape;  // width, height, spread
uniform vec2 uWind;
uniform vec2 uFoot;   // half width and half depth of what's burning
out float vLife;
out float vFade;

vec3 emberHash(vec3 s, float n) {
  uvec3 v = uvec3(s * 65535.0) + uvec3(uint(n) * 2137u);
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return vec3(v >> 16u) / 65535.0;
}

void main() {
  // an integer number of lifetimes per loop, a fresh path each life
  float k = 5.0 + floor(seed.w * 6.0);
  float x = uPhase * k + seed.x;
  float life = fract(x);
  vec3 r = emberHash(seed.xyz, mod(floor(x), k));
  vec3 q = emberHash(seed.zyx, mod(floor(x), k) + 7.0);

  float a0 = r.x * 6.28318531;
  float r0 = (0.05 + 0.36 * sqrt(r.y)) * uShape.z;
  float climb = pow(life, 0.72);
  float y = (0.08 + r.z * 0.25 + (1.0 + 2.1 * q.x) * climb) * uShape.y;
  float spin = a0 + life * 6.28318531 * (q.y - 0.5) * 1.6;
  float rad = r0 * (1.0 - 0.45 * smoothstep(0.0, 0.4, life)) + 0.55 * q.z * life * life;
  vec3 pos = vec3(cos(spin) * rad * uShape.x + (r.y * 2.0 - 1.0) * uFoot.x, y, sin(spin) * rad * uShape.x + (q.y * 2.0 - 1.0) * uFoot.y);
  float wob = life * 6.28318531;
  pos.x += 0.06 * life * sin(wob * (2.0 + floor(q.x * 3.0)) + a0);
  pos.z += 0.06 * life * cos(wob * (2.0 + floor(q.y * 3.0)) + a0 * 1.7);
  pos.xz += uWind * (y * (0.2 + 0.3 * y) + (0.3 + q.z) * life);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float world = mix(0.007, 0.017, q.y * q.y) * (1.0 - 0.45 * life) * uWorld;
  gl_PointSize = clamp(uScale * world / -mv.z, 1.6, 7.0);
  vLife = life;
  float twinkle = 0.72 + 0.28 * sin(wob * (5.0 + floor(q.z * 5.0)) + a0);
  vFade = smoothstep(0.03, 0.2, life) * (1.0 - smoothstep(0.62, 1.0, life)) * twinkle * uFlicker;
}
`;

// A handful of embers thrown up when the fire is stoked: uAge seconds since the stoke.
export const burstVertex = /* glsl */ `
in vec4 seed;
uniform float uAge;
uniform float uScale;
uniform float uWorld;
uniform vec3 uShape;
uniform vec2 uWind;
uniform vec2 uFoot;
out float vLife;
out float vFade;

void main() {
  float span = 0.9 + 1.5 * seed.w;
  float life = uAge / span;
  float a = seed.x * 6.28318531;
  float go = (1.0 - exp(-1.5 * uAge)) / 1.5;
  float up = (1.5 + 4.0 * seed.z * seed.z) * uShape.y;
  float out_ = (0.25 + 1.1 * seed.y) * uShape.x * uShape.z;
  float sway = sin(uAge * (2.0 + 3.0 * seed.y) + a) * 0.08 * uAge;
  vec3 pos = vec3(cos(a) * out_ * go + sway + (seed.w * 2.0 - 1.0) * uFoot.x, 0.25 + up * go - 0.12 * uAge * uAge, sin(a) * out_ * go - sway + (seed.z * 2.0 - 1.0) * uFoot.y);
  pos.xz += uWind * (pos.y * (0.2 + 0.3 * pos.y) + 0.5 * uAge);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = life < 1.0 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = clamp(uScale * (0.012 + 0.02 * seed.y * seed.y) * uWorld * (1.0 - 0.5 * life) / -mv.z, 1.6, 8.0);
  vLife = life * 0.85;
  vFade = (1.0 - smoothstep(0.55, 1.0, life)) * 1.4;
}
`;

export const emberFragment = /* glsl */ `
layout(location = 0) out vec4 fragColor;
uniform sampler2D tDepth;
uniform vec2 uRes;
in float vLife;
in float vFade;

void main() {
  // the logs' depth lives in the resolved texture
  if (gl_FragCoord.z > texture(tDepth, gl_FragCoord.xy / uRes).r) discard;
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float dot_ = exp(-d * d * 4.5) * (1.0 - smoothstep(0.75, 1.0, d));
  vec3 c = mix(vec3(4.2, 2.1, 0.55), vec3(2.6, 0.62, 0.05), smoothstep(0.0, 0.35, vLife));
  c = mix(c, vec3(0.75, 0.05, 0.003), smoothstep(0.35, 0.85, vLife));
  fragColor = vec4(c * dot_ * vFade, 1.0);
}
`;
