# Photoreal: how to use it

Makes a three.js scene read as a photograph instead of a render. All outdoor light comes from one real sky (an
HDRI): the sun is found in the image and becomes a shadow-casting light with the measured colour and strength,
the sky lights everything else, and a probe captured inside the level bounces light between walls. Then a camera
chain: HDR render, ambient occlusion (N8AO), wet-ground reflections, air (aerial perspective and sun glow),
motion blur, auto exposure that adapts over time, depth of field from a real lens (focal length, f-number, focus
distance), bloom, ACES tone mapping, and lens and film (chromatic aberration, slight barrel distortion, natural
vignetting, sharpening, colour grade, grain).

Renderer: **WebGL2 only** (`WebGLRenderer`; it does not run on `WebGPURenderer`). three 0.187.
npm deps: `postprocessing@6.39.6`, `n8ao@2.0.2` (plus `three`).

## What to copy

- **Reusable system:** `src/photoreal/` (import from `src/photoreal/index.js`).
  - `renderer.js` `PhotoRenderer` (the whole frame), `DEFAULT_TUNE` (every look number)
  - `sky.js` `Sky`, `polyHavenHdri(id, res)` (sun extraction, sky light, ground fill)
  - `patch.js` `adoptMaterial` / `adoptObject` (PCSS soft shadows, box-projected reflections)
  - `effects.js` auto exposure, motion blur, film, wet reflections, atmosphere (postprocessing `Effect`s)
  - `surfaces.js` `createGroundMaterial` (parallax relief, anti-tiling, grime, puddles), `createTiledMaterial`,
    `polyHavenMaps(id, res)`
  - `assets.js` `AssetLibrary` (glTF with meshopt, instancing; adopts materials for you), `loadTexture`
  - `quality.js` `QUALITY`, `pickQuality()`; `maths.js` (pure, tested)
- **Demo only:** `demo/` (a yard after the rain with primitives; drag, click to focus, sliders).

## API

```js
import { PhotoRenderer, adoptObject, polyHavenHdri, createGroundMaterial } from '.../src/photoreal/index.js';

const pr = new PhotoRenderer({ canvas });                 // or { renderer, scene, camera } to use yours
// options: quality 'low'|'medium'|'high'|'ultra' (default: phones low, 8+ cores high, else medium; ?q= forces),
//          toneMapping 'aces' (default) | 'agx' | 'neutral', fov/near/far (new camera only),
//          tune: { bloom: { intensity: 0.3 }, film: { warmth: 0.05 }, ... } (see DEFAULT_TUNE), autoResize
scene.add(world); adoptObject(world);                       // every Standard/Physical material: PCSS + box reflections
await pr.setSky(polyHavenHdri('kloofendal_48d_partly_cloudy_puresky'), {
  sunAzimuth: 0.55,   // turn the sky so the sun stands here (radians, 0 = +x, PI/2 = +z); null = as shot
  sunScale: 1.6,      // extra sun strength (CANDID: 1.6 afternoon, 1.8 golden hour, 1 overcast)
  intensity: 1,       // whole sky (CANDID's night: 0.035)
  exposure: 0,        // exposure compensation, EV
  haze: 0.002,        // air density per metre (0.002 clear .. 0.005 night/murky)
  glow: 0.25,         // sun scattering in the air (0 overcast .. 0.45 golden hour)
  fillGround: true,   // pure-sky HDRIs: paint sky-lit ground under the horizon
  groundAlbedo: 0.18, rotation: 0, airScale: 0.3,
});
pr.setShadowArea(new THREE.Box3(min, max));               // what the sun's shadow map covers: keep it tight
await pr.captureProbe(center, roomMin, roomMax);           // bounce light + parallax-correct reflections (3 captures)
// every frame:
pr.focusOn(targetOrDistance);                              // depth of field
pr.render(dt);                                             // seconds
```

- Camera and lens: `pr.camera` (yours or its own), `pr.aperture` (f-number, 4 on medium/high), `pr.sensorHeight`
  (0.024 = full frame), `pr.focusDistance`. Narrow `camera.fov` = telephoto = shallower focus.
