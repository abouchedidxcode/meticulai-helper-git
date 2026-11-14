# Archery aim: where this copy came from

From TUMEN by Meticulai (meticulai.com). Extracted 2026-11-14 from the game's source at `877d87cb2` (clean: the
copied files had no uncommitted changes). TUMEN is not released yet.

| | |
|---|---|
| Made by | Meticulai |
| Source files (relative to the game folder) | `public/js/player/aim.js`, `public/js/player/arrows.js`, `public/js/player/targets.js`, `public/js/player/bot.js`, and the shot and draw from `public/js/player/index.js` (the `loose()` and `shotLogic()` functions and the `TUNE` numbers); the arrow's sizes from `public/js/player/bow.js` |
| Copied on | 2026-11-14 |
| Code licence | MIT (see `LICENSE`) |
| Art | none: the arrow is built in code |
| Renderer | webgl2 (`arrows.js`); everything else has no renderer |

## What changed

- **Split in two.** The maths (ballistics, aim, flight, bow, targets) is now plain JavaScript with no three.js, so it
  runs in Node for tests, tools and servers. It uses a small `Vec3` with three.js's method names. Drawing stays in
  `arrows.js`, which uses three.js.
- **No game glue.** The game's `ctx` (its clock, land, army, player, mount, dev panel, URL flags, events bus) is
  replaced by plain options: `heightAt`, `now`, `carrierVel`, `listener`, `emit`, and live option objects.
- **The army is gone.** "Who is an enemy" was the game's army API (units, agents, aim points by body part). It is now
  a generic target contract: `enemy: true`, plus optional `near()` / `where()`; `bodiesTarget()` gives any list of
  moving bodies those calls with the game's exact help rule. The game's line-of-sight test that chose helm or body
  past a shield was army-specific and is left out; a hit part can say `seekBody: true` instead (a horse).
- **Men on foot** (an enemy target that offers no `where()`): kept as the game had it, a short spot lock (0.35 s).
- **The arrow is built in code** with vertex colours, replacing the game's textured arrow from `bow.js`. Same sizes.
- **The volley's light and shadows** no longer read the game's sky uniforms, haze and land shader: they take a sun
  direction and colours, and the ground for the shadows as a GLSL snippet (flat by default).
- **The draw** (`createBow`) is the game's `shotLogic` without the arms, camera, sound and arrow's-eye camera; the
  tired-arm tremble, creep and shake (all set to zero in the game) are left out.
- **The bot** drove the game's real input and spawned the army's knights in a browser. It is now `tools/bot.mjs`, a
  headless version that shoots through the same aim, bow and flight code at simple stand-in riders, and three tests.
- **One fix:** `solve(..., high = true)` could return a wrong direction when the lob would take longer than its 14 s
  search; it now returns 0. The game only lobs volleys at 58 m/s, where this never happens.
- Removed: the dev-panel wiring (`ctx.tune`), the `?archery_volley` test flag, the "friend" shortcut by target id
  (now `friend: true` on the target).
- **Tuning numbers are unchanged**: the draw, speeds, reload, help angles, lock timings, guidance turn, near-pass,
  drag, streak, burst and mark numbers are the game's module defaults. `PLAYED_SETTINGS` holds the three the game's
  maker changed in their last saved settings (draw 1.2 s, 129 m/s, no help beside the target).

## Checked

On 2026-11-14: `npm test` (28 tests pass), `node tools/bot.mjs` (a person-like aim hits 100 % of riders crossing at
12.5 m/s from 30 to 150 m with the help, 86 % to 22 % without it), `vite build`, and the demo opened in headless
Chromium: it drew without errors, the computer rider shot and hit, a 1,500-arrow volley flew. The picture is
`blocks/previews/meticulai-archery-aim.jpg`.
