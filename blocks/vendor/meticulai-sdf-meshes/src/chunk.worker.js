// Cave chunk worker: builds the field from the spec it is sent (same spec = same rock as the main
// thread) and meshes chunks on request. Started by streamer.js. From Abyssal by Meticulai.
import { CaveField } from './cave.js';
import { buildChunk } from './chunks.js';

let field = null;
let specId = null;

self.onmessage = (ev) => {
  const { id, spec, key, chunk, voxel } = ev.data;
  if (!field || specId !== id) { field = new CaveField(spec); specId = id; }
  const c = buildChunk(field, key, { chunk, voxel });
  self.postMessage({ id, ...c }, [c.positions.buffer, c.normals.buffer, c.ao.buffer, c.indices.buffer]);
};
