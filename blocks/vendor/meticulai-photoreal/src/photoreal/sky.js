// HDRI skies. A captured sky carries both the light and the look of a real place, so the engine takes all of
// its outdoor light from one:
// - the sun is found in the HDRI (its brightest disk) and becomes a shadow-casting directional light whose
//   colour and strength are measured from the pixels, so shadows line up with the sun you see;
// - the sun disk is then painted out of a second copy used for image-based lighting, so it is not counted twice;
// - pure-sky HDRIs have nothing below the horizon, so the dome fills it with ground lit by that same sky.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// The URL of a Poly Haven HDRI (CC0) on its CDN, e.g. polyHavenHdri('kloofendal_48d_partly_cloudy_puresky').
// Pure-sky HDRIs (names ending in _puresky) suit this engine best: it paints its own ground under the horizon.
// For a shipped game download it once (node tools/assets/get.mjs polyhaven:<id>) and load the local file.
export function polyHavenHdri(id, res = '1k') {
  return `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${res}/${id}_${res}.hdr`;
}

// Equirect pixel (column, row from the top) <-> world direction, matching three's equirect sampling.
export function pixelDir(c, r, w, h, out = new THREE.Vector3()) {
  const u = (c + 0.5) / w;
  const v = 1 - (r + 0.5) / h;
  const phi = (u - 0.5) * 2 * Math.PI;
  const el = (v - 0.5) * Math.PI;
  return out.set(Math.cos(el) * Math.cos(phi), Math.sin(el), Math.cos(el) * Math.sin(phi));
}

// Turns an equirect image about the vertical axis by `rad` (a whole number of columns).
export function rotate(data, w, h, rad) {
  const shift = Math.round((rad / (2 * Math.PI)) * w);
  if (!shift) return data;
  const out = new Float32Array(data.length);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const src = (r * w + c) * 4;
      const dst = (r * w + ((((c + shift) % w) + w) % w)) * 4;
      out[dst] = data[src];
      out[dst + 1] = data[src + 1];
      out[dst + 2] = data[src + 2];
      out[dst + 3] = 1;
    }
  }
  return out;
}

export function toFloat(tex) {
  const { data, width, height } = tex.image;
  if (data instanceof Float32Array) return data;
  const f = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) f[i] = THREE.DataUtils.fromHalfFloat(data[i]);
  return f;
}

// Finds the sun: the brightest pixel, then everything around it that is much brighter than the sky.
// Returns its direction, its irradiance (colour * strength, in the same units as the sky's radiance * π)
// and the pixels to paint out.
export function analyse(data, w, h) {
  let best = -1;
  let bestL = 0;
  for (let r = 0; r < h / 2; r++) {
    for (let c = 0; c < w; c++) {
      const i = (r * w + c) * 4;
      const L = lum(data[i], data[i + 1], data[i + 2]);
      if (L > bestL) {
        bestL = L;
        best = r * w + c;
      }
    }
  }
  const sr = Math.floor(best / w);
  const sc = best % w;
  // Median-ish sky level of the upper hemisphere, to tell sun pixels from bright clouds.
  const samples = [];
  for (let r = 0; r < h / 2; r += 4) for (let c = 0; c < w; c += 8) {
    const i = (r * w + c) * 4;
    samples.push(lum(data[i], data[i + 1], data[i + 2]));
  }
  samples.sort((a, b) => a - b);
  const skyL = samples[Math.floor(samples.length * 0.5)] || 0.1;

  const dir = pixelDir(sc, sr, w, h);
  const sunColor = new THREE.Vector3();
  const sunPixels = [];
  const isSun = bestL > skyL * 40;
  if (isSun) {
    const threshold = Math.max(skyL * 12, bestL * 0.02);
    const rad = Math.ceil(w * 0.012) + 2; // ~4° search window
    const tmp = new THREE.Vector3();
    for (let r = Math.max(0, sr - rad); r <= Math.min(h - 1, sr + rad); r++) {
      const el = (0.5 - (r + 0.5) / h) * Math.PI;
      const solid = ((2 * Math.PI) / w) * (Math.PI / h) * Math.cos(el);
      for (let dc = -rad * 2; dc <= rad * 2; dc++) {
        const c = (sc + dc + w) % w;
        const i = (r * w + c) * 4;
        const L = lum(data[i], data[i + 1], data[i + 2]);
        if (L < threshold) continue;
        if (pixelDir(c, r, w, h, tmp).angleTo(dir) > 0.07) continue;
        sunColor.x += data[i] * solid;
        sunColor.y += data[i + 1] * solid;
        sunColor.z += data[i + 2] * solid;
        sunPixels.push(i);
      }
    }
  }
  return { dir, sunColor, sunPixels, skyL, isSun };
}

// Average radiance of the sky dome weighted by cos(elevation) toward the zenith: the sky's irradiance on the ground / π.
export function skyIrradiance(data, w, h) {
  const acc = new THREE.Vector3();
  let wsum = 0;
  for (let r = 0; r < h / 2; r += 2) {
    const el = (0.5 - (r + 0.5) / h) * Math.PI;
    const wt = Math.sin(el) * Math.cos(el);
    for (let c = 0; c < w; c += 4) {
      const i = (r * w + c) * 4;
      acc.x += data[i] * wt;
      acc.y += data[i + 1] * wt;
      acc.z += data[i + 2] * wt;
      wsum += wt;
    }
  }
  return acc.multiplyScalar(1 / Math.max(wsum, 1e-6));
}

