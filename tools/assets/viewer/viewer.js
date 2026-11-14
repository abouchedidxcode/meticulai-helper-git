// The asset viewer: renders models, materials, skies and fonts into pictures an agent can look at.
// Runs in a hidden browser page opened by tools/assets/lib/viewer.mjs. Every function returns
// { image: <jpeg data URL>, facts: {...} }.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const draco = new DRACOLoader().setDecoderPath('/three/examples/jsm/libs/draco/gltf/');
const ktx2 = new KTX2Loader().setTranscoderPath('/three/examples/jsm/libs/basis/').detectSupport(renderer);
const gltfLoader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const TONE = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping, none: THREE.NoToneMapping, linear: THREE.LinearToneMapping };

// ---------------------------------------------------------------- loading

async function loadModel(url, ext) {
  ext = (ext || '').toLowerCase();
  if (ext === '.glb' || ext === '.gltf') {
    const g = await gltfLoader.loadAsync(url);
    return { root: g.scene || g.scenes[0], animations: g.animations || [] };
  }
  if (ext === '.fbx') {
    const o = await new FBXLoader().loadAsync(url);
    return { root: o, animations: o.animations || [] };
  }
  if (ext === '.obj') {
    const obj = new OBJLoader();
    const mtlUrl = url.replace(/\.obj$/i, '.mtl');
    try {
      const r = await fetch(mtlUrl);
      if (r.ok) {
        const ml = new MTLLoader();
        ml.setResourcePath(url.slice(0, url.lastIndexOf('/') + 1));
        const mats = ml.parse(await r.text(), '');
        mats.preload();
        obj.setMaterials(mats);
      }
    } catch { /* no mtl */ }
    return { root: await obj.loadAsync(url), animations: [] };
  }
  throw new Error(`can't read ${ext || 'this'} files as models`);
}

const TEX_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'specularMap', 'lightMap', 'clearcoatNormalMap', 'transmissionMap', 'sheenColorMap'];

function modelFacts(root, animations) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  const size = box.getSize(new THREE.Vector3());
  let tris = 0, meshes = 0, skinned = 0, vcolors = 0, instanced = 0;
  const mats = new Map(), texs = new Map(), bones = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    let t = g.index ? g.index.count / 3 : (g.attributes.position?.count || 0) / 3;
    if (o.isInstancedMesh) { t *= o.count; instanced++; }
    tris += t;
    if (o.isSkinnedMesh) { skinned++; o.skeleton?.bones.forEach((b) => bones.add(b.uuid)); }
    if (g.attributes.color) vcolors++;
    for (const m of [].concat(o.material)) {
      if (!m) continue;
      if (!mats.has(m.uuid)) {
        const c = m.color ? '#' + m.color.getHexString(THREE.SRGBColorSpace) : null;
        mats.set(m.uuid, { name: m.name || '(no name)', color: c, roughness: m.roughness, metalness: m.metalness, textured: !!m.map, transparent: !!m.transparent || (m.opacity ?? 1) < 1 });
      }
      for (const s of TEX_SLOTS) {
        const tx = m[s];
        if (!tx || texs.has(tx.uuid)) continue;
        const img = tx.image || tx.source?.data;
        texs.set(tx.uuid, { slot: s, width: img?.width || 0, height: img?.height || 0 });
      }
    }
  });
  return {
    size: { x: +size.x.toFixed(3), y: +size.y.toFixed(3), z: +size.z.toFixed(3) },
    min: { x: +box.min.x.toFixed(3), y: +box.min.y.toFixed(3), z: +box.min.z.toFixed(3) },
    center: { x: +((box.min.x + box.max.x) / 2).toFixed(3), z: +((box.min.z + box.max.z) / 2).toFixed(3) },
    triangles: Math.round(tris), meshes, skinnedMeshes: skinned, bones: bones.size, instancedMeshes: instanced, vertexColorMeshes: vcolors,
    materials: [...mats.values()], textures: [...texs.values()],
    animations: animations.map((a) => ({ name: a.name || '(no name)', seconds: +a.duration.toFixed(2) })),
    empty: box.isEmpty(),
  };
}

