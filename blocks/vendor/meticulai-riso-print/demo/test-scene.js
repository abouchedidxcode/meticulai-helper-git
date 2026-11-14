// The Meticulai looks test scene. Every look block ships this same file, so their previews compare like for like:
// a ground, a few primitives, a figure, a sun and a sky, plus a row of columns and far hills so depth effects
// (fog, depth of field, outlines) have something to work on. Pure three.js, no files.
//
//   const t = createTestScene({ makeMaterial });   // makeMaterial(role, colorHex) -> THREE.Material (optional)
//   scene.add(...)  ->  t.scene, t.camera, t.sun, t.hemi, t.figure, t.objects
//   t.update(seconds)  // idle animation (figure bobs and swings its arms, the knot turns)
//
// Roles: 'ground' 'stone' 'prop' 'accent' 'figure' 'skin' 'far'. Each look maps roles to its own materials
// (an ink id, a palette ramp, a PS1 texture...). Default: MeshStandardMaterial in the role's colour.
import * as THREE from 'three';

export const COLORS = {
  sky: 0x9fc3dd,
  ground: 0x8a9a6b,
  stone: 0xa49c8c,
  prop: 0xc4623a,
  accent: 0xe0b040,
  figure: 0xd0452f,
  skin: 0xe6b89c,
  far: 0x7f9a86,
  blue: 0x3d6a9e,
  cream: 0xe8dcc0,
};

function defaultMaterial(role, color) {
  return new THREE.MeshStandardMaterial({ color, roughness: role === 'accent' ? 0.35 : 0.8, metalness: 0 });
}

export function createTestScene({ makeMaterial = defaultMaterial, groundSegments = 120, shadows = true } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  const objects = [];
  const mat = (role, color = COLORS[role]) => makeMaterial(role, color);

  function add(mesh, name, { cast = true, receive = true } = {}) {
    mesh.name = name;
    mesh.castShadow = shadows && cast;
    mesh.receiveShadow = shadows && receive;
    scene.add(mesh);
    objects.push(mesh);
    return mesh;
  }

  // Ground: 120 m square, 1 m segments (looks like PS1 affine warping need subdivided floors).
  const groundGeo = new THREE.PlaneGeometry(120, 120, groundSegments, groundSegments);
  groundGeo.rotateX(-Math.PI / 2);
  add(new THREE.Mesh(groundGeo, mat('ground')), 'ground', { cast: false });

  // A low stone plinth with primitives on and around it.
  add(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 2.2), mat('stone')), 'plinth').position.set(-1.6, 0.15, -0.6);
  const box = add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat('prop')), 'box');
  box.position.set(-2.4, 0.8, -0.8);
  box.rotation.y = 0.5;
  add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 20), mat('prop', COLORS.cream)), 'sphere').position.set(-1.0, 0.85, -0.5);
  add(new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 24), mat('prop', COLORS.blue)), 'cone').position.set(2.2, 0.65, -1.4);
  const knot = add(new THREE.Mesh(new THREE.TorusKnotGeometry(0.42, 0.14, 120, 16), mat('accent')), 'knot');
  knot.position.set(1.5, 1.0, 0.1);
  add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), mat('stone')), 'rock').position.set(2.9, 0.35, 0.6);

  // A row of columns walking away from the camera.
  for (let i = 0; i < 9; i++) {
    const h = 3.2;
    const col = add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, h, 16), mat('stone')), `column${i}`);
    col.position.set(-4.5 + (i % 2) * 9, h / 2, -4 - i * 6);
  }

  // Far hills: big flattened spheres at 50-150 m (they show fog / aerial perspective / focus falloff).
  const hillGeo = new THREE.SphereGeometry(1, 24, 12);
  const hills = [
    [-60, -90, 28, 14], [-15, -120, 36, 20], [35, -100, 30, 12], [80, -130, 40, 22], [-100, -60, 30, 10], [100, -50, 24, 9],
  ];
  hills.forEach(([x, z, r, h], i) => {
    const hill = add(new THREE.Mesh(hillGeo, mat('far')), `hill${i}`, { cast: false });
    hill.position.set(x, 0, z);
    hill.scale.set(r, h, r);
  });

  // The figure: a simple person made of capsules, about 1.75 m tall.
  const figure = new THREE.Group();
  figure.name = 'figure';
  const bodyMat = mat('figure');
  const skinMat = mat('skin');
  const part = (geo, m, x, y, z, name) => {
    const p = new THREE.Mesh(geo, m);
    p.position.set(x, y, z);
    p.name = name;
    p.castShadow = shadows;
    p.receiveShadow = shadows;
    figure.add(p);
    objects.push(p);
    return p;
  };
  part(new THREE.CapsuleGeometry(0.24, 0.5, 6, 16), bodyMat, 0, 1.12, 0, 'torso');
  part(new THREE.SphereGeometry(0.17, 24, 16), skinMat, 0, 1.6, 0, 'head');
  const limb = new THREE.CapsuleGeometry(0.08, 0.5, 4, 10);
  limb.translate(0, -0.3, 0); // pivot at the shoulder / hip
  const armL = part(limb, skinMat, -0.33, 1.36, 0, 'armL');
  const armR = part(limb, skinMat, 0.33, 1.36, 0, 'armR');
  const legL = part(limb, bodyMat, -0.12, 0.8, 0, 'legL');
  const legR = part(limb, bodyMat, 0.12, 0.8, 0, 'legR');
  legL.scale.y = legR.scale.y = 1.4;
  figure.position.set(-0.3, 0, 1.5);
  figure.rotation.y = 0.7;
  scene.add(figure);

  // Light: warm low sun from the upper left, cool sky fill.
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6b5a45, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.position.set(-8, 12, 6);
  sun.target.position.set(0, 0, -2);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 60;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 600);
  camera.position.set(4.6, 2.6, 7.0);
  camera.lookAt(0, 0.9, -0.6);

  function update(t) {
    figure.position.y = Math.abs(Math.sin(t * 2.2)) * 0.04;
    const s = Math.sin(t * 2.2) * 0.5;
    armL.rotation.x = s;
    armR.rotation.x = -s;
    legL.rotation.x = -s * 0.6;
    legR.rotation.x = s * 0.6;
    knot.rotation.y = t * 0.6;
  }

  return { scene, camera, sun, hemi, figure, objects, update, focus: new THREE.Vector3(-0.3, 1.0, 1.5) };
}
