// The ground under the grass: soil up close, with the shade of what stands on it, the straw of what was mown and
// the ash of what burnt; far off, where no blades are drawn, it takes the colour of the grass itself.
import * as THREE from 'three';
import { COMMON, FIRE_RAMP, LEAF_LIGHT } from './glsl.js';

const vertex = /* glsl */ `
${COMMON}
uniform vec2 uGroundOrigin;
out vec3 vWorld;
out vec3 vNormal;
void main() {
  vec2 xz = uGroundOrigin + position.xz;
  float h = groundAt(xz);
  vNormal = normalize(vec3(groundAt(xz - vec2(1.0, 0.0)) - groundAt(xz + vec2(1.0, 0.0)), 2.0, groundAt(xz - vec2(0.0, 1.0)) - groundAt(xz + vec2(0.0, 1.0))));
  vWorld = vec3(xz.x, h, xz.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

const fragment = /* glsl */ `
${COMMON}
${LEAF_LIGHT}
${FIRE_RAMP}
layout(location = 0) out vec4 outC;
uniform sampler2D tSoil;
uniform sampler2D tSoilN;
uniform sampler2D tDirt;
uniform sampler2D tDirtN;
uniform float uHeight;
in vec3 vWorld;
in vec3 vNormal;

void main() {
  vec2 uvE = extentUv(vWorld.xz);
  if (uvE.x < 0.0 || uvE.y < 0.0 || uvE.x > 1.0 || uvE.y > 1.0) discard;
  vec4 m = texture(tMap, uvE);
  vec2 suv = stateUv(vWorld.xz);
  vec4 st = texture(tState, suv);
  vec4 fr = texture(tFire, suv);
  float dist = distance(vWorld, uCamPos);
  vec3 V = normalize(uCamPos - vWorld);

  // two sizes of the same soil, mixed by a slow noise, so no repeat shows
  vec2 u1 = vWorld.xz / 1.9;
  vec2 u2 = vWorld.xz.yx / 5.7 + 0.37;
  float blend = smoothstep(0.3, 0.7, texture(tNoise, vWorld.xz / 11.0).a);
  vec3 soil = mix(texture(tSoil, u1).rgb, texture(tSoil, u2).rgb, 0.3 + 0.4 * blend) * 0.85;
  vec3 dirt = mix(texture(tDirt, u1 * 0.8).rgb, texture(tDirt, u2).rgb, 0.3 + 0.4 * blend);
  float bare = 1.0 - smoothstep(0.12, 0.5, m.g + (texture(tNoise, vWorld.xz / 2.3).r - 0.5) * 0.2);
  vec3 albedo = mix(soil, dirt, bare);
  vec3 nt = mix(texture(tSoilN, u1).xyz, texture(tDirtN, u1 * 0.8).xyz, bare) * 2.0 - 1.0;
  float detail = 1.0 - smoothstep(12.0, 40.0, dist);
  vec3 N = normalize(vNormal + vec3(nt.x, 0.0, nt.y) * 0.8 * detail);
  albedo *= mix(1.0, 0.5, m.b);

  float charred = smoothstep(0.1, 0.8, fr.g);
  float standing = m.g * smoothstep(0.05, 0.3, st.b) * (1.0 - charred);
  float mown = m.g * (1.0 - smoothstep(0.08, 0.3, st.b)) * (1.0 - charred);
  // under the grass the soil is mostly hidden: last year's dead blades lie on it, and low green things grow between
  float under = texture(tNoise, vWorld.xz / 0.37).r;
  float low = texture(tNoise, vWorld.xz / 1.1 + 0.6).b;
  vec3 litter = mix(vec3(0.17, 0.135, 0.062), vec3(0.045, 0.085, 0.022), smoothstep(0.4, 0.62, low)) * (0.55 + 0.9 * under);
  albedo = mix(albedo, litter, m.g * (1.0 - bare) * smoothstep(0.22, 0.4, under + 0.25 * low));
  // mown, it is a mat of stubble and clippings
  albedo = mix(albedo, mix(vec3(0.075, 0.105, 0.028), vec3(0.2, 0.17, 0.07), smoothstep(0.3, 0.7, m.r)) * (0.7 + 0.6 * texture(tNoise, vWorld.xz / 0.7).b), mown * 0.82);
  float fleck = hash12(floor(vWorld.xz * 70.0));
  float ashN = texture(tNoise, vWorld.xz / 3.7).g * 0.6 + texture(tNoise, vWorld.xz.yx / 0.83 + 0.3).a * 0.4;
  vec3 ash = mix(vec3(0.010, 0.009, 0.009), vec3(0.12, 0.115, 0.11), smoothstep(0.42, 0.72, ashN) * 0.5 + step(0.975, fleck) * 0.5);
  albedo = mix(albedo, ash, charred);

  float cloud = cloudAt(vWorld.xz);
  float glow = texture(tGlow, suv).g + lampAt(vWorld) * mix(1.0, 0.35, standing);
  float shade = mix(1.0, 0.3, standing);
  vec3 c = albedo * (uSunColor * cloud * max(dot(N, uSunDir), 0.0) * shade + mix(uBounceColor, uSkyColor, N.y * 0.5 + 0.5) * mix(1.0, 0.4, standing));
  c += albedo * uFireColor * glow;
  // embers left in the ash, and the ground lit from just above while it burns
  // a few points of it still glow, each round, each breathing in its own time
  vec2 sp = vWorld.xz * 38.0;
  vec2 sc = floor(sp);
  float sr = hash12(sc);
  vec2 off = sp - sc - 0.5 - (vec2(hash12(sc + 3.0), hash12(sc + 5.0)) - 0.5) * 0.5;
  float spark = step(0.955, sr) * exp(-dot(off, off) * 22.0) * (0.35 + 0.65 * sin(uTime * (1.0 + 2.5 * hash12(sc + 7.0)) + sr * 60.0)) * detail;
  c += vec3(2.2, 0.42, 0.03) * fr.b * (max(spark, 0.0) * 2.4 + 0.025);
  c += fireRamp(0.55) * fr.r * 0.5;

  // beyond the last blades the ground is the grass
  float farK = smoothstep(9.0, 44.0, dist) * m.g * (1.0 - charred);
  if (farK > 0.0) {
    float gust = gustAt(vWorld.xz);
    float U = uWind.z;
    float dry = smoothstep(0.3, 0.7, m.r) * (1.0 - 0.5 * m.b);
    vec3 g = grassColor(dry, 0.66) * (1.0 + 0.16 * gust * min(U / 6.0, 1.0));
    g = mix(g, mix(vec3(0.1, 0.14, 0.035), vec3(0.24, 0.2, 0.085), dry), mown / max(m.g, 1e-3) * 0.8);
    vec3 Ng = normalize(V * 0.75 + vec3(0.0, 0.6, 0.0));
    vec3 lit = leafLight(g, Ng, V, 0.7, 0.07 + 0.2 * gust * min(U / 8.0, 1.0), cloud, glow);
    // nearer, between the blades that are drawn, it is the dim green under them
    c = mix(c, lit * mix(0.42, 1.0, smoothstep(40.0, 112.0, dist)), farK);
  }
  outC = vec4(applyFog(c, vWorld), 1.0);
}
`;

/** A square grid whose cells are 1 m near the middle and grow outwards, so one mesh reaches the horizon. */
function warpedGrid(inner = 80, outer = 60, growth = 1.06) {
  const line = [0];
  for (let i = 1; i <= inner; i++) line.push(i);
  let step = 1;
  for (let i = 0; i < outer; i++) {
    step *= growth;
    line.push(line[line.length - 1] + step);
  }
  const coords = [...line.slice(1).reverse().map((v) => -v), ...line];
  const n = coords.length;
  const positions = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      positions[(i + j * n) * 3] = coords[i];
      positions[(i + j * n) * 3 + 2] = coords[j];
    }
  }
  const indices = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = i + j * n;
      indices[k++] = a;
      indices[k++] = a + n;
      indices[k++] = a + 1;
      indices[k++] = a + 1;
      indices[k++] = a + n;
      indices[k++] = a + n + 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

export function createGround(shared, textures, { height = 0.52, extentMin, texel }) {
  const uniforms = {
    ...shared,
    uGroundOrigin: { value: new THREE.Vector2() },
    tSoil: { value: textures.soil },
    tSoilN: { value: textures.soilNormal },
    tDirt: { value: textures.dirt },
    tDirtN: { value: textures.dirtNormal },
    uHeight: { value: height },
  };
  const material = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vertex, fragmentShader: fragment, uniforms });
  const mesh = new THREE.Mesh(warpedGrid(), material);
  mesh.frustumCulled = false;
  return {
    mesh,
    uniforms,
    /** Keeps the fine middle of the grid under the camera, its vertices on the height map's texel centres. */
    follow(x, z) {
      uniforms.uGroundOrigin.value.set(
        extentMin[0] + (Math.floor((x - extentMin[0]) / texel) + 0.5) * texel,
        extentMin[1] + (Math.floor((z - extentMin[1]) / texel) + 0.5) * texel,
      );
    },
  };
}

/** Plain soil and dirt, for a field made before its pictures have loaded or without any. */
export function flatTextures() {
  const one = (r, g, b, srgb) => {
    const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { soil: one(70, 48, 34, true), soilNormal: one(128, 128, 255), dirt: one(120, 100, 72, true), dirtNormal: one(128, 128, 255) };
}

/** The CC0 ground pictures in `base` (ambientCG's Ground048 and Ground103), set up to repeat. */
export async function loadGroundTextures(renderer, base = './textures/') {
  const loader = new THREE.TextureLoader();
  const load = async (file, srgb) => {
    const t = await loader.loadAsync(base + file);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const [soil, soilNormal, dirt, dirtNormal] = await Promise.all([load('Ground048_Color.jpg', true), load('Ground048_NormalGL.jpg'), load('Ground103_Color.jpg', true), load('Ground103_NormalGL.jpg')]);
  return { soil, soilNormal, dirt, dirtNormal };
}
