# Fast frames: a steady 60 on any screen

**Problem:** the game runs below 60 frames a second on sharp (Retina, 4K) screens, stutters the first time
something appears, looks choppy on a 120 Hz screen even though the frame counter says it's fast, or slows down
when there are many things on screen.

These fixes come from games on meticulai.com. Each one is general: none needs anything from those games. The
numbers are what they measured, so you know what to expect.

## 0. Measure before you fix

`node tools/play/fps.mjs --seconds 20` prints typical and slowest frame times, hitches, WebGL errors and draw calls.
Read it like this:

| What you see | Usually means | Go to |
| --- | --- | --- |
| Slow everywhere, and faster in a smaller window | too many pixels (fill rate) | 1, 2 |
| Single long frames (over 50 ms) the first time an effect, enemy or area appears | a shader compiling mid-game | 3 |
| Average is fast but motion looks uneven on a 120/144 Hz screen | frames miss the screen's beat | 4 |
| Slow when many things are on screen; `drawCalls` in the hundreds or thousands | draw calls | 5 |
| Long frames when lots of physics happens at once | the main thread is busy | 6 |

Run it again after each fix. One fix at a time, so you know which one worked.

## 1. Adaptive pixel ratio

A sharp screen at pixel ratio 2 draws four times the pixels of ratio 1. The starter caps the ratio at 2. On top
of that, let the game lower it when the machine can't keep up, and raise it again when it can.

In seven webcam games this, together with fix 2, took every game from 34-54 fps to 60 fps at pixel ratio 2 (95% of
frames at 16.8 ms or faster, no hitches). The rules that worked there:

- ignore the first 5 seconds (loading and shader compiles make them slow anyway);
- step down 0.25 after 3 slow seconds; step back up after 6 good seconds;
- if a step up is followed by slowness straight away, wait twice as long before the next try (so it never
  flickers between two sizes).

A one-way version suits phones better: in a baseball game, it watched only during calm moments (between pitches),
stepped down (3, 2.5, 2, 1.5) if the device couldn't hold about 50 fps over 2 seconds, and never went back up.
Use `oneWay: true` for that.

**Where:** new file `src/render/dpr.js`. In `main.js`, create it after the renderer and call `frame()` once per
drawn frame with the real time since the last drawn frame (the snippet after fix 4 shows both together).

```js
// file: src/render/dpr.js
// Draws fewer pixels when the machine can't keep up, and more again when it can. ?dpr=1.5 pins the ratio.
// Stands aside in the kit's test browsers (they are slow on purpose; recordings should keep full sharpness).
export function createDprGovernor(view, {
  max = Math.min(window.devicePixelRatio || 1, 2),
  min = 1,
  step = 0.25,
  ignoreFirst = 5, // seconds
  slowFor = 3, // seconds of slow frames before stepping down
  goodFor = 6, // seconds of good frames before stepping up (doubles after a failed step up)
  slowMs = 18.5, // average frame time that counts as slow (about 54 fps)
  goodMs = 15.5, // average frame time that counts as good, with room to spare
  oneWay = false, // true: only ever step down (phones, or when steps up are noticeable)
  inTestBrowser = false, // true: run even under the kit's tools (navigator.webdriver)
} = {}) {
  const pinned = Number(new URLSearchParams(location.search).get('dpr')) || (navigator.webdriver && !inTestBrowser ? max : 0);
  let dpr = pinned > 0 ? pinned : max;
  let clock = 0, avg = 16.7, slow = 0, good = 0, wait = goodFor, raisedAt = -1;
  view.renderer.setPixelRatio(dpr);

  function set(v) {
    dpr = Math.round(Math.min(max, Math.max(min, v)) * 100) / 100;
    view.renderer.setPixelRatio(dpr); // three.js resizes the drawing buffer for us
    slow = 0;
    good = 0;
  }

  return {
    get dpr() { return dpr; },
    /** Call once per drawn frame. ms: real time since the last frame. calm: false during moments you don't want judged. */
    frame(ms, calm = true) {
      if (pinned > 0 || !(ms > 0) || ms > 250) return; // pinned, or a hidden tab / breakpoint
      const s = ms / 1000;
      clock += s;
      avg += (ms - avg) * 0.05;
      if (clock < ignoreFirst || !calm) return;
      if (avg > slowMs) { slow += s; good = 0; } else if (avg < goodMs) { good += s; slow = Math.max(0, slow - s); }
      if (slow >= slowFor && dpr > min) {
        if (raisedAt >= 0 && clock - raisedAt < slowFor * 2 + 1) wait = Math.min(wait * 2, 120); // that step up failed
        raisedAt = -1;
        set(dpr - step);
      } else if (!oneWay && good >= wait && dpr < max) {
        raisedAt = clock;
        set(dpr + step);
      }
    },
  };
}
```