function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    for (const m of [].concat(o.material || [])) {
      for (const s of TEX_SLOTS) m[s]?.dispose?.();
      m.dispose?.();
    }
  });
}

// ---------------------------------------------------------------- staging

/** A plain 1.8 m figure for scale, built from simple shapes. */
function human(color = 0x30343c) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const add = (geo, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.CapsuleGeometry(0.085, 0.72, 4, 12), -0.1, 0.445, 0); // legs (0 .. 0.89)
  add(new THREE.CapsuleGeometry(0.085, 0.72, 4, 12), 0.1, 0.445, 0);
  add(new THREE.CapsuleGeometry(0.19, 0.4, 4, 16), 0, 1.15, 0); // torso
  add(new THREE.CapsuleGeometry(0.06, 0.58, 4, 10), -0.27, 1.13, 0); // arms
  add(new THREE.CapsuleGeometry(0.06, 0.58, 4, 10), 0.27, 1.13, 0);
  add(new THREE.SphereGeometry(0.115, 20, 14), 0, 1.685, 0); // head, top at 1.80
  return g;
}

function hexOr(v, fallback) { try { return v ? new THREE.Color(v) : new THREE.Color(fallback); } catch { return new THREE.Color(fallback); } }

/** Lights, ground, grid, the scale figure. Returns { scene, unionBox, gridCell, humanShown }. */
function stage(root, box, look = null) {
  const scene = new THREE.Scene();
  const light = look?.light || {};
  const bg = look ? hexOr(light.background || light.fog || light.sky, '#9aa4b1') : new THREE.Color('#c8ccd2');
  scene.background = bg;
  scene.environment = roomEnv;
  scene.environmentIntensity = look ? (light.ambientIntensity != null ? light.ambientIntensity * 0.5 : 0.45) : 0.55;
  const size = box.getSize(new THREE.Vector3());
  const ext = Math.max(size.x, size.y, size.z) || 1;
  const hemi = new THREE.HemisphereLight(look ? hexOr(light.ambient, '#b4c0e6') : 0xffffff, look ? hexOr(light.shadow || light.ground, '#4a3f5e') : 0x7d828c, look ? 0.9 : 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(look ? hexOr(light.sun, '#ffffff') : 0xffffff, look ? (light.sunIntensity ?? 2.4) : 2.2);
  const c = box.getCenter(new THREE.Vector3());
  sun.position.set(c.x + ext * 1.2, c.y + ext * 2.2, c.z + ext * 1.6);
  sun.target.position.copy(c);
  sun.castShadow = true;
  const sc = sun.shadow.camera;
  const r = ext * 2.2;
  sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 0.01; sc.far = ext * 8;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02 * ext;
  scene.add(sun, sun.target);
  if (look && light.fog && light.fogNear != null && light.fogFar != null) scene.fog = new THREE.Fog(hexOr(light.fog, '#888888'), light.fogNear, light.fogFar);

  const cell = ext < 0.6 ? 0.1 : ext > 120 ? 10 : 1;
  const humanShown = ext >= 0.25 && ext <= 400;
  const union = box.clone();
  let figure = null;
  if (humanShown) {
    figure = human(look ? hexOr(light.shadow, '#30343c').getHex() : 0x30343c);
    figure.position.set(box.max.x + Math.min(0.55, Math.max(0.25, ext * 0.4)), 0, box.min.z - 0.3);
    scene.add(figure);
    union.expandByObject(figure);
  }
  const span = Math.max(union.max.x - union.min.x, union.max.z - union.min.z);
  const gsize = Math.ceil((span * 1.8 + cell * 6) / cell) * cell;
  const groundMat = new THREE.MeshStandardMaterial({ color: look ? hexOr(light.groundColor, '#8c8f94') : 0xa4a8ae, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gsize * 3, gsize * 3), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((union.min.x + union.max.x) / 2, Math.min(0, box.min.y) - 0.0005 * ext, (union.min.z + union.max.z) / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(gsize, Math.round(gsize / cell), 0x50555c, 0x6c7178);
  grid.position.set(Math.round(ground.position.x / cell) * cell, ground.position.y + 0.0008 * ext, Math.round(ground.position.z / cell) * cell);
  grid.material.transparent = true; grid.material.opacity = 0.75;
  scene.add(grid);
  const axes = new THREE.AxesHelper(ext * 0.3);
  axes.position.y = ground.position.y + 0.001 * ext;
  axes.material.depthTest = false; axes.renderOrder = 10;
  scene.add(axes);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(root);
  return { scene, union, cell, humanShown, figure };
}

/** Put a perspective camera along `dir` so `box` fills the frame. */
function frame(cam, box, dir, up = new THREE.Vector3(0, 1, 0), margin = 1.1) {
  const c = box.getCenter(new THREE.Vector3());
  const d = dir.clone().normalize();
  cam.up.copy(up);
  cam.position.copy(c).addScaledVector(d, 10);
  cam.lookAt(c);
  cam.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
  const upv = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
  const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), tanH = tanV * cam.aspect;
  let dist = 0;
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
    const x = Math.abs(p.dot(right)), y = Math.abs(p.dot(upv)), z = p.dot(d);
    dist = Math.max(dist, z + x / tanH, z + y / tanV);
  }
  dist *= margin;
  cam.position.copy(c).addScaledVector(d, dist);
  cam.near = Math.max(dist / 1000, 0.001); cam.far = dist * 20;
  cam.lookAt(c);
  cam.updateProjectionMatrix();
}

function snap() { return renderer.domElement; }

function label(ctx, text, x, y, { size = 15, bg = 'rgba(0,0,0,0.62)', fg = '#fff', bold = true } = {}) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
  const w = ctx.measureText(text).width;
  ctx.fillStyle = bg; ctx.fillRect(x, y, w + 12, size + 10);
  ctx.fillStyle = fg; ctx.fillText(text, x + 6, y + size + 2);
}

