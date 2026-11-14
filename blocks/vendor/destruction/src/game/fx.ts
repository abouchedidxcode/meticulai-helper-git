// What every event looks, sounds and feels like: dust by material, sparks, glass, wood snapping,
// layered recordings (audio/sounds.ts), and the camera's trauma, all as Timberfall does it.

import * as THREE from 'three/webgpu';
import { type Material, Sounds } from '../audio/sounds.ts';
import { Particles } from '../fx/particles.ts';
import type { V3 } from '../physics/builder.ts';
import { type Mat, MATS } from '../physics/materials.ts';
import type { View } from '../render/view.ts';

/** A material's sound. */
const soundOf = (m: Mat): Material => {
  const s = MATS[m].sound;
  return s === 'wood' ? 'wood' : s === 'glass' ? 'glass' : s === 'metal' ? 'metal' : s === 'concrete' ? 'concrete' : 'brick';
};

/** Dust colour of a material, linear: paler and greyer than the material, as fine dust is. */
function dustOf(m: Mat): THREE.Color {
  const c = new THREE.Color(MATS[m].dust).convertSRGBToLinear();
  const grey = (c.r + c.g + c.b) / 3;
  return c.lerp(new THREE.Color(grey, grey, grey), 0.45).multiplyScalar(0.75);
}

export class Fx {
  readonly sounds = new Sounds();
  readonly particles: Particles;
  /** Camera trauma (0..1): shake is its square, rotating not translating. */
  trauma = 0;
  /** Camera shake on or off (an agent's control). */
  shakeOn = true;
  private readonly view: View;
  private readonly wind = new THREE.Vector3(1.4, 2.1, 0);
  /** Weld breaks heard lately (per material, s): a collapse of hundreds is a few cracks, not hundreds. */
  private cracks = new Map<string, number>();
  /** Recent impacts per area (for collapse sets). */
  private impacts: { at: V3; t: number; n: number }[] = [];
  private dustBudget = 0;
  private clock = 0;

  constructor(view: View) {
    this.view = view;
    this.particles = new Particles(view.renderer, 24576, view.sceneDepth);
    view.smokeScene.add(this.particles.object);
  }