## 2. Post-processing without the hidden cost

`EffectComposer` with antialiasing (MSAA) makes a copy of the multisampled scene target for every pass, so each
full-screen pass pays a multisampled write and resolve. That cost alone kept games below 60 at pixel ratio 2.

Instead: draw the scene once into a multisampled target, then run each pass as a plain full-screen quad into
plain targets (or straight to the screen). Only add post-processing when the look truly needs it.

```js
// file: src/render/post.js
// One multisampled scene target, then full-screen passes by hand. Add more passes the same way, each into a plain
// WebGLRenderTarget (half size for blurs and glows).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export function createPost(renderer, fragmentShader) {
  const size = new THREE.Vector2();
  const sceneTarget = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
  const quad = new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms: { tScene: { value: sceneTarget.texture }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader,
  }));
  return {
    render(scene, camera, time = 0) {
      renderer.getDrawingBufferSize(size);
      if (sceneTarget.width !== size.x || sceneTarget.height !== size.y) sceneTarget.setSize(size.x, size.y);
      renderer.setRenderTarget(sceneTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      quad.material.uniforms.uTime.value = time;
      quad.render(renderer);
    },
  };
}

// An example final pass: a soft vignette. Keep the last two lines: they apply the renderer's tone mapping and
// colour space, which three.js skips when the scene is drawn into a target.
export const VIGNETTE = /* glsl */ `
  uniform sampler2D tScene;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tScene, vUv);
    float d = distance(vUv, vec2(0.5));
    c.rgb *= mix(1.0, 0.75, smoothstep(0.35, 0.8, d));
    gl_FragColor = c;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
```

Use it from `draw()` in `src/render/renderer.js`, in place of `renderer.render(scene, camera)`, so `ready` still
counts drawn frames: `post.render(scene, camera)` with `const post = createPost(renderer, VIGNETTE)` made once.
The renderer itself can then be created with `antialias: false`: the scene target does the antialiasing.

## 3. No shader compiles during play

A material compiles its shader the first time it is drawn. That froze games for 100-470 ms each time a new effect
appeared. Two rules removed every such hitch:

- At load, put everything that will ever appear into the scene (opacity 0 or out of view is fine, but not
  `visible = false`) and call `await renderer.compileAsync(scene, camera)`. The
  [loading-screen](loading-screen.md) recipe does exactly this.
- **Never change how many lights there are while playing.** Adding or removing a light (or turning shadows on for
  one) recompiles every lit material. Create every light at load and switch it off with `intensity = 0`.

In a game that drew everything once at start-up, frozen frames in the first 11 seconds went from 12 (the worst
160 ms) to one in 40 seconds.

## 4. Even frames on 120 and 144 Hz screens

A 120 Hz screen shows a new picture every 8.3 ms. A frame that takes 9.7-12.6 ms misses that beat, so frames land
alternately 8 and 17 ms apart: it looks choppy although the average is about 100 fps. The fix: when more than one
frame in twenty misses the beat, draw on every second beat for a perfectly even 60, and try the faster pace again
later (waiting longer after each failed try).

Game speed stays right while beats are skipped: the starter's loop runs its fixed 60 Hz steps from real time, so
only the drawing is paced. This was measured in a headless browser emulating a 120 Hz screen; check it on a real
one (`?pace=0` turns it off to compare).

```js
// file: src/render/pacer.js
// On fast screens (over ~85 Hz): if more than 1 frame in 20 misses the screen's beat, draw on every second beat
// (an even 60) and try full speed again later, waiting twice as long after each failed try.
export function createPacer({ missShare = 0.05, retryAfter = 10, inTestBrowser = false } = {}) {
  const off = new URLSearchParams(location.search).get('pace') === '0' || (navigator.webdriver && !inTestBrowser);
  const learn = [];
  let beat = 0, last = 0, half = false, skipNext = false, since = 0, wait = retryAfter, retriedAt = -1;
  let windowStart = 0, frames = 0, missed = 0;
  return {
    get halfRate() { return half; },
    get beatMs() { return beat; },
    /** Call at the start of each screen frame with its time in ms. false = skip drawing this beat. */
    shouldDraw(now) {
      const dt = last ? now - last : 0;
      last = now;
      if (off) return true;
      if (!beat) { // learn the screen's beat from the first 60 frames
        if (dt > 0 && dt < 50) learn.push(dt);
        if (learn.length === 60) { beat = learn.sort((a, b) => a - b)[30]; windowStart = now; }
        return true;
      }
      if (beat > 11.5) return true; // a 60-85 Hz screen: nothing to gain
      if (half) {
        skipNext = !skipNext;
        if (skipNext) return false;
        if ((now - since) / 1000 > wait) { half = false; retriedAt = now; windowStart = now; frames = missed = 0; }
        return true;
      }
      frames++;
      if (dt > beat * 1.5) missed++;
      if (now - windowStart >= 2000) {
        if (missed / frames > missShare) {
          if (retriedAt >= 0 && now - retriedAt < 4000) wait = Math.min(wait * 2, 160); // the retry failed
          half = true;
          since = now;
          skipNext = false;
        }
        retriedAt = -1;
        windowStart = now;
        frames = missed = 0;
      }
      return true;
    },
  };
}
```

Fixes 1 and 4 together in `main.js` (the starter's `render` callback runs once per screen frame):

```js
import { createDprGovernor } from './render/dpr.js';
import { createPacer } from './render/pacer.js';
const dpr = createDprGovernor(view);
const pacer = createPacer();
let lastDraw = performance.now();

