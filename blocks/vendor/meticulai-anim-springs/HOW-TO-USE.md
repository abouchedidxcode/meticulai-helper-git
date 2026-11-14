# Anim springs: how to use it

An animation toolkit for three.js from **Bonesworth** (a live tavern dice game on meticulai.com whose opponent and
first-person hands run on it). It makes things move smoothly without hand-made animation files:

- **Springs** that follow a moving goal with no overshoot (or a little bounce if you want it), the same at 30 or 144 fps.
- **Inertialized transitions**: switch from one animation to another with no pop and no crossfade.
- **A layer stack**: one base animation plus additive layers (breathing, sway, look-at, recoil) with masks.
- **Timelines** of named channels (hand position in metres, lean in radians) with smooth keys and events.
- **Two-bone IK** (arms, legs) that works on any rig, and **aim** helpers for heads and eyes.
- **Variation** (never the same move twice in a row) and seeded **noise** for breathing and idle sway.
- **Smoothness metrics** that find single-frame pops in a recorded run.

Renderer: **none** of its own. It only uses three.js maths and `Object3D`, so it works with `WebGLRenderer`,
`WebGPURenderer`, any model or a figure made of boxes. npm deps: `three` only (checked on 0.187).

## What to copy

- **Reusable system:** `src/` (import everything from `src/index.js`). 13 small files, no side effects.
- **Demo only:** `demo/` (a capsule figure that reaches for the mouse, waves and breathes).
- **Tests:** `test/anim.test.mjs` (40 cases, `npm test`).

## API in five recipes

```js
import * as A from '../../vendor/meticulai-anim-springs/src/index.js';

// 1. Follow something smoothly (camera, a hand target, a UI element, a value).
const follow = new A.SpringVec3(start, 0.15);   // half-life 0.15 s
follow.update(dt, goalVec3);                     // every step; read follow.x (and follow.v)
const yaw = new A.Spring(0, 0.1); yaw.update(dt, wantedYaw);
const look = new A.SpringQuat(undefined, 0.12); obj.quaternion.copy(look.update(dt, wantedQuat));
const wobble = new A.BouncySpring(0, 2, 0.3);   // 2 Hz, damping ratio 0.3: overshoots, then settles
// one-off: A.criticalSpring(state, goal, halflife, dt, goalVelocity) on a { x, v } object

// 2. Reach with an arm (any rig: axes are measured from the bind pose).
const ik = new A.TwoBoneIK(upperArm, foreArm, hand, new THREE.Vector3(0, 0, -1)); // elbows point back (+Z facing)
ik.solve(targetWorld, poleWorld, { softness: 0.06, weight: 1 }); // every step, after the parents are posed

// 3. Look at something, limited and smooth.
A.lookAngles(headWorldPos, chestWorldQuat, target, out);            // out.yaw, out.pitch (radians)
const q = A.quatFromEuler(-A.softClamp(out.pitch, -0.6, 0.6, 0.17), A.softClamp(out.yaw, -1.2, 1.2, 0.26), 0);
head.quaternion.copy(look.update(dt, q));
// or one bone directly: A.aimBone(bone, target, { forward: new THREE.Vector3(0, 0, 1), maxAngle: 1 })

// 4. Switch animations without a pop (bones).
const stack = new A.LayerStack(['spine', 'L_upper', 'L_lower']);
stack.play(restSource);                                   // a PoseSource: { name, duration, loop, sample(t, pose) }
stack.play(waveSource, { mode: 'inertial', fade: 0.18 });  // or { mode: 'crossfade', fade: 0.25, matchPose: true }
stack.play(A.clipSource(gltf.animations[0], true));       // glTF clips work too
stack.addLayer({ name: 'breath', weight: 1, mask: { spine: 1 }, evaluate: (dt, t, out) => { /* write offsets */ } });
stack.update(dt).applyTo(boneMap);                        // boneMap: A.collectBones(model) or your own Map

// 5. Keyframe a gesture on named channels and switch without pops (numbers, not bones).
const L = new A.ChannelLayout({ hand: [0, 1, 0.3], lean: 0 });
const tl = new A.Timeline(L).key(0.3, { hand: [0.1, 0.9, 0.4] }).key(0.6, { lean: 0.2 }, { ease: 'outBack' }).event(0.5, 'release');
tl.startFrom(current);  tl.limitSpeed('hand', 0.95);  tl.addArcs('hand', { up: [0, 1, 0], bulge: 0.09 });
const inert = new A.ChannelInertializer(L.size, 0.12);
inert.transition(tl.sample(0, tmp), tl.velocity(0, tmpVel)); // on switch
inert.update(raw, dt, out);                                  // every step; then drive IK / bones from `out`
```

