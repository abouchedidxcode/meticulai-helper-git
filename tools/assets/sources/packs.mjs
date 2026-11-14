// Packs: whole downloadable kits listed in sources/packs/<source>.json (Kenney, KayKit, Quaternius, ...).
// Search: by name, tags and description. Get: the pack's zip, once, from the original site when the pack file gives a
// direct link (KayKit's GitHub zips), or from a zip the user downloaded by hand (--zip; Kenney, itch.io, Google
// Drive). It is unzipped into ~/.cache/meticulai-helper/packs/; then "get <source>:<pack>" lists what's inside and
// "get <source>:<pack>/<file>" takes one file.
import fs from 'node:fs';
import path from 'node:path';
import { HelperError, detail } from '../../lib/log.mjs';
import { cacheDir, download, fileKind, isCc0, listFiles, matchScore, mayFetch, unzip } from '../lib/common.mjs';
import { findPack, loadPackFiles } from '../lib/catalogs.mjs';

export default {
  id: 'packs',
  name: 'Packs (Kenney, KayKit, Quaternius...)',
  kinds: null, // depends on the pack
  styles: null,

  /** Pack source ids that have a sources/packs/<id>.json file. */
  sourceIds() { return loadPackFiles().map((p) => p.sourceId); },

  async search(query, { kind, style, sources = null } = {}) {
    const out = [];
    for (const pf of loadPackFiles()) {
      if (sources && !sources.includes(pf.sourceId) && !sources.includes('packs')) continue;
      for (const p of pf.packs) {
        if (kind && p.kinds.length && !p.kinds.includes(kind)) continue;
        if (style && p.styles.length && !p.styles.includes(style) && !p.styles.includes('any')) continue;
        const score = matchScore(query, [{ text: p.name, weight: 3 }, { text: p.id, weight: 2.5 }, { text: p.tags, weight: 2 }, { text: p.what, weight: 1 }, { text: p.kinds, weight: 0.8 }]);
        if (score <= 0.2) continue;
        out.push({
          id: `${pf.sourceId}:${p.id}`, source: pf.sourceId, sourceName: pf.header.name || pf.sourceId, title: p.name,
          kind: kind || p.kinds[0] || 'pack', style: p.styles[0] || '', license: p.license || 'see pack', creditNeeded: p.credit_required ?? !isCc0(p.license),
          thumb: p.preview || null, page: p.url, isPack: true,
          info: [`pack${p.count ? ` of ${p.count}` : ''}`, p.kinds.join('/'), p.formats.join('/'),
            p.preview && !mayFetch(p.preview) ? `no thumbnail here: see ${p.url}` : '', (p.download || p.github) ? '' : 'the user downloads it by hand'].filter(Boolean).join(', '),
          score,
        });
      }
    }
    return out;
  },

  has(sourceId) { return loadPackFiles().some((p) => p.sourceId === sourceId); },

  /** Make sure the pack is downloaded and unzipped. Returns { pack, dir, files }. */
  async ensure(sourceId, packId, { zipFile = null, say = () => {} } = {}) {
    const pack = findPack(sourceId, packId);
    if (!pack) throw new HelperError(`there is no pack "${packId}" in sources/packs/${sourceId}.json.`, `Search with  node tools/assets/find.mjs "<words>" --source ${sourceId}  to see the pack ids.`);
    const base = cacheDir('packs', sourceId, packId);
    const dir = path.join(base, 'files');
    const done = path.join(base, '.unzipped');
    if (!fs.existsSync(done)) {
      const zip = path.join(base, 'pack.zip');
      if (zipFile) {
        fs.copyFileSync(path.resolve(zipFile), zip);
      } else if (!fs.existsSync(zip)) {
        const url = await resolveDownload(pack);
        say(`Downloading the pack "${pack.name}" once from ${new URL(url).host} (kept in the download cache for next time)...`);
        await download(url, zip);
      }
      fs.rmSync(dir, { recursive: true, force: true });
      await unzip(zip, dir);
      fs.writeFileSync(done, new Date().toISOString());
      fs.rmSync(zip, { force: true }); // the unzipped files are what we use
    }
    return { pack, dir, files: listFiles(dir) };
  },
};

