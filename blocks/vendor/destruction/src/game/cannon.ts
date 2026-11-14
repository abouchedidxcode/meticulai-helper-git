// The cannon: no gun to see, just iron balls fired from the camera at whatever you click (as in
// three-avbd's lab demo), with Timberfall's break feel when they land.
//
// A ball flies as a swept projectile on the CPU, in steps of 25 cm against the pieces as last read
// back, until the first piece in its path (a sphere body at 55 m/s moves 0.9 m a step and went
// straight through bricks). There it breaks what's round the hit by hardness and hands its momentum
// on, then carries on as a real sphere in the solver, slower, knocking more loose where it lands.

import * as THREE from 'three/webgpu';
import type { ContactEvent } from 'three-avbd';
import type { V3 } from '../physics/builder.ts';
import { MATS } from '../physics/materials.ts';
import { GRAVITY } from '../physics/structure.ts';
import { terrainHeight } from '../render/view.ts';
import type { Fx } from './fx.ts';
import type { Site } from './site.ts';

export interface Hit {
  piece: number;
  point: V3;
  normal: V3;
  distance: number;
}

/** The nearest piece along a ray, against the poses of the last readback. */
export function pick(site: Site, origin: THREE.Vector3, dir: THREE.Vector3, max: number): Hit | null {
  const s = site.s;
  let best: Hit | null = null;
  const q = new THREE.Quaternion();
  const o = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let i = 0; i < s.pieces.length; i++) {
    const body = s.bodies[i];
    const p = s.pieces[i];
    if (!body || p.fixed) continue;
    const pos = body.position;
    const half = [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
    const r = Math.hypot(half[0], half[1], half[2]);
    const cx = pos[0] - origin.x;
    const cy = pos[1] - origin.y;
    const cz = pos[2] - origin.z;
    const t0 = cx * dir.x + cy * dir.y + cz * dir.z;
    if (t0 < -r || t0 - r > (best?.distance ?? max)) continue;
    if (cx * cx + cy * cy + cz * cz - t0 * t0 > r * r) continue;
    const rot = body.rotation;
    q.set(rot[0], rot[1], rot[2], rot[3]).invert();
    o.set(-cx, -cy, -cz).applyQuaternion(q);
    d.copy(dir).applyQuaternion(q);
    let tmin = -Infinity;
    let tmax = Infinity;
    let axis = 0;
    let sign = 1;
    let ok = true;
    for (let k = 0; k < 3; k++) {
      const ok_ = o.getComponent(k);
      const dk = d.getComponent(k);
      if (Math.abs(dk) < 1e-9) {
        if (Math.abs(ok_) > half[k]) ok = false;
        continue;
      }
      let a = (-half[k] - ok_) / dk;
      let b = (half[k] - ok_) / dk;
      let sg = -1;
      if (a > b) {
        [a, b] = [b, a];
        sg = 1;
      }
      if (a > tmin) {
        tmin = a;
        axis = k;
        sign = sg;
      }
      tmax = Math.min(tmax, b);
    }
    if (!ok || tmin > tmax || tmax < 0) continue;
    const t = Math.max(0, tmin);
    if (t > (best?.distance ?? max)) continue;
    const n = new THREE.Vector3(axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0).applyQuaternion(q.invert());
    best = { piece: i, distance: t, point: [origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t], normal: [n.x, n.y, n.z] };
  }
  return best;
}

export interface CannonSettings {
  /** The ball's radius (m), its density (t/m³) and its launch speed (m/s). */
  radius: number;
  density: number;
  speed: number;
}

export class Cannon {
  /** Balls in flight (swept on the CPU until they hit something). */
  private readonly flying: { pos: THREE.Vector3; vel: THREE.Vector3; mesh: THREE.Mesh; age: number; radius: number; mass: number; practice: boolean }[] = [];
  private readonly ballGeo = new THREE.SphereGeometry(1, 32, 24);
  private readonly ballMat = new THREE.MeshStandardNodeMaterial({ color: 0x1c1c1f, roughness: 0.32, metalness: 0.85 });
  /** Shots fired, and first hits (for tests). */
  shots = 0;
  hits = 0;
  settings: CannonSettings = { radius: 0.12, density: 7.8, speed: 55 };

  constructor(
    private readonly site: Site,
    private readonly fx: Fx,
    private readonly scene: THREE.Scene,
  ) {
    site.world.onContact((e) => this.contact(e));
  }

  /** The ball's mass (t). */
  get mass(): number {
    const { radius, density } = this.settings;
    return (4 / 3) * Math.PI * radius ** 3 * density;
  }

  /** The launch velocity from `from` that lands on `target` (a low arc at the launch speed). */
  private launch(from: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
    const T = from.distanceTo(target) / this.settings.speed;
    const vel = target.clone().sub(from).divideScalar(Math.max(T, 1e-3));
    vel.z += 0.5 * GRAVITY * T;
    return vel;
  }

