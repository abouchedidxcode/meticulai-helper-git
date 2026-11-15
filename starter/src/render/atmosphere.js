// Sky, sun, ambient light and fog, all driven by the palette (core/look.js).
// One call gives a game a lit, coloured world that restyles itself when palette.json changes:
//
//   const air = createAtmosphere(scene, { look, far: 190 });
//   // every frame, in render():   air.follow(camera)        (keeps the sky and the shadows around the camera)
//
// Options:
//   far          how far the player can see, in metres (fog and sky size follow it). Default 200.
//   sky          false = no sky dome (indoor games, 2D games that paint their own backdrop)
//   fog          false = no fog
//   shadows      false = no shadows; or { size: 2048, area: 20, far: 100 }
//                area = half-width in metres of the square around the focus point that gets shadows
//   focus        a THREE.Vector3 the shadow area stays centred on (the player). Without it, the
//                shadows are centred on the camera's ground point.
//
// Returns { sun, hemi, sky, sunDir, fog, follow(camera, focus?), set(lookLike) }.
// `set` re-reads colours (for a live restyle or a day-night change).

import * as THREE from 'three';
import { look as defaultLook, sunDirection } from '../core/look.js';

export function createSkyDome({ look = defaultLook, radius = 400 } = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(look.sky.top) },
      horizon: { value: new THREE.Color(look.sky.horizon) },
      sunGlow: { value: new THREE.Color(look.sky.sun) },
      below: { value: new THREE.Color(look.sky.below) },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunSize: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top, horizon, sunGlow, below, sunDir;
      uniform float sunSize;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float s = max(dot(d, sunDir), 0.0);
        float towardSun = pow(max(dot(normalize(d.xz + 1e-5), normalize(sunDir.xz + 1e-5)), 0.0), 3.0);
        float low = 1.0 - smoothstep(0.15, 0.75, sunDir.y); // the horizon only warms up when the sun is low
        vec3 hor = mix(horizon, sunGlow, towardSun * 0.8 * low);
        vec3 col = mix(hor, top, smoothstep(-0.02, 0.5, d.y));
        col = mix(col, below, smoothstep(0.0, -0.4, d.y));
        col += sunGlow * (pow(s, 900.0 / sunSize) * 3.0 + pow(s, 24.0) * 0.35) * step(-0.05, sunDir.y);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  mesh.name = 'sky';
  return mesh;
}

export function createAtmosphere(scene, { look = defaultLook, far = 200, sky = true, fog = true, shadows = {}, focus = null } = {}) {
  const sunDir = new THREE.Vector3();
  const L = () => look.lighting;

  const hemi = new THREE.HemisphereLight(L().ambient, L().ground, L().ambientStrength);
  const sun = new THREE.DirectionalLight(L().sun, L().sunStrength);
  scene.add(hemi, sun, sun.target);

  const sh = shadows === false ? null : { size: 2048, area: 20, far: 100, ...shadows };
  if (sh) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(sh.size, sh.size);
    const c = sun.shadow.camera;
    c.left = -sh.area; c.right = sh.area; c.top = sh.area; c.bottom = -sh.area;
    c.near = 1; c.far = sh.far;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
  }

  const skyMesh = sky ? createSkyDome({ look, radius: Math.max(far * 2, 300) }) : null;
  if (skyMesh) scene.add(skyMesh);

  const fogObj = fog ? new THREE.Fog(L().fog, 1, far) : null;
  if (fogObj) scene.fog = fogObj;

  const centre = new THREE.Vector3();

  const api = {
    sun,
    hemi,
    sky: skyMesh,
    sunDir,
    fog: fogObj,

    // Re-read the palette (or another object with the same shape as `look`).
    set(next = look) {
      look = next;
      const l = L();
      const d = sunDirection(l);
      sunDir.set(d.x, Math.max(d.y, 0.02), d.z).normalize();
      hemi.color.set(l.ambient);
      hemi.groundColor.set(l.ground);
      hemi.intensity = l.ambientStrength;
      sun.color.set(l.sun);
      sun.intensity = l.sunStrength;
      if (fogObj) {
        // fogAmount 0 = clear to the edge of sight, 1 = thick: things fade from close by.
        fogObj.color.set(l.fog);
        fogObj.near = far * (0.55 - 0.5 * l.fogAmount);
        fogObj.far = far * (1.6 - 0.75 * l.fogAmount);
      }
      if (skyMesh) {
        const u = skyMesh.material.uniforms;
        u.top.value.set(look.sky.top);
        u.horizon.value.set(look.sky.horizon);
        u.below.value.set(look.sky.below);
        u.sunGlow.value.set(look.sky.sun);
        u.sunDir.value.set(d.x, d.y, d.z).normalize();
      }
      api.follow(null, centre);
    },

    // Keep the sky centred on the camera and the shadow area centred on the focus point.
    follow(camera, at = focus) {
      if (camera && skyMesh) skyMesh.position.copy(camera.position);
      if (at) centre.copy(at);
      else if (camera) centre.set(camera.position.x, 0, camera.position.z);
      sun.target.position.copy(centre);
      sun.position.copy(centre).addScaledVector(sunDir, sh ? sh.far * 0.5 : 40);
    },
  };
  api.set(look);
  return api;
}
