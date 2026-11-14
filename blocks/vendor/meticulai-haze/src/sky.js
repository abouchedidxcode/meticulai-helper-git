// The sky dome: its horizon is the SAME haze colour that swallows distant land, so the land melts into it.
// Default: a procedural gradient (no files). Optional: a photographed equirectangular panorama (CC0, e.g. a Poly Haven
// "pure sky"), graded warmer and rotated so its sun sits at our sun's azimuth, as Hezarfen does it.
import * as THREE from 'three';
import { hazeChunk, hazeUniform } from './haze.js';

const f = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const col = (c) => new THREE.Color(c[0], c[1], c[2]);

/**
 * @param {object} o
 * @param {THREE.Vector3} o.sunDir unit vector toward the sun disc (use haze.sunDir)
 * @param {import('./haze-math.js').HazeLook} o.look (use haze.look)
 * @param {THREE.Texture} [o.panorama] equirectangular sky (sRGB). Upper half only if panoramaBottomDeg is about 0.
 * @param {number} [o.panoramaSunU] where the sun is in the panorama, 0..1 across (Hezarfen's: 0.604)
 * @param {number} [o.panoramaBottomDeg] elevation of the panorama's bottom edge (Hezarfen's: -3.6)
 * @param {number} [o.mapped] panorama only: how far dark cloud away from the sun is recoloured lavender/rose (0.72)
 * @returns {THREE.Mesh} add it to the scene; set `.material.uniforms.uTime/uDensity` each frame (createHazeAtmosphere does)
 */
export function createSky({ sunDir, look, panorama = null, panoramaSunU = 0.604, panoramaBottomDeg = -3.6, mapped = 0.72 }) {
  const sunU = Math.atan2(sunDir.z, sunDir.x) / (2 * Math.PI) + 0.5;
  const mat = new THREE.ShaderMaterial({
    name: 'HazeSky',
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    defines: panorama ? { USE_PANORAMA: '' } : {},
    uniforms: {
      uSky: { value: panorama }, uTime: { value: 0 }, uDensity: { value: 1 }, uSunScale: { value: 1 }, uOffset: { value: panoramaSunU - sunU },
      uGain: { value: look.skyGain }, uSat: { value: look.skySaturation }, uTint: { value: new THREE.Vector3(...look.skyTint) },
      hzP: hazeUniform, uSunCol: { value: col(look.sunColor) }, uLav: { value: col(look.skyLavender) }, uRose: { value: col(look.skyRose) },
      uZenith: { value: col(look.skyZenith) }, uMapped: { value: mapped },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * viewMatrix * vec4(position * 1000.0 + cameraPosition, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vDir;
      uniform sampler2D uSky;
      uniform float uTime;
      uniform float uDensity;
      uniform float uSunScale;
      uniform float uOffset;
      uniform float uGain;
      uniform float uSat;
      uniform vec3 uTint;
      ${hazeChunk()}
      uniform vec3 uSunCol;
      uniform vec3 uLav;
      uniform vec3 uRose;
      uniform vec3 uZenith;
      uniform float uMapped;
      const float BOTTOM = ${f(panoramaBottomDeg)};

      void main() {
        vec3 dir = normalize(vDir);
        float s = max(dot(dir, HZ_SUN), 0.0);
        float toward = smoothstep(-0.4, 0.8, dot(normalize(dir.xz + 1e-5), normalize(HZ_SUN.xz)));
      #ifdef USE_PANORAMA
        float el = degrees(asin(clamp(dir.y, -1.0, 1.0)));
        float u = atan(dir.z, dir.x) / 6.2831853 + 0.5 + uOffset;
        float v = clamp((el - BOTTOM) / (90.0 - BOTTOM), 0.002, 0.998);
        // explicit gradients: the atan seam would otherwise pick the smallest mip along one column
        vec2 uv = vec2(u, v);
        vec2 dx = dFdx(uv);
        vec2 dy = dFdy(uv);
        dx.x -= floor(dx.x + 0.5);
        dy.x -= floor(dy.x + 0.5);
        vec3 sky = textureGrad(uSky, uv, dx, dy).rgb;
        // grade: richer, warmer, a little more contrast. Away from the sun, map the photo by brightness onto
        // lavender in the gaps and rose on lit cloud; toward the sun keep the photo.
        float l = dot(sky, vec3(0.2126, 0.7152, 0.0722));
        float lit = smoothstep(0.07, 0.36, l);
        vec3 mapped = mix(uLav, uRose, lit) * (0.9 + 0.75 * lit);
        vec3 photo = pow(max(mix(vec3(l), sky, uSat), 0.0), vec3(1.18)) * uGain * uTint;
        sky = mix(mix(photo, mapped, uMapped), photo, toward);
      #else
        // procedural: the haze colour at the horizon rising into a dusky zenith, with a rose band toward the sun
        float up = clamp(dir.y, 0.0, 1.0);
        vec3 horizon = hzFogColor(normalize(vec3(dir.x, 0.0, dir.z) + 1e-5));
        vec3 sky = mix(horizon, uZenith, smoothstep(0.0, 0.75, pow(up, 0.6)));
        sky = mix(sky, uRose * 1.05, 0.22 * toward * exp(-up * 9.0));
        sky *= uTint;
      #endif
        sky += sky * vec3(0.9, 0.42, 0.2) * pow(s, 3.0) * 0.9;
        // the sun itself: a soft hot core and glow
        float disc = smoothstep(0.99985, 0.99996, dot(dir, HZ_SUN));
        float glow = pow(s, 1200.0) * 5.0 + pow(s, 120.0) * 0.8 + pow(s, 18.0) * 0.22;
        sky += uSunCol * (disc * 5.0 + glow * 0.7) * uSunScale;

        // the horizon dissolves into the same haze that swallows distant land
        float a = max(dir.y, 0.0) / HZ_H;
        float od = uDensity * (HZ_D0 * exp(-max(cameraPosition.y, 0.0) / HZ_H) / max(a, 1e-5)
          + HZ_D1 * exp(-max(cameraPosition.y, 0.0) / HZ_H2) * HZ_H2 / max(dir.y, 1e-3)
          + HZ_DU * min(300.0 / HZ_BANK_SCALE / max(dir.y, 0.02), 6000.0 / HZ_BANK_SCALE)); // (HZ_BANK_SCALE = metres per unit)
        float t = exp(-od);
        vec3 fogc = hzFogColor(dir);
        vec3 col = sky * t + fogc * (1.0 - t);
        col = mix(col, fogc, smoothstep(0.004, -0.02, dir.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 5), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'sky';
  return mesh;
}
