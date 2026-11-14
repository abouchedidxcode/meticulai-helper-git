# Gotchas: technical traps your agent will hit

**The rule:** these traps each cost real hours in real games. Before blaming the game design, check this list. Each line
is: what happened, then the fix. Most are about three.js (the 3D library the starter uses) and headless browsers
(hidden test browsers).

## three.js

- **API changes.** Recent three.js removed `PCFSoftShadowMap` (use `PCFShadowMap`), replaced `Clock` with `Timer`, and
  replaced `RGBELoader` with `HDRLoader`. Agents trained on older code will reach for the old names. Check the version.
- **Black vertex-colour materials.** A material with `vertexColors: true` on a plain box or cylinder (no colour
  attribute) renders black. Add the attribute or turn the option off.
- **Invisible geometry.** Triangles in the wrong order face away and get culled. Dandelions' terrain faced down, so the
  sky showed through the grass. Fix the order, or use `DoubleSide` while checking.
- **Shadows that never draw.** Mosquito's walls were invisible, with hundreds of GL warnings, until a car's light first
  moved. The light had `shadow.autoUpdate = false`, so no shadow map existed yet. Set `shadow.needsUpdate = true` once
  right after.
- **Black frames from NaN (not-a-number) or overflow.** Real cases:
  - Topple: dust deep in a collapse halved its light until it hit 0; a `sqrt` returned NaN and bloom spread it over the
    frame. Fix: a small floor (1e-4).
  - Tell: a lamp highlight on a glossy eye overflowed a half-float buffer; bloom spread it. Fix: clamp after the scene.
  - Kite Fight: about 1 in 6 far captures were pure black from a NaN in depth of field. Fix: write tests so NaN fails
    them (`!(x >= 0.6)`), and sanitise before bloom. After: 0 black frames in 36.
  - Several games: `pow()` of a slightly negative number. Clamp inputs to `pow`.
- **First-use hitches.** Adding, removing or hiding a light changes the light count and recompiles every lit shader.
  Moonflowers froze for 100-133 ms when a spotlight toggled `visible` (programs went from 53 to 67 in one frame).
  Labyrinth froze for 100-470 ms. Fix: keep lights in the scene at intensity 0, keep the light count constant, and
  precompile behind the title (`renderer.compileAsync`, with hidden objects shown during the compile).
- **MSAA plus EffectComposer.** The composer copies a multisampled target, so both buffers become multisampled.
  Moonflowers cost 35-44 ms a frame at DPR 2; running the passes by hand brought it to about 11 ms. Fireflies went from
  74 to 98 fps of headroom with the same fix.
- **Too many draw calls.** Topple merged chunks into one mesh per material: about 20,000 draw calls to about 400.
- **Physics on the main thread.** Topple moved physics into a Web Worker: 7.4 ms to 0.37 ms a frame on the main thread.
- **High-DPI screens.** Cap the device pixel ratio at 2.
- **A hidden or zero-size canvas.** Palm Runner ran in a hidden browser pane that reported a 0x0 window; the math filled
  with NaN and nothing ever drew. Fix: skip frames under 2 px and resize when the size changes.

## Testing in a headless browser

- **It runs at 0.5-5 fps without a GPU.** Never judge frame rate, aim or timing from it. Advance **game time**, not wall
  time. Dig Site: 10 minutes of wall time held only 1-2.5 minutes of play. Kite Fight: a critic's "dead minute" was about 15 s
  of real play.
- **Render a few frames before a screenshot,** or it comes out black (shaders compile late).
- **No H.264 video in headless Chromium.** Ship a WebM fallback for any video.
- **Hot reload ruins recordings.** Lava Lamp's recording reloaded to the title four times as agents saved files; Echo
  and Orbitball lost runs the same way. Record against a frozen production build, not the dev server.

## Shipping

- **Relative paths.** A game served from a sub-folder breaks with paths starting `/`. Use `base: './'` in Vite.
- **A missing module means a loading bar forever.** Lost Marbles worked in development, but the live build never
  started: an effect pass imported a noise module the build didn't copy. Fix: load the built game headlessly before
  shipping, not just the dev server.
- **Web fonts can hang the page.** A test machine that couldn't reach Google Fonts never fired the page's `load` event.
  Put font files in the project.
- **File size limits.** Some hosts cap files at 25 MB. Check before uploading.
- **Stale caches.** After publishing, check the live page with a cache-buster (`?v=random`) and look for text that
  wasn't in the old build. A false "it's live" happened once because the checked word was already there.

## Determinism

- **three.js uses `Math.random` too.** Still Life 2's same-seed replay ended at frame 678 in one look and 556 in
  another: every new material takes four random numbers for its id, so different looks shifted every later draw. Fix:
  gameplay draws only from its own seeded generator (the starter's `random.js`). After: 758 frames in both.
- **`Math.sin` may differ in the last bits between browsers.** The marble games that needed exact replays either
  shipped their own sine built from + - * / and sqrt, or banned trig in the physics step.

## Multiplayer and webcam

- **Servers always had real bugs.** Every multiplayer game reviewed found some: crashes on malformed connections, ping
  floods, ghost rooms, cheating holes, dropped answers, NaN positions from clients. Have a separate reviewer check it.
- **Webcams need https or localhost.** Chrome blocks the camera on a plain IP address.
- **Mirror the camera** (selfie view: move right, it moves right). Decide left and right hands by position, not the
  tracker's label.
- **Pinch needs two thresholds** (on 0.72, off 0.42 in one hall), or a shaky pinch flickers.

## How to apply it

- [ ] When something renders black, invisible or frozen, check this page before redesigning anything.
- [ ] Keep the light count fixed, precompile on the title screen, cap DPR at 2.
- [ ] Record and test against a production build, on game time, one browser at a time.
- [ ] Before shipping: `node tools/ship.mjs` (relative paths, the built game loads headless), then a cache-busted
      check of the live page.
- [ ] Add every new trap you hit to the game's `DEVLOG.md` with the fix.

Related: [feel](feel.md), [audio](audio.md), [scope](scope.md).