export class Sky {
  constructor() {
    this.full = null; // what you see
    this.lighting = null; // sun painted out, ground filled in
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.sunIrradiance = new THREE.Color(0, 0, 0);
    this.skyRadiance = new THREE.Color(0.5, 0.6, 0.8);
    this.dome = null;
    this.uniforms = {
      tSky: { value: null },
      uGround: { value: new THREE.Color(0.1, 0.1, 0.1) },
      uIntensity: { value: 1 },
      uFillGround: { value: 1 },
    };
  }

  // opts: intensity (scales everything), sunScale (extra on the sun), groundAlbedo, fillGround (pure skies)
  async load(url, opts = {}) {
    const { intensity = 1, sunScale = 1, groundAlbedo = 0.18, fillGround = true, rotation = 0, sunAzimuth = null } = opts;
    const tex = await new HDRLoader().setDataType(THREE.FloatType).loadAsync(url);
    const { width: w, height: h } = tex.image;
    let data = toFloat(tex);
    if (rotation) data = rotate(data, w, h, rotation);
    if (sunAzimuth != null) {
      // turn the sky so the sun stands at this azimuth (radians; 0 = +x, PI/2 = +z)
      const pre = analyse(data, w, h);
      if (pre.isSun) data = rotate(data, w, h, sunAzimuth - Math.atan2(pre.dir.z, pre.dir.x));
    }
    const a = analyse(data, w, h);

    // Lighting copy: the sun disk replaced by the sky level around it.
    const lit = new Float32Array(data);
    if (a.isSun) {
      const fill = a.skyL * 3;
      for (const i of a.sunPixels) {
        const L = lum(lit[i], lit[i + 1], lit[i + 2]);
        const k = Math.min(1, fill / L);
        lit[i] *= k;
        lit[i + 1] *= k;
        lit[i + 2] *= k;
      }
    }
    const skyIrr = skyIrradiance(lit, w, h);
    this.sunDir.copy(a.dir);
    if (this.sunDir.y < 0.05) this.sunDir.y = 0.05;
    this.sunDir.normalize();
    this.sunIrradiance.setRGB(a.sunColor.x, a.sunColor.y, a.sunColor.z).multiplyScalar(intensity * sunScale);
    this.skyRadiance.setRGB(skyIrr.x, skyIrr.y, skyIrr.z).multiplyScalar(intensity);
    this.hasSun = a.isSun;

    // Ground under the horizon: lit by the sun at its elevation plus the sky, as a diffuse grey-brown surface.
    const sunE = this.sunIrradiance.clone().multiplyScalar(Math.max(0, this.sunDir.y));
    const ground = this.skyRadiance.clone().multiplyScalar(Math.PI).add(sunE).multiplyScalar(groundAlbedo / Math.PI);
    ground.multiply(new THREE.Color(1.0, 0.92, 0.8));

    const make = (arr) => {
      // half floats: linear filtering works everywhere (float32 filtering is optional in WebGL)
      const half = new Uint16Array(arr.length);
      for (let i = 0; i < arr.length; i++) half[i] = THREE.DataUtils.toHalfFloat(Math.min(arr[i], 65000));
      const t = new THREE.DataTexture(half, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.LinearSRGBColorSpace;
      t.flipY = true;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    };
    if (fillGround) {
      for (const arr of [data, lit]) {
        for (let r = Math.floor(h / 2); r < h; r++) {
          const el = -(((r + 0.5) / h - 0.5) * Math.PI);
          const k = THREE.MathUtils.smoothstep(-el, 0.0, 0.06);
          for (let c = 0; c < w; c++) {
            const i = (r * w + c) * 4;
            arr[i] = arr[i] * (1 - k) + ground.r * k;
            arr[i + 1] = arr[i + 1] * (1 - k) + ground.g * k;
            arr[i + 2] = arr[i + 2] * (1 - k) + ground.b * k;
          }
        }
      }
    }
    this.full?.dispose();
    this.lighting?.dispose();
    this.full = make(data);
    this.lighting = make(lit);
    this.uniforms.tSky.value = this.full;
    this.uniforms.uIntensity.value = intensity;
    this.uniforms.uGround.value.copy(ground);
    tex.dispose();
    return this;
  }

  // A dome that shows the full sky behind everything (and is captured by probes).
  createDome(radius = 900) {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize( position );
          vec4 p = modelViewMatrix * vec4( position, 1.0 );
          gl_Position = projectionMatrix * p;
          gl_Position.z = gl_Position.w; // on the far plane
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSky;
        uniform float uIntensity;
        varying vec3 vDir;
        #include <common>
        void main() {
          vec3 d = normalize( vDir );
          vec2 uv = vec2( atan( d.z, d.x ) * RECIPROCAL_PI2 + 0.5, asin( clamp( d.y, -1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5 );
          vec3 c = texture2D( tSky, uv ).rgb * uIntensity;
          gl_FragColor = vec4( c, 1.0 );
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    this.dome.name = 'sky-dome';
    return this.dome;
  }
}
