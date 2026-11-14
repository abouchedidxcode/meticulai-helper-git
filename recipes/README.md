# Recipes

Small, tested pieces of code that plug into the starter game (`my-game/src/`). Each recipe says the problem in
one sentence, gives the code, where to put it, a one-line way to check it works, and the common wrong version.

They are written against the starter's `core/` APIs (`input`, `tune`, `juice`, `audio`, `events`, `rng`,
`view`, `ui`, `testmode`) and three.js 0.187. Copy the code into the file named on its first line, then adapt
the numbers. Put new numbers in `src/tuning.json` so they show up in the dev panel.

| Recipe | Use it when |
| --- | --- |
| [follow-camera](follow-camera.md) | A third-person camera keeps ending up inside walls or behind them. |
| [jump](jump.md) | Jumps feel stiff, floaty or "eaten": coyote time, buffering, variable height. |
| [projectile](projectile.md) | Anything fast (bullets, arrows, thrown things) must hit walls and targets reliably. |
| [pickup-that-feels-good](pickup-that-feels-good.md) | Collecting things feels flat. |
| [telegraph-then-attack](telegraph-then-attack.md) | Enemies hit without warning, or feel unfair. |
| [death-card](death-card.md) | The game over screen doesn't tell the player what happened or what to try. |
| [save-progress](save-progress.md) | Progress, unlocks or settings should survive a reload. |
| [loading-screen](loading-screen.md) | The game loads files (models, textures) and shows black, or hitches the first time something appears. |
| [screen-shake-done-right](screen-shake-done-right.md) | Shake feels weak, sickening, or jittery; you want rotation shake and a comfort setting. |
| [audio-that-answers](audio-that-answers.md) | Sounds feel robotic, pile up, or bury the big moments. |
| [first-person-controls](first-person-controls.md) | The player sees through the character's eyes and turns with the mouse. |
| [top-down-2d](top-down-2d.md) | The game is seen from above or from the side, with no perspective. |
| [day-night-light](day-night-light.md) | Time of day should change the light, sky and fog together. |
| [simple-particles](simple-particles.md) | Dust, sparks, bursts and trails without slowing the game down. |
| [fast-frames](fast-frames.md) | The game runs below 60 on sharp screens, hitches when something first appears, looks choppy on a 120 Hz screen, or slows down with many things on screen. |

## Rules every recipe follows (keep them when you adapt one)

- Gameplay changes happen in `update(dt)` (fixed 60 Hz game time), drawing in `render(alpha)`.
- Random numbers come from `ctx.rng`, never `Math.random()`, so `?seed=` replays the same game.
- Timers count `dt`, never `setTimeout` or `Date.now()`, so pause, hit-stop and slow test browsers behave.
- Objects are made once and reused (pools), not created and deleted during play.
- Paths are relative (`./models/x.glb`), and nothing is loaded from the internet at runtime.
