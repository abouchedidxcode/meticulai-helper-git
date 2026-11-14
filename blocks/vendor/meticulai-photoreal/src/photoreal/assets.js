// Loading glTF models (meshopt-compressed, WebP textures) and placing many copies of them cheaply.
//   const lib = new AssetLibrary(renderer, { base: 'assets/' });
//   const can = await lib.model('models/trash_can.glb');      // cached; returns the source scene
//   lib.instance(can, [matrix, matrix, ...])                  // one InstancedMesh per sub-mesh
//   const kit = await lib.kit('kits/factory.glb');            // Map piece name -> source node
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { adoptObject } from './patch.js';

export class AssetLibrary {
  constructor(renderer, { base = '', anisotropy = 8, onProgress } = {}) {
    this.base = base;
    this.anisotropy = Math.min(anisotropy, renderer.capabilities.getMaxAnisotropy());
    this.manager = new THREE.LoadingManager();
    this.manager.onProgress = (url, loaded, total) => onProgress?.(loaded, total, url);
    this.loader = new GLTFLoader(this.manager).setMeshoptDecoder(MeshoptDecoder);
    this.cache = new Map();
  }

  async model(path) {
    if (!this.cache.has(path)) {
      this.cache.set(
        path,
        this.loader.loadAsync(this.base + path).then((gltf) => {
          const root = gltf.scene;
          root.updateMatrixWorld(true);
          root.traverse((o) => {
            if (!o.isMesh) return;
            // shape keys (rigged Poly Haven props) are not needed for static copies and break instancing
            if (Object.keys(o.geometry.morphAttributes).length) {
              o.geometry.morphAttributes = {};
              o.morphTargetInfluences = undefined;
              o.morphTargetDictionary = undefined;
            }
            o.castShadow = true;
            o.receiveShadow = true;
            const m = o.material;
            for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
              if (m[k]) m[k].anisotropy = this.anisotropy;
            }
            // glTF alpha-tested foliage and fences: keep their shadows cut out too
            if (m.alphaTest > 0 || m.transparent) {
              m.alphaToCoverage = m.alphaTest > 0;
              o.customDepthMaterial = new THREE.MeshDepthMaterial({ map: m.map, alphaTest: Math.max(m.alphaTest, 0.5) });
            }
          });
          adoptObject(root);
          return root;
        }),
      );
    }
    return this.cache.get(path);
  }

  // A kit's pieces by name (each piece's pivot is at the origin).
  async kit(path) {
    const root = await this.model(path);
    const map = new Map();
    for (const c of root.children) map.set(c.name, c);
    return map;
  }

  // The meshes under `source` with their transforms relative to its parent. The source's own transform is
  // kept: meshopt-quantized pieces carry their dequantisation scale there.
  static parts(source) {
    source.updateMatrixWorld(true);
    const inv = source.parent ? new THREE.Matrix4().copy(source.parent.matrixWorld).invert() : new THREE.Matrix4();
    const parts = [];
    source.traverse((o) => {
      if (o.isMesh) parts.push({ mesh: o, local: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
    });
    return parts;
  }

  // Instanced copies of `source` at each matrix. Returns a Group of InstancedMeshes.
  instance(source, matrices, { castShadow = true, receiveShadow = true, name } = {}) {
    const group = new THREE.Group();
    group.name = name || source.name;
    const m = new THREE.Matrix4();
    for (const { mesh, local } of AssetLibrary.parts(source)) {
      const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, matrices.length);
      matrices.forEach((mat, i) => im.setMatrixAt(i, m.multiplyMatrices(mat, local)));
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = castShadow;
      im.receiveShadow = receiveShadow;
      im.customDepthMaterial = mesh.customDepthMaterial;
      im.computeBoundingSphere();
      group.add(im);
    }
    return group;
  }

  // A clone sharing geometry and materials (for things that move on their own), wrapped in a fresh group
  // so the source's own (dequantisation) transform is kept.
  clone(source) {
    const g = new THREE.Group();
    g.add(source.clone(true));
    g.name = source.name;
    return g;
  }
}

export function loadTexture(url, { srgb = false, repeat = 1, anisotropy = 8 } = {}) {
  const t = new THREE.TextureLoader().load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = anisotropy;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}