Also: `TimelinePlayer` (plays a timeline into a buffer, `onEvent`, `done` promise), `ChannelFollower` (a 20-30 ms
low-pass that makes keyed motion C2), `PoseInertializer`, `Pose` (blend, additive `difference`, `maxAngleTo`),
`findBestEntryTime`, `VariationPicker`, `Jitter`, `Rng` (seeded, `fork('name')`), `Noise1`/`fbm1`, `clampQuatAngle`
(joint limits that never flip), `swingTwist`, `MotionRecorder` (smoothness report), easings and `cubicBezier`.

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-anim-springs` (copies to `my-game/vendor/meticulai-anim-springs/`). No npm
   deps to add (the starter already has `three`).
2. In `my-game/src/game/player.js` (or any file in `src/game/`):
   `import { SpringVec3, BouncySpring } from '../../vendor/meticulai-anim-springs/src/index.js';`
3. Create springs in `createPlayer` / `createGame` and call `.update(dt, goal)` in `update(dt, mode)`. The starter's
   fixed 60 Hz step is ideal; the springs are exact at any `dt` anyway.
4. Put the half-lives in `my-game/src/tuning.json` so the user can feel them in the dev panel (backquote key), e.g.
   `"anim": { "followHalflife": { "value": 0.15, "min": 0.02, "max": 0.6, "step": 0.01, "label": "Follow half-life (s)",
   "help": "Time to close half the gap. Lower = snappier." } }`, then set `spring.halflife = tune.anim.followHalflife`
   each step.
5. Good first uses in the starter: the follow camera (`camera.js`), squash and stretch on landing (a `BouncySpring` on
   the squash scale), a head or hat that lags the body, pickups that bob toward the player.
6. For `window.__game.state()` (bots, recordings), report things like `ik.reach` and `stack.playing?.name`.

## The numbers that matter

| Number | Default | What it feels like |
|---|---|---|
| Spring half-life | 0.15 s | Time to close half the gap. 0.05 = snappy, almost glued. 0.15 = responsive, soft. 0.4 = floaty, heavy. |
| Inertialization half-life (`fade`) | 0.12 s | How fast the old pose's offset melts away. 0.1-0.2 hides any switch; longer looks sluggish. |
| `ChannelFollower` half-life | 0.025 s | Kills jerk at every key for a few mm of lag. Bonesworth used 22 ms on the body, 16 ms on hands, 6 ms on fingers. |
| IK `softness` | 0.015 m (default), 0.06 m in Bonesworth | The last bit of reach is approached gently, so the elbow never snaps straight. |
| `BouncySpring` | 2 Hz, ratio 0.4 | Ratio 1 = no bounce, 0.3 = one clear overshoot, 0.1 = jelly. |
| Layer weight fade | 0.2 s | How fast an additive layer (breathing, look-at) fades in and out. |
| `limitSpeed` | 0.95 m/s for hands in Bonesworth (0.7 holding a mug) | Above this, keyed reaches look robotic. |
| `addArcs` | 12 cm, bulge 0.09-0.1 | Long moves curve instead of travelling on a ruler line. |
| `Jitter` | 8% time, 12% amplitude | Enough that repeats never look copy-pasted. |

## What made it good in Bonesworth

- The brief asked for an opponent whose animation is "as smooth and seamless and fun as possible while also not getting
  overly repetitive". The game measured it instead of eyeballing it: every bone recorded at 60 fps through scripted and
  random matches, with the metrics in `src/metrics.js`.
- Starting every new action from the live pose and inertializing the switch took the worst transition from 127 degrees
  in one frame to under 3 degrees. The same script with plain cuts measured 107 degrees per frame and a pop ratio of 429.
- A 22 ms output follower removed the jerk spikes that keyframe splines have at every key.
- A joint clamp with history (`clampQuatAngle(q, max, soft, hist)`) removed a 161-degree hand flip that a critic caught
  in review; the worst wrist request dropped from 180 to 117 degrees.
- 6 cm of IK softness and a 0.95 m/s hand speed limit took far-reach forearm spikes from 17 to 12 degrees per frame. Over
  1,500 s of auto-played matches, no body bone turned more than 12 degrees in one frame.
- Every lean went through critically damped springs: hips peaked at 0.35 m/s instead of 1.9, with no jolt.
- `VariationPicker` plus per-performance `Jitter` meant no move played twice in a row and repeated moves still differed
  (closest pair of palm paths over six throws: 3 cm apart).

## Gotchas

- Call `ik.solve` **after** the parents are posed (layers applied, `updateMatrixWorld`), every step. It writes local
  rotations of `upper` and `lower` only.
- `TwoBoneIK` measures bone axes when constructed: build it when the rig is in its bind (rest) pose.
- `LayerStack.update()` starts every frame from `bindPose` (identity by default). Only list bones the stack should own;
  `applyTo` overwrites them. Pass `{ bindPose: Pose.capture(bones) }` for an imported model.
- Additive layers write **offsets**: identity means "no change". The stack resets them each frame before `evaluate`.
- A quaternion clamp without `history` flips when a request crosses 180 degrees. Keep one `history` quaternion per joint.
- `Noise1` and `Rng` are seeded and deterministic; `Math.random` is not used anywhere.
- Hard `Math.min`/`clamp` on motion makes kinks you can see; prefer `softClamp`.
- Inertialization needs the previous output, so call `update` every frame, including frames with no change.

## Restyle it

Change the half-lives (snappier or heavier), swap `BouncySpring` ratios for cartoon bounce, give additive layers
bigger amplitudes for a jittery creature, or raise IK softness for a lazy reach. For a different body, write your own
`PoseSource` objects (procedural functions of time, like the demo's `rest` and `wave`) or wrap glTF clips with
`clipSource`.

## Run the demo alone

`cd my-game/vendor/meticulai-anim-springs && npm install && npm run dev` (http://127.0.0.1:5406), or `npm run build`
for `dist/`. `npm test` runs the 40 tests. Move the mouse to steer the reach; click to switch the left arm's animation.

## Credit

From Bonesworth by Meticulai (meticulai.com), MIT. The springs and inertialization follow Daniel Holden's article
"Spring-It-On" and David Bollo's GDC 2018 talk "Inertialization"; soft IK follows Andy Dunn's method (see `LICENSE`).