function canvas2d(w, h, fill = '#1d2024') {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = fill; ctx.fillRect(0, 0, w, h);
  return { cv, ctx };
}

const fmtM = (v) => (v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3));

function paletteStrip(ctx, colors, x, y, w, h) {
  if (!colors?.length) return;
  const cw = w / colors.length;
  colors.forEach((c, i) => {
    ctx.fillStyle = c.hex; ctx.fillRect(x + i * cw, y, cw - 2, h);
    const lum = 0.2126 * c.rgb[0] + 0.7152 * c.rgb[1] + 0.0722 * c.rgb[2];
    ctx.fillStyle = lum > 140 ? '#111' : '#fff';
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillText(`${c.index} ${c.hex}`, x + i * cw + 6, y + h / 2 + 5);
  });
}

const pivotOk = (f) => Math.abs(f.min.y) <= Math.max(0.01, f.size.y * 0.02) && Math.hypot(f.center.x, f.center.z) <= Math.max(0.02, Math.max(f.size.x, f.size.z) * 0.1);
function pivotText(f) {
  const h = Math.max(f.size.y, 1e-6);
  const parts = [];
  if (Math.abs(f.min.y) <= Math.max(0.01, h * 0.02)) parts.push('Bottom is at y = 0: it stands on the ground where you place it.');
  else if (f.min.y < 0) parts.push(`Bottom is ${fmtM(-f.min.y)} m BELOW its origin: placed at y = 0 it sinks into the ground.`);
  else parts.push(`Bottom is ${fmtM(f.min.y)} m ABOVE its origin: placed at y = 0 it floats.`);
  const off = Math.hypot(f.center.x, f.center.z);
  if (off > Math.max(0.02, Math.max(f.size.x, f.size.z) * 0.1)) parts.push(`Its middle is ${fmtM(off)} m off the origin.`);
  if (!pivotOk(f)) parts.push('Fix: restyle.mjs --pivot bottom-center.');
  return parts.join(' ');
}

function pickIdle(animations) {
  return animations.find((a) => /idle|stand|breath/i.test(a.name)) || null;
}

// ---------------------------------------------------------------- models

