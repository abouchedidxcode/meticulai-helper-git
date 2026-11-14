// Streams cave chunks around a moving point (the player) from a small pool of Web Workers and
// keeps their meshes in one THREE.Group. Nearest chunks first; far ones are dropped and freed.
// With workers: 0 (or where Workers are missing) it meshes a few chunks per update() on the main
// thread instead (fine for small caves, causes hitches for big ones).
//
// Abyssal: 24 m chunks, 1 m voxels, 78 m view radius (just past the fog), up to 3 workers,
// about 70 ms per chunk, ~1,300 live chunks per generated cave. From Abyssal by Meticulai.
import * as THREE from 'three';
import { CaveField } from './cave.js';
import { buildChunk, chunkCoords, chunkKey, chunkOf, liveChunks, CHUNK_DEFAULTS } from './chunks.js';
import { toGeometry } from './geometry.js';

let nextId = 1;

export class CaveStreamer {
  /**
   * @param {{ seed: number, tubes: import('./cave.js').Tube[] } & Record<string, any>} spec  CaveField spec (plain data)
   * @param {{ material?: THREE.Material, chunk?: number, voxel?: number, viewRadius?: number, workers?: number, syncPerUpdate?: number }} [opts]
   */
  constructor(spec, { material, chunk = CHUNK_DEFAULTS.chunk, voxel = CHUNK_DEFAULTS.voxel, viewRadius = 78, workers, syncPerUpdate = 1 } = {}) {
    this.spec = spec;
    this.id = nextId++;
    this.field = new CaveField(spec); // main-thread copy: use it for collision (field.density)
    this.chunk = chunk;
    this.voxel = voxel;
    this.viewRadius = viewRadius;
    this.syncPerUpdate = syncPerUpdate;
    this.group = new THREE.Group();
    this.group.name = 'cave';
    this.material = material || new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.95 });
    /** @type {((c: { key: number, mesh: THREE.Mesh | null }) => void) | null} */
    this.onChunk = null;
    /** @type {((c: { key: number, mesh: THREE.Mesh | null }) => void) | null} */
    this.onDrop = null;
    this.chunks = new Map();
    this.pending = new Set();
    this.queue = [];
    this.live = liveChunks(this.field, { chunk });
    this.lastAt = new THREE.Vector3(1e9, 0, 0);
    this.workers = [];
    this.idle = [];
    const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    const n = typeof Worker === 'undefined' ? 0 : workers ?? Math.max(1, Math.min(3, hc - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./chunk.worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (ev) => { this.idle.push(w); this.receive(ev.data); };
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  /** Chunks built so far. */
  get ready() { return this.chunks.size; }

  dispose() {
    for (const w of this.workers) w.terminate();
    for (const c of this.chunks.values()) c.mesh?.geometry.dispose();
    this.chunks.clear();
  }

  /** Keep chunks within `radius` of p meshed (nearest first); drop far ones. Call every frame. */
  update(p, radius = this.viewRadius, force = false) {
    const C = this.chunk;
    if (!force && p.distanceToSquared(this.lastAt) < 9) { this.pump(); return; }
    this.lastAt.copy(p);
    const r = Math.ceil(radius / C);
    const ci = chunkOf(p.x, C), cj = chunkOf(p.y, C), ck = chunkOf(p.z, C);
    const want = [];
    for (let i = ci - r; i <= ci + r; i++)
      for (let j = cj - r; j <= cj + r; j++)
        for (let k = ck - r; k <= ck + r; k++) {
          const key = chunkKey(i, j, k);
          if (!this.live.has(key) || this.chunks.has(key) || this.pending.has(key)) continue;
          const d = Math.hypot((i + 0.5) * C - p.x, (j + 0.5) * C - p.y, (k + 0.5) * C - p.z);
          if (d > radius + C * 0.87) continue;
          want.push({ key, d });
        }
    want.sort((a, b) => a.d - b.d);
    this.queue = want.map((w) => w.key);
    const dropR = radius + C * 2;
    for (const [key, c] of this.chunks) {
      const { i, j, k } = chunkCoords(key);
      const d = Math.hypot((i + 0.5) * C - p.x, (j + 0.5) * C - p.y, (k + 0.5) * C - p.z);
      if (d > dropR) {
        if (c.mesh) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); }
        this.chunks.delete(key);
        this.onDrop?.(c);
      }
    }
    this.pump();
  }

  pump() {
    if (!this.workers.length) {
      for (let n = 0; n < this.syncPerUpdate && this.queue.length; n++) {
        const key = this.queue.shift();
        if (this.chunks.has(key)) continue;
        this.receive({ id: this.id, ...buildChunk(this.field, key, { chunk: this.chunk, voxel: this.voxel }) });
      }
      return;
    }
    while (this.idle.length && this.queue.length) {
      const key = this.queue.shift();
      if (this.chunks.has(key) || this.pending.has(key)) continue;
      this.pending.add(key);
      this.idle.pop().postMessage({ id: this.id, spec: this.spec, key, chunk: this.chunk, voxel: this.voxel });
    }
  }

  receive(d) {
    this.pending.delete(d.key);
    if (d.id === this.id && !this.chunks.has(d.key)) {
      let mesh = null;
      if (d.indices.length) {
        mesh = new THREE.Mesh(toGeometry(d), this.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        this.group.add(mesh);
      }
      const c = { key: d.key, mesh };
      this.chunks.set(d.key, c);
      this.onChunk?.(c);
    }
    this.pump();
  }

  /** Resolves when every chunk within `radius` of p is built (use it behind a loading screen). */
  async waitFor(p, radius = 40) {
    const C = this.chunk;
    this.update(p, this.viewRadius, true);
    const r = Math.ceil(radius / C);
    const ci = chunkOf(p.x, C), cj = chunkOf(p.y, C), ck = chunkOf(p.z, C);
    const need = [];
    for (let i = ci - r; i <= ci + r; i++)
      for (let j = cj - r; j <= cj + r; j++)
        for (let k = ck - r; k <= ck + r; k++) {
          const key = chunkKey(i, j, k);
          if (!this.live.has(key)) continue;
          if (Math.hypot((i + 0.5) * C - p.x, (j + 0.5) * C - p.y, (k + 0.5) * C - p.z) > radius + C * 0.87) continue;
          need.push(key);
        }
    while (!need.every((k) => this.chunks.has(k))) {
      if (!this.workers.length) this.pump();
      await new Promise((res) => setTimeout(res, this.workers.length ? 30 : 0));
    }
  }
}
