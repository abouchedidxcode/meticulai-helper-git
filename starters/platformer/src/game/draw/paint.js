// A tiny toolkit for flat 2D drawing in three.js: everything on screen is made of coloured triangles.
//
//   const p = new Painter();
//   p.rect(x, y, w, h, '#ff0000');                 // x, y = bottom-left corner
//   p.roundRect(cx, cy, w, h, radius, colour);     // cx, cy = centre
//   p.circle(cx, cy, r, colour);   p.tri(ax, ay, bx, by, cx, cy, colour);
//   scene.add(p.mesh());                           // ONE mesh (one draw call) for all of it
//
// Every shape takes an optional z (default 0): bigger z draws in front. Colours are '#rrggbb' strings
// from ctx.look, never hard-coded, so the whole game follows palette.json.
// flat(colour) is the material for single-colour meshes. Nothing here is lit or tone-mapped: colours
// come out on screen exactly as the palette says.
//
// To use SPRITES instead of drawn shapes: see STARTER.md ("Swapping the shapes for sprites"). The short
// version: build a PlaneGeometry of the same size and give it flat(colour, { map: texture, transparent: true }).

import * as THREE from 'three';

const cache = new Map();
/** '#rrggbb' -> a shared THREE.Color (already converted for rendering). Don't change the result. */
export function col(hex) {
  let c = cache.get(hex);
  if (!c) cache.set(hex, (c = new THREE.Color(hex)));
  return c;
}

export function flat(color, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false, side: THREE.DoubleSide, ...opts });
}

export function vertexMaterial(opts = {}) {
  return new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide, ...opts });
}

export class Painter {
  constructor() {
    this.pos = [];
    this.rgb = [];
  }
  tri(ax, ay, bx, by, cx, cy, color, z = 0, colorB = color, colorC = color) {
    this.pos.push(ax, ay, z, bx, by, z, cx, cy, z);
    for (const c of [col(color), col(colorB), col(colorC)]) this.rgb.push(c.r, c.g, c.b);
    return this;
  }
  rect(x, y, w, h, color, z = 0) {
    return this.gradient(x, y, w, h, color, color, z);
  }
  /** A rectangle that fades from one colour at the bottom to another at the top. */
  gradient(x, y, w, h, bottom, top, z = 0) {
    this.tri(x, y, x + w, y, x + w, y + h, bottom, z, bottom, top);
    this.tri(x, y, x + w, y + h, x, y + h, bottom, z, top, top);
    return this;
  }
  /** An ellipse: rx across, ry up (ry defaults to rx). */
  circle(cx, cy, rx, color, z = 0, ry = rx, segments = 20) {
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const b = ((i + 1) / segments) * Math.PI * 2;
      this.tri(cx, cy, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, cx + Math.cos(b) * rx, cy + Math.sin(b) * ry, color, z);
    }
    return this;
  }
  roundRect(cx, cy, w, h, r, color, z = 0) {
    const pts = roundRectPoints(cx, cy, w, h, r);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      this.tri(cx, cy, a[0], a[1], b[0], b[1], color, z);
    }
    return this;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.rgb, 3));
    return g;
  }
  mesh(opts = {}) {
    return new THREE.Mesh(this.geometry(), vertexMaterial(opts));
  }
}

function roundRectPoints(cx, cy, w, h, r, per = 5) {
  r = Math.min(r, w / 2, h / 2);
  const pts = [];
  const corners = [[cx + w / 2 - r, cy + h / 2 - r, 0], [cx - w / 2 + r, cy + h / 2 - r, 1], [cx - w / 2 + r, cy - h / 2 + r, 2], [cx + w / 2 - r, cy - h / 2 + r, 3]];
  for (const [x, y, q] of corners) {
    for (let i = 0; i <= per; i++) {
      const a = (q + i / per) * (Math.PI / 2);
      pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
  }
  return pts;
}

/** The colour to outline `c` with so it stands out on anything: light things get a dark edge, dark things a light one. */
export function outlineFor(look, c) {
  return look.luminance(c) > 0.22 ? look.shade(look.mix(c, look.shadow, 0.75), -0.45) : look.shade(look.mix(c, look.light, 0.8), 0.35);
}

/** A cheap repeatable "random" number 0..1 from two whole numbers (decoration that never changes). */
export function hash(a, b = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Free the GPU memory of everything under a group (when a level is replaced). */
export function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
    else o.material?.dispose?.();
  });
  root.removeFromParent();
}
