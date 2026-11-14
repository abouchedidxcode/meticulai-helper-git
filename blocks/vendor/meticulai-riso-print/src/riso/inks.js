// Ink roles, surface modes and spot-ink sets for the riso print look. No three.js here (tests import it).
//
// A model never asks for a colour. It asks for a ROLE: mat(INK.ENEMY), mat(INK.WALL, MODE.WOOD).
// The riso look prints each role with its own mix of three spot inks (blue B, pink P, yellow Y) on paper;
// the plain look turns the same role into a lit colour. Keep the meaning of each ink fixed across the game:
// in Still Life 2, pink only ever means "this can hurt you" and yellow means "yours to grab".

/** Ink roles. The number is written into the G-buffer (green channel), so keep them 1..254 and unique. */
export const INK = {
  SKY: 1, // the sky dome: pale blue dots, the sun printed in solid blue
  WALL: 2, // walls, columns, big architecture: blue halftone by shade
  FLOOR: 3, // floors and ground: blue halftone + a 10% yellow tint
  ENEMY: 4, // what can hurt you: solid pink, shaded with blue dots, pink outline
  PICKUP: 5, // what is yours to grab (weapons, keys): solid yellow, pink dots in shade
  GLASS: 6, // mirrors, glass: blue wash
  ENEMY_SHOT: 7, // dangerous projectiles: pink + yellow (reads orange-red)
  PLAYER_SHOT: 8, // your projectiles: solid blue
  ZONE_SLOW: 9, // see-through areas (no outlines): yellow
  ZONE_FAST: 10, // see-through areas (no outlines): blue
  MACHINE: 11, // moving machinery (a roller, a press): yellow, pink glow stripes
  HANDS: 12, // first-person hands (view model)
  FX: 13, // sparks, muzzle flashes: yellow, pink where glowing
  LASER: 14, // laser lines: solid pink
  SHIELD: 15, // blocking things: blue + pink dots
  TURRET: 16, // static danger: pink + blue dots, yellow glow
  DISTANT: 17, // far skyline / backdrop: like WALL
  ITEM: 18, // small grabbable props (a bottle): yellow + blue dots
  SPLAT: 19, // spent ink (what's left of the dead): dull plum, never the live pink
  VM_PICKUP: 20, // a held pickup in the view model
  VM_FX: 21, // view-model effects
  MARK: 22, // markers and decals: solid blue
  SCENERY: 23, // furniture, set dressing: darker blue halftone
  SLEEVE: 24, // first-person sleeves
  PAPER: 25, // pale things (paper, cloth, skin): light blue dots
  CORE: 26, // a weak point / the thing to hit: pink + yellow, pink outline
  BEAM: 27, // big energy beams: blue + pink
  PLAYER: 28, // you, seen from outside: highlighter yellow, shaded in blue
};

/** Surface modes: procedural print patterns drawn into the shade channel. */
export const MODE = {
  PLAIN: 0, FLOOR: 1, WALL: 2, ZONE: 3, MIRROR: 4, SKY: 5, DRUM: 6, CRATE: 7,
  WOOD: 8, TILE: 9, TATAMI: 10, CARPET: 11, GRATE: 12, METAL: 13, PAPERWALL: 14, CEILING: 15,
  BELT: 16, HAZARD: 17,
};

/**
 * Spot-ink sets, as 0..1 display colours. `paper` is the sheet; B, P, Y the three inks.
 * Pink and yellow barely change between sets: only the blue (the "key" ink) does, so meaning survives.
 * @type {Record<string, {paper: number[], B: number[], P: number[], Y: number[]}>}
 */
