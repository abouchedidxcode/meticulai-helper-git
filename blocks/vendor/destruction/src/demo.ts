// The destruction block's demo: a structure of welded rigid bodies in a country yard, and cannonballs
// to knock it down. Physics is three-avbd (Steven Bobyn, MIT): every piece is a box on the GPU, welded to
// its neighbours with fixed joints that break past their strength. The look and the break feel are
// Timberfall's, Patch's demolition game. Patch's block page steers it through Patch's block demo
// helper (lib/patch-block.js, from patch.gg/patch-block.js); the controls are in recipe.json.
//
// In the frame: click fires a cannonball from the camera at what's under the pointer (a raycast
// against the bodies on the GPU), dragging orbits the camera, the wheel zooms.

import { patchBlock } from 'patch-block';
import * as THREE from 'three/webgpu';
import { block as recipeBlock } from '../recipe.json';
import { Cannon } from './game/cannon.ts';
import { Fx } from './game/fx.ts';
import { Site } from './game/site.ts';
import { type Framing, STRUCTURES, type StructureId } from './level/structures.ts';
import type { V3 } from './physics/builder.ts';
import { GRAVITY } from './physics/structure.ts';
import { View } from './render/view.ts';

type Values = Record<string, number | boolean | string>;
/** How long each part of loading took (s since the page started), for tuning. */
const boot: string[] = [];

const LOST_KEY = 'destruction-device-lost';
const NAMES: Record<StructureId, string> = { barn: 'Timber barn', tower: 'Water tower', wall: 'Garden wall', chimney: 'Brick chimney' };
const canvas = document.getElementById('view') as HTMLCanvasElement;
const label = document.getElementById('label') as HTMLElement;

/** The orbit camera: a target, a turn about z, a tilt and a distance, each easing to where it's asked. */
class Orbit {
  target = new THREE.Vector3();
  yaw = 0;
  pitch = 0.2;
  distance = 15;
  want = { target: new THREE.Vector3(), yaw: 0, pitch: 0.2, distance: 15 };
  /** Fast while dragging, slow for a reveal. */
  ease = 6;

  frame(f: Framing, from?: { distance: number }): void {
    this.want.target.set(...f.target);
    this.want.yaw = f.yaw;
    this.want.pitch = f.pitch;
    this.want.distance = f.distance;
    if (from) {
      this.target.copy(this.want.target);
      this.yaw = f.yaw;
      this.pitch = f.pitch;
      this.distance = from.distance;
    }
    this.ease = 2.6;
  }

  update(dt: number, camera: THREE.PerspectiveCamera): void {
    const k = 1 - Math.exp(-dt * this.ease);
    this.target.lerp(this.want.target, k);
    this.yaw += (this.want.yaw - this.yaw) * k;
    this.pitch += (this.want.pitch - this.pitch) * k;
    this.distance += (this.want.distance - this.distance) * k;
    const c = Math.cos(this.pitch);
    camera.position.set(this.target.x + this.distance * c * Math.sin(this.yaw), this.target.y - this.distance * c * Math.cos(this.yaw), this.target.z + this.distance * Math.sin(this.pitch));
    camera.up.set(0, 0, 1);
    camera.lookAt(this.target);
  }
}