  update(dt: number, camera: THREE.Camera): void {
    this.clock += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.1);
    this.dustBudget = Math.min(24, this.dustBudget + dt * 30);
    this.particles.sunColour.value.copy(this.view.sky.sunColor).multiplyScalar(0.5 * this.view.sky.sunIntensity());
    this.particles.skyAmbient.value.copy(this.view.sky.horizon).multiplyScalar(0.8);
    this.particles.update(dt, camera, this.view.sunDirection, this.wind);
    this.impacts = this.impacts.filter((i) => this.clock - i.t < 0.6);
  }

  shake(amount: number): void {
    if (this.shakeOn) this.trauma = Math.min(1, this.trauma + amount);
  }

  /** A ball is fired from beside the camera: the shot and a kick of the view (no smoke, which would fill the frame). */
  launch(): void {
    this.sounds.cannonFire();
    this.shake(0.16);
  }

  /** A ball struck a piece. */
  hit(at: V3, mat: Mat, energy: number, broken: number): void {
    this.particles.dust(at, Math.min(10, 2 + broken * 0.6 + energy * 3), dustOf(mat));
    if (MATS[mat].hardness >= 2) this.particles.sparks(at, 14, 7);
    const d = this.sounds.distanceTo(at);
    this.sounds.impact(soundOf(mat), energy, d, broken * 8, at);
    this.shake(Math.min(0.35, ((0.1 + energy * 0.25) * 12) / (8 + d)));
  }

  /** A weld broke: a crack of the material, a puff of dust. Rate-limited per material. */
  weld(at: V3, a: Mat, b: Mat): void {
    const m = a === 'glass' || b === 'glass' ? 'glass' : MATS[a].hardness >= MATS[b].hardness ? a : b;
    const key = soundOf(m);
    if (this.clock - (this.cracks.get(key) ?? -1) > 0.07) {
      this.cracks.set(key, this.clock);
      const d = this.sounds.distanceTo(at);
      if (m === 'timber') {
        // Timber splits across the grain: a recorded snap, big ones lower
        this.sounds.play('wood_snap', 0.7, d, { rate: 0.85 + Math.random() * 0.25, send: 0.25, at, spread: 0.08 });
        if (Math.random() < 0.35) this.sounds.creak('wood', 0.95, at);
      } else if (m === 'board') this.sounds.play('hit_wood', 0.3, d, { rate: 1.2, send: 0.12, at, spread: 0.1 });
      else if (m === 'steel') this.sounds.creak('steel', 0.9, at);
      else if (m !== 'glass') this.sounds.debrisHit(key, 'S', 4, 1, at);
    }
    if (this.dustBudget > 1 && m !== 'glass' && m !== 'steel') {
      this.dustBudget -= 1;
      this.particles.dust(at, m === 'brick' || m === 'stone' ? 1.6 : 0.8, dustOf(m));
    }
  }

  /** A piece hit something hard enough to hear. */
  impact(at: V3, dv: number, mat: Mat, mass: number): void {
    const tier = mass > 0.25 ? 'L' : mass > 0.03 ? 'M' : 'S';
    const d = this.sounds.distanceTo(at);
    // A big timber landing: the recorded beam drop
    if (mat === 'timber' && mass > 0.06 && dv > 3.5) this.sounds.play('beam_drop', Math.min(1, 0.35 + dv * 0.05), d, { rate: 1.05 - Math.min(0.2, mass), send: 0.25, at });
    else this.sounds.debrisHit(soundOf(mat), tier, dv, mass * 400, at);
    if (this.dustBudget > 1 && mat !== 'glass' && mat !== 'steel') {
      this.dustBudget -= tier === 'L' ? 2 : 1;
      this.particles.dust(at, Math.min(6, 1 + dv * 0.3 * (tier === 'L' ? 3 : 1)), dustOf(mat));
    }
    if (mat === 'steel' && dv > 5) this.particles.sparks(at, 8, 5);
    if (tier === 'L' && dv > 5) this.shake(Math.min(0.08, 0.5 / (6 + d)));
    // Many impacts close together: a collapse set (one big designed sound, a rumble)
    const near = this.impacts.find((i) => Math.hypot(i.at[0] - at[0], i.at[1] - at[1], i.at[2] - at[2]) < 6);
    if (near) {
      near.n += tier === 'L' ? 4 : 1;
      if (near.n > 14) {
        if (this.sounds.collapseSet(soundOf(mat), near.n * 20, at)) this.shake(Math.min(0.4, 6 / (10 + d)));
        near.n = 0;
      }
    } else this.impacts.push({ at, t: this.clock, n: 1 });
  }

  /** A pane shattered (several at once are one sound). */
  private lastGlass = -1;
  shatter(at: V3, size: number): void {
    if (this.clock - this.lastGlass < 0.05) return;
    this.lastGlass = this.clock;
    const d = this.sounds.distanceTo(at);
    this.sounds.play('glass_break', 0.55, d, { send: 0.2, at, spread: 0.08 });
    this.sounds.glass(Math.max(1, Math.round(size * 6)), d, at);
  }

  /** A frame under load: timber straining as it bends (a plastic weld giving). */
  private lastStrain = -10;
  strain(at: V3, amount: number): void {
    if (this.clock - this.lastStrain < 0.9) return;
    this.lastStrain = this.clock;
    this.sounds.play('strain', Math.min(0.9, 0.35 + amount * 4), this.sounds.distanceTo(at), { send: 0.3, at, spread: 0.1, rate: 0.9 + Math.random() * 0.2 });
    this.sounds.creak('wood', 0.85 + Math.min(0.15, amount), at);
    this.particles.dust(at, 1 + Math.min(1, amount * 20), new THREE.Color(0.45, 0.4, 0.33));
  }
}