  /**
   * Fire a ball from `from` (just in front of the camera) so it lands on `target`. A practice shot
   * (the warm-up's) stops where it lands instead of rolling on into the structure.
   */
  fire(from: THREE.Vector3, target: THREE.Vector3, practice = false): void {
    const vel = this.launch(from, target);
    const r = this.settings.radius;
    const mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
    mesh.scale.setScalar(r);
    mesh.castShadow = true;
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.flying.push({ pos: from.clone(), vel, mesh, age: 0, radius: r, mass: this.mass, practice });
    this.shots++;
    this.fx.launch();
  }

  /** Warm-up: a ball drawn once, far below the ground. */
  warm(on: boolean): void {
    if (on) {
      const m = new THREE.Mesh(this.ballGeo, this.ballMat);
      m.name = 'warm-ball';
      m.castShadow = true;
      m.position.set(0, -60, -40);
      this.scene.add(m);
    } else this.scene.getObjectByName('warm-ball')?.removeFromParent();
  }

  /** Balls in flight. `dt` is game time (slow motion slows it). */
  update(dt: number): void {
    this.fly(dt);
  }

  /** Every ball in flight goes (a rebuild). */
  clear(): void {
    for (const b of this.flying) this.scene.remove(b.mesh);
    this.flying.length = 0;
  }

  private fly(dt: number): void {
    const s = this.site.s;
    for (let k = this.flying.length - 1; k >= 0; k--) {
      const b = this.flying[k];
      b.age += dt;
      const n = Math.max(1, Math.ceil((b.vel.length() * dt) / 0.25));
      let done = false;
      for (let i = 0; i < n && !done; i++) {
        const h = dt / n;
        const step = b.vel.clone().multiplyScalar(h);
        const len = step.length();
        const dir = step.clone().divideScalar(len || 1);
        const hit = this.site.ready ? pick(this.site, b.pos, dir, len + b.radius) : null;
        if (hit) {
          const p = s.pieces[hit.piece];
          if (p.mat === 'glass') {
            // A pane barely slows it
            this.site.shatter(hit.piece, b.vel.clone().multiplyScalar(0.25).toArray() as V3);
            b.vel.multiplyScalar(0.9);
            continue;
          }
          this.strike(b, hit, dir);
          done = true;
          break;
        }
        b.pos.add(step);
        b.vel.z -= GRAVITY * h;
        const ground = terrainHeight(b.pos.x, b.pos.y);
        if (b.pos.z - b.radius < ground) {
          // Into the ground: a spray of dirt, and it rolls on as a body
          b.pos.z = ground + b.radius + 0.01;
          this.fx.particles.dust(b.pos.toArray(), 4, new THREE.Color(0.32, 0.27, 0.2));
          this.fx.sounds.debrisHit('concrete', 'L', 6, 300, b.pos.toArray());
          const roll = b.practice ? 0 : 0.5;
          this.handOver(b, new THREE.Vector3(b.vel.x * roll, b.vel.y * roll, Math.abs(b.vel.z) * 0.25));
          done = true;
        }
      }
      if (done || b.age > 5) {
        this.scene.remove(b.mesh);
        this.flying.splice(k, 1);
      } else b.mesh.position.copy(b.pos);
    }
  }

  private handOver(b: { pos: THREE.Vector3; radius: number }, vel: THREE.Vector3): void {
    if ((globalThis as any).__noHand) return;
    this.site.addBall(b.pos.toArray() as V3, vel.toArray() as V3, b.radius, this.settings.density);
  }

