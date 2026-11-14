// Polyfork (polyfork.dev): low-poly, flat-shaded models at real-world scale (origin on the ground, front +Z).
// Browsing and the low-poly GLBs need no key. Mesh files are CC BY 4.0 (credit line given by the API).
import path from 'node:path';
import { HelperError } from '../../lib/log.mjs';
import { cachedJson, download, matchScore } from '../lib/common.mjs';

const API = 'https://polyfork.dev/api';

const sizeText = (s) => (s && s.x != null ? `${s.x} x ${s.y} x ${s.z} m` : '');

export default {
  id: 'polyfork',
  name: 'Polyfork',
  kinds: ['model'],
  styles: ['lowpoly'],
  license: 'CC-BY-4.0',
  creditRequired: true,

  async search(query, { kind, limit = 24 } = {}) {
    if (kind && kind !== 'model') return [];
    const p = new URLSearchParams({ q: query, per_page: String(Math.min(48, Math.max(limit, 12))), free: '1' });
    const j = await cachedJson(`${API}/assets?${p}`);
    const list = j.assets || [];
    return list.filter((a) => a.free !== false).map((a, i) => {
      const rel = matchScore(query, [{ text: a.title, weight: 3 }, { text: a.class || '', weight: 1 }, { text: a.kit || '', weight: 1 }]);
      return {
        id: `polyfork:${a.id}`, source: 'polyfork', sourceName: 'Polyfork', title: a.title, kind: 'model', style: 'lowpoly',
        license: 'CC-BY-4.0', creditNeeded: true, thumb: a.thumbnail || null, page: a.page,
        info: [sizeText(a.size_m), a.triangles ? `${a.triangles} triangles` : '', a.has_rig ? 'rigged' : '', a.kit ? `kit ${a.kit}` : ''].filter(Boolean).join(', '),
        // titles that answer the query rank high; description-only matches (the API says so) rank lower
        score: Math.max(0.2, rel * 0.75 + (1 - i / Math.max(1, list.length)) * 0.15 + (j.strong_matches ? 0.05 : 0)),
      };
    });
  },

  async get(id, { workDir } = {}) {
    let a;
    try { a = await cachedJson(`${API}/assets/${encodeURIComponent(id)}`); } catch (e) {
      throw new HelperError(`Polyfork has no asset called "${id}" (or didn't answer).`, 'Check the id from the find results (the part after "polyfork:").', e);
    }
    a = a.asset || a;
    const url = a.download?.glb || `https://polyfork.dev/cdn/${id}.glb`;
    const out = path.join(workDir, `${id}.glb`);
    await download(url, out);
    return {
      kind: 'model', title: a.title || id, author: 'Polyfork', license: 'CC-BY-4.0', url: a.page || `https://polyfork.dev/asset/${id}`,
      credit: a.credit || null, assetId: id, files: [out], main: out,
      note: 'Polyfork mesh files: CC BY 4.0 with the credit line (or the Polyfork licence: no credit, no redistribution).',
    };
  },
};
