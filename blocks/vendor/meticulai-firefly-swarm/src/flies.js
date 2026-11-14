/**
 * Firefly simulation (the catchable ones; the distant decorative swarm is pure shader, see view.js).
 *
 * Each firefly wanders between random points in the play volume with a little separation from its neighbours (a
 * loose flock), blinks on its own rhythm, gets curious about a still open hand and drifts toward it, bolts when a
 * hand snatches nearby, rides inside a fist once caught and, when released, either drops into the jar or flies off.
 */
import * as THREE from 'three';

/** @typedef {import('./rules.js').Kind} Kind */
/** @typedef {'wander' | 'startled' | 'caught' | 'escape' | 'jar' | 'gone'} FlyState */

/**
 * @typedef {object} PairLink
 * @property {THREE.Vector3} center
 * @property {THREE.Vector3} vel
 * @property {THREE.Vector3} target
 * @property {number} angle
 * @property {Fly[]} members
 * @property {number} pendingT
 */

/**
 * @typedef {object} Fly
 * @property {number} id
 * @property {Kind} kind
 * @property {THREE.Vector3} pos
 * @property {THREE.Vector3} vel
 * @property {THREE.Vector3} target
 * @property {FlyState} state
 * @property {number} stateT
 * @property {number} bright   visible brightness this frame (0..~1.6)
 * @property {number} alpha    spawn fade 0..1 and despawn
 * @property {number} phase
 * @property {number} period   blink period (s)
 * @property {number} size
 * @property {number | null} hand
 * @property {THREE.Vector3} inner  offset inside the fist
 * @property {PairLink | null} pair
 * @property {{ x: number, y: number }} screen  screen position (0..1, y down), refreshed by the host each frame
 * @property {boolean} onScreen
 * @property {number} age
 * @property {number} life     seconds of life left for rare ones (they leave if not caught)
 */

/** Firefly colours per kind (linear). @type {Record<Kind, THREE.Color>} */
export const COLORS = {
  common: new THREE.Color(1.0, 0.78, 0.36),
  blue: new THREE.Color(0.45, 0.72, 1.0),
  gold: new THREE.Color(1.0, 0.62, 0.18),
  pair: new THREE.Color(1.0, 0.86, 0.55),
};

/** Wander speed per kind (world units / s). @type {Record<Kind, number>} */
export const SPEED = { common: 0.32, blue: 0.62, gold: 0.2, pair: 0.26 };
/** Size per kind (1 = common). @type {Record<Kind, number>} */
export const SIZE = { common: 1, blue: 1.05, gold: 1.75, pair: 1.1 };

/**
 * Where fireflies may live.
 * @typedef {object} Space
 * @property {(rand: () => number) => THREE.Vector3} pick  a random world point inside the play volume
 * @property {(p: THREE.Vector3, out: { x: number, y: number }) => boolean} project  world -> screen 0..1 (y down); false when off screen
 */

/**
 * A hand (or pointer) that influences free fireflies: a still, open one draws the curious ones in.
 * @typedef {{ world: THREE.Vector3, screen: { x: number, y: number }, open: boolean, still: boolean }} HandInfluence
 */

let nextId = 1;

export class Flies {
  /**
   * @param {Space} space
   * @param {number} [seed]
   * @param {{ speed?: Partial<Record<Kind, number>>, size?: Partial<Record<Kind, number>>, curiousRadius?: number, floorY?: number }} [opts]
   */
  constructor(space, seed = 1, opts = {}) {
    this.space = space;
    /** @type {Fly[]} */
    this.list = [];
    /** @type {PairLink[]} */
    this.pairs = [];
    this.speed = { ...SPEED, ...(opts.speed || {}) };
    this.sizes = { ...SIZE, ...(opts.size || {}) };
    /** Screen-height radius in which a still open hand draws fireflies in (the game used 0.34 here). */
    this.curiousRadius = opts.curiousRadius ?? 0.34;
    /** Fireflies never fly below this height. */
    this.floorY = opts.floorY ?? 0.25;
    let s = seed >>> 0;
    this.rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
  }

  /** @param {Kind} kind @param {THREE.Vector3} [at] @returns {Fly} */
  spawn(kind, at) {
    const r = this.rand;
    const p = at ? at.clone() : this.space.pick(r);
    /** @type {Fly} */
    const f = {
      id: nextId++, kind, pos: p, vel: new THREE.Vector3((r() - 0.5) * 0.2, (r() - 0.5) * 0.1, 0), target: this.space.pick(r),
      state: 'wander', stateT: 0, bright: 0, alpha: 0, phase: r() * 10, period: kind === 'gold' ? 2.2 : 2.4 + r() * 2.6,
      size: this.sizes[kind] * (0.85 + r() * 0.3), hand: null, inner: new THREE.Vector3(), pair: null,
      screen: { x: 0.5, y: 0.5 }, onScreen: false, age: 0, life: kind === 'common' ? Infinity : kind === 'pair' ? 40 : 32,
    };
    this.list.push(f);
    return f;
  }