/** Four views of one model on a 1 m grid with a 1.8 m figure. args: { url, ext, name, fileSize, look, toneMapping, exposure } */
async function modelSheet({ url, ext, name, look = null, title = null }) {
  const { root, animations } = await loadModel(url, ext);
  const facts = modelFacts(root, animations);
  if (facts.empty) throw new Error('the model has no visible geometry');
  const idle = pickIdle(animations);
  if (idle) {
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(idle).play();
    mixer.setTime(Math.min(0.5, idle.duration * 0.25));
    facts.posedWith = idle.name;
  }
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  const { scene, union, cell, humanShown, figure } = stage(root, box, look);
  // small things: show the person only in the 3/4 view, so the other views show the model big enough to judge
  const sz = box.getSize(new THREE.Vector3());
  const small = figure && Math.max(sz.x, sz.y, sz.z) < 1.0;
  const light = look?.light || {};
  renderer.toneMapping = TONE[String(light.toneMapping || 'aces').toLowerCase()] ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = look ? (light.exposure ?? 1.0) : 1.0;
  const VW = 640, VH = 420;
  renderer.setSize(VW, VH, false);
  const cam = new THREE.PerspectiveCamera(32, VW / VH, 0.01, 1000);
  const views = [
    ['FRONT (from +Z)', new THREE.Vector3(0, 0.12, 1)],
    ['SIDE (from +X)', new THREE.Vector3(1, 0.12, 0)],
    ['TOP (front at the bottom)', new THREE.Vector3(0, 1, 0.0001), new THREE.Vector3(0, 0, -1)],
    ['3/4 VIEW', new THREE.Vector3(1, 0.75, 1)],
  ];
  const head = 96, foot = look?.colors?.length ? 44 : 0;
  const { cv, ctx } = canvas2d(VW * 2, head + VH * 2 + foot);
  views.forEach(([lab, dir, up], i) => {
    const withFigure = !small || i === 3;
    if (figure) figure.visible = withFigure;
    frame(cam, withFigure ? union : box, dir, up || new THREE.Vector3(0, 1, 0));
    renderer.render(scene, cam);
    const x = (i % 2) * VW, y = head + Math.floor(i / 2) * VH;
    ctx.drawImage(snap(), x, y);
    label(ctx, lab, x + 8, y + 8, { size: 14 });
    ctx.strokeStyle = '#1d2024'; ctx.lineWidth = 2; ctx.strokeRect(x, y, VW, VH);
  });
  // header
  const s = facts.size;
  ctx.fillStyle = '#fff'; ctx.font = `bold 20px ${FONT}`;
  ctx.fillText(title || name, 12, 28);
  ctx.font = `15px ${FONT}`;
  const texTxt = facts.textures.length ? `${facts.textures.length} texture${facts.textures.length > 1 ? 's' : ''} (largest ${Math.max(...facts.textures.map((t) => t.width))} px)` : 'no textures';
  ctx.fillText(`${fmtM(s.x)} x ${fmtM(s.y)} x ${fmtM(s.z)} m (wide x tall x deep)  |  ${facts.triangles.toLocaleString('en')} triangles  |  ${facts.meshes} mesh${facts.meshes === 1 ? '' : 'es'}, ${facts.materials.length} material${facts.materials.length === 1 ? '' : 's'}, ${texTxt}${facts.animations.length ? `  |  ${facts.animations.length} animation${facts.animations.length > 1 ? 's' : ''}` : ''}`, 12, 50);
  ctx.fillStyle = '#c9d1d9';
  ctx.fillText(`Grid squares: ${cell >= 1 ? cell + ' m' : cell * 100 + ' cm'}.${humanShown ? (small ? ' Dark figure (3/4 view): a 1.8 m person.' : ' Dark figure: a 1.8 m person.') : ''} Red/blue lines: the origin (red = +X, blue = +Z = front).${facts.posedWith ? ` Posed with "${facts.posedWith}".` : ''}`, 12, 69);
  ctx.fillStyle = pivotOk(facts) ? '#9be9a8' : '#ffb86b';
  ctx.fillText(pivotText(facts), 12, 88);
  if (foot) {
    ctx.fillStyle = '#fff'; ctx.font = `bold 13px ${FONT}`;
    ctx.fillText('Game palette:', 8, head + VH * 2 + 27);
    paletteStrip(ctx, look.colors, 110, head + VH * 2 + 6, VW * 2 - 118, foot - 12);
  }
  disposeTree(root);
  scene.clear();
  return { image: cv.toDataURL('image/jpeg', 0.9), facts: { ...facts, gridCell: cell, humanShown } };
}

