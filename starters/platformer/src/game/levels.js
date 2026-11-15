// THE LEVELS, as text you can type. This file is content only: no mechanics live here.
//
// A level is a picture made of characters. Each character is one tile (one tile = one world unit; the
// player is a bit under one tile tall and a full jump clears about three tiles). The legend:
//
//   (space)  air
//   #        ground: solid. Gets a grass top wherever there is air above it, and darkens inside.
//   =        block: solid stone/brick, for walls, towers and steps.
//   -        one-way platform: jump up through it, land on top, drop through with down + jump.
//   ^        spikes: hurt. Put them on top of something solid.
//   o        coin
//   P        where the player starts (one per level)
//   C        checkpoint (stand it on the ground; touching it moves your restart point)
//   G        goal (stand it on the ground)
//   e        crawler: an enemy that walks back and forth and turns at walls, ledges and spikes
//   M        moving platform (3 tiles wide, centred here; you stand on the TOP of this row)
//   ~        its track, when it slides sideways: put a run of ~ right next to the M, left or right
//   :        its track, when it goes up and down: put a run of : right above or below the M
//
// Rules of thumb for a fair level (they match the numbers in tuning.json):
//   - a gap of 3 tiles is easy, 4 is a real jump, 5 needs a perfect one
//   - a step of 1 or 2 tiles is easy, 3 is the most a full jump can climb
//   - leave 3 tiles of flat ground before a hazard so the player can read it
//   - put coins where you want the player to go: an arc of coins over a gap says "jump here"
//
// A level is { id, name, sections, next }. `sections` are joined left to right, so each piece stays
// short enough to read and you can reorder or reuse them. They are lined up at the BOTTOM row, so they
// don't need the same number of rows, and rows don't need the same length. `next` is the id of the
// level the goal leads to (null = reaching the goal wins the game). `rows` (optional) is the least
// number of rows of sky the level gets.
//
// To add a character to the legend (a new tile, enemy or pickup): see STARTER.md, "Make it yours".

// 1. The meadow: flat ground, a first step, a dip you can't die in, a platform to jump up through,
//    one crawler with room to jump it. Teaches: run, jump, coins mean "this way".
const MEADOW = `
##
##
##                     o    oooo
##           oo       o o   ----         oo
##          o                           o  o
##                                                  C  ooo
##  P  ooo    ########   ###########      e    #############
######################   ###################################
############################################################
############################################################
############################################################
`;

// 2. The spikes: every hazard arrives after flat ground, with coins drawing the jump over it. The two
//    tall towers near the end are an optional wall-jump climb to a stash of coins.
const SPIKES = `
                                                    oooo
                                                = o ====
                                                =   =
                                                = o =
                                                =   =
                                 oo             = o =
                                o  o      o     =   =
        oo       o                       o o    =   =
       o  o     o o     ooo      ^^              ---
                              ###########
        ^^               e    ###########                C
################   ######################   ################
################   ######################   ################
################   ######################   ################
################   ######################   ################
################   ######################   ################
`;

// 3. The crossing: a moving platform over a safe trench first, then one over a real pit, then a lift
//    up to a high ledge with the last checkpoint.
const CROSSING = `
                                                         oo
                                                        o  o
                                                     C   ^^
                                                 : #############
                                                 : #############
                                                 : #############
                          ooo                    : #############
                                                 : #############
             o o o o       e       o o o o   oo  : #############
##########  M~~~~~~~  ##########  M~~~~~~~  #### M #############
##########            ##########            ####   #############
##########=          =##########            ####   #############
################################            ####   #############
################################            ####   #############
`;

// 4. The way home: everything at once, a little faster. Steps down, a platform over a bed of spikes,
//    crawlers on narrow ground, a last lift to the goal.
const HOME = `
                                                     oo G
   e                                             : #########
######oo                                o        : #########
######                                 o o       : #########
#########oo                                      : #########
#########                       ooo          e   : #########
############                        ###   ###### M #########
############ ooo     o o o o     e  ###   ######   #########
##################  M~~~~~~~  #########   ######   #########
##################^^^^^^^^^^^^#########   ######   #########
#######################################   ######   #########
#######################################   ######   #########
#######################################   ######   #########
`;

// A second, tiny level. It is not linked from the first one: set `next: 'steps'` on the level above to
// play it after the meadow, or jump to it with the "Level 2" test button (?test=1).
const STEPS = `
                      o o
                o o  -----
        o o    -----
       -----            e                 G
  P               ############    oo    #####
#########    o    ############  M~~~~   #####
#########   ###   ############          #####
#########   ###   ############          #####
`;

export const LEVELS = [
  { id: 'meadow', name: 'The meadow', sections: [MEADOW, SPIKES, CROSSING, HOME], next: null, rows: 18 },
  { id: 'steps', name: 'Stepping stones', sections: [STEPS], next: null, rows: 14 },
];

// What each character means to the code. `tile` entries become collision tiles (see level.js for what
// solid / oneWay / hazard do); the others become things placed in the level.
export const LEGEND = {
  '#': { tile: 'ground' },
  '=': { tile: 'block' },
  '-': { tile: 'oneway' },
  '^': { tile: 'spike' },
  o: { thing: 'coin' },
  P: { thing: 'start' },
  C: { thing: 'checkpoint' },
  G: { thing: 'goal' },
  e: { thing: 'enemy', type: 'crawler' },
  M: { thing: 'mover' },
  '~': { track: 'x' },
  ':': { track: 'y' },
};

// Tile kinds. Add one here, give it a character above and a look in draw/tiles.js.
export const TILES = {
  air: { id: 0 },
  ground: { id: 1, solid: true },
  block: { id: 2, solid: true },
  oneway: { id: 3, oneWay: true },
  spike: { id: 4, hazard: true },
};
