// The game's "look": an optional layer that changes how the finished picture is drawn
// (a print look, pixels, a painted look, depth blur...). The plain starter has none.
//
// main.js calls installLook(ctx) once, after the renderer exists and before the game is made.
//   ctx = { view, look, tune, flags }
// To add a look, return (or pass to view.setPost) an object with any of:
//   render(renderer, scene, camera)   draw the frame yourself (instead of renderer.render)
//   resize(width, height, pixelRatio) the window changed
//   update(dt)                        once per fixed step (for animated grain, boil...)
//   dispose()
//
// `node tools/vibes/apply.mjs <vibe>` replaces this file with the look that vibe uses.
// Colours and light do NOT live here: they come from palette.json through core/look.js.

export const lookInfo = { id: 'none', name: 'Plain' };

export function installLook(_ctx) {
  return null;
}
