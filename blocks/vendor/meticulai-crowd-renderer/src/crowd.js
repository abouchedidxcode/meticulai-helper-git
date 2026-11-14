// THE CROWD RENDERER. From TUMEN by Meticulai.
// Draws thousands of animated, skinned horses and riders (or any rigged model: herds, birds, people) in a few draw calls.
//
// How: at load every clip of a model is played once and each bone's matrix is written into a float texture (one row
// per frame, three texels per bone). Instances are then drawn with instancing and skinned in the vertex shader by
// reading that texture, so an instance costs 24 floats per frame and no CPU skinning. A rider is glued to its horse
// by reading the horse's `seat` bone from the horse's texture, for the horse's own clip and phase, in the rider's
// vertex shader: a rider cannot drift off the saddle. Materials are three's own (Standard near, Lambert far) with
// the vertex stage replaced, so they take the sun, the shadows and the fog like everything else.
// WebGL2 only (GLSL patched into three's materials; it will not run under WebGPURenderer).
//
// USE:
//
//   const crowd = createCrowd({ scene, camera });          // options: quality 'high'|'medium'|'low' (LOD distances),
//                                                          //   cost: { far: 2500, ... } (see COST SWITCHES below)
//   await crowd.register('horse', buildHorse());           // a code-built model from standin.js, or a GLB url:
//   await crowd.register('horse', 'models/horse.glb', 'models/horse.meta.json');
//       // a GLB per the asset contract (HOW-TO-USE.md): SkinnedMeshes named <name>_lod0/_lod1/_lod2 on one skeleton,
//       // named clips. Models without LOD names work too (the one mesh is used at every distance). Options (4th argument):
//       //   { transform: Matrix4 (fix scale/axes), fps: 60, loops: ['walk', ...] or oneShots: [...] (default: the meta's
//       //     clips.<name>.loop when it says, else clips named draw_*, loose_*, couch, hit_*, fall, nock play once),
//       //     track: ['seat','head','hoof_fl',...] bones whose frames the CPU can read, lod3: false, lod3Ratio: 0.42 }
//       // Instead of a url you may pass a built model { root, clips: [{ name, duration, loop, pose(t) }], meta }.
//       // Tints: a vertex attribute _COAT / _TINT (0..1) marks what the first tint colours; or the meta names a mask
//       // texture (meta.tint.mask, R = first tint, G = second) and a heraldry atlas (meta.heraldry).
//   const herd = crowd.createSet('horse', 400);          // capacity; options: { mount: 'horse' } for riders,
//                                                        //   lodDist: [9, 45, 120], shadowDist: 80, radius: 2.4
//   herd.count = 400;
//   herd.set(i, { x, y, z, yaw, pitch, roll, scale,      // where it stands (pitch + = nose up, roll + = leans left)
//                 clip: 'walk', phase: 0.3,              // loops: phase in cycles (any real); one-shots: time: seconds
//                 clipB: 'trot', phaseB: 0.1, blend: 0.4, // optional cross-fade: blend is the weight of clipB
//                 curve: 0,                              // 1/m, + = turning left: bends the body along its path
//                 bend: [b1, b2, b3, b4],                // or the full bend along the trail (locomotion.js / herd.js)
//                 tint: [r, g, b], tintB: [r, g, b],     // multiply the masked parts (coat / cloth; blanket / shield)
//                 hair: 0.2,                             // horses: mane and tail = the coat's tint times this (1 = same);
//                                                        //   a horse whose meta has coat.hair.tints: hair = that list's index + brightness 0..0.99
//                 parts: 0b10010,                        // which variant parts this one wears (see VARIANTS below)
//                 show: true });                         // show: 2 = casts a shadow but is not drawn
//   Riders add: twist (rad, upper body yaw), and the mount's clip state: mClip, mPhase, mClipB, mPhaseB, mBlend,
//   plus riderScale. Give the rider the same x, y, z, yaw, pitch, roll, scale and curve as its horse.
//   A herd animal that wanders can simply use phase += distance / meta.clips[clip].stride and curve = yawRate / speed.
//
//   Fast path (thousands every frame): write the 24 floats per instance straight into set.buf using the offsets in
//   crowd.F, and rows from model.row(clip, phase) / model.rowAt(clip, seconds).
//
//   crowd.models[name].sample('seat', row, out12)        // CPU: a tracked bone's 3x4 model-space frame at a row
//   crowd.stats  { instances, drawn, shadow, lod: [n0, n1, n2, n3], tris, prepMs }
//
// VARIANTS: a model may carry a float vertex attribute _VARIANT: 0 = always drawn, k = 1..12 = the vertex
// belongs to part k (a hat, a helm, a cuirass, a pennon). An instance carries one bit per part (bit k-1) in the whole
// part of its seed float; the vertex shader folds the parts it does not wear to a point. One mesh, one draw call.
// model.hasVariants says whether the attribute was found; meta.variants names the parts.
//
// Cost, measured in the game on a laptop: the far field is cheap (1,600 riders beyond 45 m: under 1 ms); the hero
// mesh is not (a dozen riders at LOD0, 18,000 triangles each with four-bone skinning: about 2 ms). That is why LOD0
// is used only within 9 m. Raise lodDist[0] if the budget allows.
// Culling, LOD (with hysteresis so nothing flickers) and the upload happen once each time the scene is drawn, from
// the camera as it is then. Shadows are cast only by instances within shadowDist of the camera, with the LOD1 mesh
// within 9 m, the LOD2 mesh to 50 m and the far mesh beyond.
// COST SWITCHES, all on by default; pass `cost: { name: false }` to switch one off and measure it:
//   skipEmpty   shadow-only meshes are invisible to the renderer outside the shadow pass and in cascades they hold
//               nothing for (no zero-instance draw calls)         shadowCull  casters by cascade and by what the
//   camera can see (needs opts.cascades; off: rings by distance)  shadowLazy  no new caster list for a cascade that is
//   not redrawn this frame                                        vskip       unworn variant parts skip the skinning
//   nm1         normal map on the mid LOD (default: high quality only)
//   shadowHero  LOD1 mesh for casters within 9 m (false: LOD2)    far: <m>    nothing drawn beyond (2500)
//   crowd.cost holds them (the LIVE ones can be changed while running); crowd.stats.rings = casters per shadow ring.
// Instance record (24 floats): position + scale; quaternion; clip row A, row B, weight of A, twist (riders) or lean
// (horses); horses: the four bend coefficients of the body along its trail (b1 = curvature), riders: the mount's
// row A, row B, weight of A, and curvature; tint A + seed; tint B + rider scale.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const F = { X: 0, Y: 1, Z: 2, SCALE: 3, QX: 4, QY: 5, QZ: 6, QW: 7, ROW_A: 8, ROW_B: 9, W_A: 10, TWIST: 11 /* riders: upper-body twist; horses: lean */, M_ROW_A: 12, M_ROW_B: 13, M_W_A: 14, CURVE: 15, BEND: 12 /* horses: b1..b4 at 12..15; riders: b1 at 15 */, TINT_A: 16, SEED: 19, TINT_B: 20, RIDER_SCALE: 23, STRIDE: 24 };
const STRIDE = F.STRIDE;
const SHADOW_LOD = [1, 2, 2, 3];        // which LOD's mesh each ring of shadow casters uses (see createSet)
const DEFAULT_TRACK = ['seat', 'head', 'hoof_fl', 'hoof_fr', 'hoof_hl', 'hoof_hr'];