/** Before/after: two model sheets stacked. args: { a: {...modelSheet args}, b: {...} } */
async function compare({ a, b }) {
  const A = await modelSheet(a), B = await modelSheet(b);
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const [ia, ib] = await Promise.all([load(A.image), load(B.image)]);
  const { cv, ctx } = canvas2d(ia.width, ia.height + ib.height + 8, '#000');
  ctx.drawImage(ia, 0, 0); ctx.drawImage(ib, 0, ia.height + 8);
  label(ctx, 'BEFORE', ia.width - 110, 8, { size: 18, bg: '#b42318' });
  label(ctx, 'AFTER', ia.width - 100, ia.height + 16, { size: 18, bg: '#1a7f37' });
  return { image: cv.toDataURL('image/jpeg', 0.88), facts: { before: A.facts, after: B.facts } };
}

/** Many models, one 3/4 view each, in a numbered grid. args: { items: [{ url, ext, label, name }], cols, tile } */
async function modelGrid({ items, cols = 6, tile = 256, title = '' }) {
  const rows = Math.ceil(items.length / cols);
  const head = title ? 34 : 0;
  const { cv, ctx } = canvas2d(cols * tile, head + rows * tile, '#1d2024');
  if (title) { ctx.fillStyle = '#fff'; ctx.font = `bold 17px ${FONT}`; ctx.fillText(title, 10, 23); }
  renderer.setSize(tile, tile, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const x = (i % cols) * tile, y = head + Math.floor(i / cols) * tile;
    try {
      const { root, animations } = await loadModel(it.url, it.ext);
      const f = modelFacts(root, animations);
      const box = new THREE.Box3().setFromObject(root, true);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#c8ccd2');
      scene.environment = roomEnv; scene.environmentIntensity = 0.55;
      scene.add(new THREE.HemisphereLight(0xffffff, 0x7d828c, 0.8));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(1, 2, 1.4); scene.add(sun);
      scene.add(root);
      frame(cam, box, new THREE.Vector3(1, 0.75, 1), new THREE.Vector3(0, 1, 0), 1.05);
      renderer.render(scene, cam);
      ctx.drawImage(snap(), x, y);
      const s = f.size;
      label(ctx, `${fmtM(s.x)}x${fmtM(s.y)}x${fmtM(s.z)} m`, x + 4, y + tile - 24, { size: 11, bold: false });
      out.push({ label: it.label, name: it.name, size: f.size, triangles: f.triangles, animations: f.animations.length });
      disposeTree(root); scene.clear();
    } catch (e) {
      ctx.fillStyle = '#5a5d63'; ctx.fillRect(x, y, tile, tile);
      ctx.fillStyle = '#fff'; ctx.font = `13px ${FONT}`; ctx.fillText("couldn't load", x + 10, y + tile / 2);
      out.push({ label: it.label, name: it.name, error: String(e.message || e) });
    }
    label(ctx, String(it.label), x + 4, y + 4, { size: 16 });
    ctx.strokeStyle = '#1d2024'; ctx.lineWidth = 2; ctx.strokeRect(x, y, tile, tile);
  }
  return { image: cv.toDataURL('image/jpeg', 0.88), facts: out };
}

// ---------------------------------------------------------------- materials and textures

const loadTex = (url) => new THREE.TextureLoader().loadAsync(url);
const loadImg = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`can't load ${url.split('/').pop()}`)); i.src = url; });