async function main(): Promise<void> {
  // Steered by the page: every control's value, kept in step from onSet (the helper's `values` is a copy)
  let app: App | null = null;
  const block = patchBlock({
    ...recipeBlock,
    onSet(id: string, value: number | boolean | string) {
      // (A page restoring a value the demo already has mustn't reload the structure and move the camera)
      if (v[id] === value) return;
      v[id] = value;
      app?.set(id, value);
    },
    onTrigger(id: string) {
      if (id === 'rebuild') app?.rebuild(true);
    },
    onVisible(on: boolean) {
      if (app) app.visible = on;
    },
  });
  const v: Values = { ...block.values };
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  // The GPU device gone (a driver reset, a browser's GPU process crashing): a reload gets a fresh one. Lost
  // again within a minute, stop and say so in the frame, rather than reloading for ever.
  const onLost = (): void => {
    try {
      const last = Number(sessionStorage.getItem(LOST_KEY) ?? 0);
      if (Date.now() - last > 60_000) {
        sessionStorage.setItem(LOST_KEY, String(Date.now()));
        location.reload();
        return;
      }
    } catch {
      // (No storage in this frame: nothing to stop a reload loop with, so show the message)
    }
    const box = document.getElementById('lost') as HTMLElement;
    (box.querySelector('#reload') as HTMLElement).addEventListener('click', () => location.reload());
    box.classList.add('on');
    for (const id of ['label', 'tip', 'credit']) (document.getElementById(id) as HTMLElement).hidden = true;
    canvas.style.display = 'none';
    document.getElementById('cover')?.remove();
    block.ready();
  };
  try {
    if (!gpu) throw new Error('No WebGPU in this browser (navigator.gpu is missing).');
    app = await App.create(v, onLost);
  } catch (e) {
    console.warn(e);
    const box = document.getElementById('nogpu') as HTMLElement;
    (box.querySelector('.why') as HTMLElement).textContent = e instanceof Error ? e.message : String(e);
    box.classList.add('on');
    for (const id of ['label', 'tip', 'credit']) (document.getElementById(id) as HTMLElement).hidden = true;
    canvas.style.display = 'none';
    document.getElementById('cover')?.remove();
  }
  block.ready();
  (window as unknown as { __block: unknown }).__block = { app, values: v, block, boot };
}

class App {
  readonly view: View;
  readonly site: Site;
  readonly fx: Fx;
  readonly cannon: Cannon;
  readonly orbit = new Orbit();
  readonly v: Values;
  visible = true;
  private rebuildAt = -1;
  private clock = 0;
  private autoNext = 0;
  private autoShots = 0;
  private downAt = -1;
  /** A shot waiting for its raycast, or for the structure to be armed. */
  private queued: THREE.Vector3 | null = null;
  private brokenShown = -1;

  private constructor(view: View, site: Site, v: Values) {
    this.view = view;
    this.site = site;
    this.v = v;
    this.fx = new Fx(view);
    this.cannon = new Cannon(site, this.fx, view.scene);
    site.events = {
      onWeld: (at, a, b) => this.fx.weld(at, a, b),
      onImpact: (at, dv, mat, mass) => this.fx.impact(at, dv, mat, mass),
      onShatter: (at, size) => this.fx.shatter(at, size),
      onStrain: (at, amount) => this.fx.strain(at, amount),
    };
  }