const VERT_PARS = /* glsl */`
uniform sampler2D uBoneTex;
#ifdef CROWD_MOUNT
  uniform sampler2D uMountTex; uniform int uSeatCol;
#endif
attribute vec4 iPos; attribute vec4 iQuat; attribute vec4 iAnim; attribute vec4 iMount; attribute vec4 iTintA; attribute vec4 iTintB;
attribute vec4 aExtra; attribute vec4 cSkinIndex; attribute vec4 cSkinWeight;
#ifdef CROWD_COLOR
  varying vec3 vCrowdTintA; varying vec3 vCrowdTintB; varying vec2 vCrowdMask;
#endif
#ifdef CROWD_DEVICES
  attribute vec2 aUv1; varying vec3 vCrowdDev;
#endif
#ifdef CROWD_HAIRTINT
  uniform vec3 uHairTint[8]; uniform vec3 uHairToCoat;
#endif
void crowdRows(sampler2D tex, float row, int col, out vec4 r0, out vec4 r1, out vec4 r2) {
  int y = int(row);
  #ifdef CROWD_INTERP
    float f = row - float(y);
    r0 = mix(texelFetch(tex, ivec2(col, y), 0), texelFetch(tex, ivec2(col, y + 1), 0), f);
    r1 = mix(texelFetch(tex, ivec2(col + 1, y), 0), texelFetch(tex, ivec2(col + 1, y + 1), 0), f);
    r2 = mix(texelFetch(tex, ivec2(col + 2, y), 0), texelFetch(tex, ivec2(col + 2, y + 1), 0), f);
  #else
    r0 = texelFetch(tex, ivec2(col, y), 0); r1 = texelFetch(tex, ivec2(col + 1, y), 0); r2 = texelFetch(tex, ivec2(col + 2, y), 0);
  #endif
}
void crowdSkin(float row, out vec4 r0, out vec4 r1, out vec4 r2) {
  vec4 a0, a1, a2;
  crowdRows(uBoneTex, row, int(cSkinIndex.x + 0.5) * 3, r0, r1, r2);
  #if CROWD_INF > 1
    r0 *= cSkinWeight.x; r1 *= cSkinWeight.x; r2 *= cSkinWeight.x;
    for (int k = 1; k < CROWD_INF; k++) {
      float w = cSkinWeight[k];
      if (w > 0.0) { crowdRows(uBoneTex, row, int(cSkinIndex[k] + 0.5) * 3, a0, a1, a2); r0 += a0 * w; r1 += a1 * w; r2 += a2 * w; }
    }
  #endif
}
vec3 crowdRot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
`;
const VERT_MAIN = /* glsl */`
  vec3 cP = iPos.xyz, cN = vec3(0.0, 1.0, 0.0);
  #if defined(CROWD_VARIANTS) && defined(CROWD_VSKIP)
    // a part this rider does not wear (aExtra.w = part number, the instance carries a bit per part) stays folded to
    // a point, and none of the skinning below is done for it (on the game's hero rider that was four vertices in ten)
    if (!(aExtra.w > 0.5 && ((int(iTintA.w) >> (int(aExtra.w + 0.5) - 1)) & 1) == 0))
  #endif
  {
  vec4 c0, c1, c2; crowdSkin(iAnim.x, c0, c1, c2);
  if (iAnim.z < 0.999) { vec4 d0, d1, d2; crowdSkin(iAnim.y, d0, d1, d2); c0 = mix(d0, c0, iAnim.z); c1 = mix(d1, c1, iAnim.z); c2 = mix(d2, c2, iAnim.z); }
  vec4 cP4 = vec4(position, 1.0);
  cP = vec3(dot(c0, cP4), dot(c1, cP4), dot(c2, cP4));
  cN = vec3(dot(c0.xyz, normal), dot(c1.xyz, normal), dot(c2.xyz, normal));
  #ifdef CROWD_MOUNT
    float cTw = iAnim.w * aExtra.z; float cTc = cos(cTw), cTs = sin(cTw);
    cP = vec3(cP.x * cTc + cP.z * cTs, cP.y, cP.z * cTc - cP.x * cTs) * iTintB.w;
    cN = vec3(cN.x * cTc + cN.z * cTs, cN.y, cN.z * cTc - cN.x * cTs);
    vec4 s0, s1, s2; crowdRows(uMountTex, iMount.x, uSeatCol, s0, s1, s2);
    if (iMount.z < 0.999) { vec4 t0, t1, t2; crowdRows(uMountTex, iMount.y, uSeatCol, t0, t1, t2); s0 = mix(t0, s0, iMount.z); s1 = mix(t1, s1, iMount.z); s2 = mix(t2, s2, iMount.z); }
    cP4 = vec4(cP, 1.0);
    cP = vec3(dot(s0, cP4), dot(s1, cP4), dot(s2, cP4));
    cN = vec3(dot(s0.xyz, cN), dot(s1.xyz, cN), dot(s2.xyz, cN));
  #endif
  cP *= iPos.w;
  { // lay the body along the path it has ridden (see locomotion.js, bendPoint): planted hooves stay planted.
    // A horse bends along its trail; a rider does not bend, he is carried rigidly by the saddle's place on it.
    #ifdef CROWD_MOUNT
      vec4 cB = vec4(iMount.w, 0.0, 0.0, 0.0); vec3 cO = vec3(s0.w, s1.w, s2.w) * iPos.w; vec3 cRel = cP - cO;
    #else
      vec4 cB = iMount; vec3 cO = cP;
    #endif
    // heading along the trail: th(u) = b1 u + b2 u^2 + b3 u^3 + b4 u^4; position = its integral (4-point Gauss)
    float z = cO.z, bX = 0.0, bZ = 0.0, u, a;
    u = z * 0.0694318442; a = u * (cB.x + u * (cB.y + u * (cB.z + u * cB.w))); bX += 0.1739274226 * sin(a); bZ += 0.1739274226 * cos(a);
    u = z * 0.3300094782; a = u * (cB.x + u * (cB.y + u * (cB.z + u * cB.w))); bX += 0.3260725774 * sin(a); bZ += 0.3260725774 * cos(a);
    u = z * 0.6699905218; a = u * (cB.x + u * (cB.y + u * (cB.z + u * cB.w))); bX += 0.3260725774 * sin(a); bZ += 0.3260725774 * cos(a);
    u = z * 0.9305681558; a = u * (cB.x + u * (cB.y + u * (cB.z + u * cB.w))); bX += 0.1739274226 * sin(a); bZ += 0.1739274226 * cos(a);
    float th = z * (cB.x + z * (cB.y + z * (cB.z + z * cB.w))), sn = sin(th), cs = cos(th);
    cP = vec3(bX * z + cO.x * cs, cO.y, bZ * z - cO.x * sn);
    #ifdef CROWD_MOUNT
      cP += vec3(cRel.x * cs + cRel.z * sn, cRel.y, cRel.z * cs - cRel.x * sn);
    #endif
    cN = vec3(cN.x * cs + cN.z * sn, cN.y, cN.z * cs - cN.x * sn);
    #ifndef CROWD_MOUNT
      // the lean into a turn (iAnim.w, + = to the left): the body rolls about the line under it, but the part near
      // the ground does not, so planted hooves neither move nor sink. (A rider's lean is in his quaternion.)
      float cL = iAnim.w * smoothstep(0.0, 0.55 * iPos.w, cP.y), cLs = sin(cL), cLc = cos(cL);
      cP.xy = vec2(cP.x * cLc + cP.y * cLs, cP.y * cLc - cP.x * cLs);
      cN.xy = vec2(cN.x * cLc + cN.y * cLs, cN.y * cLc - cN.x * cLs);
    #endif
  }
  cP = crowdRot(iQuat, cP) + iPos.xyz;
  cN = normalize(crowdRot(iQuat, cN));
  }
  #if defined(CROWD_VARIANTS) && !defined(CROWD_VSKIP)
    // (cost.vskip false: every vertex skinned first and the unworn parts folded afterwards)
    if (aExtra.w > 0.5 && ((int(iTintA.w) >> (int(aExtra.w + 0.5) - 1)) & 1) == 0) cP = iPos.xyz;
  #endif
  #ifdef CROWD_COLOR
    vCrowdTintA = iTintA.rgb; vCrowdTintB = iTintB.rgb; vCrowdMask = aExtra.xy;
    #ifndef CROWD_MOUNT
      #ifdef CROWD_HAIRTINT
        // a horse's mane and tail wear a hair colour of their own (one of the meta's list: the instance carries its
        // number and a brightness); and its "points" (legs from the knee down, muzzle, ear tips, a dorsal stripe:
        // aExtra.z < 0) are drawn toward that colour by the instance's points strength: black legs on a bay
        vec3 cHair = uHairTint[int(clamp(iTintB.w, 0.0, 7.0))] * (0.8 + 0.4 * fract(iTintB.w));
        if (aExtra.z > 0.5) vCrowdTintA = cHair;
        else if (aExtra.z < 0.0) vCrowdTintA = mix(vCrowdTintA, cHair * uHairToCoat, min(1.0, -aExtra.z * fract(iTintA.w) * 1.002));
      #else
        vCrowdTintA *= mix(1.0, iTintB.w, max(aExtra.z, 0.0));       // a horse's mane and tail: the coat's colour, darker or paler
      #endif
    #endif
  #endif
  #ifdef CROWD_DEVICES
    vCrowdDev = vec3(aUv1, floor(fract(iTintA.w) * 7.999));
  #endif
`;
const FRAG_PARS = /* glsl */`
varying vec3 vCrowdTintA; varying vec3 vCrowdTintB; varying vec2 vCrowdMask;
#ifdef CROWD_MASKTEX
  uniform sampler2D uMaskTex;
#endif
#ifdef CROWD_DEVICES
  uniform sampler2D uDevTex; uniform vec2 uDevGrid; varying vec3 vCrowdDev;
#endif
`;
const FRAG_TINT = /* glsl */`
  {
    vec2 cMask = vCrowdMask; vec3 cTintB = vCrowdTintB;
    #ifdef CROWD_MASKTEX
      cMask = texture2D(uMaskTex, vMapUv).rg;
    #endif
    #ifdef CROWD_DEVICES
      if (vCrowdDev.x >= 0.0) {     // on the shield face: the device (charge) over the field
        float dev = texture2D(uDevTex, (clamp(vCrowdDev.xy, 0.0, 1.0) + vec2(mod(vCrowdDev.z, uDevGrid.x), floor(vCrowdDev.z / uDevGrid.x))) / uDevGrid).r;
        // the charge's colour: on a pale field the surcoat's colour if that is dark, else deep red; on a dark field off-white
        vec3 charge = dot(cTintB, vec3(0.33)) > 0.3 ? vCrowdTintA * step(dot(vCrowdTintA, vec3(0.33)), 0.3) + vec3(0.2, 0.012, 0.014) * step(0.3, dot(vCrowdTintA, vec3(0.33))) : vec3(0.69, 0.64, 0.55);
        cTintB = mix(cTintB, charge, dev);
      }
    #endif
    diffuseColor.rgb *= mix(vec3(1.0), vCrowdTintA, cMask.x) * mix(vec3(1.0), cTintB, cMask.y);
  }
`;