- Exposure: auto by default. `pr.exposure.compensation = ev`, `pr.exposure.manualEV = ev` (null = meter again),
  `pr.setExposureRange(-10, 3.9)` keeps a night dark (else the camera "sees in the dark" and turns it into day).
- Film: `pr.setFilm('uWarmth', 0.06)`; also `uFlash` (add light for one frame, a camera flash), `uDesat`, `uTint`
  (a THREE.Color), `uGrain`, `uVignette`, `uAberration`, `uDistortion`, `uSharpen`, `uSaturation`, `uContrast`.
- Wet ground: `createGroundMaterial({ maps, tile: 3, pomDepth: 0.012, wetness: 0.35, edgeGlsl, tint: 0x8f8b86,
  quality: pr.q })` then `pr.setWetGround({ edgeGlsl, groundY: 0 })` (screen-space reflections in the same
  puddles; not on `low`). Change wetness on both: `mat.userData.surface.srWet.value = w; pr.setWetness(w)`.
  `edgeGlsl` is GLSL `float srEdge( vec3 p )`: metres from a ground point to the nearest wall (grime collects
  there, puddles keep off it). `smoothPuddles: true` also makes puddles mirror-smooth in the material (see VENDOR.md).
- Motion blur: `pr.motionBlur?.cut()` after a teleport or camera cut.
- Dynamic resolution: on by default (60-100 %); `pr.adaptive = false` to stop it. `pr.snapshot()` returns a JPEG
  data URL of the last frame (the canvas keeps its drawing buffer when PhotoRenderer made the renderer).
- Effects are reachable for fine control: `pr.bloom`, `pr.toneMapping`, `pr.dof`, `pr.ao` (N8AO), `pr.film`,
  `pr.atmosphere`, `pr.sun` (the DirectionalLight), `pr.sky`.

## The sky and textures (nothing is stored in this block)

The demo loads the sky and the asphalt straight from Poly Haven's CDN (CC0, CORS open). That is fine for trying
things. **For a game you ship, download them once** so the game works offline and does not lean on Poly Haven's
servers:

```
node tools/assets/get.mjs polyhaven:kloofendal_48d_partly_cloudy_puresky --res 2k
#  -> my-game/public/assets/skies/kloofendal_48d_partly_cloudy_puresky.hdr  (+ a CREDITS.md row)
node tools/assets/get.mjs polyhaven:asphalt_04
#  -> my-game/public/assets/materials/asphalt_04/asphalt_04_diff_1k.jpg, _nor_gl_1k, _arm_1k, _disp_1k, ...
```

```js
await pr.setSky('assets/skies/kloofendal_48d_partly_cloudy_puresky.hdr', { sunAzimuth: 0.55, sunScale: 1.6 });
const a = 'assets/materials/asphalt_04/asphalt_04';
const ground = createGroundMaterial({ maps: { diff: `${a}_diff_1k.jpg`, nor: `${a}_nor_gl_1k.jpg`, arm: `${a}_arm_1k.jpg`, disp: `${a}_disp_1k.jpg` }, tile: 3, quality: pr.q });
```

Pick **pure-sky** HDRIs (names ending `_puresky`): the engine paints the ground itself and finds the sun cleanly.
CANDID's four: `kloofendal_48d_partly_cloudy_puresky` (afternoon), `qwantani_late_afternoon_puresky` (golden
hour), `kloofendal_overcast_puresky` (after the rain, no sun), `kloppenheim_02_puresky` (night, `intensity:
0.035`, `setExposureRange(-10, 3.9)`). 2k for skies you see; 1k is enough for light only.

## Drop it into the starter

Tested on a copy of the kit's starter (it ran and built). Five small edits:

1. `node tools/blocks/add.mjs meticulai-photoreal`, then in `my-game/`:
   `npm install postprocessing@6.39.6 n8ao@2.0.2`, and add `resolve: { dedupe: ['three'] },` to
   `my-game/vite.config.js` (next to `plugins`).
2. `my-game/src/render/renderer.js`: add `drawWith: null,` at the top of `api`, and in both `draw()` and
   `capture()` replace `renderer.render(scene, camera);` with
   `api.drawWith ? api.drawWith(scene, camera) : renderer.render(scene, camera);`
