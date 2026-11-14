# Loading screen and shader warm-up

**Problem:** with real assets (models, textures, sounds) the game shows a black screen while loading, then
stutters the first time each new thing appears because its shader compiles right then.

1. Load everything through one `THREE.LoadingManager` and show its progress.
2. Before hiding the loading screen, put every material in the scene (visible, even at opacity 0 or far away)
   and call `renderer.compileAsync(scene, camera)`.
3. Draw a few frames, then reveal the game. The starter's `__game.ready` already waits for 3 drawn frames.

**Where:** new file `src/core/loading.js`. In `main.js`, `await` it before `loop.start()`.

```js
// file: src/core/loading.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function createLoading() {
  const el = document.createElement('div');
  el.className = 'loading';
  el.innerHTML = '<div class="loading-bar"><span></span></div><p>Loading</p>';
  Object.assign(el.style, {
    position: 'fixed', inset: '0', display: 'grid', placeItems: 'center', zIndex: '50',
    background: '#1d1c2b', color: '#f7ecd9', font: '16px system-ui, sans-serif',
  });
  const bar = el.querySelector('span');
  Object.assign(el.querySelector('.loading-bar').style, { width: '240px', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.12)', overflow: 'hidden' });
  Object.assign(bar.style, { display: 'block', height: '100%', width: '0%', background: '#f2a65a', transition: 'width 0.2s' });
  document.body.appendChild(el);

  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, done, total) => {
    bar.style.width = `${Math.round((done / total) * 100)}%`;
  };
  const textures = new THREE.TextureLoader(manager);
  const models = new GLTFLoader(manager);

  return {
    manager,
    // Paths are relative to index.html: put files in public/ and use './models/x.glb'.
    texture: (url) => textures.loadAsync(url),
    model: (url) => models.loadAsync(url),
    // Compile every shader now, draw a few frames, then fade the screen out.
    async finish(view, scene, camera) {
      await view.renderer.compileAsync(scene, camera);
      for (let i = 0; i < 3; i++) {
        view.draw(scene, camera);
        await new Promise((r) => requestAnimationFrame(r));
      }
      el.style.transition = 'opacity 0.4s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 450);
    },
  };
}
```

In `main.js` (top-level `await` works in Vite):
```js
import { createLoading } from './core/loading.js';
const loading = createLoading();
const [rockTex, treeGltf] = await Promise.all([loading.texture('./textures/rock.jpg'), loading.model('./models/tree.glb')]);
// ...create the game with them, then:
await loading.finish(view, game.scene, game.camera);
loop.start();
```

**Check it works:** load with `?autostart=1` and run `tools/play/fps.mjs`: no single frame over ~50 ms in the
first seconds; the first pickup or explosion doesn't hitch.

**Common wrong version:** absolute paths (`/models/x.glb`) that break once the game is uploaded to a sub-folder,
loading from a CDN or Google Fonts (hangs headless tests and offline play), creating effect materials only
when first needed (that is the hitch: create them at load and reuse), or setting `visible = false` on the
objects to warm up (invisible objects are skipped by `compile`).