// inside createLoop({ ..., render(alpha) { ... } }):
  render(alpha) {
    const now = performance.now();
    if (!pacer.shouldDraw(now)) return; // half-rate on a fast screen: skip this beat
    dpr.frame(now - lastDraw);
    lastDraw = now;
    game.render(alpha);
    view.draw(game.scene, game.camera);
  },
```

## 5. Many things on screen: fewer draw calls

Every separate mesh is at least one draw call, and a few thousand calls is enough to slow any laptop.

- **Same model many times** (rocks, trees, coins): one `THREE.InstancedMesh`. Start here.
- **Thousands of far things** (forests, crowds in the distance): impostors. Render each model from several angles
  into a texture at load, then draw far copies as flat cards that pick the right angle. One flight game drew about
  100,000 trees for about 100,000 triangles (0.5-2 ms a frame); another drew 3,573 spectators as cards lit by the
  scene's sun.
- **Thousands of animated characters or animals**: play each animation once at load into a texture of bone
  positions and skin the instances in the vertex shader. A battle game drew 1,600 distant riders in under 1 ms, and
  the whole battle frame took about 12 ms.
- **Thousands of independently moving pieces** (debris, rubble, blocks): merge all pieces of one material into one
  mesh, keep each piece's position in a texture, and move them in the vertex shader. That cut one demolition
  game's draw calls from 20,192 to 406.

Several of these exist as blocks: `node tools/blocks/suggest.mjs --text "thousands of trees"` (or "crowd", "debris")
points to them.

## 6. Heavy physics: move it off the main thread

When the simulation takes several milliseconds a step, run it in a Web Worker at a fixed 60 steps a second, send back
only what moved (positions and rotations in typed arrays), and draw by blending the last two states. Keep the
same code able to run on the main thread, and test that both give the same result for the same seed. In a
demolition game the main thread's simulation cost fell from 8.4 ms to 0.49 ms a frame on average, and the longest
gap between frames from 424 ms to 46 ms. This is a big change: do it only when `fps.mjs` shows physics is the
problem.

## Smaller tricks that paid off

- A sun shadow map for a big static area: render it once, and again only after the shadow box has moved (8 m in a
  gliding game), instead of every frame.
- Expensive full-screen effects (ray-marched shapes, an underwater pass): draw them at half resolution and scale up.

**Check it works:** `node tools/play/fps.mjs --seconds 20` before and after. Expect fewer slow frames and no frame
over 50 ms after the first 5 seconds. For fix 1, add `?dpr=2` to compare against a pinned ratio.

**Common wrong version:** lowering the pixel ratio for everyone instead of only when needed (blurry on fast
machines); a governor that reacts to single frames (it flickers: use an average over seconds); an `EffectComposer`
added "just for bloom"; `visible = false` during warm-up (hidden objects are skipped, so they still compile later);
adding a point light for each explosion; judging a fix by one run on a busy machine (other agents' browsers slow it
down: measure twice).
