// The look (Timberfall's): a late-afternoon country yard lit like an architect's model on a table. A
// low warm sun with soft shadows, a raymarched sky with drifting cloud (sky.ts, from three-voxel-
// destruction by way of Brickfall), image-based sky light, ambient occlusion in the corners, haze, a
// filmic tone curve with a warm grade, and bloom for blasts. Dust and smoke are drawn in a pass of
// their own at half resolution and laid over the scene.
//
// z is up. The yard is small (the structure stands at the origin), so the sun's shadow box covers
// all of it at once.

import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  add,
  equirectUV,
  float,
  hash,
  mix,
  mrt,
  mx_noise_float,
  normalize,
  normalView,
  output,
  pass,
  positionLocal,
  positionWorld,
  renderOutput,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  instanceIndex,
  max,
  min,
  abs,
  clamp,
  transformNormalToView,
} from 'three/tsl';
import * as THREE from 'three/webgpu';
import { buildNature } from './nature.ts';
import { CitySky } from './sky.ts';
import { loadSet, type TextureSet } from './pieces.ts';

// biome-ignore lint: TSL nodes
type N = any;

/**
 * A scene pass that clears to transparent black whatever the renderer's clear colour (from
 * Brickfall: effects that copy their input reset the clear to opaque black meanwhile).
 */
class TransparentPass extends THREE.PassNode {
  private readonly held = new THREE.Color();
  updateBefore(frame: THREE.NodeFrame): boolean | undefined {
    const renderer = frame.renderer as THREE.Renderer;
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.held);
    renderer.setClearColor(this.held, 0);
    const result = super.updateBefore(frame);
    renderer.setClearColor(this.held, alpha);
    return result;
  }
}

/** The site's middle and the sun's shadow box half-width (m). */
const SITE_CENTRE = new THREE.Vector3(0, 0, 3);
const SHADOW_HALF = 15;
/** How many blast lights there are (always in the scene, dark until used: nothing recompiles). */
const LIGHT_POOL = 4;

interface LightJob {
  t: number;
  life: number;
  intensity: number;
}

