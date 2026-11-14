// Nearest-filtered, repeating three.js textures from texels.js (the PS1 had no texture filtering worth the name).
import * as THREE from 'three';
import { paintTexels } from './texels.js';

const cache = new Map();

/**
 * A cached procedural texture. Do not dispose it: it is shared.
 * @param {'bricks'|'planks'|'tiles'|'grass'|'cloth'|'skin'|'noise'|'checker'} kind
 * @param {{ size?: number, seed?: number }} [opts]
 * @returns {THREE.DataTexture}
 */
export function makePS1Texture(kind, opts = {}) {
  const key = `${kind}|${opts.size ?? 32}|${opts.seed ?? 7}`;
  let tex = cache.get(key);
  if (!tex) {
    const { width, height, data } = paintTexels(kind, opts);
    tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    tex.name = kind;
    tex.flipY = false;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    cache.set(key, tex);
  }
  return tex;
}
