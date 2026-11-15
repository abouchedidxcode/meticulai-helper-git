// Small helpers shared by the kit's looks (node tools/looks/apply.mjs copies this file next to index.js).
//
// A look draws the game's picture in a style. Every look here works the same way:
//   1. the scene is drawn off screen ("stage"): real light values, with its depth
//   2. one or more full-screen passes turn that into the final picture on the canvas
// The starter's colours are made for its tone mapping (ACES by default) and sRGB output, and three.js only applies
// those when drawing straight to the screen. So passes call toDisplay(), which does the same job here, and then
// work on colours as the eye sees them (the same numbers as in palette.json).

import * as THREE from 'three';
import { define, tune } from '../core/settings.js';

/** Add the look's options to the tuning panel (press ` in the game), under "Look". Returns the live values. */
export function lookOptions(spec) {
  for (const [id, o] of Object.entries(spec)) {
    const def = { value: o.default, label: o.label, help: o.help };
    if (typeof o.default === 'number') {
      def.min = o.min ?? 0;
      def.max = o.max ?? Math.max(1, o.default * 2);
      def.step = o.step ?? (def.max - def.min > 20 ? 1 : 0.01);
    }
    define('look', id, def);
  }
  return tune.look;
}

/** '#rrggbb' -> the three numbers as written (0..1), for shaders that work on display colours. */
export function displayColor(hex) {
  const n = Number.parseInt(String(hex).replace('#', ''), 16) || 0;
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Tools read this to know which look is running (window.__look). */
export function announce(lookInfo) {
  if (typeof window !== 'undefined') window.__look = lookInfo.id;
}

const TONE_FN = {
  [THREE.LinearToneMapping]: 'LinearToneMapping',
  [THREE.ReinhardToneMapping]: 'ReinhardToneMapping',
  [THREE.CineonToneMapping]: 'CineonToneMapping',
  [THREE.ACESFilmicToneMapping]: 'ACESFilmicToneMapping',
  [THREE.AgXToneMapping]: 'AgXToneMapping',
  [THREE.NeutralToneMapping]: 'NeutralToneMapping',
};

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const head = (toneFn) => /* glsl */ `
#include <common>
#include <tonemapping_pars_fragment>
varying vec2 vUv;
uniform sampler2D tColor;   // the picture this pass reads
uniform sampler2D tDepth;   // the scene's depth (when the stage has one)
uniform vec2 uRes;          // size of what this pass draws to, in pixels
uniform vec2 uSrcRes;       // size of tColor, in pixels
uniform float uTime;        // game seconds (stops when the game is paused)
uniform float uNear;
uniform float uFar;
uniform float uOrtho;       // 1 when the game's camera is orthographic
// Light values -> the colour on screen (the renderer's tone mapping and exposure, then sRGB).
vec3 toDisplay(vec3 c) {
  c = ${toneFn ? `${toneFn}(max(c, vec3(0.0)))` : 'c * toneMappingExposure'};
  return sRGBTransferOETF(vec4(clamp(c, 0.0, 1.0), 1.0)).rgb;
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// "Hash without sine" by Dave Hoskins (MIT).
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Distance from the camera, in the game's units.
float viewZ(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return uOrtho > 0.5 ? uNear + d * (uFar - uNear) : uNear * uFar / max(uFar - d * (uFar - uNear), 1e-6);
}
`;

/**
 * Where the scene is drawn before a look works on it.
 *   samples        smooth edges (4) or none (0, for pixel looks)
 *   depth          keep the scene's depth for the passes (outlines, depth blur)
 *   rows           a number or a function returning one: draw the scene only this many pixel rows tall (pixel looks)
 *   maxPixelRatio  on sharp screens, draw at most this many pixels per CSS pixel (keeps looks fast)
 *   nearest        hard pixels when the picture is enlarged
 */
export function createStage(renderer, { samples = 4, depth = true, rows = 0, maxPixelRatio = 1.5, nearest = false } = {}) {
  const filter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  const depthTexture = depth ? new THREE.DepthTexture(4, 4) : null;
  if (depthTexture) depthTexture.type = THREE.UnsignedIntType;
  const target = new THREE.WebGLRenderTarget(4, 4, {
    type: THREE.HalfFloatType, samples, depthBuffer: true, depthTexture, minFilter: filter, magFilter: filter, generateMipmaps: false,
  });
  const buf = new THREE.Vector2();
  const stage = {
    target,
    texture: target.texture,
    depthTexture,
    width: 4,
    height: 4,
    /** Match the canvas (cheap when nothing changed, so it is safe to call every frame). */
    sync() {
      renderer.getDrawingBufferSize(buf);
      const r = typeof rows === 'function' ? rows() : rows;
      let w, h;
      if (r > 0) {
        h = Math.max(8, Math.round(r));
        w = Math.max(8, Math.round((h * buf.x) / Math.max(1, buf.y)));
      } else {
        const k = Math.min(1, maxPixelRatio / Math.max(1, renderer.getPixelRatio()));
        w = Math.max(1, Math.floor(buf.x * k));
        h = Math.max(1, Math.floor(buf.y * k));
      }
      if (w !== stage.width || h !== stage.height) {
        target.setSize(w, h);
        stage.width = w;
        stage.height = h;
      }
    },
    /** Draw the scene into the stage. */
    render(scene, camera) {
      stage.sync();
      // Point particles are sized in screen pixels; when the stage is smaller than the screen they would come
      // out too big, so their size is scaled for this one drawing.
      const k = stage.height / Math.max(1, buf.y);
      const points = [];
      if (k < 0.98) {
        scene.traverseVisible((obj) => {
          if (obj.isPoints && obj.material?.isPointsMaterial && !points.includes(obj.material)) points.push(obj.material);
        });
        for (const m of points) m.size *= k;
      }
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(prev);
      for (const m of points) m.size /= k;
    },
    dispose() {
      target.dispose();
      depthTexture?.dispose();
    },
  };
  return stage;
}

/** A plain picture buffer (8-bit by default) for a pass to draw into. */
export function createBuffer({ nearest = false, hdr = false } = {}) {
  const filter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  return new THREE.WebGLRenderTarget(4, 4, {
    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: false, minFilter: filter, magFilter: filter, generateMipmaps: false,
  });
}

const quadGeometry = new THREE.PlaneGeometry(2, 2);
const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/**
 * One full-screen pass. `fragment` is GLSL with a main(); it can use everything in the head above
 * (vUv, tColor, tDepth, uRes, uSrcRes, uTime, toDisplay, luma, hash12, vnoise, viewZ) plus your own uniforms.
 */
export function createPass(renderer, fragment, uniforms = {}) {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: head(TONE_FN[renderer.toneMapping]) + fragment,
    uniforms: {
      tColor: { value: null }, tDepth: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) }, uSrcRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 }, uNear: { value: 0.1 }, uFar: { value: 100 }, uOrtho: { value: 0 },
      toneMappingExposure: { value: 1 },
      ...uniforms,
    },
    depthTest: false,
    depthWrite: false,
    toneMapped: false, // toDisplay() does it, so the pass works the same on screen and off screen
  });
  const mesh = new THREE.Mesh(quadGeometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const buf = new THREE.Vector2();
  return {
    material,
    uniforms: material.uniforms,
    /**
     * Draw the pass. source: a texture or a stage. target: a buffer, or null for the screen.
     * camera: the game's camera (for depth). time: seconds.
     */
    render({ source, target = null, camera = null, time = 0, depth = null }) {
      const u = material.uniforms;
      const tex = source?.isTexture ? source : source?.texture;
      u.tColor.value = tex;
      u.tDepth.value = depth ?? source?.depthTexture ?? null;
      if (tex?.image) u.uSrcRes.value.set(tex.image.width || 1, tex.image.height || 1);
      if (target) u.uRes.value.set(target.width, target.height);
      else u.uRes.value.copy(renderer.getDrawingBufferSize(buf));
      u.uTime.value = time;
      u.toneMappingExposure.value = renderer.toneMappingExposure;
      if (camera) {
        u.uNear.value = camera.near;
        u.uFar.value = camera.far;
        u.uOrtho.value = camera.isOrthographicCamera ? 1 : 0;
      }
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(scene, quadCamera);
      renderer.setRenderTarget(prev);
    },
    dispose() {
      material.dispose();
    },
  };
}
