// The search adapters. Live APIs (Poly Haven, ambientCG, Polyfork) plus the kit's own files (packs, catalogues).
// To add a source: one small module with { id, name, kinds, styles, license, creditRequired, search(), get() }.
import polyhaven from './polyhaven.mjs';
import ambientcg from './ambientcg.mjs';
import polyfork from './polyfork.mjs';
import packs from './packs.mjs';
import catalog from './catalog.mjs';

export const LIVE = [polyhaven, ambientcg, polyfork];
export const ALL = [...LIVE, packs, catalog];
export const byId = (id) => ALL.find((s) => s.id === id) || null;
export { polyhaven, ambientcg, polyfork, packs, catalog };