function patchMaterial(mat, model, mountModel, { inf, interp, color, lodHasUv1 = false, vskip = true }) {
  mat.defines = { ...(mat.defines || {}), CROWD_INF: inf };
  if (model.hasVariants) { mat.defines.CROWD_VARIANTS = 1; if (vskip) mat.defines.CROWD_VSKIP = 1; }
  if (interp) mat.defines.CROWD_INTERP = 1;
  if (mountModel) mat.defines.CROWD_MOUNT = 1;
  if (color) mat.defines.CROWD_COLOR = 1;
  const maskTex = color && model.maskTex && mat.map ? model.maskTex : null, devTex = color && model.devTex && lodHasUv1 ? model.devTex : null;
  const hair = color && !mountModel && model.hairTints ? model.hairTints : null;
  if (hair) mat.defines.CROWD_HAIRTINT = 1;
  if (maskTex) mat.defines.CROWD_MASKTEX = 1;
  if (devTex) mat.defines.CROWD_DEVICES = 1;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBoneTex = { value: model.tex };
    if (maskTex) shader.uniforms.uMaskTex = { value: maskTex };
    if (hair) { shader.uniforms.uHairTint = { value: hair }; shader.uniforms.uHairToCoat = { value: model.hairToCoat }; }
    if (devTex) { shader.uniforms.uDevTex = { value: devTex }; shader.uniforms.uDevGrid = { value: model.devGrid }; }
    if (mountModel) { shader.uniforms.uMountTex = { value: mountModel.tex }; shader.uniforms.uSeatCol = { value: mountModel.seatCol }; }
    let v = shader.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_PARS);
    if (v.includes('#include <beginnormal_vertex>') && !/USE_DISPLACEMENTMAP\s+#include <beginnormal_vertex>/.test(v)) {
      v = v.replace('#include <beginnormal_vertex>', VERT_MAIN + '\nvec3 objectNormal = cN;').replace('#include <begin_vertex>', 'vec3 transformed = cP;');
    } else v = v.replace('#include <begin_vertex>', VERT_MAIN + '\nvec3 transformed = cP;');
    shader.vertexShader = v;
    if (color) shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_PARS).replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_TINT);
  };
  mat.customProgramCacheKey = () => `crowd:${inf}:${interp ? 1 : 0}:${mountModel ? 1 : 0}:${color ? 1 : 0}:${maskTex ? 1 : 0}:${devTex ? 1 : 0}:${model.hasVariants ? (vskip ? 2 : 1) : 0}:${hair ? model.name : 0}`;
  return mat;
}

/**
 * @param {{ scene: THREE.Scene, camera: THREE.Camera, quality?: 'high'|'medium'|'low', cost?: object, hairTints?: boolean,
 *           cascades?: () => ({ reach: number[], fade?: number, margin?: number, active?: number[], sunDir: THREE.Vector3 } | null) }} opts
 */
