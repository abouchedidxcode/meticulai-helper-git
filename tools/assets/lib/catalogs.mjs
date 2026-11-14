// Read the kit's catalogues: sources/catalog.json (asset libraries), sources/libraries.json (code libraries),
// sources/packs/<id>.json (packs inside a library), blocks/catalog.json (drop-in blocks).
// Every reader is forgiving: a missing file gives an empty list (the tools then say "the catalogue isn't there yet").
import fs from 'node:fs';
import path from 'node:path';
import { detail } from '../../lib/log.mjs';
import { REPO_ROOT } from '../../lib/paths.mjs';

/** Folder with sources/ and blocks/ (HELPER_KIT_DIR lets tests point at fixture catalogues). */
export const kitDir = () => (process.env.HELPER_KIT_DIR ? path.resolve(process.env.HELPER_KIT_DIR) : REPO_ROOT);

function readList(file, keys) {
  if (!fs.existsSync(file)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(j)) return j;
    for (const k of keys) if (Array.isArray(j[k])) return j[k];
    return [];
  } catch (e) {
    detail(`could not read ${file}: ${e.message}`);
    return [];
  }
}

/** Asset libraries. null when the file doesn't exist yet. */
export const loadSources = () => readList(path.join(kitDir(), 'sources', 'catalog.json'), ['sources']);
export const loadLibraries = () => readList(path.join(kitDir(), 'sources', 'libraries.json'), ['libraries', 'items']);
export const loadBlocks = () => readList(path.join(kitDir(), 'blocks', 'catalog.json'), ['blocks']);

export function sourceInfo(id) {
  return (loadSources() || []).find((s) => s.id === id) || null;
}

/** Pack files: sources/packs/<id>.json. Returns [{ sourceId, file, source: {...file header}, packs: [...] }]. */
export function loadPackFiles() {
  const dir = path.join(kitDir(), 'sources', 'packs');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const file = path.join(dir, f);
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      const list = Array.isArray(j) ? j : (j.packs || j.items || j.assets || []);
      const sourceId = (!Array.isArray(j) && (j.source || j.id)) || f.replace(/\.json$/, '');
      out.push({ sourceId: String(sourceId), file, header: Array.isArray(j) ? {} : j, packs: list.map((p) => normPack(p, sourceId, Array.isArray(j) ? {} : j)) });
    } catch (e) {
      detail(`could not read ${file}: ${e.message}`);
    }
  }
  return out;
}

const first = (...xs) => xs.find((x) => x !== undefined && x !== null && x !== '');
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

/** One pack row in a fixed shape, whatever the exact field names in the file. */
function normPack(p, sourceId, header) {
  const src = sourceInfo(sourceId) || {};
  return {
    id: String(first(p.id, p.slug, p.name)),
    name: first(p.name, p.title, p.id),
    url: first(p.url, p.page, p.homepage),
    download: first(p.download, p.download_url, p.zip, p.zip_url, p.downloadUrl),
    download_page: first(p.download_page, p.url),
    github: first(p.github),
    agent_fetch: first(p.agent_fetch, header.agent_fetch),
    notes: first(p.notes, ''),
    preview: first(p.preview, p.thumbnail, p.thumb, p.image, p.cover),
    kinds: arr(first(p.kinds, p.kind, header.kinds, src.kinds)),
    styles: arr(first(p.styles, p.style, header.styles, src.styles)),
    tags: arr(first(p.tags, p.keywords)),
    what: first(p.what, p.description, p.summary, ''),
    count: first(p.count, p.count_approx, p.assets),
    formats: arr(first(p.formats, header.formats, src.formats)),
    license: first(p.license, header.license, src.license),
    credit_required: first(p.credit_required, header.credit_required, src.credit_required),
    author: first(p.author, p.by, header.author, src.author, src.name),
    credit_template: first(p.credit_template, header.credit_template, src.credit_template),
    raw: p,
  };
}

export function findPack(sourceId, packId) {
  const pf = loadPackFiles().find((x) => x.sourceId === sourceId);
  if (!pf) return null;
  return pf.packs.find((p) => p.id === packId) || pf.packs.find((p) => p.id.toLowerCase() === packId.toLowerCase()) || null;
}

/** Fill a credit template: {title} {author} {url} {license}. */
export function fillTemplate(tpl, v) {
  return String(tpl).replace(/\{(\w+)\}/g, (_, k) => (v[k] != null && v[k] !== '' ? String(v[k]) : `(${k} unknown)`));
}

export const DEFAULT_CREDIT = '"{title}" by {author} ({url}), {license}';