/** A material (or a single texture): tiled 2x2 swatch + on a sphere and a plane. args: { maps: { color, normal, roughness, ao, metalness, arm }, name } */
async function material({ maps, name, look = null }) {
  const W = 1320, P = 640, head = 64;
  const { cv, ctx } = canvas2d(W, head + P + 16);
  const colorImg = await loadImg(maps.color);
  // swatch: the colour map tiled 2 x 2, so seams show
  const half = P / 2;
  for (let i = 0; i < 4; i++) ctx.drawImage(colorImg, 8 + (i % 2) * half, head + Math.floor(i / 2) * half, half, half);
  label(ctx, 'TILED 2 x 2 (look for seams)', 16, head + 8, { size: 13 });

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  const set = async (slot, url, srgb = false) => { if (!url) return; const t = await loadTex(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; mat[slot] = t; return t; };
  await set('map', maps.color, true);
  await set('normalMap', maps.normal);
  if (maps.arm) { const t = await set('aoMap', maps.arm); mat.roughnessMap = t; mat.metalnessMap = t; mat.roughness = 1; mat.metalness = 1; }
  if (maps.roughness) { await set('roughnessMap', maps.roughness); mat.roughness = 1; }
  if (maps.ao) await set('aoMap', maps.ao);
  if (maps.metalness) { await set('metalnessMap', maps.metalness); mat.metalness = 1; }
  if (maps.normal && /nor_dx|normaldx|_dx\b/i.test(maps.normal)) mat.normalScale.set(1, -1);
  const plane = mat.clone();
  for (const s of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'metalnessMap']) if (mat[s]) { plane[s] = mat[s].clone(); plane[s].repeat.set(2, 2); plane[s].needsUpdate = true; }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c8ccd2');
  scene.environment = roomEnv; scene.environmentIntensity = 0.6;
  const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(3, 4, 2); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -4; sun.shadow.camera.right = 4; sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4;
  scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x777777, 0.5));
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat);
  sphere.position.set(0, 1, 0); sphere.castShadow = true;
  sphere.geometry.setAttribute('uv1', sphere.geometry.attributes.uv);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), plane);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  ground.geometry.setAttribute('uv1', ground.geometry.attributes.uv);
  scene.add(sphere, ground);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  renderer.setSize(P, P, false);
  const cam = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
  cam.position.set(2.6, 2.4, 3.4); cam.lookAt(0, 0.75, 0);
  renderer.render(scene, cam);
  ctx.drawImage(snap(), W - P - 8, head);
  label(ctx, 'LIT: sphere 2 m wide, ground 6 m, texture repeats every 3 m', W - P, head + 8, { size: 13 });

  const found = Object.entries(maps).filter(([, v]) => v).map(([k]) => k);
  ctx.fillStyle = '#fff'; ctx.font = `bold 20px ${FONT}`; ctx.fillText(name, 12, 28);
  ctx.font = `15px ${FONT}`;
  ctx.fillText(`${colorImg.naturalWidth} x ${colorImg.naturalHeight} px  |  maps: ${found.join(', ')}`, 12, 52);
  const facts = { width: colorImg.naturalWidth, height: colorImg.naturalHeight, maps: found };
  // average colour of the colour map (sRGB)
  const sm = document.createElement('canvas'); sm.width = sm.height = 32;
  const sx = sm.getContext('2d'); sx.drawImage(colorImg, 0, 0, 32, 32);
  const d = sx.getImageData(0, 0, 32, 32).data; let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4; facts.average = '#' + [r / n, g / n, b / n].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  if (look?.colors?.length) paletteStrip(ctx, look.colors, 700, 12, 600, 40);
  for (const t of [mat, plane]) { for (const s of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'metalnessMap']) t[s]?.dispose(); t.dispose(); }
  sphere.geometry.dispose(); ground.geometry.dispose();
  return { image: cv.toDataURL('image/jpeg', 0.9), facts };
}

// ---------------------------------------------------------------- skies (HDRI)

