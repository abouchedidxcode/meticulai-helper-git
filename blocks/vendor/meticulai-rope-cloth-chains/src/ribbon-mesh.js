// three.js: draw a Chain3 as a tapered ribbon (a strip of quads), updated every frame. By default the ribbon turns
// to face the camera (reads like the 2D game's brush strokes from any angle); pass a `side` vector to keep it flat
// in one orientation instead (a banner, a flag tail).
import * as THREE from 'three';

export class RibbonMesh extends THREE.Mesh {
  /**
   * @param {import('./chain3.js').Chain3} chain
   * @param {{ w0?: number, w1?: number, tip?: number, material?: THREE.Material }} [opts] half-widths at pin and end,
   *   pointed tip length (same units as the chain)
   */
  constructor(chain, { w0 = 0.04, w1 = 0.015, tip = 0, material } = {}) {
    const n = chain.n + (tip > 0 ? 1 : 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    super(g, material || new THREE.MeshStandardMaterial({ color: 0xc0392b, side: THREE.DoubleSide, roughness: 0.8 }));
    this.chain = chain;
    this.w0 = w0; this.w1 = w1; this.tip = tip;
    this.frustumCulled = false;
    this._t = new THREE.Vector3(); this._s = new THREE.Vector3(); this._v = new THREE.Vector3(); this._nrm = new THREE.Vector3(); this._p = new THREE.Vector3();
  }

  /**
   * Rebuild the strip from the chain. Call after chain.step each frame.
   * @param {THREE.Camera|null} camera faces this camera (ignored when `side` is given)
   * @param {THREE.Vector3} [side] fixed width direction instead (unit)
   */
  update(camera, side) {
    const ch = this.chain, cn = ch.n;
    const n = cn + (this.tip > 0 ? 1 : 0);
    const pos = this.geometry.attributes.position.array, nor = this.geometry.attributes.normal.array;
    const t = this._t, s = this._s, v = this._v, nrm = this._nrm;
    for (let i = 0; i < n; i++) {
      const j = Math.min(i, cn - 1);
      const i0 = Math.max(0, j - 1), i1 = Math.min(cn - 1, j + 1);
      t.set(ch.x[i1] - ch.x[i0], ch.y[i1] - ch.y[i0], ch.z[i1] - ch.z[i0]).normalize();
      let px = ch.x[j], py = ch.y[j], pz = ch.z[j];
      let w = this.w0 + (this.w1 - this.w0) * (j / (cn - 1));
      if (i === cn) { px += t.x * this.tip; py += t.y * this.tip; pz += t.z * this.tip; w = 0; }
      if (side) s.copy(side);
      else {
        v.set(camera.position.x - px, camera.position.y - py, camera.position.z - pz);
        s.crossVectors(t, v);
        if (s.lengthSq() < 1e-12) s.set(1, 0, 0);
        s.normalize();
        // Keep the strip from twisting half a turn between nodes when the chain bends toward the camera.
        if (i > 0 && s.x * this._p.x + s.y * this._p.y + s.z * this._p.z < 0) s.negate();
      }
      this._p.copy(s);
      nrm.crossVectors(s, t).normalize();
      const o = i * 6;
      pos[o] = px - s.x * w; pos[o + 1] = py - s.y * w; pos[o + 2] = pz - s.z * w;
      pos[o + 3] = px + s.x * w; pos[o + 4] = py + s.y * w; pos[o + 5] = pz + s.z * w;
      nor[o] = nor[o + 3] = nrm.x; nor[o + 1] = nor[o + 4] = nrm.y; nor[o + 2] = nor[o + 5] = nrm.z;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
  }
}
