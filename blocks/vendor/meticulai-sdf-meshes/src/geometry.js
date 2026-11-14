// three.js glue: turn mesher output into a BufferGeometry, and darken a material by the baked
// per-vertex occlusion (`ao` attribute). From Dig Site and Abyssal by Meticulai.
import * as THREE from 'three';

/**
 * @param {{ positions: Float32Array, normals: Float32Array, indices: Uint32Array, ao?: Float32Array }} m
 * @returns {THREE.BufferGeometry} with position, normal, ao (if present) and an index
 */
export function toGeometry(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  if (m.ao) g.setAttribute('ao', new THREE.BufferAttribute(m.ao, 1));
  const nv = m.positions.length / 3;
  g.setIndex(nv > 65535 ? new THREE.BufferAttribute(m.indices, 1) : new THREE.BufferAttribute(new Uint16Array(m.indices), 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/**
 * Patch a MeshStandardMaterial / MeshPhysicalMaterial / MeshLambertMaterial so the geometry's `ao`
 * attribute darkens it: colour *= mix(1, ao, strength). Recesses read as recesses without SSAO.
 * Dig Site stained recesses with occlusion x 0.8. Returns the same material.
 * @template {THREE.Material} M @param {M} material @param {number} [strength]
 * @returns {M}
 */
export function withBakedAO(material, strength = 0.8) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.uniforms.uAoStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float ao;\nvarying float vBakedAo;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBakedAo = ao;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBakedAo;\nuniform float uAoStrength;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(1.0, vBakedAo, uAoStrength);');
  };
  material.customProgramCacheKey = () => 'bakedAO';
  return material;
}
