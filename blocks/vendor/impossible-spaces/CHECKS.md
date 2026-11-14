# Checks

What the scripts in `scripts/` found on the build released as 1.0.1. All of it ran in headless Chromium on WebGPU on one PC (an RTX 4090), muted, with a pretend pointer lock, and with frames stepped by hand unless it says otherwise.

| Check | Result |
|---|---|
| `all.mjs`: walk in through all 34 walkable openings, straight and slanted (68 runs, 1/240 s steps, every frame compared with the one before) | 68 crossed. Largest one-frame jump 2.6 of 255, where ordinary walking changes 0.5 to 5 a frame. No pop, black frame or wrong-side flash. |
| `roll-all.mjs`: a ball rolled in through all 34 | 34 came out in the right room at the right size, down and heading, speed kept within 1%, drawn on both sides while straddling. |
| `props.mjs`: roll into the tunnel, throw through the shrinking door, the wall door and the tunnel's window, carry through the tunnel mouth | All five as expected. |
| `walk.mjs`: tunnel slow, strafing, grazing, stopping at the plane and turning, backwards; hut in and out; the corridor's cut; stairs up, down and across the seam; wall door; table door; mouse door; the whole tunnel at a run | Crossed each time, no single-frame spike. |
| `zfight.mjs`: 2,808 views drawn twice, the second with the camera nudged a tenth of a pixel, flagging areas that flip | 12 views flagged, each a line one or two pixels wide where a view inside a view meets its frame, far away: edge aliasing, not two surfaces swapping. |
| `fps.mjs` at 1920×1080, each frame waited on, uncapped | Stairs looking up (7 views, 5 deep) 192 fps; tunnel mouth 233; gallery 244; table room 222; hall 263. |
| `smoke.mjs`: the real page with its own loop, real keys and clicks | Pick up, walk, throw and restart work, no console errors, nothing requested from another host. |

## Loading

| Check | Result |
|---|---|
| The baked light | 65.3 MB of half-float EXR packed to 3.4 MB of lossless WebP (`tools/pack-lightmaps.mjs`): half the bake's size, denoised, eight bits a channel with a gamma curve and a little noise before rounding. A smooth wall with its tones stretched fivefold shows no banding beside the original. Lossy WebP at quality 95 and 98 was tried and showed blocks and colour shifts there, so it isn't used. |
| The release | 37 files, 14.8 MB; a first visit downloads 11.3 MB from Patch's game host (the script is compressed in transit). |
| `cold.mjs` on the game host: a new browser profile, CPU slowed four times, 30 Mbit/s | Ready in 9.0 s, about 5 s of it download; the longest task while loading 0.8 s on the slowed CPU; no frame over 50 ms in the 3 s after ready, nor on going straight to each room and bringing the ball. At full speed and 100 Mbit/s, ready in 3.8 s. |
| `page-visit.mjs`: the live demo's bytes in a real block page's frame, twice, with rooms, outlines and the ball pressed | The page round the demo never went more than 178 ms between frames, all of that while loading, and nothing after ready. |
| The same script on another WebGPU block, as a control | Some runs start with up to 2.9 s before the page's first frame reaches the screen, on that block as on this one: the browser bringing WebGPU up, and longer when other work is on the graphics card. |
| Patch's own test of the release, in Patch Desktop | Passed: ready, every control through its range, the button, a click and W held, no frame over 100 ms after ready. (1.0.0's draft failed it: the ball button dropped the ball out of sight. A failed version can't be reused, so the first release is 1.0.1.) |

How the loading is kept light: every number that differs between surfaces or rooms is a uniform, so the whole gallery draws with a handful of programs; one surface of each program is compiled ahead and then drawn on its own, one a turn, with a wait on the graphics card between; textures are handed over one at a time; and every room is drawn once through every opening behind the cover before the demo says ready.

## Known limits

- **Edges that aren't shared.** Walls split round a door meet the floor and ceiling along edges they don't share end to end, so now and then a single pixel between them shows what is behind. Behind everything is the room's own overall colour, so it is faint. Cutting every room's shell so all its quads share edges would remove it, and needs every room rebaked.
- **Light at a threshold.** Each room is baked on its own, with a soft light standing in for the room behind each opening. Dark-lined reveals hide the step; at the tunnel's mouth, where the lining is concrete, a step in brightness shows at the joint.
- **Things half through an opening** touch only their own side until their centre crosses.
- **No body.** The walker has no body or shadow; carried things have a soft round shadow only.
- **Reflections** on floors are a generic studio, not the room.
- **Memory.** Every view is a screen-sized multisampled target, so the page caps its pixels at about 1440p.

## Not checked

A person playing with a real mouse on another PC; any graphics card but the one above; any browser but Chromium.