export const PALETTES = {
  classic: { paper: [0.957, 0.933, 0.871], B: [0.16, 0.33, 0.68], P: [1.0, 0.30, 0.60], Y: [1.0, 0.87, 0.10] },
  teal: { paper: [0.955, 0.94, 0.88], B: [0.0, 0.43, 0.48], P: [1.0, 0.31, 0.56], Y: [1.0, 0.86, 0.12] },
  violet: { paper: [0.96, 0.935, 0.89], B: [0.35, 0.22, 0.6], P: [1.0, 0.32, 0.58], Y: [1.0, 0.85, 0.14] },
  green: { paper: [0.955, 0.94, 0.875], B: [0.1, 0.42, 0.3], P: [1.0, 0.33, 0.56], Y: [1.0, 0.86, 0.1] },
  night: { paper: [0.95, 0.925, 0.87], B: [0.27, 0.2, 0.56], P: [1.0, 0.28, 0.56], Y: [1.0, 0.84, 0.14] },
  burgundy: { paper: [0.96, 0.93, 0.875], B: [0.45, 0.16, 0.3], P: [1.0, 0.36, 0.55], Y: [1.0, 0.86, 0.2] },
  slate: { paper: [0.955, 0.94, 0.9], B: [0.2, 0.26, 0.33], P: [1.0, 0.3, 0.58], Y: [1.0, 0.85, 0.12] },
  black: { paper: [0.95, 0.93, 0.88], B: [0.14, 0.14, 0.17], P: [1.0, 0.29, 0.57], Y: [1.0, 0.86, 0.1] },
};

/** How fast a palette change "re-inks the press": the inks close this fraction of the gap per second (x dt). */
export const PALETTE_EASE = 2.5;

/**
 * Ease the current inks toward a target set (mutates `cur`). k = min(1, dt * 2.5) per call, as in the game.
 * @param {{paper:number[],B:number[],P:number[],Y:number[]}} cur
 * @param {{paper:number[],B:number[],P:number[],Y:number[]}} target
 * @param {number} dt seconds
 */
export function easePalette(cur, target, dt) {
  const k = Math.min(1, dt * PALETTE_EASE);
  for (const key of ['paper', 'B', 'P', 'Y']) {
    for (let i = 0; i < 3; i++) cur[key][i] += (target[key][i] - cur[key][i]) * k;
  }
  return cur;
}

/** Typical ink coverage [B, P, Y] of each role at mid shade. The plain look uses it so roles keep their colour. */
export const ROLE_COVERAGE = {
  [INK.SKY]: [0.12, 0, 0], [INK.WALL]: [0.4, 0, 0], [INK.FLOOR]: [0.42, 0, 0.1], [INK.ENEMY]: [0.4, 0.94, 0],
  [INK.PICKUP]: [0, 0.25, 1], [INK.GLASS]: [0.62, 0, 0], [INK.ENEMY_SHOT]: [0, 1, 1], [INK.PLAYER_SHOT]: [1, 0, 0],
  [INK.ZONE_SLOW]: [0, 0.12, 0.9], [INK.ZONE_FAST]: [0.75, 0, 0], [INK.MACHINE]: [0, 0.3, 1], [INK.HANDS]: [0.27, 0, 0],
  [INK.FX]: [0, 0.35, 1], [INK.LASER]: [0, 1, 0], [INK.SHIELD]: [0.85, 0.35, 0], [INK.TURRET]: [0.45, 1, 0],
  [INK.DISTANT]: [0.4, 0, 0], [INK.ITEM]: [0.3, 0, 0.75], [INK.SPLAT]: [0.6, 0.28, 0], [INK.VM_PICKUP]: [0, 0.25, 1],
  [INK.VM_FX]: [0, 0.35, 1], [INK.MARK]: [0.9, 0, 0], [INK.SCENERY]: [0.55, 0, 0], [INK.SLEEVE]: [0.7, 0, 0],
  [INK.PAPER]: [0.27, 0, 0], [INK.CORE]: [0, 1, 0.85], [INK.BEAM]: [1, 0.6, 0], [INK.PLAYER]: [0.39, 0, 0.82],
};

/**
 * The colour a role would print as: paper x (1 - cov x (1 - ink)) per ink, like the riso composite.
 * @returns {number[]} display RGB 0..1
 */
export function overprint(cov, pal = PALETTES.classic) {
  const [b, p, y] = cov;
  return [0, 1, 2].map((i) =>
    pal.paper[i] * (1 + (pal.B[i] - 1) * b) * (1 + (pal.P[i] - 1) * p) * (1 + (pal.Y[i] - 1) * y));
}

/** GLSL `#define I_<ROLE> <id>.0` lines, so the post shader can name roles. */
export function inkDefines(ink = INK) {
  return Object.entries(ink).map(([k, v]) => `#define I_${k} ${v}.0`).join('\n');
}