  /**
   * A ball meets a piece: a hole by hardness round the hit, its momentum into what it hit. How big
   * a blow it is goes with its momentum against the default ball's (12 cm of iron, 56 kg, at 55 m/s).
   */
  private strike(b: { pos: THREE.Vector3; vel: THREE.Vector3; radius: number; mass: number }, hit: Hit, dir: THREE.Vector3): void {
    const s = this.site.s;
    const p = s.pieces[hit.piece];
    const at = hit.point;
    const speed = b.vel.length();
    const blow = (b.mass * speed) / (0.05646 * 55);
    const energy = Math.min(1, speed / 45) * Math.min(2, Math.cbrt(blow));
    const h = MATS[p.mat].hardness;
    const reach = Math.cbrt(Math.max(0.05, blow));
    const radius = h >= 2 ? 0.08 * reach : (0.18 + 0.24 * Math.min(1, energy)) * reach;
    let broken = 0;
    const kept = h >= 2 ? 0.25 : 0.45;
    // What it hit takes the momentum it loses: half to the piece it hit, the rest shared by mass
    // among the pieces round the hit (never more than the ball had: a share each made a shock that
    // shook a whole barn's boards off)
    const J = b.mass * speed * (1 - kept);
    const cap = 10 * Math.min(2, Math.sqrt(Math.max(1, blow)));
    const struck = this.near(at, radius + 0.25).filter((i) => {
      const q = s.pieces[i];
      const pos = s.bodies[i]!.position;
      return i === hit.piece || Math.hypot(pos[0] - at[0], pos[1] - at[1], pos[2] - at[2]) - Math.min(...q.size) * 0.5 <= radius;
    });
    if (!struck.includes(hit.piece)) struck.push(hit.piece);
    const around = struck.reduce((m, i) => m + (i === hit.piece ? 0 : s.mass[i]), 0);
    for (const i of struck) {
      const q = s.pieces[i];
      const body = s.bodies[i];
      if (!body) continue;
      const pos = body.position;
      const dist = Math.hypot(pos[0] - at[0], pos[1] - at[1], pos[2] - at[2]) - Math.min(...q.size) * 0.5;
      if (q.mat === 'glass') {
        this.site.shatter(i, dir.clone().multiplyScalar(speed * 0.25).toArray() as V3);
        continue;
      }
      const hq = MATS[q.mat].hardness;
      if ((globalThis as any).__noBreak) {} else if (hq < 2) broken += q.mat === 'timber' ? s.holding(i).filter((w) => s.strength[w] < 48 * energy * reach && s.cut(w)).length : s.release(i);
      // Steel gives where it's hit: the member it lands on is shot from its rivets, and what's round
      // it only to a heavy blow. Stone shrugs it off
      else if (q.mat === 'steel' && i === hit.piece && energy * blow >= 0.5) broken += s.release(i);
      else if (q.mat === 'steel' && dist < radius) broken += s.holding(i).filter((w) => s.strength[w] < 4 * energy * blow && s.cut(w)).length;
      // A big ball straight onto a timber splinters it
      if (q.mat === 'timber' && i === hit.piece && blow > 8 && !q.role.includes('offcut')) {
        const v = 6 * Math.min(2, blow / 8);
        this.site.cutOut(i, at, [dir.x * v, dir.y * v, dir.z * v + 1.5], 3);
        broken++;
        continue;
      }
      const share = i === hit.piece ? (around > 0 ? 0.5 : 1) : (0.5 * s.mass[i]) / around;
      const k = Math.min(J * share, s.mass[i] * cap) * ((globalThis as any).__impulse ?? 1);
      body.applyImpulse([dir.x * k, dir.y * k, dir.z * k], at);
    }
    this.hits++;
    this.fx.hit(at, p.mat, Math.min(1, energy), broken);
    // On as a body, from just short of the surface, at what speed it kept
    const back = new THREE.Vector3(...hit.normal).multiplyScalar(b.radius + 0.03);
    this.handOver({ pos: new THREE.Vector3(...at).add(back), radius: b.radius }, b.vel.clone().multiplyScalar(kept));
  }

  /** Pieces whose centres are within `r` of a point. */
  private near(at: V3, r: number): number[] {
    const s = this.site.s;
    const out: number[] = [];
    for (let i = 0; i < s.pieces.length; i++) {
      const b = s.bodies[i];
      if (!b || s.pieces[i].fixed) continue;
      const p = b.position;
      const reach = r + Math.max(...s.pieces[i].size) * 0.5;
      if (Math.abs(p[0] - at[0]) > reach || Math.abs(p[1] - at[1]) > reach || Math.abs(p[2] - at[2]) > reach) continue;
      if (Math.hypot(p[0] - at[0], p[1] - at[1], p[2] - at[2]) < reach) out.push(i);
    }
    return out;
  }

  /** A cannonball body (after its first hit) struck another piece: smaller holes. */
  private contact(e: ContactEvent): void {
    // (Events arrive with the readback after their step: one from before a rebuild is of bodies since gone)
    if (e.type !== 'begin' || e.impulse < 1.2 || !this.site.ready || !e.a.alive || !e.b.alive || e.step < this.site.since) return;
    const s = this.site.s;
    const other = s.pieceAt.get(e.a.shape === 'sphere' ? e.b.index : e.a.index);
    if (other === undefined || !s.bodies[other] || s.bodies[other]!.index !== (e.a.shape === 'sphere' ? e.b.index : e.a.index)) return;
    const p = s.pieces[other];
    const at = e.point as V3;
    const energy = Math.min(1, e.impulse / 12);
    if (MATS[p.mat].hardness >= 2 || energy < 0.2) return;
    let broken = 0;
    for (const i of this.near(at, 0.2 + 0.3 * energy)) {
      const q = s.pieces[i];
      if (MATS[q.mat].hardness >= 2) continue;
      if (q.mat === 'glass') {
        this.site.shatter(i);
        continue;
      }
      broken += q.mat === 'timber' ? 0 : s.release(i);
    }
    this.fx.hit(at, p.mat, energy * 0.7, broken);
  }
}