/** The zip's URL, when a tool may download it: the pack's direct link (e.g. a GitHub zip). Otherwise the person
 *  downloads it by hand (some sites need a click, and kenney.nl asks AI agents not to fetch anything). */
async function resolveDownload(pack) {
  const direct = pack.download || (pack.github ? githubZip(pack.github) : null);
  if (direct && mayFetch(direct)) return direct;
  throw manual(pack);
}

function githubZip(url) {
  try {
    const u = new URL(url);
    const [owner, repo] = u.pathname.split('/').filter(Boolean);
    return u.host === 'github.com' && owner && repo ? `https://codeload.github.com/${owner}/${repo.replace(/\.git$/, '')}/zip/HEAD` : null;
  } catch { return null; }
}

function manual(pack) {
  const page = pack.download_page || pack.url || 'the pack page';
  return new HelperError(`"${pack.name}" has to be downloaded by a person (the site needs a click, or asks tools not to download).`,
    `Ask the user, in plain words: "Please open ${page} and click Download${/itch\.io/.test(page) ? ' (choose the free option: type 0 or click \'No thanks, just take me to the downloads\')' : ''}. Then drag the zip into the my-game folder and tell me its name." Then run the same command again with  --zip <that file>.`);
}

/** Group a pack's files for listing. Prefers one copy per model (GLB over glTF over FBX over OBJ). */
export function groupPackFiles(files) {
  const groups = { model: [], image: [], audio: [], font: [], hdri: [] };
  const models = new Map();
  const rank = { '.glb': 0, '.gltf': 1, '.fbx': 2, '.obj': 3 };
  for (const f of files) {
    const k = fileKind(f);
    if (!k) continue;
    if (k === 'model') {
      const key = path.basename(f).replace(/\.[^.]+$/, '').toLowerCase();
      const cur = models.get(key);
      if (!cur || rank[path.extname(f).toLowerCase()] < rank[path.extname(cur).toLowerCase()]) models.set(key, f);
    } else groups[k].push(f);
  }
  groups.model = [...models.values()].sort();
  // previews/sample pictures aren't sprites
  groups.preview = groups.image.filter((f) => /(^|\/)(previews?|renders?|screenshots?)\//i.test(f) || /^(preview|sample|cover)\.(png|jpe?g)$/i.test(path.basename(f)));
  groups.image = groups.image.filter((f) => !groups.preview.includes(f));
  // textures that belong to the models (a texture folder, or next to the models) are not sprites
  if (groups.model.length) {
    const modelDirs = new Set(files.filter((f) => fileKind(f) === 'model').map((f) => path.dirname(f)));
    groups.texture = groups.image.filter((f) => modelDirs.has(path.dirname(f)) || /(^|\/)textures?\//i.test(f));
    groups.image = groups.image.filter((f) => !groups.texture.includes(f));
  }
  return groups;
}

/** Find one file in a pack by a relative path, a path ending, or a bare file name. */
export function findInPack(files, want) {
  const w = want.replace(/\\/g, '/').toLowerCase();
  const exact = files.find((f) => f.toLowerCase() === w);
  if (exact) return { file: exact };
  const ends = files.filter((f) => f.toLowerCase().endsWith('/' + w) || path.basename(f).toLowerCase() === path.basename(w));
  if (!ends.length) {
    const stem = path.basename(w).replace(/\.[^.]+$/, '');
    const loose = files.filter((f) => path.basename(f).toLowerCase().replace(/\.[^.]+$/, '') === stem);
    if (!loose.length) return { file: null, near: files.filter((f) => f.toLowerCase().includes(stem.slice(0, 5))).slice(0, 8) };
    ends.push(...loose);
  }
  const rank = (f) => ({ '.glb': 0, '.gltf': 1, '.png': 1, '.ogg': 1, '.fbx': 2, '.obj': 3 }[path.extname(f).toLowerCase()] ?? 5);
  ends.sort((a, b) => rank(a) - rank(b) || a.length - b.length);
  return { file: ends[0], others: ends.slice(1) };
}