  /** Two fireflies that circle each other and wander as one (the game asks for both hands to catch them). */
  spawnPair() {
    const c = this.space.pick(this.rand);
    /** @type {PairLink} */
    const link = { center: c, vel: new THREE.Vector3(), target: this.space.pick(this.rand), angle: 0, members: [], pendingT: -1 };
    for (let i = 0; i < 2; i++) { const f = this.spawn('pair', c); f.pair = link; f.phase = i * 0.15; f.period = 2.6; link.members.push(f); }
    this.pairs.push(link);
    return link;
  }

  /** @param {Fly} f */
  catchable(f) {
    if (f.alpha < 0.3 || !f.onScreen) return false;
    if (f.state === 'wander') return true;
    if (f.state === 'startled') return f.stateT > 1.6;
    if (f.state === 'escape') return f.stateT > 0.9;
    return false;
  }

  /**
   * A frantic grab at `world` (screen point `s`): fireflies within `radius` (screen heights) bolt. Returns how many.
   * @param {THREE.Vector3} world @param {{ x: number, y: number }} s @param {number} radius @param {number} aspect
   */
  startle(world, s, radius, aspect) {
    let n = 0;
    for (const f of this.list) {
      if (f.state !== 'wander' && f.state !== 'escape' && f.state !== 'startled') continue;
      const d = Math.hypot((f.screen.x - s.x) * aspect, f.screen.y - s.y);
      if (d > radius) continue;
      const away = this.tmp.copy(f.pos).sub(world);
      away.z *= 0.4;
      if (away.lengthSq() < 1e-4) away.set(this.rand() - 0.5, 0.5, 0);
      away.normalize();
      away.y += 0.6;
      f.vel.copy(away.normalize().multiplyScalar(2.6 + this.rand()));
      f.state = 'startled'; f.stateT = 0;
      f.target = this.space.pick(this.rand);
      if (f.pair) { f.pair.vel.copy(f.vel).multiplyScalar(0.7); }
      n++;
    }
    return n;
  }

  /** Puts a firefly in a fist. @param {Fly} f @param {number} hand */
  grab(f, hand) {
    f.state = 'caught'; f.stateT = 0; f.hand = hand;
    const r = this.rand;
    f.inner.set((r() - 0.5) * 0.05, (r() - 0.5) * 0.05, (r() - 0.5) * 0.03);
    if (f.pair) this.unlinkPair(f);
    f.vel.set(0, 0, 0);
  }

  /** Lets a firefly go from a hand (opened away from the jar, or slipped out). @param {Fly} f */
  release(f) {
    f.state = 'escape'; f.stateT = 0; f.hand = null;
    const r = this.rand;
    f.vel.set((r() - 0.5) * 1.2, 0.8 + r() * 0.6, (r() - 0.5) * 0.6);
    f.target = this.space.pick(r);
  }

  /** @param {Fly} f */
  unlinkPair(f) {
    const link = f.pair; if (!link) return;
    for (const m of link.members) m.pair = null;
    this.pairs = this.pairs.filter((p) => p !== link);
  }

