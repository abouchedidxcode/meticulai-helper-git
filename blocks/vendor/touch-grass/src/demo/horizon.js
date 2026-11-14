// What lies past the field's own ground: the same land carried on to hills at the horizon, coloured as distant
// meadow and woodland and lost in the haze. Demo dressing, not part of the library.
import * as THREE from 'three';
import { COMMON } from '../lib/index.js';
import { fbm, heightAt } from './world.js';

const vertex = /* glsl */ `
in vec3 aColor;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vAlbedo;
void main() {
  vWorld = position;
  vNormal = normal;
  vAlbedo = aColor;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;

const fragment = /* glsl */ `
${COMMON}
layout(location = 0) out vec4 outC;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vAlbedo;
void main() {
  vec3 N = normalize(vNormal);
  if (N.y < 0.0) N = -N;
  float sun = max(dot(N, uSunDir), 0.0) * cloudAt(vWorld.xz);
  // grass seen from far off is lit a little from every side
  vec3 c = vAlbedo * (uSunColor * (sun * 0.75 + 0.12) + mix(uBounceColor, uSkyColor, N.y * 0.5 + 0.5));
  outC = vec4(applyFog(c, vWorld), 1.0);
}
`;

/** @param inner half the side of the square the field's ground covers; the land starts just inside it */
export function createHorizon(field, inner = 512) {
  const around = 320;
  const rings = 34;
  const edge = inner - 5;
  const positions = [];
  const colors = [];
  for (let k = 0; k <= rings; k++) {
    const scale = Math.pow(11, k / rings);
    for (let i = 0; i < around; i++) {
      // a point on the square's edge, pushed outwards
      const t = (i / around) * 4;
      const side = Math.floor(t);
      const u = (t - side) * 2 - 1;
      let x = side === 0 ? u : side === 1 ? 1 : side === 2 ? -u : -1;
      let z = side === 0 ? -1 : side === 1 ? u : side === 2 ? 1 : -u;
      x *= edge * scale;
      z *= edge * scale;
      // sunk a little where it runs under the field's ground, so the two never fight
      const y = heightAt(x, z) - (k === 0 ? 1.2 : 0);
      positions.push(x, y, z);
      const dry = fbm(x / 300 + 4, z / 300 + 2, 3, 71);
      const wood = fbm(x / 420 - 3, z / 420 + 6, 3, 83) + Math.min(0.25, Math.hypot(x, z) / 9000);
      let r = 0.12 + 0.3 * dry;
      let g = 0.2 + 0.16 * dry;
      let b = 0.05 + 0.05 * dry;
      if (wood > 0.56) {
        const w = Math.min(1, (wood - 0.56) / 0.05);
        r += (0.035 - r) * w;
        g += (0.07 - g) * w;
        b += (0.03 - b) * w;
      }
      colors.push(r, g, b);
    }
  }
  const indices = [];
  for (let k = 0; k < rings; k++) {
    for (let i = 0; i < around; i++) {
      const a = k * around + i;
      const b = k * around + ((i + 1) % around);
      indices.push(a, a + around, b, b, a + around, b + around);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vertex, fragmentShader: fragment, uniforms: field.uniforms, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}
