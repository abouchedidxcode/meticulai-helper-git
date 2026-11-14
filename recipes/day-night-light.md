# Day and night light

**Problem:** a day/night cycle where the sun, sky light, fog and background all change together, so it never
looks like a dimmer switch on a grey scene.

Pick a few **key moments** (night, dawn, day, dusk) with all their colours, then blend between the two nearest
for the current time. Time runs in game time.

**Where:** new file `src/game/dayNight.js`. `sky.update(dt)` every step.

```js
// file: src/game/dayNight.js
import * as THREE from 'three';

// t: 0..1 through the day. Colours are picked by eye; change them freely.
const KEYS = [
  { t: 0.0, sun: '#3a4a8a', sunI: 0.15, sky: '#1b2140', ground: '#141020', hemiI: 0.35, fog: '#141a33', exp: 0.9 }, // night
  { t: 0.23, sun: '#ff9a5c', sunI: 1.4, sky: '#e8a07a', ground: '#4a3040', hemiI: 0.8, fog: '#d99a86', exp: 1.0 }, // dawn
  { t: 0.5, sun: '#fff1dc', sunI: 3.0, sky: '#9cc4f0', ground: '#7a6a50', hemiI: 1.4, fog: '#b9d2ee', exp: 1.0 }, // day
  { t: 0.77, sun: '#ff8a4a', sunI: 1.6, sky: '#c98a7a', ground: '#5a3a3a', hemiI: 0.9, fog: '#9a6a7a', exp: 1.05 }, // dusk
  { t: 1.0, sun: '#3a4a8a', sunI: 0.15, sky: '#1b2140', ground: '#141020', hemiI: 0.35, fog: '#141a33', exp: 0.9 }, // night
];

// Pre-convert hex strings to Colors once.
const keys = KEYS.map((k) => ({ ...k, sun: new THREE.Color(k.sun), sky: new THREE.Color(k.sky), ground: new THREE.Color(k.ground), fog: new THREE.Color(k.fog) }));

// sun: DirectionalLight, hemi: HemisphereLight, scene: for fog + background, renderer: for exposure.
export function createDayNight({ sun, hemi, scene, renderer, dayLength = 240, start = 0.3 }) {
  let t = start;
  const smooth = (x) => x * x * (3 - 2 * x);

  function apply() {
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const u = smooth((t - a.t) / (b.t - a.t));

    sun.color.lerpColors(a.sun, b.sun, u);
    sun.intensity = THREE.MathUtils.lerp(a.sunI, b.sunI, u);
    hemi.color.lerpColors(a.sky, b.sky, u);
    hemi.groundColor.lerpColors(a.ground, b.ground, u);
    hemi.intensity = THREE.MathUtils.lerp(a.hemiI, b.hemiI, u);
    if (scene.fog) scene.fog.color.lerpColors(a.fog, b.fog, u);
    if (scene.background?.isColor) scene.background.copy(scene.fog?.color ?? hemi.color);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(a.exp, b.exp, u);

    // The sun travels east to west; below the horizon it becomes a weak moon from above.
    const ang = (t - 0.25) * Math.PI * 2; // sunrise at t=0.25, sunset at 0.75
    const height = Math.sin(ang);
    sun.position.set(Math.cos(ang) * 40, Math.max(height, 0.25) * 40, 15);
  }

  apply();
  return {
    get time() {
      return t;
    },
    set time(v) {
      t = ((v % 1) + 1) % 1;
      apply();
    },
    update(dt) {
      t = (t + dt / dayLength) % 1;
      apply();
    },
  };
}
```

Use it: `const day = createDayNight({ sun: world.sun, hemi, scene, renderer: ctx.view.renderer, dayLength: 180 });`
(return the hemisphere light from your world builder). Register test moments:
`ctx.testmode.add('night', 'Night', () => (day.time = 0.95));`.

**Check it works:** `__game.skipTo('night')` then capture: the scene is dark blue but the player is still
readable (keep a little light on what matters at night: a lamp, an emissive outline).

**Common wrong version:** only dimming the sun (grey, lifeless nights: the colour and the sky light must move
too), linear blending of brightness with no tone (dusk is the prettiest part; give it its own key), driving it
from `Date.now()` (tests and recordings can't reach night), and a pitch-black night where nothing can be seen.