  static async create(v: Values, onLost: () => void): Promise<App> {
    const mark = (s: string) => boot.push(`${s} ${(performance.now() / 1000).toFixed(2)}`);
    mark('start');
    const view = new View(canvas);
    view.setSize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight);
    await view.init();
    mark('view');
    let lost = false;
    const device = (view.renderer.backend as unknown as { device: GPUDevice }).device;
    device.addEventListener('uncapturederror', (e) => console.error('GPU error:', (e as GPUUncapturedErrorEvent).error.message));
    void device.lost.then((info) => {
      // (The page going away destroys its device: that's no trouble)
      if (info.reason === 'destroyed') return;
      console.warn('GPU device lost:', info.message);
      lost = true;
      view.renderer.setAnimationLoop(null);
      onLost();
    });
    const site = await Site.create(view);
    mark('site');
    const app = new App(view, site, v);
    await app.warmUp(mark);
    mark('warm');
    app.input();
    const fit = () => view.setSize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight);
    addEventListener('resize', fit);
    new ResizeObserver(fit).observe(canvas);
    app.last = performance.now();
    app.started = true;
    if (!lost) view.renderer.setAnimationLoop(() => app.frame());
    return app;
  }

  private get tuning() {
    return { strength: this.v.strength as number, density: this.v.density as number, friction: this.v.friction as number };
  }

  /**
   * Warm up behind the page's "Loading the demo…": every structure planned, the first one built,
   * settled and armed, and everything a click, a break or a control can reach drawn or run once
   * (the solver's raycast, push and contact passes, a shard, a ball, the particles' fire,
   * dust and sparks), so the first shot never hitches.
   */
  private async warmUp(mark: (s: string) => void): Promise<void> {
    for (const id of STRUCTURES) this.site.plan(id);
    mark('plans');
    this.applySettings();
    this.load(this.v.structure as StructureId, false);
    const sounds = this.fx.sounds.load().then(() => mark('sounds'));
    this.site.warm();
    this.cannon.warm(true);
    const below: V3 = [0, -60, -8];
    this.fx.particles.explosion(below, 1);
    this.fx.particles.dust(below, 2);
    this.fx.particles.sparks(below, 4, 3);
    this.view.flash(below, 1, 0.1);
    const ray = this.site.world.raycast([0, -20, 2], [0, 1, 0], { maxDistance: 100 });
    // The materials compile in the background while the structure settles. A cover of the page's colour
    // stays over the canvas to the end of the warm-up, practice shot and all: the page's loader sits over
    // the frame and what's behind it shows, so nothing of this may be seen. (A cover, not a hidden canvas:
    // a canvas shown for the first time stalls that frame 300 to 500 ms, just after ready.)
    this.orbit.update(1, this.view.camera);
    const compiled = this.view.compile().then(() => mark('compiled'));
    for (let k = 0; !this.site.ready; k++) {
      this.site.update(1 / 60, 1, true);
      // (The particles' compute kernels compile on their first run: meanwhile too)
      if (k < 3) this.fx.update(1 / 60, this.view.camera);
      await new Promise((r) => requestAnimationFrame(r));
      if (k > 600) throw new Error('The structure did not settle');
    }
    mark('settled');
    await Promise.all([ray, compiled, sounds]);
    for (let k = 0; k < 4; k++) {
      this.step(1 / 60);
      await new Promise((r) => requestAnimationFrame(r));
    }
    mark('drawn');
    this.cannon.warm(false);
    this.site.world.gravity = [0, 0, -(this.v.gravity as number)];
    // A practice shot onto the ground in front of the structure, in view (a ball first drawn in the
    // frame stalled it 65 ms): the flying ball, its shadow, the landing and the ball rolling on in the
    // solver, all once before the first real one
    const o = this.orbit;
    const side = new THREE.Vector3(Math.cos(o.yaw), Math.sin(o.yaw), 0);
    const toward = new THREE.Vector3(Math.sin(o.yaw), -Math.cos(o.yaw), 0);
    const field = o.target.clone().addScaledVector(toward, o.distance * 0.3).addScaledVector(side, 1.5);
    field.z = 0;
    this.cannon.fire(this.muzzle(field), field, true);
    for (let k = 0; k < 24; k++) {
      this.step(1 / 60);
      await new Promise((r) => requestAnimationFrame(r));
    }
    this.cannon.clear();
    this.site.clearBalls();
    this.fx.particles.clear();
    this.fx.trauma = 0;
    // A few clean frames, still unseen, then the settled starting view is what shows
    for (let k = 0; k < 3; k++) {
      this.step(1 / 60);
      await new Promise((r) => requestAnimationFrame(r));
    }
    document.getElementById('cover')?.remove();
    // The settled view under the page's loader for a moment: the canvas's first real composite can stall
    // a frame 100 to 300 ms, which belongs before ready, not after
    for (let k = 0; k < 20; k++) {
      this.step(1 / 60);
      await new Promise((r) => requestAnimationFrame(r));
    }
  }

  private applySettings(): void {
    const v = this.v;
    this.cannon.settings.radius = v.ball as number;
    this.cannon.settings.speed = v.power as number;
    this.site.world.iterations = v.iterations as number;
    this.fx.shakeOn = v.shake as boolean;
  }

  /** Put up a structure (a fresh one, or the same again), framed by the camera. */
  private load(id: StructureId, reveal: boolean): void {
    const same = this.site.id === id;
    this.cannon.clear();
    this.fx.particles.clear();
    this.queued = null;
    this.site.load(id, this.tuning);
    const f = this.site.built.framing;
    // A reveal: the camera eases in onto the new structure (a rebuild of the same one, from a little further out)
    if (reveal) this.orbit.frame(f, same ? { distance: f.distance * 1.18 } : undefined);
    else if (!same) this.orbit.frame(f, { distance: f.distance });
    this.autoShots = 0;
    this.brokenShown = -1;
    this.showLabel();
  }

  /** For pictures (make-thumbs.mjs, make-cover.mjs): no label or tips. */
  still(on: boolean): void {
    for (const id of ['label', 'tip', 'credit']) (document.getElementById(id) as HTMLElement).style.visibility = on ? 'hidden' : '';
  }

  /** Shown, after the warm-up: the label follows the structure from then on. */
  started = false;

  rebuild(reveal: boolean): void {
    this.rebuildAt = -1;
    this.load(this.site.id, reveal);
  }

  set(id: string, value: number | boolean | string): void {
    switch (id) {
      case 'structure':
        return this.load(value as StructureId, true);
      case 'strength':
      case 'density':
      case 'friction':
        // Rebuilt once the value has stopped changing (a slider dragged sends many)
        this.rebuildAt = this.clock + 0.3;
        return;
      case 'gravity':
        if (this.site.ready) this.site.world.gravity = [0, 0, -(value as number)];
        return;
      case 'auto':
        this.autoNext = this.clock + 0.6;
        return;
      default:
        this.applySettings();
    }
  }

  private showLabel(): void {
    if (!this.started) return;
    const w = this.site.welds;
    const broken = w.total - w.holding;
    if (broken === this.brokenShown) return;
    if (this.brokenShown >= 0 && broken > this.brokenShown) {
      label.classList.remove('hit');
      void label.offsetWidth;
      label.classList.add('hit');
    }
    this.brokenShown = broken;
    (label.querySelector('.name') as HTMLElement).textContent = NAMES[this.site.id];
    (label.querySelector('.k') as HTMLElement).textContent = broken ? `${broken.toLocaleString('en')} of ${w.total.toLocaleString('en')} welds broken` : `${this.site.s.pieces.length - 1} pieces · ${w.total.toLocaleString('en')} welds`;
    label.hidden = false;
  }

  // ---- Input: click fires, drag orbits, wheel zooms
  private input(): void {
    let down: { x: number; y: number; id: number } | null = null;
    let dragged = false;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.fx.sounds.start();
      down = { x: e.clientX, y: e.clientY, id: e.pointerId };
      dragged = false;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!down || e.pointerId !== down.id) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (!dragged && Math.hypot(dx, dy) > 5) {
        dragged = true;
        canvas.classList.add('drag');
      }
      if (dragged) {
        const o = this.orbit;
        o.want.yaw -= e.movementX * 0.006;
        o.want.pitch = Math.max(0.02, Math.min(1.25, o.want.pitch + e.movementY * 0.005));
        o.ease = 14;
      }
    });
    const up = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return;
      if (!dragged) this.fireAt(e.clientX, e.clientY);
      down = null;
      dragged = false;
      canvas.classList.remove('drag');
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', () => {
      down = null;
      canvas.classList.remove('drag');
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const o = this.orbit;
        o.want.distance = Math.max(5, Math.min(30, o.want.distance * Math.exp(e.deltaY * 0.0012)));
        o.ease = 8;
      },
      { passive: false },
    );
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Fire at what's under a point of the frame: a raycast on the GPU, then a ball from the camera. */
  async fireAt(x: number, y: number): Promise<void> {
    const cam = this.view.camera;
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector3(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1, 0.5);
    const dir = ndc.unproject(cam).sub(cam.position).normalize();
    const origin = cam.position.clone();
    const hit = await this.site.world.raycast(origin.toArray() as V3, dir.toArray() as V3, { maxDistance: 200 });
    let target: THREE.Vector3;
    if (hit) target = new THREE.Vector3(...hit.point);
    else {
      // The sky: as far as the ground, or 60 m along the ray
      const t = dir.z < -0.01 ? -origin.z / dir.z : 60;
      target = origin.addScaledVector(dir, Math.min(t, 80));
    }
    this.shoot(target);
  }

  /** Fire a ball from the camera at a world point (now, or once the structure is armed). */
  shoot(target: THREE.Vector3): void {
    if (!this.site.ready) {
      this.queued = target;
      return;
    }
    this.cannon.fire(this.muzzle(target), target);
  }

  /** Where a ball starts: a metre out from the camera towards its target, a little below the eye. */
  private muzzle(target: THREE.Vector3): THREE.Vector3 {
    const cam = this.view.camera;
    const dir = target.clone().sub(cam.position).normalize();
    const down = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).multiplyScalar(-0.22);
    return cam.position.clone().addScaledVector(dir, 1.2).add(down);
  }

  /** Keep firing: a piece of the structure, picked at random, every two seconds, and a rebuild once it's down. */
  private auto(): void {
    if (!this.v.auto || !this.site.ready || this.clock < this.autoNext) return;
    const w = this.site.welds;
    if (this.autoShots >= 9 || w.holding < w.total * 0.4) {
      this.rebuild(false);
      this.autoNext = this.clock + 1.5;
      return;
    }
    // Something still standing in the lower two thirds, on the camera's side (stone footings never give)
    const s = this.site.s;
    const h = this.site.built.height;
    const eye = this.view.camera.position;
    const near: number[] = [];
    s.pieces.forEach((p, i) => {
      const b = s.bodies[i];
      if (!b || p.fixed || p.mat === 'stone' || p.mat === 'glass') return;
      const at = b.position;
      if (at[2] > 0.35 && at[2] < h * 0.68 && Math.hypot(at[0] - eye.x, at[1] - eye.y) < Math.hypot(eye.x, eye.y) + 0.5) near.push(i);
    });
    if (!near.length) {
      this.autoShots = 99;
      return;
    }
    const pick = near[Math.floor(Math.random() * near.length)];
    this.shoot(new THREE.Vector3(...s.bodies[pick]!.position));
    this.autoShots++;
    this.autoNext = this.clock + 2;
  }

  private step(dt: number): void {
    const speed = this.v.speed as number;
    this.clock += dt;
    if (this.rebuildAt > 0 && this.clock >= this.rebuildAt) this.rebuild(false);
    const wasReady = this.site.ready;
    this.site.update(dt, speed);
    if (!wasReady && this.site.ready) this.site.world.gravity = [0, 0, -((this.v.gravity as number) ?? GRAVITY)];
    if (this.site.ready && this.queued) {
      const t = this.queued;
      this.queued = null;
      this.shoot(t);
    }
    this.auto();
    this.cannon.update(dt * speed);
    const cam = this.view.camera;
    this.orbit.update(dt, cam);
    // Shake: rotation only, about 2° at full trauma
    const tr = this.fx.trauma * this.fx.trauma;
    const t = performance.now() / 1000;
    const n = (f: number, o: number) => Math.sin(t * f + o) * 0.6 + Math.sin(t * f * 2.31 + o * 1.7) * 0.4;
    cam.rotateY(tr * 0.03 * n(23, 1));
    cam.rotateX(tr * 0.03 * n(19, 4));
    cam.rotateZ(tr * 0.04 * n(17, 9));
    this.view.pulse.value += (1 - this.view.pulse.value) * Math.min(1, dt * 6);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const forward = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 2).negate();
    this.fx.sounds.listen(cam.position.toArray(), forward.toArray(), up.toArray());
    this.fx.sounds.rubble(this.site.moving, this.site.movingAt);
    this.fx.update(dt * speed, cam);
    this.showLabel();
    this.view.render(dt);
  }

  last = performance.now();
  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.visible) return;
    this.step(dt);
  }
}

void main();
