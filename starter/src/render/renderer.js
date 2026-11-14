// The three.js renderer, set up the way that has worked across many games:
// - sRGB output and ACES filmic tone mapping (bright lights roll off softly instead of clipping)
// - pixel ratio capped at 2 (a 3x phone screen would otherwise draw 9x the pixels)
// - PCFShadowMap (PCFSoftShadowMap was removed from recent three.js; don't use it)
// - resizes with the window, and ignores 0x0 sizes (hidden tabs, headless start-up)
// - `ready` turns true only after a few real frames are drawn, so tests and screenshots
//   never catch a black first frame while shaders are still compiling.
// No post-processing on purpose: add it later only if the look truly needs it.

import * as THREE from 'three';

export function createRenderer({ container = document.body, framesBeforeReady = 3 } = {}) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.className = 'game-canvas';
  renderer.domElement.tabIndex = 0; // can take keyboard focus back from UI buttons
  container.appendChild(renderer.domElement);

  const cameras = new Set();
  let width = 0;
  let height = 0;

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    if (w === 0 || h === 0) return; // hidden or not laid out yet: keep the last good size
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    for (const cam of cameras) fitCamera(cam);
  }

  function fitCamera(cam) {
    const aspect = width / height;
    if (cam.isPerspectiveCamera) {
      cam.aspect = aspect;
    } else if (cam.isOrthographicCamera) {
      // Keep the vertical size; widen or narrow the sides.
      const halfH = (cam.top - cam.bottom) / 2;
      cam.left = -halfH * aspect;
      cam.right = halfH * aspect;
    }
    cam.updateProjectionMatrix();
  }

  window.addEventListener('resize', resize);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(container);
  resize();

  let drawn = 0;
  const api = {
    renderer,
    canvas: renderer.domElement,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get ready() {
      return drawn >= framesBeforeReady;
    },
    // Register a camera so its aspect follows the window.
    addCamera(cam) {
      cameras.add(cam);
      if (width && height) fitCamera(cam);
      return cam;
    },
    // Compile every material in the scene now (avoids a hitch the first time something appears).
    // Objects must be in the scene and visible (opacity 0 is fine) to be compiled.
    warmUp(scene, camera) {
      renderer.compile(scene, camera);
    },
    draw(scene, camera) {
      if (!width || !height) resize();
      renderer.render(scene, camera);
      drawn++;
    },
    // A PNG of the current frame. Draws first, because WebGL clears the picture after showing it.
    capture(scene, camera) {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    },
  };
  return api;
}
