// The kit's own catalogues, so a search also suggests whole libraries and drop-in blocks:
// sources/catalog.json (asset libraries) -> "source:<id>", sources/libraries.json (code) -> "library:<id>",
// blocks/catalog.json (effects, systems, tools) -> "block:<id>".
import fs from 'node:fs';
import path from 'node:path';
import { isCc0, matchScore } from '../lib/common.mjs';
import { kitDir, loadBlocks, loadLibraries, loadSources } from '../lib/catalogs.mjs';

const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

export default {
  id: 'catalog',
  name: "the kit's catalogues",

  /** Which catalogue files exist. */
  status() {
    return { sources: loadSources() !== null, libraries: loadLibraries() !== null, blocks: loadBlocks() !== null };
  },

  async search(query, { kind, style, license } = {}) {
    const out = [];
    for (const s of loadSources() || []) {
      if (kind && arr(s.kinds).length && !arr(s.kinds).includes(kind)) continue;
      if (style && arr(s.styles).length && !arr(s.styles).includes(style) && !arr(s.styles).includes('any')) continue;
      if (license === 'cc0' && !isCc0(s.license)) continue;
      const score = matchScore(query, [{ text: s.name, weight: 3 }, { text: s.good_for || '', weight: 2 }, { text: arr(s.kinds), weight: 1.5 }, { text: arr(s.styles), weight: 1.5 }]);
      if (score <= 0.25) continue;
      out.push({
        id: `source:${s.id}`, source: 'catalog', sourceName: 'Asset library', title: s.name, kind: kind || arr(s.kinds)[0] || '',
        style: arr(s.styles).join('/'), license: s.license, creditNeeded: !!s.credit_required, thumb: null, page: s.url,
        info: `a whole library (${s.count_approx ? `~${s.count_approx} assets, ` : ''}${arr(s.kinds).join('/')}): ${s.good_for || ''}`.slice(0, 140),
        isLibrary: true, score: score * 0.8,
      });
    }
    for (const l of loadLibraries() || []) {
      if (kind && !['shader', 'vfx', 'animation'].includes(kind)) continue;
      const score = matchScore(query, [{ text: l.name, weight: 3 }, { text: l.what || '', weight: 2 }, { text: l.good_for || '', weight: 2 }]);
      if (score <= 0.3) continue;
      out.push({
        id: `library:${l.id}`, source: 'catalog', sourceName: 'Code library', title: l.name, kind: 'code', style: '',
        license: l.license, creditNeeded: !isCc0(l.license), thumb: null, page: l.repo || (l.npm ? `https://www.npmjs.com/package/${l.npm}` : null),
        info: `code library${l.npm ? ` (npm ${l.npm})` : ''}: ${l.what || ''}`.slice(0, 140), isLibrary: true, score: score * 0.7,
      });
    }
    for (const b of loadBlocks() || []) {
      if (kind && !['shader', 'vfx', 'animation', 'model'].includes(kind) && b.kind !== kind) continue;
      // Meticulai blocks also carry use_when (the situation they fit), tags (synonyms) and from_game (the game they came from)
      const score = matchScore(query, [
        { text: b.name, weight: 3 }, { text: b.id, weight: 2.5 }, { text: arr(b.tags), weight: 2.5 }, { text: b.use_when || '', weight: 2.5 },
        { text: b.what || '', weight: 2 }, { text: b.from_game || '', weight: 2 }, { text: b.good_for || '', weight: 1.5 }, { text: b.kind || '', weight: 1 },
      ]);
      if (score <= 0.25) continue;
      let thumb = null;
      if (b.preview) {
        const local = path.join(kitDir(), b.preview);
        thumb = fs.existsSync(local) ? local : (/^https?:/.test(b.preview) ? b.preview : null);
      }
      out.push({
        id: `block:${b.id}`, source: 'catalog', sourceName: 'Block', title: b.name, kind: b.kind || 'block', style: '',
        license: b.license, creditNeeded: !isCc0(b.license), thumb, page: b.upstream?.repo || b.play_url || null,
        info: `drop-in ${b.kind || 'block'} ${b.from_game ? `from ${b.from_game} (Meticulai)` : `by ${b.by || 'unknown'}`}: ${b.use_when ? `use when ${b.use_when}` : b.what || ''}`.slice(0, 140),
        isBlock: true, score: score * (b.tuned_by_play ? 0.95 : 0.9),
      });
    }
    return out;
  },
};
