// glTF files through glTF Transform: one reader/writer that understands the common extensions (Draco, meshopt,
// KTX2 textures pass through untouched), plus "make this a single self-contained GLB".
import fs from 'node:fs';
import { HelperError } from '../../lib/log.mjs';

let ioPromise = null;

/** A NodeIO with every extension and the Draco/meshopt codecs registered. */
export function getIO() {
  if (!ioPromise) {
    ioPromise = (async () => {
      let core, ext;
      try {
        core = await import('@gltf-transform/core');
        ext = await import('@gltf-transform/extensions');
      } catch (e) {
        throw new HelperError('the 3D file tools (glTF Transform) are not installed yet.', 'Run  node tools/doctor.mjs --fix  (or  npm install  in the kit folder) and try again.', e);
      }
      const io = new core.NodeIO().registerExtensions(ext.ALL_EXTENSIONS);
      const deps = {};
      try {
        const mo = await import('meshoptimizer');
        await mo.MeshoptDecoder.ready; await mo.MeshoptEncoder.ready;
        deps['meshopt.decoder'] = mo.MeshoptDecoder; deps['meshopt.encoder'] = mo.MeshoptEncoder;
      } catch { /* meshopt optional */ }
      try {
        const draco = (await import('draco3dgltf')).default;
        deps['draco3d.decoder'] = await draco.createDecoderModule();
        deps['draco3d.encoder'] = await draco.createEncoderModule();
      } catch { /* draco optional */ }
      io.registerDependencies(deps);
      return io;
    })();
  }
  return ioPromise;
}

export async function readDoc(file) {
  const io = await getIO();
  try {
    const doc = await io.read(file);
    const { Logger } = await import('@gltf-transform/core');
    doc.setLogger(new Logger(process.env.HELPER_VERBOSE === '1' || process.argv.includes('--verbose') ? Logger.Verbosity.INFO : Logger.Verbosity.ERROR));
    return doc;
  } catch (e) {
    throw new HelperError(`I couldn't read ${file} as a glTF/GLB model (${e.message.split('\n')[0]}).`, 'Check that the file downloaded completely and is a .glb or .gltf. For .fbx or .obj, open it in Blender and export as GLB first.', e);
  }
}

export async function writeDoc(doc, file) {
  const io = await getIO();
  await io.write(file, doc);
  return file;
}

/** Any glTF/GLB (with external .bin and textures) -> one GLB with everything inside. */
export async function toGlb(input, out) {
  const doc = await readDoc(input);
  await writeDoc(doc, out);
  return out;
}

/** True if a .glb/.gltf points at files outside itself (textures or buffers next to it). */
export function hasExternalRefs(file) {
  try {
    let json;
    if (file.toLowerCase().endsWith('.glb')) {
      const b = fs.readFileSync(file);
      const len = b.readUInt32LE(12);
      json = JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
    } else json = JSON.parse(fs.readFileSync(file, 'utf8'));
    const uris = [...(json.images || []), ...(json.buffers || [])].map((x) => x.uri).filter(Boolean);
    return uris.some((u) => !u.startsWith('data:'));
  } catch { return false; }
}
