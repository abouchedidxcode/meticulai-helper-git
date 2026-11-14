// Poly Haven (polyhaven.com): CC0 photoreal models, materials and HDRI skies. Public API, no key.
// Search: the asset list (cached a day) matched locally by name, tags and categories.
// Get: models as glTF + textures at the chosen resolution, packed into one GLB; materials as a folder of maps;
// HDRIs as one .hdr.
import fs from 'node:fs';
import path from 'node:path';
import { HelperError } from '../../lib/log.mjs';
import { cachedJson, download, mapLimit, matchScore } from '../lib/common.mjs';

const API = 'https://api.polyhaven.com';
const TYPE = { 0: 'hdri', 1: 'material', 2: 'model' };
const T_PARAM = { hdri: 'hdris', material: 'textures', model: 'models' };

export default {
  id: 'polyhaven',
  name: 'Poly Haven',
  kinds: ['model', 'material', 'hdri'],
  styles: ['realistic'],
  license: 'CC0-1.0',
  creditRequired: false,

  async search(query, { kind } = {}) {
    const t = kind ? T_PARAM[kind] : null;
    const all = await cachedJson(`${API}/assets${t ? `?t=${t}` : ''}`);
    const out = [];
    for (const [id, a] of Object.entries(all)) {
      const score = matchScore(query, [
        { text: a.name, weight: 3 }, { text: id, weight: 2.5 }, { text: a.tags || [], weight: 2 },
        { text: a.categories || [], weight: 1.5 }, { text: a.category || '', weight: 1 }, { text: a.description || '', weight: 0.6 },
      ]);
      if (score <= 0.2) continue;
      const k = TYPE[a.type] || 'model';
      const facts = [];
      if (k === 'model' && Array.isArray(a.dimensions)) facts.push(a.dimensions.map((d) => (d / 1000).toFixed(2)).join(' x ') + ' m');
      if (a.polycount) facts.push(`${a.polycount.toLocaleString('en')} triangles`);
      out.push({
        id: `polyhaven:${id}`, source: 'polyhaven', sourceName: 'Poly Haven', title: a.name, kind: k, style: 'realistic',
        license: 'CC0-1.0', creditNeeded: false,
        thumb: `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256&height=256`,
        page: `https://polyhaven.com/a/${id}`, info: facts.join(', '),
        score: score + Math.min(0.05, Math.log10((a.download_count || 1) + 1) / 120),
      });
    }
    return out;
  },

  /** Download into workDir. Returns { kind, title, author, license, url, files: [abs], main }. */
  async get(id, { res = '1k', workDir, format = 'glb', say = () => {} } = {}) {
    const info = await cachedJson(`${API}/info/${encodeURIComponent(id)}`).catch(() => null);
    if (!info || !info.name) throw new HelperError(`Poly Haven has no asset called "${id}".`, 'Check the id from the find results (the part after "polyhaven:").');
    const files = await cachedJson(`${API}/files/${encodeURIComponent(id)}`);
    const kind = TYPE[info.type] || 'model';
    const author = Object.keys(info.authors || {}).join(', ') || 'Poly Haven';
    const base = { kind, title: info.name, author, license: 'CC0-1.0', url: `https://polyhaven.com/a/${id}`, assetId: id };
    const pickRes = (obj) => {
      if (obj?.[res]) return res;
      const order = ['1k', '2k', '4k', '8k', '16k'];
      const have = order.filter((r) => obj?.[r]);
      if (!have.length) throw new HelperError(`Poly Haven has no downloadable files for "${id}".`, 'Try another asset.');
      say(`  note  ${res} isn't available for this one; using ${have[0]}.`);
      return have[0];
    };

    if (kind === 'hdri') {
      const r = pickRes(files.hdri);
      const f = files.hdri[r].hdr || files.hdri[r].exr;
      const out = path.join(workDir, `${id}_${r}${path.extname(new URL(f.url).pathname)}`);
      await download(f.url, out);
      return { ...base, files: [out], main: out, res: r };
    }

    if (kind === 'material') {
      const r = pickRes(files.Diffuse || files.diff);
      const want = { Diffuse: 'diff', nor_gl: 'nor_gl', Rough: 'rough', AO: 'ao', arm: 'arm', Displacement: 'disp' };
      const jobs = [];
      for (const [k, short] of Object.entries(want)) {
        const f = files[k]?.[r]?.jpg || files[k]?.[r]?.png;
        if (!f) continue;
        if (k === 'Displacement' && files[k]?.[r]?.jpg == null) continue;
        jobs.push({ url: f.url, out: path.join(workDir, `${id}_${short}_${r}${path.extname(new URL(f.url).pathname)}`) });
      }
      await mapLimit(jobs, 3, (j) => download(j.url, j.out));
      const got = jobs.map((j) => j.out).filter((f) => fs.existsSync(f));
      return { ...base, files: got, main: workDir, res: r, folder: true };
    }

    // model: the glTF and everything it includes, then (by default) one GLB
    const r = pickRes(files.gltf);
    const g = files.gltf[r].gltf;
    const gltfDir = path.join(workDir, 'gltf');
    const gltfFile = path.join(gltfDir, path.basename(new URL(g.url).pathname));
    await download(g.url, gltfFile);
    const inc = Object.entries(g.include || {}).map(([rel, f]) => ({ url: f.url, out: path.join(gltfDir, rel) }));
    const res2 = await mapLimit(inc, 3, (j) => download(j.url, j.out));
    const broken = res2.find((x) => x && x.error);
    if (broken) throw broken.error;
    if (format === 'gltf') return { ...base, files: [gltfDir], main: gltfFile, res: r, folder: true };
    const { toGlb } = await import('../lib/gltf.mjs');
    const glb = path.join(workDir, `${id}_${r}.glb`);
    await toGlb(gltfFile, glb);
    fs.rmSync(gltfDir, { recursive: true, force: true });
    return { ...base, files: [glb], main: glb, res: r };
  },
};