async function hdri({ url, ext, name }) {
  const loader = (ext || '').toLowerCase() === '.exr' ? new EXRLoader() : new HDRLoader();
  loader.setDataType(THREE.FloatType);
  const tex = await loader.loadAsync(url);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const img = tex.image; const W = img.width, H = img.height, data = img.data;
  const ch = data.length / (W * H);
  // brightest spot (the sun, if there is one) and overall brightness
  let best = -1, bi = 0, sum = 0, cnt = 0;
  const step = Math.max(1, Math.floor(W / 512));
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
    const i = (y * W + x) * ch;
    const L = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    sum += L; cnt++;
    if (L > best) { best = L; bi = y * W + x; }
  }
  const by = Math.floor(bi / W), bx = bi % W;
  const elevation = +(90 - (by / H) * 180).toFixed(1);
  const azimuth = +((bx / W) * 360).toFixed(0);
  const avg = sum / cnt;
  const OUT_W = 1280, PAN_H = 640, ROW_H = 380, head = 64;
  const { cv, ctx } = canvas2d(OUT_W, head + PAN_H + ROW_H + 8);
  // expose it so the average sky sits at a mid tone (like a camera would), not blown out
  const exposure = Math.min(4, Math.max(0.08, 0.4 / Math.max(1e-4, avg)));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = exposure;
  // panorama
  renderer.setSize(OUT_W, PAN_H, false);
  const flat = new THREE.Scene();
  const pano = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex }));
  flat.add(pano);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  renderer.render(flat, ortho);
  ctx.drawImage(snap(), 0, head);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(0, head + PAN_H / 2); ctx.lineTo(OUT_W, head + PAN_H / 2); ctx.stroke(); ctx.setLineDash([]);
  const sx = (bx / W) * OUT_W, sy = head + (by / H) * PAN_H;
  ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, 14, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
  label(ctx, 'WHOLE SKY (dashed line = horizon, red circle = brightest spot)', 8, head + 8, { size: 13 });
  // three spheres lit by it, the sky behind
  renderer.setSize(OUT_W, ROW_H, false);
  const env = pmrem.fromEquirectangular(tex).texture;
  const scene = new THREE.Scene();
  scene.background = tex; scene.environment = env;
  const mk = (color, roughness, metalness, x) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.MeshStandardMaterial({ color, roughness, metalness })); m.position.x = x; scene.add(m); return m; };
  const spheres = [mk(0xffffff, 0.02, 1, -2.4), mk(0xf2f2f2, 0.35, 0, 0), mk(0x8a8a8a, 0.95, 0, 2.4)];
  const cam = new THREE.PerspectiveCamera(16, OUT_W / ROW_H, 0.1, 200);
  cam.position.set(0, 0.6, 14.5); cam.lookAt(0, 0, 0);
  renderer.render(scene, cam);
  ctx.drawImage(snap(), 0, head + PAN_H + 8);
  label(ctx, 'LIGHT IT GIVES: chrome, glossy white, rough grey', 8, head + PAN_H + 16, { size: 13 });
  ctx.fillStyle = '#fff'; ctx.font = `bold 20px ${FONT}`; ctx.fillText(name, 12, 28);
  ctx.font = `15px ${FONT}`;
  const sunTxt = best > avg * 20 ? `bright sun ${elevation} deg above the horizon` : `no strong sun (soft light); brightest area ${elevation} deg up`;
  ctx.fillText(`${W} x ${H} px  |  ${sunTxt}  |  average brightness ${avg.toFixed(2)} (shown at exposure ${exposure.toFixed(2)})`, 12, 52);
  spheres.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
  pano.geometry.dispose(); pano.material.dispose(); env.dispose(); tex.dispose();
  return { image: cv.toDataURL('image/jpeg', 0.9), facts: { width: W, height: H, brightest: { elevation, azimuth, value: +best.toFixed(2) }, average: +avg.toFixed(3), hasSun: best > avg * 20, exposure: +exposure.toFixed(2) } };
}

// ---------------------------------------------------------------- fonts

async function font({ url, name }) {
  const ff = new FontFace('LookFont', `url(${url})`);
  await ff.load();
  document.fonts.add(ff);
  const { cv, ctx } = canvas2d(1280, 560, '#f4f4f2');
  ctx.fillStyle = '#111';
  ctx.font = `bold 18px ${FONT}`; ctx.fillText(name, 20, 34);
  const lines = [[72, 'Score 12,450'], [48, 'GAME OVER  Press Space'], [32, 'The quick brown fox jumps over the lazy dog'], [24, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ  abcdefghijklmnopqrstuvwxyz'], [24, '0123456789  !?.,:;()+-=%&@#  é ü ñ ç ß'], [16, 'Small text, as in a settings menu or a tooltip: Volume 80%  Sensitivity 1.5']];
  let y = 50;
  for (const [s, t] of lines) { ctx.font = `${s}px LookFont`; y += s * 1.5; ctx.fillText(t, 20, y); }
  return { image: cv.toDataURL('image/jpeg', 0.9), facts: {} };
}

window.viewer = { modelSheet, compare, modelGrid, material, hdri, font };
