// ambientCG (ambientcg.com): CC0 photo materials (PBR), HDRI skies and a few models. Public JSON API, no key.
// Search: api/v2/full_json (the site's own search). Get: the zip at the chosen resolution, unzipped.
import fs from 'node:fs';
import path from 'node:path';
import { HelperError } from '../../lib/log.mjs';
import { cachedJson, download, matchScore, unzip } from '../lib/common.mjs';

const API = 'https://ambientcg.com/api/v2/full_json';
const TYPE_OF = { Material: 'material', HDRI: 'hdri', '3DModel': 'model', Decal: 'material', Atlas: 'sprite', Terrain: 'material', Substance: 'material', PlainTexture: 'material' };
const TYPE_PARAM = { material: 'Material', hdri: 'HDRI', model: '3DModel' };

export default {
  id: 'ambientcg',
  name: 'ambientCG',
  kinds: ['material', 'hdri', 'model'],
  styles: ['realistic'],
  license: 'CC0-1.0',
  creditRequired: false,

  async search(query, { kind, limit = 24 } = {}) {
    const p = new URLSearchParams({ q: query, limit: String(Math.min(60, Math.max(limit, 12))), include: 'previewData,tagData,displayData' });
    if (kind && TYPE_PARAM[kind]) p.set('type', TYPE_PARAM[kind]);
    const j = await cachedJson(`${API}?${p}`);
    const found = j.foundAssets || [];
    return found.map((a, i) => {
      const k = TYPE_OF[a.dataType] || 'material';
      if (kind && k !== kind) return null;
      const rel = matchScore(query, [{ text: a.displayName || a.assetId, weight: 3 }, { text: a.tags || [], weight: 2 }, { text: a.displayCategory || '', weight: 1.5 }]);
      const thumb = a.previewImage?.['256-PNG'] || a.previewImage?.['512-PNG'] || Object.values(a.previewImage || {})[0] || null;
      return {
        id: `ambientcg:${a.assetId}`, source: 'ambientcg', sourceName: 'ambientCG', title: a.displayName || a.assetId,
        kind: k, style: 'realistic', license: 'CC0-1.0', creditNeeded: false, thumb,
        page: a.shortLink || `https://ambientcg.com/view?id=${a.assetId}`,
        info: k === 'material' ? [a.displayCategory, a.creationMethodName].filter(Boolean).join(', ') : (a.displayCategory || ''),
        // the site's own order is good; blend it with our word match
        score: Math.max(0.25, rel * 0.7 + (1 - i / Math.max(1, found.length)) * 0.3),
      };
    }).filter(Boolean);
  },

  async get(id, { res = '1k', workDir, say = () => {} } = {}) {
    const j = await cachedJson(`${API}?id=${encodeURIComponent(id)}&include=downloadData,displayData,tagData`);
    const a = (j.foundAssets || []).find((x) => x.assetId === id) || (j.foundAssets || [])[0];
    if (!a || a.assetId !== id) throw new HelperError(`ambientCG has no asset called "${id}".`, 'Check the id from the find results (the part after "ambientcg:").');
    const downloads = Object.values(a.downloadFolders || {}).flatMap((f) => Object.values(f.downloadFiletypeCategories || {}).flatMap((c) => c.downloads || []));
    if (!downloads.length) throw new HelperError(`ambientCG lists no downloads for "${id}".`, 'Try another asset.');
    const R = res.toUpperCase();
    const want = [`${R}-JPG`, R, `${R}-PNG`];
    let d = null;
    for (const w of want) { d = downloads.find((x) => x.attribute === w); if (d) break; }
    if (!d) {
      d = downloads.find((x) => /^1K/.test(x.attribute || '') && /JPG/.test(x.attribute || '')) || downloads.find((x) => /^1K/.test(x.attribute || '')) || downloads[0];
      say(`  note  ${res} isn't available for this one; using ${d.attribute}.`);
    }
    const zip = path.join(workDir, d.fileName || `${id}.zip`);
    await download(d.fullDownloadPath || d.downloadLink, zip);
    let files = [];
    if (/\.zip$/i.test(zip)) {
      files = await unzip(zip, workDir);
      fs.rmSync(zip, { force: true });
    } else files = [zip];
    // keep what a game uses; drop preview renders and tool-specific files
    const keep = files.filter((f) => !/\.(usda|usdc|mtlx|tres|blend|sbsar)$/i.test(f) && !/_PREVIEW|preview\./i.test(path.basename(f))
      && path.basename(f).replace(/\.[^.]+$/, '') !== id && !/NormalDX/i.test(path.basename(f))); // <id>.png is the site's preview render; three.js wants the GL normal map
    for (const f of files) if (!keep.includes(f)) fs.rmSync(f, { force: true });
    const kind = TYPE_OF[a.dataType] || 'material';
    const main = kind === 'hdri' ? (keep.find((f) => /\.(hdr|exr)$/i.test(f)) || keep[0]) : kind === 'model' ? (keep.find((f) => /\.(glb|gltf|obj|fbx)$/i.test(f)) || workDir) : workDir;
    return {
      kind, title: a.displayName || id, author: 'ambientCG', license: 'CC0-1.0', url: a.shortLink || `https://ambientcg.com/view?id=${id}`,
      assetId: id, files: keep, main, res: d.attribute, folder: kind === 'material',
    };
  },
};