  /**
   * One step. Call `refreshScreen()` (or set `f.screen` / `f.onScreen` yourself) after it.
   * @param {number} dt seconds @param {number} t time (s) @param {HandInfluence[]} hands @param {number} aspect width / height
   */
  update(dt, t, hands, aspect) {
    const r = this.rand;
    for (const link of this.pairs) {
      // the pair wanders as one and circles each other
      const to = this.tmp.copy(link.target).sub(link.center);
      if (to.length() < 0.35) link.target = this.space.pick(r);
      to.normalize().multiplyScalar(this.speed.pair);
      link.vel.lerp(to, 1 - Math.exp(-dt * 0.8));
      link.center.addScaledVector(link.vel, dt);
      link.angle += dt * 2.1;
    }
    for (const f of this.list) {
      f.age += dt; f.stateT += dt;
      // blink: a soft steady glow plus a J-shaped flash on each firefly's own rhythm
      const ph = ((t + f.phase) % f.period) / f.period;
      const flash = ph < 0.22 ? Math.sin((ph / 0.22) * Math.PI) ** 2 : 0;
      let b = 0.32 + 0.9 * flash;
      if (f.kind === 'gold') b = 0.55 + 0.6 * flash;
      if (f.state === 'startled') b = f.stateT < 0.25 ? 1.6 : 0.12 + 0.2 * Math.min(1, f.stateT / 3);
      if (f.state === 'caught') b = 1.0 + 0.25 * Math.sin(t * 9 + f.phase);
      f.life -= dt;
      const leaving = f.life < 0 && f.state !== 'caught';
      f.alpha = leaving ? Math.max(0, f.alpha - dt * 0.6) : Math.min(1, f.alpha + dt * 0.7);
      if (leaving && f.alpha <= 0) f.state = 'gone';
      f.bright = b * f.alpha;

      if (f.state === 'caught' || f.state === 'jar' || f.state === 'gone') continue;

      if (f.pair && f.state === 'wander') {
        const link = f.pair, k = link.members.indexOf(f);
        const a = link.angle + k * Math.PI;
        const goal = this.tmp.set(link.center.x + Math.cos(a) * 0.16, link.center.y + Math.sin(a * 0.7) * 0.06, link.center.z + Math.sin(a) * 0.16);
        f.pos.lerp(goal, 1 - Math.exp(-dt * 6));
        continue;
      }

      const sp = this.speed[f.kind];
      if (f.state === 'startled' || f.state === 'escape') {
        f.vel.multiplyScalar(Math.exp(-dt * (f.state === 'startled' ? 0.9 : 1.6)));
        if (f.stateT > (f.state === 'startled' ? 3.2 : 1.4)) { f.state = 'wander'; f.stateT = 0; if (f.pair) f.pair.center.copy(f.pos); }
      }
      if (f.state === 'wander') {
        let goal = f.target;
        // curiosity: drift toward a still, open hand nearby
        for (const h of hands) {
          if (!h.open || !h.still) continue;
          const d = Math.hypot((f.screen.x - h.screen.x) * aspect, f.screen.y - h.screen.y);
          if (d < this.curiousRadius) {
            goal = this.tmp2.copy(h.world);
            goal.y += 0.08 + Math.sin(t * 1.3 + f.phase) * 0.06;
            goal.x += Math.cos(t * 0.9 + f.phase) * 0.12;
            break;
          }
        }
        const to = this.tmp.copy(goal).sub(f.pos);
        const dist = to.length();
        if (goal === f.target && dist < 0.3) f.target = this.space.pick(r);
        to.normalize().multiplyScalar(goal === f.target ? sp : Math.min(sp, dist * 0.8));
        // a little wobble so paths curve
        to.x += Math.sin(t * 1.7 + f.phase * 3) * sp * 0.6;
        to.y += Math.cos(t * 1.3 + f.phase * 2) * sp * 0.5;
        f.vel.lerp(to, 1 - Math.exp(-dt * 1.2));
        // separation
        for (const o of this.list) {
          if (o === f || o.state !== 'wander') continue;
          const dx = f.pos.x - o.pos.x, dy = f.pos.y - o.pos.y, dz = f.pos.z - o.pos.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 0.16 && d2 > 1e-6) { const k = (0.16 - d2) * 2.5 * dt; f.vel.x += dx * k; f.vel.y += dy * k; f.vel.z += dz * k; }
        }
      }
      f.pos.addScaledVector(f.vel, dt);
      if (f.pos.y < this.floorY) { f.pos.y = this.floorY; f.vel.y = Math.abs(f.vel.y) * 0.5; }
    }
    this.list = this.list.filter((f) => f.state !== 'gone' && f.state !== 'jar');
  }

  /** Refreshes every firefly's screen position from the space's projection. */
  refreshScreen() {
    for (const f of this.list) f.onScreen = this.space.project(f.pos, f.screen);
  }

  /** Keeps held fireflies inside their fist. @param {number} handId @param {THREE.Vector3} world @param {number} dt @param {number} t */
  follow(handId, world, dt, t) {
    for (const f of this.list) {
      if (f.state !== 'caught' || f.hand !== handId) continue;
      const goal = this.tmp.copy(world).add(f.inner);
      goal.x += Math.sin(t * 7 + f.phase) * 0.01;
      f.pos.lerp(goal, 1 - Math.exp(-dt * 16));
    }
  }

  /** @param {number} handId @returns {Fly[]} */
  held(handId) { return this.list.filter((f) => f.state === 'caught' && f.hand === handId); }
  /** Free (not held) fireflies, optionally of one kind. @param {Kind} [kind] */
  count(kind) { return this.list.filter((f) => (kind ? f.kind === kind : true) && f.state !== 'caught').length; }
}