export function createCrowd(opts) {
  const ctx = { scene: opts.scene, camera: opts.camera, quality: opts.quality || 'high' };
  const models = {}, sets = [];
  const stats = { instances: 0, drawn: 0, shadow: 0, rings: [0, 0, 0, 0], cascadesDue: 3, lod: [0, 0, 0, 0], tris: 0, prepMs: 0 };      // rings: casters in each shadow ring (see prepare)
  const lodScale = { high: 1, medium: 0.8, low: 0.6 }[ctx.quality] ?? 1;
  const gltf = new GLTFLoader();
  // ---- COST SWITCHES (each can be turned off to measure what it saves). cost.* marked LIVE can also be changed while
  // the game runs (crowd.cost.far = 600).
  const C = opts.cost || {}, flag = (k, d = true) => (k in C ? !!C[k] : d);
  const cost = {
    skipEmpty: flag('skipEmpty'),      // LIVE. shadow-only meshes are not handed to the renderer at all outside the shadow pass, nor for a cascade they have nothing in
    shadowCull: flag('shadowCull'),    // LIVE. casters: only riders whose shadow can fall where the camera looks, each into only the cascades it reaches
    shadowLazy: flag('shadowLazy'),    // LIVE. a cascade the sky is not redrawing this frame gets no new caster list
    vskip: flag('vskip'),              // (shader) vertices of parts a rider does not wear leave the vertex shader before any skinning
    nm1: flag('nm1', ctx.quality === 'high'),   // (material) the mid LOD (9 to 45 m) keeps its normal map; off on medium and low
    shadowHero: flag('shadowHero'),    // LIVE. casters within 9 m use the LOD1 mesh (off: LOD2 for every caster)
    far: Number(C.far) || 2500, // LIVE. metres: nothing of the crowd is drawn beyond this
  };
  // The marker: an (almost) empty mesh that is the first of the crowd's objects in the scene. three's shadow pass
  // calls its onBeforeShadow at the start of each cascade it draws, which is how the shadow-only meshes below know
  // that a shadow pass is on and for which cascade: they are `visible` only then (and only when they hold riders
  // for that cascade), so the colour pass and the cascades they are not in never set up a draw call for them.
  let shadowPass = false, passCascade = -1;
  const marker = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  marker.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  marker.name = 'crowd:shadow-pass-marker'; marker.frustumCulled = false; marker.castShadow = true; marker.matrixAutoUpdate = false;
  marker.onBeforeShadow = (r, o, cam, shadowCam) => { shadowPass = true; const c = shadowCam?.userData?.cascade; passCascade = c === undefined ? -1 : c; };
  ctx.scene.add(marker);
  // which cascade a ring of casters goes into. New lists (cost.shadowCull with the sky's eye-centred cascades): ring
  // 0 and 1 -> cascade 0, ring 2 -> cascade 1, ring 3 -> cascade 2. Round 2's rings by distance: 0 and 1 -> cascades
  // 0 and 1, 2 -> 1, 3 -> 2. Nothing goes into the last cascade: a rider is under a texel there.
  let ringsByCascade = false;
  const ringIn = (s, c) => (ringsByCascade ? c === (s <= 1 ? 0 : s - 1) : s <= 1 ? c <= 1 : s === 2 ? c === 1 : c === 2);

  // ------------------------------------------------------------ load and bake
  async function register(name, src, metaUrl, opts = {}) {
    if (models[name]) return models[name];
    let built = src, meta = null;
    if (typeof src === 'string') {
      const g = await gltf.loadAsync(src);
      const mixer = new THREE.AnimationMixer(g.scene), actions = g.animations.map((c) => mixer.clipAction(c));
      built = {
        name, root: g.scene, meta: null,
        clips: g.animations.map((c, i) => ({
          name: c.name, duration: c.duration, loop: opts.oneShots ? !opts.oneShots.includes(c.name) : (opts.loops ? opts.loops.includes(c.name) : !/^(draw_|loose_|couch|hit_|fall|nock)/.test(c.name)),
          pose(t) { for (const a of actions) a.stop(); actions[i].play(); actions[i].time = Math.min(t, c.duration - 1e-5); mixer.update(0); },
        })),
      };
    }
    if (typeof metaUrl === 'string') { try { const r = await fetch(metaUrl); if (r.ok) meta = await r.json(); } catch { /* optional */ } }
    else if (metaUrl) meta = metaUrl;
    meta = meta || built.meta || {};
    // the meta's own word on which clips play once wins over the guess from the clip's name
    if (typeof src === 'string' && meta.clips && !opts.oneShots && !opts.loops) for (const c of built.clips) { const m = meta.clips[c.name]; if (m && typeof m.loop === 'boolean') c.loop = m.loop; }
    const model = bake(name, built, meta, opts);
    // a horse whose meta lists hair colours (meta.coat.hair.tints): its mane and tail take one of them per instance
    // (`hair: index + brightness 0..0.99` in set()), and `seed` 0..0.99 is how strongly its points are drawn dark
    const HT = meta.coat?.hair?.tints;
    if (Array.isArray(HT) && HT.length && opts.hairTints !== false) {      // (hairTints: false: the simpler rule, hair = the coat's tint times a factor)
      model.hairTints = Array.from({ length: 8 }, (_, k) => new THREE.Vector3().fromArray((HT[k] || HT[HT.length - 1]).tint));
      const cb = meta.coat.baseColor || [0.28, 0.19, 0.12], hb = meta.coat.hairBaseColor || cb;
      model.hairToCoat = new THREE.Vector3(hb[0] / cb[0], hb[1] / cb[1], hb[2] / cb[2]);
    }
    // tint masks painted as a texture (knight: R = surcoat, G = shield face) and a heraldry atlas, beside the meta
    if (typeof metaUrl === 'string') {
      const tl = new THREE.TextureLoader(), rel = (f) => new URL(f, new URL(metaUrl, location.href)).href;
      const data = async (f) => { const t = await tl.loadAsync(rel(f)); t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; return t; };
      try { if (meta.tint?.mask) model.maskTex = await data(meta.tint.mask); } catch (e) { console.warn(`crowd: ${name} mask texture missing`); }
      try { if (meta.heraldry?.atlas) { model.devTex = await data(meta.heraldry.atlas); model.devGrid = new THREE.Vector2(meta.heraldry.cols || 4, meta.heraldry.rows || 2); } } catch (e) { console.warn(`crowd: ${name} heraldry atlas missing`); }
    }
    models[name] = model;
    return model;
  }

  function bake(name, built, meta, opts) {
    const root = built.root, fix = opts.transform || null, fps = opts.fps || 60;
    root.updateMatrixWorld(true);
    // meshes by LOD
    const byLod = [[], [], []]; let primary = null, anyLod = false;
    root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const m = /_lod(\d)/i.exec(o.name) || /_lod(\d)/i.exec(o.parent?.name || '');
      const l = m ? Math.min(2, +m[1]) : 0; if (m) anyLod = true;
      byLod[l].push(o); if (!primary || l === 0) primary = primary && !m ? primary : o;
    });
    if (!primary) throw new Error(`crowd: ${name} has no skinned mesh`);
    primary = byLod[0][0] || byLod[1][0] || byLod[2][0];
    for (let l = 1; l < 3; l++) if (!byLod[l].length) byLod[l] = byLod[l - 1];
    if (!byLod[0].length) byLod[0] = byLod[1];
    const skel = primary.skeleton, bones = skel.bones, N = bones.length;
    const boneIndex = {}; bones.forEach((b, i) => { boneIndex[b.name] = i; });
    const findBone = (n) => { let f = null; root.traverse((o) => { if (!f && o.name === n) f = o; }); return f; };
    const track = [...new Set([...(opts.track || []), ...DEFAULT_TRACK])].map((n) => [n, findBone(n)]).filter((e) => e[1]);
    const seatBone = findBone('seat');
    // rows
    const clips = {}; let rows = 0;
    for (const c of built.clips) { const n = Math.max(2, Math.ceil(c.duration * fps)); clips[c.name] = { name: c.name, row: rows, n, duration: c.duration, loop: c.loop !== false }; rows += n + 1; }
    rows += 1;
    const W = (N + 1) * 3, data = new Float32Array(W * rows * 4), tracked = {};
    for (const [n] of track) tracked[n] = new Float32Array(rows * 12);
    const M = new THREE.Matrix4();
    const put = (row, col, m) => { const e = m.elements, o = (row * W + col) * 4; for (let j = 0; j < 3; j++) { data[o + j * 4] = e[j]; data[o + j * 4 + 1] = e[4 + j]; data[o + j * 4 + 2] = e[8 + j]; data[o + j * 4 + 3] = e[12 + j]; } };
    // A tracked bone (the seat above all) is stored as a rigid frame that is axis-aligned (+Z forward, +Y up) when
    // the model is in its bind pose, whatever axes the bone itself was authored with (Blender bones point along +Y),
    // and with any model scale removed. So a rider glued to it sits upright and at his own size.
    const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
    const restT = new Map();
    for (const [, b] of track) { const i = bones.indexOf(b); if (i >= 0) { _p.setFromMatrixPosition(M.copy(skel.boneInverses[i]).invert()); restT.set(b, { inv: skel.boneInverses[i], T: new THREE.Matrix4().makeTranslation(_p.x, _p.y, _p.z) }); } }
    // restRot[name]: the bone's own axes in the bind pose (rotation only). The bone's true world rotation at a row is
    // (the tracked frame's rotation) x restRot: for hanging something along a prop bone's own axis (a lance, a pole).
    const restRot = {};
    for (const [n, b] of track) { const i = bones.indexOf(b); if (i >= 0) { M.copy(skel.boneInverses[i]).invert(); M.decompose(_p, _q, _s); restRot[n] = new THREE.Matrix4().makeRotationFromQuaternion(_q); } }
    const frameOf = (b) => {
      const r = restT.get(b);
      if (r) M.multiplyMatrices(b.matrixWorld, r.inv).multiply(r.T); else M.copy(b.matrixWorld);
      if (fix) M.premultiply(fix);
      M.decompose(_p, _q, _s); return M.compose(_p, _q, ONE);
    };
    const writeRow = (row) => {
      root.updateMatrixWorld(true);
      for (let i = 0; i < N; i++) { M.multiplyMatrices(bones[i].matrixWorld, skel.boneInverses[i]); if (fix) M.premultiply(fix); put(row, i * 3, M); }
      if (seatBone) put(row, N * 3, frameOf(seatBone)); else put(row, N * 3, M.identity());
      for (const [n, b] of track) { const e = frameOf(b).elements, t = tracked[n], o = row * 12; for (let j = 0; j < 3; j++) { t[o + j * 4] = e[j]; t[o + j * 4 + 1] = e[4 + j]; t[o + j * 4 + 2] = e[8 + j]; t[o + j * 4 + 3] = e[12 + j]; } }
    };
    for (const c of built.clips) {
      const info = clips[c.name];
      for (let k = 0; k <= info.n; k++) {
        if (info.loop && k === info.n) { data.copyWithin((info.row + k) * W * 4, info.row * W * 4, (info.row + 1) * W * 4); for (const [n] of track) tracked[n].copyWithin((info.row + k) * 12, info.row * 12, info.row * 12 + 12); continue; }
        c.pose((k / info.n) * c.duration); writeRow(info.row + k);
      }
    }
    data.copyWithin((rows - 1) * W * 4, (rows - 2) * W * 4, (rows - 1) * W * 4);
    const tex = new THREE.DataTexture(data, W, rows, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;

    // geometry per LOD: bind matrix folded in, influences sorted and trimmed, mask + twist weights
    const twistW = new Float32Array(N);
    for (let i = 0; i < N; i++) { let b = bones[i], w = 0; while (b) { if (b.name === 'spine1') { w = Math.max(w, 0.33); } if (b.name === 'spine2') w = Math.max(w, 0.66); if (b.name === 'spine3') w = 1; b = b.parent; } twistW[i] = w; }
    const tintInfo = meta.tint || {};
    let hasVariants = false;
    const lods = byLod.map((meshes, l) => meshes.map((mesh) => {
      const src = mesh.geometry, g = new THREE.InstancedBufferGeometry();
      const pos = src.attributes.position.clone(), nrm = (src.attributes.normal || pos).clone();
      if (mesh.bindMatrix) { pos.applyMatrix4(mesh.bindMatrix); if (src.attributes.normal) nrm.transformDirection(mesh.bindMatrix); }
      g.setAttribute('position', pos); g.setAttribute('normal', nrm);
      if (src.attributes.uv) g.setAttribute('uv', src.attributes.uv);
      if (src.attributes.uv1 && meta.heraldry) g.setAttribute('aUv1', src.attributes.uv1);
      if (src.attributes.color) g.setAttribute('color', src.attributes.color);
      if (src.index) g.setIndex(src.index);
      const nv = pos.count, si = src.attributes.skinIndex, sw = src.attributes.skinWeight;
      const inf = [4, 2, 1][l], I = new Float32Array(nv * 4), Wt = new Float32Array(nv * 4), ex = new Float32Array(nv * 4);
      const srcVar = src.attributes._variant || null; if (srcVar) hasVariants = true;
      const remap = mesh.skeleton === skel ? null : mesh.skeleton.bones.map((b) => boneIndex[b.name] ?? 0);
      const pair = [0, 1, 2, 3], srcEx = src.attributes.aExtra;
      for (let v = 0; v < nv; v++) {
        const ii = [si.getX(v), si.getY(v), si.getZ(v), si.getW(v)], ww = [sw.getX(v), sw.getY(v), sw.getZ(v), sw.getW(v)];
        pair.sort((a, b) => ww[b] - ww[a]);
        let sum = 0; for (let k = 0; k < inf; k++) sum += ww[pair[k]];
        let tw = 0;
        for (let k = 0; k < 4; k++) {
          const bi = remap ? remap[ii[pair[k]]] : ii[pair[k]], w = k < inf && sum > 0 ? ww[pair[k]] / sum : 0;
          I[v * 4 + k] = w > 0 ? bi : 0; Wt[v * 4 + k] = w; tw += w * twistW[bi];
        }
        if (sum <= 0) Wt[v * 4] = 1;
        if (srcEx) { ex[v * 4] = srcEx.getX(v); ex[v * 4 + 1] = srcEx.getY(v); ex[v * 4 + 2] = srcEx.getZ(v); if (srcEx.itemSize > 3) ex[v * 4 + 3] = srcEx.getW(v); }
        else { ex[v * 4 + 2] = tw; maskFor(tintInfo, mesh, src, v, ex); }
        if (srcVar) ex[v * 4 + 3] = Math.round(srcVar.getX(v) * (srcVar.normalized ? 255 : 1));
      }
      g.setAttribute('cSkinIndex', new THREE.BufferAttribute(I, 4)); g.setAttribute('cSkinWeight', new THREE.BufferAttribute(Wt, 4)); g.setAttribute('aExtra', new THREE.BufferAttribute(ex, 4));
      const m0 = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      return { geometry: g, source: m0, inf, tris: (src.index ? src.index.count : pos.count) / 3 };
    }));
    // LOD3, for the far field (a rider 15 pixels tall): LOD2 with its vertices clustered on a coarse grid, made here
    // at load, so thousands of distant riders cost well under half the triangles. Thin props may vanish at this size.
    lods.push(opts.lod3 === false ? lods[2] : lods[2].map((prim) => decimate(prim, opts.lod3Ratio ?? 0.42)));
    let radius = 0; primary.geometry.computeBoundingSphere(); radius = primary.geometry.boundingSphere.radius * (fix ? fix.getMaxScaleOnAxis() : 1) * Math.max(root.scale.x, 1);
    const model = {
      name, meta, tex, clips, rows, bones: N, seatCol: N * 3, lods, tracked, restRot, hasVariants, radius, hasLods: anyLod,
      // row for a looping clip at a phase (cycles), or a one-shot at a time (seconds)
      row(clip, phase) { const c = clips[clip]; if (!c) return 0; return c.row + (phase - Math.floor(phase)) * c.n; },
      rowAt(clip, t) { const c = clips[clip]; if (!c) return 0; if (c.loop) { const p = t / c.duration; return c.row + (p - Math.floor(p)) * c.n; } return c.row + (t <= 0 ? 0 : t >= c.duration ? 1 : t / c.duration) * c.n; },
      // a tracked bone's model-space 3x4 matrix (row-major, 12 floats) at a row; returns out
      sample(bone, row, out) {
        const t = tracked[bone]; if (!t) return null;
        const y = Math.floor(row), f = row - y, a = y * 12, b = a + 12;
        for (let k = 0; k < 12; k++) out[k] = t[a + k] + (t[b + k] - t[a + k]) * f;
        return out;
      },
    };
    return model;
  }
  // Which vertices take the per-instance tints. The art builders mark them with a custom vertex attribute
  // (horse: _COAT, 1 = coat, 0.5 = hair, 0 = tack), or the meta's `tint` block names a vertex colour channel or
  // material names. x = first tint (coat / cloth), y = second (blanket / shield).
  const MASK_A = ['_coat', '_cloth', '_tint', '_mask'], MASK_B = ['_tint2', '_cloth2', '_shield', '_trim'];
  function decimate(prim, ratio) {
    const g = prim.geometry, pos = g.attributes.position, nv = pos.count, idx = g.index ? g.index.array : Uint32Array.from({ length: nv }, (_, i) => i);
    const target = (idx.length / 3) * ratio, cellOf = new Int32Array(nv), exA = g.attributes.aExtra;
    // a small variant part (a hat, a pennon: 64 triangles or fewer) is kept whole: clustered, it would vanish
    const partTris = {}; for (let t = 0; t < idx.length; t += 3) { const k = exA.getW(idx[t]); partTris[k] = (partTris[k] || 0) + 1; }
    const whole = (v) => { const k = exA.getW(v); return k > 0 && partTris[k] <= 64; };
    const cluster = (c) => {
      const cells = new Map(), sum = [], rep = [];
      for (let v = 0; v < nv; v++) {
        const k = whole(v) ? 'v' + v : `${Math.floor(pos.getX(v) / c)},${Math.floor(pos.getY(v) / c)},${Math.floor(pos.getZ(v) / c)},${exA.getW(v)}`;      // variant parts are never merged into their neighbours
        let id = cells.get(k); if (id === undefined) { id = sum.length; cells.set(k, id); sum.push([0, 0, 0, 0]); }
        const q = sum[id]; q[0] += pos.getX(v); q[1] += pos.getY(v); q[2] += pos.getZ(v); q[3]++; cellOf[v] = id;
      }
      const best = new Float64Array(sum.length).fill(1e9); rep.length = sum.length;
      for (let v = 0; v < nv; v++) { const q = sum[cellOf[v]], d = (pos.getX(v) - q[0] / q[3]) ** 2 + (pos.getY(v) - q[1] / q[3]) ** 2 + (pos.getZ(v) - q[2] / q[3]) ** 2; if (d < best[cellOf[v]]) { best[cellOf[v]] = d; rep[cellOf[v]] = v; } }
      const out = [], seen = new Set();
      for (let t = 0; t < idx.length; t += 3) {
        const a = rep[cellOf[idx[t]]], b = rep[cellOf[idx[t + 1]]], cc = rep[cellOf[idx[t + 2]]];
        if (a === b || b === cc || a === cc) continue;
        const key = [a, b, cc].sort((x, y) => x - y).join(','); if (seen.has(key)) continue; seen.add(key);
        out.push(a, b, cc);
      }
      return out;
    };
    let lo = 0.01, hi = 0.4, tri = null;
    for (let it = 0; it < 8; it++) { const c = (lo + hi) / 2, r = cluster(c); if (r.length / 3 > target) lo = c; else { hi = c; tri = r; } }
    if (!tri) tri = cluster(hi);
    // keep only the vertices still used
    const remap = new Int32Array(nv).fill(-1), keep = [];
    for (const v of tri) if (remap[v] < 0) { remap[v] = keep.length; keep.push(v); }
    const ng = new THREE.InstancedBufferGeometry();
    for (const name of Object.keys(g.attributes)) {
      const a = g.attributes[name], n = a.itemSize, arr = new a.array.constructor(keep.length * n);
      for (let k = 0; k < keep.length; k++) for (let j = 0; j < n; j++) arr[k * n + j] = a.array[keep[k] * n + j];
      ng.setAttribute(name, new THREE.BufferAttribute(arr, n, a.normalized));
    }
    ng.setIndex(tri.map((v) => remap[v]));
    return { geometry: ng, source: prim.source, inf: prim.inf, tris: tri.length / 3 };
  }
  function maskFor(info, mesh, src, v, ex) {
    for (const n of MASK_A) if (src.attributes[n]) { ex[v * 4] = src.attributes[n].getX(v); break; }
    for (const n of MASK_B) if (src.attributes[n]) { ex[v * 4 + 1] = src.attributes[n].getX(v); break; }
    // the horses' _COAT: 1 = coat, 0.5 = hair (takes the coat's tint times the instance's hair factor), 0.25 = the
    // destrier's caparison cloth (takes the second tint: the knight's livery), 0 = tack
    if (src.attributes._coat) {
      const c = ex[v * 4];
      if (c > 0.4 && c < 0.6) { ex[v * 4] = 1; ex[v * 4 + 2] = 1; } else if (c > 0.15 && c < 0.35) { ex[v * 4] = 0; ex[v * 4 + 1] = 1; }
      // _POINTS (legs from the knee down, muzzle, ear tips, dorsal stripe) rides in z as a negative number
      else if (src.attributes._points && c > 0.9) { const pt = src.attributes._points.getX(v); if (pt > 0.004) ex[v * 4 + 2] = -pt; }
    }
    const keys = Object.keys(info);
    for (let k = 0; k < Math.min(2, keys.length); k++) {
      const d = info[keys[k]]; if (!d || typeof d !== 'object') continue;
      if (d.vertexColor && src.attributes.color) ex[v * 4 + k] = src.attributes.color['get' + d.vertexColor.toUpperCase()]?.(v) ?? 0;
      else if (d.materials) { const mn = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.name; if (d.materials.includes(mn)) ex[v * 4 + k] = 1; }
      else if (d.all) ex[v * 4 + k] = d.all;
    }
  }

  // ------------------------------------------------------------ sets
  function makeMaterial(model, mountModel, prim, lod, simpleFrom = 2) {
    const s = prim.source;
    let mat;
    if (lod >= simpleFrom) mat = new THREE.MeshLambertMaterial({ color: s.color?.clone?.() ?? 0xffffff, map: s.map || null, vertexColors: !!s.vertexColors, alphaTest: s.alphaTest || 0, side: s.side ?? THREE.FrontSide });
    else { mat = s.clone(); if (mat.normalMap && (!prim.geometry.attributes.uv || (lod === 1 && !cost.nm1))) mat.normalMap = null; }
    // alpha-tested hair (manes, tails) seen close: let the multisampled target soften its edges
    if (mat.alphaTest > 0 && lod < 2 && C.alphaToCoverage !== false) mat.alphaToCoverage = true;
    mat.name = `crowd:${model.name}:lod${lod}`;
    return patchMaterial(mat, model, mountModel, { inf: prim.inf, interp: lod < 2, color: true, lodHasUv1: !!prim.geometry.attributes.aUv1, vskip: cost.vskip });
  }
  function makeDepth(model, mountModel, prim) {
    const mat = new THREE.MeshDepthMaterial();          // as three's own shadow pass uses
    if (prim.source.alphaTest > 0 && prim.source.map) { mat.map = prim.source.map; mat.alphaTest = prim.source.alphaTest; }
    mat.side = prim.source.side ?? THREE.FrontSide;
    return patchMaterial(mat, model, mountModel, { inf: prim.inf, interp: false, color: false, vskip: cost.vskip });
  }
  function instanced(prim, buffer) {
    const g = new THREE.InstancedBufferGeometry();
    for (const k of Object.keys(prim.geometry.attributes)) g.setAttribute(k, prim.geometry.attributes[k]);
    if (prim.geometry.index) g.setIndex(prim.geometry.index);
    g.setAttribute('iPos', new THREE.InterleavedBufferAttribute(buffer, 4, 0));
    g.setAttribute('iQuat', new THREE.InterleavedBufferAttribute(buffer, 4, 4));
    g.setAttribute('iAnim', new THREE.InterleavedBufferAttribute(buffer, 4, 8));
    g.setAttribute('iMount', new THREE.InterleavedBufferAttribute(buffer, 4, 12));
    g.setAttribute('iTintA', new THREE.InterleavedBufferAttribute(buffer, 4, 16));
    g.setAttribute('iTintB', new THREE.InterleavedBufferAttribute(buffer, 4, 20));
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    return g;
  }

  function createSet(name, capacity, opts = {}) {
    const model = models[name]; if (!model) throw new Error(`crowd: register('${name}') first`);
    const mountModel = opts.mount ? models[opts.mount] : null;
    const set = {
      name, model, mountModel, capacity, count: 0,
      buf: new Float32Array(capacity * STRIDE), show: new Uint8Array(capacity).fill(1), lodOf: new Uint8Array(capacity).fill(3),
      lodDist: (opts.lodDist || [9, 45, 120]).concat([1e9, 1e9]).slice(0, 3).map((d) => d * lodScale), shadowDist: opts.shadowDist ?? 80, shadowHero: 9, shadowNear: 22, shadowMid: 50, shadowOverlap: 38,
      radius: opts.radius ?? Math.max(2.4, model.radius * 1.15), castShadow: opts.castShadow !== false,
      draw: [], shadow: [], visible: true,
      set(i, o) { setInstance(set, i, o); },
      dispose() { for (const b of [...set.draw, ...set.shadow]) for (const m of b.meshes) { ctx.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } const k = sets.indexOf(set); if (k >= 0) sets.splice(k, 1); },
    };
    for (let i = 0; i < capacity; i++) { const o = i * STRIDE; set.buf[o + F.SCALE] = 1; set.buf[o + F.QW] = 1; set.buf[o + F.W_A] = 1; if (mountModel) set.buf[o + F.M_W_A] = 1; set.buf[o + 16] = set.buf[o + 17] = set.buf[o + 18] = 1; set.buf[o + 20] = set.buf[o + 21] = set.buf[o + 22] = 1; set.buf[o + F.RIDER_SCALE] = 1; }
    for (let l = 0; l < 4; l++) {
      const buffer = new THREE.InstancedInterleavedBuffer(new Float32Array(capacity * STRIDE), STRIDE, 1); buffer.setUsage(THREE.DynamicDrawUsage);
      const b = { buffer, arr: buffer.array, n: 0, meshes: [], tris: 0 };
      for (const prim of model.lods[l]) {
        const mesh = new THREE.Mesh(instanced(prim, buffer), makeMaterial(model, mountModel, prim, l, opts.simpleFrom ?? 2));
        mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = l < (opts.receiveShadowBelow ?? 2); mesh.matrixAutoUpdate = false; mesh.name = `crowd:${name}:lod${l}`;
        mesh.onBeforeRender = prepare;
        ctx.scene.add(mesh); b.meshes.push(mesh); b.tris += prim.tris;
      }
      set.draw.push(b);
    }
    if (set.castShadow) for (let s = 0; s < 4; s++) {
      const buffer = new THREE.InstancedInterleavedBuffer(new Float32Array(capacity * STRIDE), STRIDE, 1); buffer.setUsage(THREE.DynamicDrawUsage);
      const b = { buffer, arr: buffer.array, n: 0, meshes: [] }, sl = SHADOW_LOD[s];
      for (const prim of model.lods[sl]) {
        const mesh = new THREE.Mesh(instanced(prim, buffer), set.draw[sl].meshes[b.meshes.length].material);
        mesh.customDepthMaterial = makeDepth(model, mountModel, prim);
        mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = false; mesh.matrixAutoUpdate = false; mesh.name = `crowd:${name}:shadow${s}`;
        // Drawn only into shadow maps. Outside a shadow pass, and for a cascade this ring is not in, the mesh is
        // not `visible`, so three sets up no draw call for it (cost.skipEmpty; off: it is handed over every time
        // with zero instances).
        Object.defineProperty(mesh, 'visible', { configurable: true, set() {}, get: () => cost.warm || (cost.skipEmpty ? shadowPass && b.n > 0 && (passCascade < 0 || ringIn(s, passCascade)) : b.n > 0) });      // (cost.warm: the boot's warm-up frame draws every batch, empty or not, so its programs exist before play)
        mesh.onBeforeRender = () => { prepare(); mesh.geometry.instanceCount = 0; };
        // The sky's sun has cascades (shadowCamera.userData.cascade, 0 = nearest). Which riders are in which ring is
        // decided in prepare(); which cascade a ring is drawn into, by ringIn().
        mesh.onBeforeShadow = (r, o, cam, shadowCam) => {
          prepare();
          const c = shadowCam?.userData?.cascade;
          mesh.geometry.instanceCount = c === undefined || ringIn(s, c) ? b.n : 0;
        };
        ctx.scene.add(mesh); b.meshes.push(mesh);
      }
      set.shadow.push(b);
    }
    sets.push(set);
    return set;
  }

  const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  function setInstance(set, i, o) {
    const b = set.buf, k = i * STRIDE, m = set.model, mm = set.mountModel;
    if (o.x !== undefined) { b[k] = o.x; b[k + 1] = o.y ?? 0; b[k + 2] = o.z; }
    if (o.scale !== undefined) b[k + 3] = o.scale;
    if (o.yaw !== undefined) { _e.set(-(o.pitch || 0), o.yaw, mm ? -(o.roll || 0) : 0, 'YXZ'); _q.setFromEuler(_e); b[k + 4] = _q.x; b[k + 5] = _q.y; b[k + 6] = _q.z; b[k + 7] = _q.w; if (!mm) b[k + 11] = o.roll || 0; }
    if (o.clip !== undefined) { b[k + 8] = o.time !== undefined ? m.rowAt(o.clip, o.time) : m.row(o.clip, o.phase || 0); b[k + 10] = 1; }
    if (o.clipB !== undefined) { b[k + 9] = o.timeB !== undefined ? m.rowAt(o.clipB, o.timeB) : m.row(o.clipB, o.phaseB || 0); b[k + 10] = 1 - (o.blend ?? 0); }
    if (o.twist !== undefined) b[k + 11] = o.twist;
    if (mm && o.mClip !== undefined) { b[k + 12] = mm.row(o.mClip, o.mPhase || 0); b[k + 14] = 1; if (o.mClipB !== undefined) { b[k + 13] = mm.row(o.mClipB, o.mPhaseB || 0); b[k + 14] = 1 - (o.mBlend ?? 0); } }
    if (o.curve !== undefined) { if (mm) b[k + 15] = o.curve; else b[k + 12] = o.curve; }
    if (o.bend && !mm) { b[k + 12] = o.bend[0]; b[k + 13] = o.bend[1]; b[k + 14] = o.bend[2]; b[k + 15] = o.bend[3] || 0; }
    if (o.tint) { b[k + 16] = o.tint[0]; b[k + 17] = o.tint[1]; b[k + 18] = o.tint[2]; }
    if (o.seed !== undefined) b[k + 19] = Math.floor(b[k + 19]) + Math.min(0.999, Math.max(0, o.seed));
    if (o.tintB) { b[k + 20] = o.tintB[0]; b[k + 21] = o.tintB[1]; b[k + 22] = o.tintB[2]; }
    if (o.riderScale !== undefined) b[k + 23] = o.riderScale;
    if (o.hair !== undefined && !mm) b[k + 23] = o.hair;
    if (o.parts !== undefined) b[k + 19] = (o.parts | 0) + (b[k + 19] - Math.floor(b[k + 19]));
    if (o.show !== undefined) set.show[i] = o.show === 2 ? 2 : o.show ? 1 : 0;
  }

  // ------------------------------------------------------------ once per frame: cull, pick LODs, upload
  // THE COLOUR PASS: an instance list per LOD, of what the camera can see.
  // THE SHADOW PASSES: a list per cascade. The sky's cascades (opts.cascades) are squares of ground round the eye; a pixel
  // d metres from the eye reads cascade i when reach[i-1] <= d < reach[i] (and the next one in the last 12 % of
  // that ring). So a rider belongs in cascade i only if his SHADOW (a capsule on the ground from the rider to the
  // shadow's tip, which at this low sun is three horse-lengths away) comes within that band of distances, and only
  // if it can be seen: a rider behind the camera whose shadow also falls behind it casts nothing the player can
  // see. Cascade 0 is drawn every frame, so its list is cut to the camera's view exactly; cascades 1 and 2 are kept
  // by the sky for a few frames while the head may turn, so their lists keep a margin of about 20 degrees.
  // Ring 0: within 9 m, the LOD1 mesh, cascade 0. Ring 1: the rest of cascade 0, LOD2 mesh. Ring 2: cascade 1, LOD2
  // mesh. Ring 3: cascade 2, the far mesh, every second rider beyond 50 m. (cost.shadowCull off, or a sky without
  // eye-centred cascades: rings by distance alone.)
  const farCut = C.farCut === true;
  const planes = new Float32Array(24), _pm = new THREE.Matrix4(), _fr = new THREE.Frustum();
  let preparedFrame = -1, frame = 0;
  function prepare() {
    if (preparedFrame === frame) return;
    preparedFrame = frame;
    const t0 = performance.now();
    const cam = ctx.camera; cam.updateMatrixWorld();
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm, cam.coordinateSystem, cam.reversedDepth);
    for (let p = 0; p < 6; p++) { const pl = _fr.planes[p]; planes[p * 4] = pl.normal.x; planes[p * 4 + 1] = pl.normal.y; planes[p * 4 + 2] = pl.normal.z; planes[p * 4 + 3] = pl.constant; }
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z, far2 = cost.far * cost.far;
    stats.instances = stats.drawn = stats.shadow = stats.tris = 0; stats.lod[0] = stats.lod[1] = stats.lod[2] = stats.lod[3] = 0; stats.rings[0] = stats.rings[1] = stats.rings[2] = stats.rings[3] = 0;
    // the sun and the sky's cascades, for the shadow lists
    const cas = opts.cascades ? opts.cascades() : null;
    const shd = cas ? { reach: cas.reach, fade: cas.fade, margin: cas.margin, _inPass: !!cas.active, _active: cas.active } : null, sun = cas?.sunDir;
    const byCascade = cost.shadowCull && !!shd && Array.isArray(shd.reach) && shd.reach.length >= 2 && !!sun && sun.y > 0.03;
    ringsByCascade = byCascade;
    let lx = 0, lz = 0, cot = 0, reach0 = 0, lo1 = 0, hi1 = 0, lo2 = 0, due1 = true, due2 = true;
    if (byCascade) {
      const hl = Math.hypot(sun.x, sun.z) || 1e-6, fade = shd.fade ?? 0.12, margin = shd.margin ?? 0.05, r0 = shd.reach[0], r1 = shd.reach[1];
      lx = -sun.x / hl; lz = -sun.z / hl; cot = Math.min(12, hl / sun.y);          // the way shadows fall on the ground; metres of shadow per metre of height
      const slack1 = Math.max(1.5, r1 * margin), slack2 = Math.max(1.5, (shd.reach[2] ?? r1 * 3) * margin);
      reach0 = r0; lo1 = r0 - fade * r0 - slack1; hi1 = r1 + slack1; lo2 = r1 - fade * (r1 - r0) - slack2;
      // the cascades the sky will draw this frame (it plans them before the frame is drawn); unknown: all of them
      const act = cost.shadowLazy && shd._inPass && Array.isArray(shd._active) ? shd._active : null;
      if (act) { due1 = act.includes(1); due2 = act.includes(2); }
    }
    stats.cascadesDue = 1 + (due1 ? 1 : 0) + (due2 ? 1 : 0);
    for (const set of sets) {
      const d = set.draw, sh = set.shadow, buf = set.buf, show = set.show, lodOf = set.lodOf, R = set.radius;
      d[0].n = d[1].n = d[2].n = d[3].n = 0;
      if (sh.length) { sh[0].n = sh[1].n = 0; sh[0].fresh = sh[1].fresh = true; sh[2].fresh = due1 || !set.visible; sh[3].fresh = due2 || !set.visible; if (sh[2].fresh) sh[2].n = 0; if (sh[3].fresh) sh[3].n = 0; }
      if (!set.visible) { finish(set); continue; }
      const d0 = set.lodDist[0], d1 = set.lodDist[1], d2 = set.lodDist[2];
      const up0 = d0 * d0 * 1.21, dn0 = d0 * d0 * 0.81, up1 = d1 * d1 * 1.21, dn1 = d1 * d1 * 0.81, up2 = d2 * d2 * 1.21, dn2 = d2 * d2 * 0.81;
      const sd2 = set.castShadow ? set.shadowDist * set.shadowDist : -1, sh2 = cost.shadowHero ? set.shadowHero * set.shadowHero : -1, sn2 = set.shadowNear * set.shadowNear, sm2 = set.shadowMid * set.shadowMid, so2 = set.shadowOverlap * set.shadowOverlap;
      const SL = Math.min(45, (1.1 + R) * cot);          // how far this model's shadow reaches along the ground
      for (let i = 0, n = set.count; i < n; i++) {
        const vis = show[i]; if (!vis) continue;
        const o = i * STRIDE, x = buf[o], y = buf[o + 1] + 1.1, z = buf[o + 2];
        const dx = x - cx, dy = y - cy, dz = z - cz, dd = dx * dx + dy * dy + dz * dz;
        if (dd > far2) continue;
        // LOD with hysteresis: move one level at a time, only when well past the boundary
        let l = lodOf[i];
        if (l === 0) { if (dd > up0) l = 1; } else if (l === 1) { if (dd < dn0) l = 0; else if (dd > up1) l = 2; } else if (l === 2) { if (dd < dn1) l = 1; else if (dd > up2) l = 3; } else if (dd < dn2) l = 2;
        if (l === 3 && dd < dn1) l = dd < dn0 ? 0 : 1; else if (l === 0 && dd > up2) l = 3;      // far jumps (first frame, a camera cut)
        lodOf[i] = l;
        if (dd < sd2) {
          if (byCascade) {
            // the shadow: from the rider to its tip. Is any of it where the camera looks (wide: with the margin)?
            const tx = x + lx * SL, tz = z + lz * SL, dist = Math.sqrt(dd), Rw = R + 0.35 * dist;
            let seen = true, seenNow = true;
            for (let p = 0; p < 24; p += 4) {
              const a = planes[p] * x + planes[p + 1] * y + planes[p + 2] * z + planes[p + 3], b = planes[p] * tx + planes[p + 1] * y + planes[p + 2] * tz + planes[p + 3], m = a > b ? a : b;
              if (m < -R) { seenNow = false; if (m < -Rw) { seen = false; break; } }
            }
            if (seen) {
              // how near and how far from the eye the shadow comes
              let u = -(dx * lx + dz * lz) / SL; u = u < 0 ? 0 : u > 1 ? 1 : u;
              const nx = dx + lx * SL * u, nz = dz + lz * SL * u, dmin = Math.sqrt(nx * nx + dy * dy + nz * nz) - R;
              const ex = tx - cx, ez = tz - cz, dt2 = ex * ex + dy * dy + ez * ez, dmax = Math.sqrt(dt2 > dd ? dt2 : dd) + R;
              if (seenNow && dmin < reach0) { const b = sh[dd < sh2 ? 0 : 1], arr = b.arr, t = b.n++ * STRIDE; for (let k = 0; k < STRIDE; k++) arr[t + k] = buf[o + k]; }
              if (due1 && dmax > lo1 && dmin < hi1) { const b = sh[2], arr = b.arr, t = b.n++ * STRIDE; for (let k = 0; k < STRIDE; k++) arr[t + k] = buf[o + k]; }
              if (due2 && dmax > lo2 && (dd < sm2 || !(i & 1))) { const b = sh[3], arr = b.arr, t = b.n++ * STRIDE; for (let k = 0; k < STRIDE; k++) arr[t + k] = buf[o + k]; }
            }
          } else {
            if (dd < sm2) { const b = sh[dd < sh2 ? 0 : dd < sn2 ? 1 : 2], arr = b.arr, t = b.n++ * STRIDE; for (let k = 0; k < STRIDE; k++) arr[t + k] = buf[o + k]; }
            if (dd > so2 && (dd < sm2 || !(i & 1))) { const b = sh[3], arr = b.arr, t = b.n++ * STRIDE; for (let k = 0; k < STRIDE; k++) arr[t + k] = buf[o + k]; }
          }
        }
        let inside = true;
        for (let p = 0; p < 24; p += 4) if (planes[p] * x + planes[p + 1] * y + planes[p + 2] * z + planes[p + 3] < -R) { inside = false; break; }
        if (!inside || vis === 2) continue;       // show = 2: casts a shadow but is not drawn (the player's own rider)
        if (farCut && l === 3) continue;          // cost.farCut: measure what the far field costs
        const b = d[l], arr = b.arr, t = b.n++ * STRIDE;
        for (let k = 0; k < STRIDE; k++) arr[t + k] = buf[o + k];
      }
      finish(set);
    }
    stats.prepMs = stats.prepMs * 0.9 + (performance.now() - t0) * 0.1;
  }
  function finish(set) {
    stats.instances += set.count;
    for (let l = 0; l < 4; l++) {
      const b = set.draw[l];
      if (b.n) { b.buffer.clearUpdateRanges(); b.buffer.addUpdateRange(0, b.n * STRIDE); b.buffer.needsUpdate = true; }
      for (const m of b.meshes) { m.geometry.instanceCount = b.n; m.visible = b.n > 0 || !!cost.warm; }
      stats.drawn += b.n; stats.lod[l] += b.n; stats.tris += b.n * b.tris;
    }
    for (let s = 0; s < set.shadow.length; s++) {
      const b = set.shadow[s];
      if (b.n && b.fresh !== false) { b.buffer.clearUpdateRanges(); b.buffer.addUpdateRange(0, b.n * STRIDE); b.buffer.needsUpdate = true; }
      stats.shadow += b.n; stats.rings[s] += b.n;
    }
  }
  // the scene hook runs before shadow maps and the colour pass; mesh hooks above are a fallback if someone replaces it
  const prevHook = ctx.scene.onBeforeRender;
  ctx.scene.onBeforeRender = function (...a) { prevHook?.apply(this, a); shadowPass = false; passCascade = -1; frame++; prepare(); };      // (each time the scene is drawn: the colour list is built before any shadow pass)

  return {
    register, createSet, models, sets, stats, cost, F,
    /** Build the instance lists now (normally done for you each time the scene is drawn). */
    prepare() { frame++; prepare(); },
    /** Change the camera the crowd culls and picks LODs for. */
    setCamera(cam) { ctx.camera = cam; },
    /** Draw every batch once, even empty ones, so every shader is compiled before play: crowd.warm(() => renderer.compile(scene, camera)). */
    warm(fn) { cost.warm = true; frame++; prepare(); try { fn(); } finally { cost.warm = false; } },
  };
}