export class View {
  readonly renderer: THREE.WebGPURenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2500);
  /** Smoke and dust (particles.ts), drawn at half resolution over the scene. */
  readonly smokeScene = new THREE.Scene();
  readonly sun = new THREE.DirectionalLight(0xfff0dc, 3);
  readonly hemi = new THREE.HemisphereLight(0xc6d8f0, 0x6a5a44, 0.35);
  /** Unit vector towards the sun. */
  readonly sunDirection = new THREE.Vector3();
  sky!: CitySky;
  readonly lights: THREE.PointLight[] = [];
  private readonly jobs: LightJob[] = [];
  private post!: THREE.RenderPipeline;
  private bloomPass!: ReturnType<typeof bloom>;
  /** A blast flashes the whole frame for a moment (exposure, 1: none). */
  readonly pulse = uniform(1);
  readonly sceneDepth!: THREE.TextureNode;
  private smokePass!: TransparentPass;
  private scenePass!: ReturnType<typeof pass>;
  private time = 0;
  /** The ground's texture sets (null if they didn't load). */
  private ground: { grass: TextureSet; gravel: TextureSet } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGPURenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.camera.up.set(0, 0, 1);
  }

  /**
   * Start the GPU, asking for the storage limits the solver uses (as big as this adapter offers),
   * then build the sky, the ground and the post chain.
   */
  async init(onProgress: (share: number) => void = () => {}): Promise<void> {
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    if (!gpu) throw new Error('WebGPU is not available in this browser');
    // (Asked a few times over a few seconds: a browser's GPU process restarting takes that long to come back)
    let adapter: GPUAdapter | null = null;
    for (const wait of [0, 500, 1500, 3000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
      if (adapter) break;
    }
    if (!adapter) throw new Error('The browser has WebGPU, but it offered no graphics adapter after several tries. Restarting the browser usually brings it back.');
    const want = 1 << 30;
    const backend = this.renderer.backend as unknown as { parameters: { requiredLimits: Record<string, number> } };
    backend.parameters.requiredLimits = {
      maxStorageBufferBindingSize: Math.min(want, adapter.limits.maxStorageBufferBindingSize),
      maxBufferSize: Math.min(want, adapter.limits.maxBufferSize),
      maxStorageBuffersPerShaderStage: Math.min(10, adapter.limits.maxStorageBuffersPerShaderStage),
    };
    await this.renderer.init();
    // (three falls back to WebGL by itself when it can't get a device, and the solver can't run there)
    if (!(this.renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend) throw new Error('The browser could not give this demo a WebGPU device. Restarting the browser usually brings it back.');
    (window as unknown as { __viewBoot?: string[] }).__viewBoot = [`gpu ${(performance.now() / 1000).toFixed(2)}`];
    onProgress(0.3);
    const [grass, gravel] = await Promise.all([loadSet('leafy_grass'), loadSet('gravel_floor')]).catch(() => [null, null]);
    if (grass && gravel) this.ground = { grass, gravel };
    onProgress(0.6);
    const vb = (window as unknown as { __viewBoot: string[] }).__viewBoot;
    vb.push(`ground textures ${(performance.now() / 1000).toFixed(2)}`);
    this.setupLights();
    vb.push(`lights+sky ${(performance.now() / 1000).toFixed(2)}`);
    this.setupWorld();
    await Promise.all([this.setupSkyLight().catch((e) => console.warn('sky light', e)), buildNature(this.scene).catch((e) => console.warn('nature', e))]);
    vb.push(`skylight+nature ${(performance.now() / 1000).toFixed(2)}`);
    this.setupPost();
    onProgress(1);
  }

  private setupLights(): void {
    // Late afternoon: the sun low over the camera's right shoulder at the start, raking across the front
    const az = (-38 * Math.PI) / 180;
    const el = (27 * Math.PI) / 180;
    this.sunDirection.set(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)).normalize();
    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera as THREE.OrthographicCamera;
    [s.left, s.right, s.top, s.bottom, s.near, s.far] = [-SHADOW_HALF, SHADOW_HALF, SHADOW_HALF, -SHADOW_HALF, 1, 200];
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 2;
    sun.position.copy(SITE_CENTRE).addScaledVector(this.sunDirection, 90);
    sun.target.position.copy(SITE_CENTRE);
    this.scene.add(sun, sun.target, this.hemi);
    this.scene.fog = new THREE.FogExp2(0xc9d2d6, 0.0065);
    this.smokeScene.fog = this.scene.fog;
    for (let k = 0; k < LIGHT_POOL; k++) {
      const light = new THREE.PointLight(0xff9a50, 0, 26, 2);
      light.position.set(0, 0, -500);
      this.scene.add(light);
      this.lights.push(light);
      this.jobs.push({ t: 0, life: 0, intensity: 0 });
    }
    this.sky = new CitySky(this.sunDirection);
    this.sky.coverage = 0.38;
    this.sky.setQuality('high');
    this.scene.add(this.sky.object);
    this.sky.update(this.camera, 0);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(this.sky.horizon).multiplyScalar(0.85);
    this.sun.color.copy(this.sky.sunColor);
    this.sun.intensity = this.sky.sunIntensity() * 1.05;
  }

  /** Sky light and reflections: Poly Haven's Qwantani late afternoon, turned so its sun is ours. */
  private async setupSkyLight(): Promise<void> {
    const info = await fetch('hdri/index.json').then((r) => r.json());
    const sky = info.late_afternoon;
    const tex = await new HDRLoader().loadAsync(`hdri/${sky.file}`);
    const [x, y] = sky.sun;
    const turn = Math.atan2(this.sunDirection.y, this.sunDirection.x) - Math.atan2(y, x);
    const env = new THREE.Scene();
    const dome = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
    const dir: N = normalize(positionLocal);
    const [c, s] = [Math.cos(-turn), Math.sin(-turn)];
    const turned: N = vec3(dir.x.mul(c).sub(dir.y.mul(s)), dir.x.mul(s).add(dir.y.mul(c)), dir.z);
    // The ground half: the yard's warm grey-green, not the HDRI's own
    const below = vec3(0.12, 0.12, 0.08);
    dome.colorNode = mix(below, texture(tex, equirectUV(vec3(turned.y, turned.z, turned.x))).rgb, smoothstep(-0.05, 0.02, dir.z)) as unknown as THREE.Node<"color">;
    env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), dome));
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const target = pmrem.fromScene(env, 0.02);
    this.scene.environment = target.texture;
    this.scene.environmentIntensity = 0.42;
    pmrem.dispose();
    tex.dispose();
  }

  /** The ground (a gravel yard in a grass field, rolling away to hills) and the model trees round it. */
  private setupWorld(): void {
    // Ground: 400 m square, flat over the site, rolling beyond 40 m
    const SIZE = 400;
    const g = new THREE.PlaneGeometry(SIZE, SIZE, 220, 220);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      p.setZ(i, terrainHeight(x, y));
    }
    g.computeVertexNormals();
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
    const w: N = positionWorld;
    if (this.ground) {
      const { grass, gravel } = this.ground;
      const uvG: N = w.xy.div(2.2);
      const uvY: N = w.xy.div(1.6);
      // Where the yard is: a rounded rectangle round the structure, frayed by noise
      const yard: N = (() => {
        const q: N = abs(w.xy).sub(vec2(7, 5.5));
        const d: N = max(q, vec2(0)).length().add(min(max(q.x, q.y), 0));
        const n: N = mx_noise_float(w.xy.mul(0.35)).mul(1.6).add(mx_noise_float(w.xy.mul(1.7)).mul(0.5));
        return smoothstep(1.2, -0.6, d.add(n));
      })();
      // A farm track: two wheel ruts of dirt running off the yard
      const track = (ox: number, oy: number, dx: number, dy: number, from: number, to: number) => {
        const rel: N = w.xy.sub(vec2(ox, oy));
        const along: N = rel.dot(vec2(dx, dy));
        const across: N = rel.dot(vec2(-dy, dx)).add(mx_noise_float(w.xy.mul(0.08)).mul(2.5));
        const rut: N = (smoothstep as N)(0.55, 0.15, abs(abs(across).sub(0.85))).mul(0.9).add((smoothstep as N)(1.6, 1.0, abs(across)).mul(0.35));
        return rut.mul((smoothstep as N)(from, from + 3, along)).mul((smoothstep as N)(to, to - 10, along));
      };
      const tracks: N = max(track(5, 4, 0.83, 0.55, 0, 80), track(-6, -5, -0.6, -0.8, 0, 70));
      const t: N = max(yard, tracks.min(1));
      const variation: N = mx_noise_float(w.xy.mul(0.05)).mul(0.5).add(0.5);
      const grassC: N = texture(grass.diff, uvG).rgb.mul(mix(vec3(0.78, 0.86, 0.62), vec3(1.0, 0.95, 0.7), variation));
      const gravelC: N = texture(gravel.diff, uvY).rgb.mul(vec3(0.82, 0.8, 0.76)).mul(mx_noise_float(w.xy.mul(0.3)).mul(0.12).add(0.95));
      m.colorNode = mix(grassC, gravelC, t) as unknown as THREE.Node<'color'>;
      m.roughnessNode = mix(texture(grass.arm, uvG).g, texture(gravel.arm, uvY).g, t) as unknown as THREE.Node<'float'>;
      m.aoNode = mix(texture(grass.arm, uvG).r, texture(gravel.arm, uvY).r, t).mul(0.5).add(0.5) as unknown as THREE.Node<'float'>;
      const nG: N = texture(grass.nor, uvG).rgb.mul(2).sub(1);
      const nY: N = texture(gravel.nor, uvY).rgb.mul(2).sub(1);
      // The maps' tangent frame is the world's x and y on this nearly flat ground
      const nm: N = mix(nG, nY, t);
      m.normalNode = transformNormalToView(normalize(vec3(nm.x.mul(0.9), nm.y.mul(0.9), nm.z))) as unknown as THREE.Node<'vec3'>;
    } else m.color.setRGB(0.3, 0.38, 0.2);
    const ground = new THREE.Mesh(g, m);
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.scene.add(ground);
  }

  private setupPost(): void {
    this.post = new THREE.RenderPipeline(this.renderer);
    const scenePass = pass(this.scene, this.camera, { samples: 0 });
    this.scenePass = scenePass;
    scenePass.setMRT(mrt({ output, normal: normalView }));
    const colour: N = scenePass.getTextureNode('output');
    const depth: N = scenePass.getTextureNode('depth');
    (this as { sceneDepth: THREE.TextureNode }).sceneDepth = texture(scenePass.getTexture('depth'));
    const occlusion = ao(depth, scenePass.getTextureNode('normal'), this.camera);
    occlusion.resolutionScale = 0.5;
    occlusion.radius.value = 0.9;
    occlusion.thickness.value = 1.2;
    occlusion.scale.value = 1.3;
    this.smokePass = new TransparentPass(THREE.PassNode.COLOR, this.smokeScene, this.camera, { samples: 0, depthBuffer: false });
    this.smokePass.setResolutionScale(0.5);
    const smoke: N = this.smokePass.getTextureNode('output');
    const lit: N = colour.rgb.mul(occlusion.getTextureNode().r.mul(0.85).add(0.15));
    const withSmoke: N = lit.mul(float(1).sub(smoke.a)).add(smoke.rgb);
    const hdr: N = vec4(withSmoke, 1);
    this.bloomPass = bloom(hdr, 0.22, 0.5, 0.9);
    const bloomed: N = add(hdr, this.bloomPass).rgb.mul(this.pulse);
    // Grade: a touch more colour, warm highlights, cool shadows
    const lum: N = bloomed.dot(vec3(0.2126, 0.7152, 0.0722));
    const graded: N = mix(vec3(lum), bloomed, 1.12).mul(mix(vec3(0.93, 0.98, 1.05), vec3(1.05, 1.0, 0.92), smoothstep(0, 1.2, lum)));
    const toned: N = renderOutput(vec4(graded, 1));
    const vignette: N = smoothstep(1.3, 0.4, uv().sub(0.5).length().mul(1.5)).mul(0.2).add(0.8);
    // A whisper of grain against banding in the sky and the dust
    const grain: N = hash(uv().mul(1777).add(this.pulse)).sub(0.5).mul(0.012);
    const finished: N = vec4((clamp as N)(toned.rgb.mul(vignette).add(grain), 0, 1), 1);
    this.post.outputColorTransform = false;
    this.post.outputNode = smaa(finished);
  }

  /**
   * Compile every material in the background (the driver's threads), keyed for the passes the
   * scene and the smoke are drawn in: a compile keyed for the canvas, where nothing is drawn,
   * left the first frame to compile them all again, for 3 s.
   */
  async compile(): Promise<void> {
    // One frame of the post chain with nothing in the scenes first: it sets the passes up (the
    // scene pass's second target, for normals, only exists then; compiled before it, materials
    // didn't write it and their pipelines failed) and compiles the post effects themselves
    const shown = [...this.scene.children, ...this.smokeScene.children].filter((o) => o.visible);
    for (const o of shown) o.visible = false;
    this.post.render();
    for (const o of shown) o.visible = true;
    // (One after the other: each sets the renderer's target and outputs while it compiles)
    await this.scenePass.compileAsync(this.renderer);
    await this.smokePass.compileAsync(this.renderer);
  }

  setSize(w: number, h: number): void {
    // (A frame laid out at no size, hidden or not yet placed, still gets a canvas: WebGPU refuses an empty one)
    w = Math.max(16, Math.round(w));
    h = Math.max(16, Math.round(h));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Light a blast: a flash at `at` fading over `life` s. */
  flash(at: ArrayLike<number>, intensity: number, life = 0.5, colour = 0xff9a50): void {
    let k = this.jobs.findIndex((j) => this.time - j.t > j.life);
    if (k < 0) k = this.jobs.reduce((best, j, i) => (j.t < this.jobs[best].t ? i : best), 0);
    this.jobs[k] = { t: this.time, life, intensity };
    this.lights[k].position.set(at[0], at[1], at[2]);
    this.lights[k].color.set(colour);
  }

  /** Bloom strength (0.22 normally; a blast pushes it). */
  set glow(v: number) {
    this.bloomPass.strength.value = v;
  }

  render(dt: number): void {
    this.time += dt;
    for (let k = 0; k < LIGHT_POOL; k++) {
      const j = this.jobs[k];
      const a = (this.time - j.t) / Math.max(j.life, 1e-3);
      // A hot flash, then a flicker as it dies
      this.lights[k].intensity = a < 1 ? j.intensity * (1 - a) ** 2 * (0.85 + 0.15 * Math.sin(this.time * 60 + k)) : 0;
    }
    this.sky.update(this.camera, this.time);
    this.post.render();
  }
}

/** Ground height (m): flat over the yard, rolling hills from 45 m out. */
export function terrainHeight(x: number, y: number): number {
  const d = Math.hypot(x, y);
  const k = Math.min(1, Math.max(0, (d - 45) / 60));
  const ease = k * k * (3 - 2 * k);
  const h = Math.sin(x * 0.021 + 1.3) * 6 + Math.cos(y * 0.027 - 0.4) * 5 + Math.sin((x + y) * 0.05) * 2.2 + Math.max(0, d - 120) * 0.12;
  return ease * (h + 4.5);
}

