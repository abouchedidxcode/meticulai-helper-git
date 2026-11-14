# Feel: input, camera, weight, feedback

**The rule:** every press is answered on the next frame, the camera never fights the player, every hit has weight
(a short freeze, a sound, a visible push), and input is generous when it's ambiguous. Once the person says the feel is
right, write it down and never change it without asking.

## Evidence

**Write the feel as numbers first.** Inkbound's first version found hits from wherever the animated blade happened to
be, so "feel and looks could not be tuned apart." The rebuild put the numbers in one table (frames are 1/60 s) and made
the animation follow it:

| Move | Startup | Active | Recovery | Hit-stop |
| --- | --- | --- | --- | --- |
| Quick slash | 5 | 3 | 11 | 3 frames (50 ms) |
| Heavy stroke | 16 | 4 | 24 | 8 frames (~133 ms) |
| Falling cut | | | | 12 frames |
| Parry | | | | 14 frames, plus slow motion |

Also: full run speed in 4 frames, every button buffered for 6 frames, and a run of 620 px/s where the first version
walked at 300 ("A fight should be fast enough that moving is fun before anything is hit"). One detail mattered on
screen: the freeze first showed the blade still overhead, so every sweep was retimed to finish one frame after the hit.

**Hit-stop must be checked in real time.** Dig Site added hit-stop to its pick (70-85 ms) and chisel (25-35 ms). Its
handover admits it was "tuned blind ... never judged; headless frames miss them." Test browsers run far below real
speed, so a 50 ms freeze can't be judged from a recording. A person has to feel it.

**Speed comes from the near field, not the number.** Dune Sails' design notes: "Speed sensation comes from the near
field: ground texture rushing, particles, FOV and sound pitch, not the number." The same game felt like
driving over "rocks" on smooth sand: the camera shook at 47-53 Hz, which aliases badly at 60 fps. Smoothing what the
hull rides on fixed it.

**But fast is not the goal.** Lost Marbles felt "way too fast" and jittery to the creator. Speed bursts from the
server and burst boosts were removed or softened. Kite Race went further: six
critic rounds had pushed it to 110-210 km/h, and the creator found it "too fast ... not a fun vibe." Cruise dropped to
54 km/h, and shake, motion blur, speed streaks and hit-stops all came out. Juice serves the fantasy. A calm game wants
less of it.

**Controls need a stable reference.** Kite Fight: "controlling the kite is quite difficult." The pointer aimed relative
to the kite's on-screen position, which drifted with the camera's lag: "The hand still has no stable reference."
The fix: "The pointer aims from a fixed spot on the screen, so holding the mouse still holds the nose still." 

**The camera must never lose the player.** Abyssal's camera swung "60-80 deg to straight overhead in tunnels" and the
sub was invisible for 20+ s; it is now capped at 54 degrees above the sub. Orbitball's camera started inside a wall
with the player off screen (see [Orbitball](../case-studies/orbitball.md)).

**Charitable input.** The hands games (webcam games played with your hand) have a rule: "Be charitable with gestures
... low thresholds ... generous hit areas ... When the game is unsure, it says the player is right." Concretely:
- Pinch uses **hysteresis**: two thresholds instead of one, so a wobbly half-pinch doesn't flicker on and off. In the
  Show of Hands hall a pinch turns on at 0.72 and off at 0.42.
- Fireflies catches on how slowly the hand closes. The "scared" threshold is 120 ms while a normal close takes 250-500
  ms, and the catch radius is "generous on purpose."
- Everything can also be played with mouse, keyboard or touch through the same code path.

**Don't change feel the player praised.** On Dragon Aces the creator said "the way you control and move, and the speed
is right." That became a standing rule through a full UI overhaul: the flight feel, speed and controls were not touched.
Scrapfall's first grey-box movement was called
"perfect," and later rounds were built around it.

## How to apply it

- [ ] Put every feel number in one tuning file (`src/tuning.json` in the starter): speeds, acceleration, jump, buffers,
      hit-stop, shake, camera distance. The game reads it; the dev panel edits it live.
- [ ] Answer every press on the next frame. Buffer inputs for about 6 frames so early presses aren't lost.
- [ ] For hits: freeze both sides briefly (about 3 frames light, 8 heavy), play a sound, push the target visibly, kick
      the camera a little. Then ask the person if it feels right; never tune hit-stop from recordings alone.
- [ ] Make the camera keep the player and the next decision in view. Cap camera angles; test in tight spaces.
- [ ] Give controls a fixed reference (screen centre, world direction), never one that drifts with the camera.
- [ ] For speed: near-ground detail, particles, FOV and sound pitch. Kill high-frequency camera shake.
- [ ] For webcam or fuzzy input: two thresholds (hysteresis), generous targets, a short grace period, and a
      mouse/keyboard path that runs the same code.
- [ ] When the person praises the feel, write it in `DECISIONS.md` as a standing rule and keep it.

Related: [what makes it fun](what-makes-it-fun.md), [audio](audio.md), [gotchas](gotchas.md).
