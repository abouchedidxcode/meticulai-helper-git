// THE TRACKS, as data. A track is a closed loop of control points; everything else (the road
// ribbon, kerbs, rails, start line, checkpoints, the racing line the rivals drive, the terrain
// around it and the scenery) is built from this file. Add a track by adding an object to TRACKS.
//
// A control point is [x, z, height, width, bank]:
//   x, z     position on the map in metres (x = east, z = south). The loop closes by itself
//            and is smoothed into curves, so 8 to 20 points are enough.
//   height   metres above the sea (keep it above 1.5 or the road floods). Hills are just numbers here.
//   width    road width in metres at this point (optional, default 13). Wider = easier.
//   bank     extra tilt in degrees (optional). Corners already bank by themselves (autoBank).
// The race runs in the order of the list; the start line is at the first point.
//
// Rules of thumb: keep points 50-120 m apart, keep two stretches of road at least 40 m apart
// (the loop must not cross itself), and check a new track with the bot (?bot=1&track=<index>).
//
// Pick the track with "Track" in the tuning panel (then reload), or ?track=1 in the address.

export const TRACKS = [
  {
    name: 'Lakeside Circuit',
    laps: 3,
    checkpoints: 6, // gates spread evenly round the lap (the last one is the finish line)
    verge: 5, // grass between the road edge and the rail, each side (metres)
    autoBank: 7, // degrees of banking in the tightest corners
    points: [
      [-120, 120, 2.5, 15],
      [0, 126, 2.5, 15],
      [110, 118, 4, 14],
      [172, 78, 9, 13],
      [182, 8, 15, 13],
      [142, -52, 21, 13],
      [70, -62, 18, 13],
      [28, -18, 11, 13],
      [-22, 8, 6, 13],
      [-62, -32, 4.5, 13],
      [-52, -102, 8, 13],
      [-112, -132, 10, 14],
      [-172, -92, 6, 13],
      [-152, -20, 3.5, 13],
      [-192, 48, 2.5, 13],
      [-172, 104, 2.5, 14],
    ],
    // The land around the road. hills = how tall the wild ground gets, scale = how wide the
    // hills are, lakes dig a bowl that fills with water, shore = how far past the track the
    // island ends.
    terrain: { hills: 13, scale: 95, seed: 7, shore: 64, lakes: [{ x: -98, z: 38, r: 70, depth: 9 }] },
    // Scenery rules. "along" places things beside the road every so many metres;
    // "scatter" sprinkles them over the island. kind: tree | rock | post.
    scenery: [
      { kind: 'tree', along: 14, from: 4, to: 26, chance: 0.6 },
      { kind: 'rock', along: 37, from: 3, to: 20, chance: 0.6 },
      { kind: 'post', along: 24, from: 0.6, to: 0.6, chance: 1 },
      { kind: 'tree', scatter: 420 },
      { kind: 'rock', scatter: 70 },
    ],
  },
  {
    name: 'Pine Loop',
    laps: 4,
    checkpoints: 4,
    verge: 4,
    autoBank: 9,
    points: [
      [-70, 48, 3, 14],
      [30, 56, 3, 14],
      [96, 22, 5, 13],
      [84, -44, 8, 13],
      [14, -30, 6, 13],
      [-44, -70, 5, 13],
      [-104, -30, 3.5, 13],
    ],
    terrain: { hills: 9, scale: 70, seed: 3, shore: 60, lakes: [{ x: 22, z: 12, r: 30, depth: 6 }] },
    scenery: [
      { kind: 'tree', along: 9, from: 3, to: 28, chance: 0.85 },
      { kind: 'post', along: 20, from: 0.6, to: 0.6, chance: 1 },
      { kind: 'tree', scatter: 260 },
      { kind: 'rock', scatter: 40 },
    ],
  },
];
