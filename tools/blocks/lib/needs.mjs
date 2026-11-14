// The groups of blocks/BY-NEED.md ("You fly or glide", "Crowds, herds, flocks"...) and which group(s) a block is in.
// Used by build-catalog.mjs (to write BY-NEED.md) and list.mjs (--need).
import { tokens } from './words.mjs';

/** The groups in BY-NEED.md. `concepts` are from tools/blocks/lib/words.mjs; `kinds` are catalogue kinds. */
export const NEEDS = [
  { id: 'fly', title: 'You fly or glide', concepts: ['fly'], kinds: [] },
  { id: 'ride', title: 'You ride or drive', concepts: ['ride', 'drive', 'sail', 'race'], kinds: ['vehicle'] },
  { id: 'shoot', title: 'You shoot, throw or aim', concepts: ['shoot', 'throw', 'fight', 'magic'], kinds: ['combat'] },
  { id: 'crowd', title: 'Crowds, herds, flocks', concepts: ['crowd'], kinds: ['ai'] },
  { id: 'world', title: 'Water, sky, weather', concepts: ['water', 'sky', 'weather', 'fire'], kinds: ['sky-water-weather'] },
  { id: 'look', title: 'The look of the whole game', concepts: ['paint', 'pixel', 'look', 'miniature'], kinds: ['look'] },
  { id: 'hands', title: 'Hands, face and webcam controls', concepts: ['webcam'], kinds: ['input'] },
  { id: 'sound', title: 'Music and sound', concepts: ['music', 'sound'], kinds: ['audio'] },
  { id: 'physics', title: 'Physics and simulation', concepts: ['physics', 'marble', 'destruction', 'dig'], kinds: ['physics'] },
  { id: 'build', title: 'Building things from code', concepts: ['procedural', 'dungeon', 'city', 'nature'], kinds: ['procgen'] },
  { id: 'tuning', title: 'Tuning and testing', concepts: ['tuning', 'performance'], kinds: ['dev-tool', 'performance'] },
];
export const OTHER = { id: 'other', title: 'Everything else (characters, cameras, menus, game rules)', concepts: ['character', 'camera', 'replay', 'dice', 'online'], kinds: ['character', 'ui', 'camera'] };
const ALL = [...NEEDS, OTHER];


function needScores(b) {
  const fields = [
    [b.name, 2], [b.id, 1], [b.tags || [], 2.5], [b.use_when || '', 2], [b.what || '', 1], [b.good_for || '', 1],
  ];
  const score = Object.fromEntries(ALL.map((n) => [n.id, 0]));
  for (const [text, w] of fields) {
    const seen = new Set();
    for (const t of tokens(Array.isArray(text) ? text.join(' . ') : text)) {
      for (const c of t.concepts) {
        if (seen.has(c)) continue; // each concept counts once per field
        seen.add(c);
        for (const n of ALL) if (n.concepts.includes(c)) score[n.id] += w;
      }
    }
  }
  for (const n of ALL) if (n.kinds.includes(b.kind)) score[n.id] += 4;
  return score;
}

/** The one or two groups a block is listed under. A block.json may set "needs": ["fly", "tuning"] to choose. */
export function needsOf(b) {
  const valid = ALL.map((n) => n.id);
  if (Array.isArray(b.needs) && b.needs.length) {
    const chosen = b.needs.filter((x) => valid.includes(x) || x === 'other');
    if (chosen.length) return chosen;
  }
  const s = needScores(b);
  const ranked = Object.entries(s).sort((x, y) => y[1] - x[1]);
  if (!ranked.length || ranked[0][1] < 2) return ['other'];
  const out = [ranked[0][0]];
  if (ranked[1] && ranked[1][0] !== 'other' && ranked[0][0] !== 'other' && ranked[1][1] >= Math.max(3, ranked[0][1] * 0.6)) out.push(ranked[1][0]);
  return out;
}