3. `my-game/src/game/world.js` (the demo island; do the same in your own world): the sky now lights everything,
   so don't add the hand-placed light. Give `buildWorld(scene, { photoreal = false } = {})` and wrap:
   `if (!photoreal) scene.fog = ...`, `const skyMesh = photoreal ? new THREE.Object3D() : sky(scene, sunDir);`,
   `if (!photoreal) scene.add(hemi);`, `if (!photoreal) scene.add(sun, sun.target);`
4. `my-game/src/game/game.js`:
   ```js
   import { PhotoRenderer, adoptObject, polyHavenHdri } from '../../vendor/meticulai-photoreal/src/photoreal/index.js';
   // in createGame(ctx): buildWorld(scene, { photoreal: true }), then AFTER the world, player, props are added:
   const pr = new PhotoRenderer({ renderer: ctx.view.renderer, scene, camera: rig.camera });
   adoptObject(scene); // things added later: adoptObject(thing)
   pr.setShadowArea(new THREE.Box3(new THREE.Vector3(-22, -4, -22), new THREE.Vector3(22, 12, 22)));
   pr.setSky(polyHavenHdri('kloofendal_48d_partly_cloudy_puresky'), { sunAzimuth: 0.6, sunScale: 1.6 })
     .then(() => pr.captureProbe(new THREE.Vector3(0, 3, 0), new THREE.Vector3(-30, -5, -30), new THREE.Vector3(30, 30, 30)));
   let lastDraw = performance.now();
   ctx.view.drawWith = () => {
     const now = performance.now();
     pr.render(Math.min(0.1, (now - lastDraw) / 1000));
     lastDraw = now;
   };
   ```
   (`createGame` can't `await`: for the first frames the sky is still loading and the scene is dark grey.)
5. Look: tone mapping, exposure and colour now happen in the post chain, so the starter's
   `toneMappingExposure = 1.1` and `palette.json`'s `exposure` no longer apply. Use `pr.exposure.compensation`,
   `setSky({ exposure })` and `tune.film` instead. The starter's stylised flat-shaded island looks like a lit
   model under a real sky; for a photo look, use real scanned assets (Poly Haven models via `tools/assets/get.mjs`,
   loaded with `AssetLibrary`).

## The numbers that matter

| Number | Value | What it does |
|---|---|---|
| `exposure.key` | 0.16 | mid grey after metering; up = brighter overall |
| `exposure.speed` | 1.4 /s | how fast the eye adapts walking from shade into sun |
| `exposure` min/max EV | -10 / 8 | clamp; a night needs max 3.9 |
| `ao.intensity` / `aoRadius` | 6.5 / 1.4 m | strong contact shadows where things meet the ground ("stronger contact AO" was a deliberate pass) |
| `bloom.intensity` / threshold | 0.22 / 0.85 | only real highlights glow; more looks dreamy, not photographic |
| `film.grain` | 0.035-0.045 by preset | strongest in mid-tones like film; 0 looks like CG |
| `film.vignette` / `distortion` / `aberration` | 0.35 / 0.025 / 0.0016 | a real lens; push them and it looks like a filter |
| `aperture` | f/4 (5.6 on low) | with the field of view, sets how blurry the background is |
| `sunScale` | 1.6-1.8 | sun vs sky balance: higher = harder shadows, more contrast |
| `haze`, `glow` | 0.002-0.005, 0-0.45 | depth in the air; what makes a 60 m alley feel 60 m deep |
| dynamic resolution | 60-100 %, -10 % below 38 fps, +5 % above 58 fps, every 2 s | keeps frame rate on weaker GPUs |

## Quality presets and cost

| | low (phones) | medium | high (8+ cores) | ultra |
|---|---|---|---|---|
| render scale / max pixel ratio | 0.75 / 1 | 1 / 1 | 1 / 1.5 | 1 / 2 |
| anti-aliasing | SMAA | SMAA | MSAA 4x | MSAA 4x |
| AO samples, half res | 8, yes | 12, yes | 16, no | 16, no |
| wet reflections (SSR steps) | off | 28 | 40 | 56 |
| depth of field / motion blur | off / off | on / 8 | on / 10 | on / 14 |
| sun shadow map / probe | 2048 / 128 | 4096 / 256 | 4096 / 256 | 8192 / 512 |
| ground relief (POM) | off | on | on | on |

This is a heavy renderer meant for desktop GPUs. Frame rate was never measured on a weak GPU or a phone, in
CANDID or here. On mobile it falls back to `low` and dynamic resolution; test on the slowest device you care
about with `node tools/play/fps.mjs`, and try `?q=low` and `?q=medium`.

## What made it good in CANDID

- The brief was "must look like photos", and in CANDID the look is the game: hiders turn into the junk in the
  alley, so a hider is pixel-for-pixel the same thing as the real props around it, and seekers catch them by
  taking photos. If the render looked like CG, hiding would not work.
- Light from one real sky, not hand-placed lights: the shadows line up with the sun you can see, and four moods
  (afternoon, golden hour, after the rain, night) are four HDRIs plus a few numbers, not four lighting setups.
- Photo-scanned CC0 assets did most of the work; the engine's job is to not spoil them: contact shadows that
  harden where objects touch, bounce light from sunlit walls, puddles that mirror the real scene, air.
- ACES was chosen over AgX after comparing renders side by side.
- A second game (Topple) ported `sky.js` to WebGPU, so the sky-to-sun idea held up outside CANDID.
- Known gap: nobody measured the frame rate on a real mid-range GPU, and the first load in CANDID is heavy (that
  is the scanned assets, not this code).

## Gotchas

- WebGL only. A WebGPU port of the sky exists in Topple, but not of the post chain.
- The shader patches splice into three's own shader chunks. A three.js upgrade can move those lines: run
  `npm test` after any upgrade. If a patch no longer matches, the engine warns once in the console and falls back
  to plain shadows or plain reflections (it does not break).
- Materials you create need `adoptMaterial(m)` / `adoptObject(root)` to get PCSS shadows and box-projected
  reflections; `AssetLibrary` does it for loaded models. Only `MeshStandardMaterial`/`MeshPhysicalMaterial`.
- The renderer is switched to `BasicShadowMap` (PCSS does the filtering) and `NoToneMapping` (post does it).
  Other code that changes those undoes the look.
- `setShadowArea` sets how sharp shadows can be: a 40 m box on a 4096 map is about 1 cm per texel; a whole
  island at once is blurrier. Re-fit it if the playable area moves.
- `captureProbe` takes a moment (three cube renders); call it after the level is built and after each `setSky`.
  The probe box should match the room or street it stands in.
- Perspective cameras only (depth of field, motion blur and the reflections assume one).
- Transparent materials are left out of AO on purpose (`transparencyAware: false`); alpha-tested foliage is fine.
- `preserveDrawingBuffer` is on when it makes its own renderer (photos are read back); a small cost.

## Restyle it

- Mood: another HDRI plus `sunScale`, `haze`, `glow`, `setFilm('uWarmth', ...)`.
- Cleaner, more "game" look: `tune: { film: { grain: 0, aberration: 0, distortion: 0, vignette: 0.15 } }`.
- Film stock: `saturation` 0.9 and `contrast` 1.12 for a harder print; `uDesat` for a washed-out flashback.
- Night: a night HDRI with `intensity: 0.035`, `setExposureRange(-10, 3.9)`, and your own lamps (SpotLights with
  shadows work alongside the sun).

## Run the demo alone

`cd blocks/vendor/meticulai-photoreal && npm install && npm run dev` (http://127.0.0.1:5395), `npm run build`
for `dist/`, `npm test` for the 20 tests (maths, presets, sun extraction on a synthetic sky, and the shader
patches against the installed three). URL switches: `?q=low|medium|high|ultra`, `?flat=1` (no textures),
`?sky=<poly haven id>`, `?res=2k`, `?ui=0`.

## Credit

Photoreal by Meticulai (meticulai.com), from CANDID; MIT. Keep `LICENSE` (it carries the notices for Dave
Hoskins' hash, postprocessing (zlib) and n8ao (ISC / CC0)). Poly Haven skies and textures are CC0; a credit
line is kind and `tools/assets/get.mjs` adds it for you.
