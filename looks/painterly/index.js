// Look: Painterly. The game as a gouache painting: a brush that paints near things in broad strokes and far
// things finely, a little more pigment at the edge of each stroke, paint pooled unevenly, soft dark edges where one
// thing stands in front of another, paper tooth, warm lights and cool darks. Works on any game, no game code changes.
//
// This is the "gouache" finishing pass of the kit's block meticulai-painterly-styles (its real shader), fed with the
// starter's own picture and depth. Its colours are the picture's, so they follow palette.json.
// What the full block adds if you build with it: materials repainted in flat pigment colours with a painter's
// light, brush strokes that stay on the walls as the camera moves, a painted sky with clouds, two more styles (an
// ink-outlined miniature and a clean toon) and a live style switch.

import { StylePass } from '../../vendor/meticulai-painterly-styles/src/style-post.js';
import { STYLE_U } from '../../vendor/meticulai-painterly-styles/src/patch-material.js';
import { announce, createBuffer, createPass, createStage, lookOptions } from './look-kit.js';

export const lookInfo = { id: 'painterly', name: 'Painterly' };

const OPTIONS = {
  brush: { default: 2.2, min: 0.6, max: 3, step: 0.05, label: 'Brush size', help: 'Bigger = broader strokes and softer detail.' },
};

export function installLook({ view }) {
  announce(lookInfo);
  const o = lookOptions(OPTIONS);
  const renderer = view.renderer;
  const stage = createStage(renderer, { samples: 4, depth: true });
  const picture = createBuffer(); // the finished 8-bit picture the brush works on
  const develop = createPass(renderer, /* glsl */ `void main() { gl_FragColor = vec4(toDisplay(texture2D(tColor, vUv).rgb), 1.0); }`);
  const brush = new StylePass();
  let time = 0;
  return {
    update(dt) {
      time += dt;
    },
    render(_renderer, scene, camera) {
      STYLE_U.uStyle.value = 2; // gouache
      stage.render(scene, camera);
      if (picture.width !== stage.width || picture.height !== stage.height) picture.setSize(stage.width, stage.height);
      develop.render({ source: stage, target: picture });
      // the brush measures in pixels of the size it is told: a smaller size makes every stroke broader
      brush.setSize(stage.width / o.brush, stage.height / o.brush);
      brush.render(renderer, picture.texture, stage.depthTexture, camera, null, time);
    },
    dispose() {
      STYLE_U.uStyle.value = 0;
      stage.dispose();
      picture.dispose();
      develop.dispose();
      brush.dispose();
    },
  };
}
