/**
 * The catching game around the swarm, without any particular input device: give it hands (a screen point, a world
 * point and an openness 0..1 each) every frame, and it runs the rules exactly as the game did:
 *   - a hand that closes slowly around fireflies catches them (capture radius, with a little charity just outside);
 *   - a hand that snaps shut (faster than `franticMs`) startles every firefly near it instead;
 *   - a still, open hand draws curious fireflies in;
 *   - open a full hand over the jar and they fly in (it glows brighter); open it anywhere else and they fly off;
 *   - hold them too long (`holdMs`) and one slips out; a hand that vanishes for 0.6 s lets them all go.
 * Hands can be a mouse (see pointer.js), touches, a bot, or a hand tracker that reports openness.
 */
import * as THREE from 'three';
import { Grip, TUNING, VALUE, addToJar, newStats, raresDue, screenDist, targetCommon } from './rules.js';

/** @typedef {import('./flies.js').Fly} Fly */
/** @typedef {import('./rules.js').Kind} Kind */

/**
 * One hand this frame.
 * @typedef {object} HandInput
 * @property {number} id          stable per hand
 * @property {{ x: number, y: number }} screen  0..1, y down
 * @property {THREE.Vector3} world  where the palm is in the world (fireflies are drawn toward it)
 * @property {THREE.Vector3} [fist] where caught fireflies sit (defaults to `world`)
 * @property {number} openness    1 open .. 0 fist
 */

/**
 * @typedef {'catch' | 'startle' | 'release' | 'drop' | 'jar' | 'slip' | 'pair-wait'} CatchEventType
 * Events: catch {hand, flies}, startle {hand, count}, release {hand, flies} (opened away from the jar),
 * drop {hand, flies} (opened over the jar: they are flying in), jar {fly, gained} (one landed), slip {hand, fly},
 * pair-wait {} (one hand closed on the pair, the other never came).
 */

class HandState {
  /** @param {number} id @param {typeof TUNING} tune */
  constructor(id, tune) {
    this.id = id;
    this.grip = new Grip(tune);
    this.heldT = 0;
    this.screen = { x: 0.5, y: 0.5 };
    this.world = new THREE.Vector3();
    this.fist = new THREE.Vector3();
    this.speed = 0;
    this.lost = 0;
    this.openness = 1;
    /** Glow of the fist (flares to 1.7 on a catch), for lights and your hand visuals. */
    this.glow = 0;
    this.present = true;
  }
}

export class FireflyCatcher {
  /**
   * @param {object} o
   * @param {import('./flies.js').Flies} o.flies
   * @param {import('./jar.js').Jar | { mouth: THREE.Vector3, count: number, pulse: number } | null} [o.jar]
   * @param {Partial<typeof TUNING>} [o.tuning]  override any rule number
   * @param {() => number} [o.aspect]  width / height of the view (default: the window's)
   * @param {boolean} [o.singleHanded] one pointer only: the pair can be caught with one hand (default true)
   * @param {(type: CatchEventType, data: any) => void} [o.onEvent]
   */
  constructor({ flies, jar = null, tuning = {}, aspect, singleHanded = true, onEvent }) {
    this.flies = flies;
    this.jar = jar;
    /** @type {typeof TUNING} */
    this.tune = { ...TUNING, ...tuning };
    this.aspect = aspect ?? (() => (typeof innerWidth === 'number' ? innerWidth / innerHeight : 16 / 9));
    this.singleHanded = singleHanded;
    this.onEvent = onEvent ?? (() => {});
    /** Where the jar's mouth is on screen (0..1, y down). Set it each frame (`project(jar.center, catcher.jarScreen)`). */
    this.jarScreen = { x: 0.8, y: 0.7 };
    /** Turn off to stop catching (e.g. on a title screen); open hands still release. */
    this.playing = true;
    this.stats = newStats();
    /** @type {Map<number, HandState>} */
    this.hands = new Map();
    /** @type {{ fly: Fly, from: THREE.Vector3, t: number, delay: number }[]} */
    this.drops = [];
    /** @type {{ hand: number, t: number, fly: Fly } | null} */
    this.pairPending = null;
    this.commonCooldown = 0;
  }

  /**
   * One frame. Runs hands, drops, the flies' own motion and their screen positions.
   * @param {number} dt seconds @param {number} t seconds (any clock, used for blinking) @param {HandInput[]} hands
   */
  update(dt, t, hands) {
    const nowMs = t * 1000;
    this.processHands(dt, nowMs, t, hands);
    this.updateDrops(dt);
    const infl = [];
    for (const st of this.hands.values()) {
      if (!st.present) continue;
      infl.push({ world: st.world, screen: st.screen, open: st.openness > 0.55 && !this.flies.held(st.id).length, still: st.speed < 0.45 });
    }
    this.flies.update(dt, t, infl, this.aspect());
    this.flies.refreshScreen();
  }

  /**
   * Keeps the meadow stocked the way the game did: commons up to targetCommon(dusk), one every 0.7 s; rares on the
   * session schedule between prevS and nowS (pass `rares: false` to skip them).
   * @param {number} dt @param {number} dusk 0..1 @param {{ prevS?: number, nowS?: number, endless?: boolean, rares?: boolean }} [o]
   * @returns {import('./rules.js').Spawn[]} the rares spawned now
   */
  populate(dt, dusk, { prevS = 0, nowS = 0, endless = false, rares = true } = {}) {
    this.commonCooldown -= dt;
    const free = this.flies.list.filter((f) => f.kind === 'common').length;
    if (free < targetCommon(dusk) && this.commonCooldown <= 0) { this.flies.spawn('common'); this.commonCooldown = 0.7; }
    if (!rares) return [];
    const due = raresDue(prevS, nowS, endless, this.tune.sessionS);
    for (const s of due) { if (s.kind === 'pair') this.flies.spawnPair(); else this.flies.spawn(s.kind); }
    return due;
  }

  /** Fists with their glow, for writeLights(). */
  fists() {
    return [...this.hands.values()].map((st) => ({ pos: st.fist, glow: st.glow }));
  }

  /**
   * 0..1 how close a hand's held fireflies are to slipping out (for a flutter warning), or 0.
   * @param {number} id
   */
  slipWarning(id) {
    const st = this.hands.get(id);
    if (!st || !this.flies.held(id).length || st.heldT <= this.tune.slipWarnMs) return 0;
    return (st.heldT - this.tune.slipWarnMs) / (this.tune.holdMs - this.tune.slipWarnMs);
  }

  /** Lets every held firefly go and clears hands, drops and stats. */
  reset() {
    for (const f of this.flies.list) if (f.state === 'caught') this.flies.release(f);
    this.hands.clear(); this.drops.length = 0; this.pairPending = null; this.stats = newStats();
    if (this.jar) { this.jar.count = 0; this.jar.pulse = 0; }
  }

  // ------------------------------------------------------------------ internals

  /** @param {HandState} st @param {Fly[]} list */
  catchFlies(st, list) {
    if (!list.length) return;
    for (const f of list) this.flies.grab(f, st.id);
    this.stats.catches += list.length;
    this.stats.bestHeld = Math.max(this.stats.bestHeld, this.flies.held(st.id).length);
    st.heldT = 0;
    st.glow = 1.7; // a flare as it closes
    this.onEvent('catch', { hand: st.id, flies: list, value: Math.max(...list.map((f) => VALUE[f.kind])) });
  }

  /** @param {HandState} st @param {'slow' | 'frantic'} kind @param {number} nowMs */
  onClose(st, kind, nowMs) {
    const aspect = this.aspect();
    const T = this.tune;
    if (kind === 'frantic') {
      const n = this.flies.startle(st.world, st.screen, T.startleRadius, aspect);
      if (n > 0) { this.stats.startles++; this.onEvent('startle', { hand: st.id, count: n }); }
      return;
    }
    const cands = this.flies.list.filter((f) => this.flies.catchable(f));
    const pts = cands.map((f) => f.screen);
    let idx = cands.length ? withinR(st.screen, pts, T.captureRadius, aspect) : [];
    // charity: nothing inside the radius but one just outside it still counts
    if (!idx.length) idx = withinR(st.screen, pts, T.captureRadius * 1.3, aspect).slice(0, 1);
    const got = idx.map((i) => cands[i]);
    const singles = got.filter((f) => !f.pair);
    const pairFly = got.find((f) => f.pair);
    if (pairFly && pairFly.pair) {
      const link = pairFly.pair;
      const pp = this.pairPending;
      if (this.singleHanded) singles.push(...link.members);
      else if (pp && pp.hand !== st.id && nowMs - pp.t <= T.pairWindowMs && link.members.includes(pp.fly)) {
        // both hands: each keeps one
        const other = this.hands.get(pp.hand);
        const mine = link.members.find((m) => m !== pp.fly);
        if (other && other.grip.state === 'closed') this.catchFlies(other, [pp.fly]); else singles.push(pp.fly);
        if (mine) singles.push(mine);
        this.pairPending = null;
      } else {
        this.pairPending = { hand: st.id, t: nowMs, fly: pairFly };
      }
    }
    this.catchFlies(st, singles);
  }

  /** @param {HandState} st */
  onOpen(st) {
    const held = this.flies.held(st.id);
    if (!held.length) return;
    const overJar = !!this.jar && screenDist(st.screen, this.jarScreen, this.aspect()) <= this.tune.jarRadius;
    if (overJar && this.playing) {
      held.forEach((f, i) => { f.state = 'escape'; f.hand = null; this.drops.push({ fly: f, from: f.pos.clone(), t: 0, delay: i * 0.08 }); });
      this.onEvent('drop', { hand: st.id, flies: held });
    } else {
      for (const f of held) this.flies.release(f);
      this.stats.releasedFree += held.length;
      this.onEvent('release', { hand: st.id, flies: held });
    }
    st.heldT = 0;
  }

  /** @param {number} dt @param {number} nowMs @param {number} t @param {HandInput[]} hands */
  processHands(dt, nowMs, t, hands) {
    const seen = new Set();
    const aspect = this.aspect();
    const T = this.tune;
    for (const h of hands) {
      seen.add(h.id);
      let st = this.hands.get(h.id);
      if (!st) { st = new HandState(h.id, T); st.screen = { ...h.screen }; this.hands.set(h.id, st); }
      st.lost = 0; st.present = true;
      const sp = Math.hypot((h.screen.x - st.screen.x) * aspect, h.screen.y - st.screen.y) / Math.max(dt, 1e-3);
      st.speed += (sp - st.speed) * (1 - Math.exp(-dt * 8));
      st.screen = { ...h.screen };
      st.world.copy(h.world);
      st.fist.copy(h.fist ?? h.world);
      st.openness = h.openness;
      const ev = st.grip.update(h.openness, nowMs);
      if (this.playing) {
        if (ev?.type === 'close') this.onClose(st, ev.kind, nowMs);
        if (ev?.type === 'open') this.onOpen(st);
      } else if (ev?.type === 'open') this.onOpen(st);
      // holding too long: it slips out between the fingers
      const held = this.flies.held(st.id);
      if (held.length) {
        st.heldT += dt * 1000;
        if (st.heldT > T.holdMs) {
          const f = held[held.length - 1];
          this.flies.release(f);
          this.stats.slips++;
          this.onEvent('slip', { hand: st.id, fly: f });
          st.heldT = T.holdMs - 1500;
        }
      }
      this.flies.follow(st.id, st.fist, dt, t);
    }
    for (const [id, st] of this.hands) {
      if (!seen.has(id)) {
        st.lost += dt; st.present = false;
        // a brief tracking dropout keeps the catch; a hand gone for good lets it go
        if (st.lost > 0.6) {
          for (const f of this.flies.held(st.id)) this.flies.release(f);
          if (st.glow < 0.01) this.hands.delete(id);
        }
      }
      const target = this.flies.held(st.id).length ? 1 : 0;
      st.glow += (target - st.glow) * (1 - Math.exp(-dt * (st.glow > target ? 3 : 10)));
    }
    // pair: the first hand closed on it but the second never came
    if (this.pairPending && nowMs - this.pairPending.t > T.pairWindowMs) {
      this.pairPending = null;
      this.onEvent('pair-wait', {});
    }
  }

  /** @param {number} dt */
  updateDrops(dt) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      const k = Math.min(1, Math.max(0, (d.t - d.delay) / 0.55));
      const e = k * k * (3 - 2 * k);
      if (this.jar) d.fly.pos.lerpVectors(d.from, this.jar.mouth, e);
      d.fly.pos.y += Math.sin(e * Math.PI) * 0.12;
      d.fly.state = 'escape'; d.fly.stateT = 0; d.fly.vel.set(0, 0, 0);
      if (k >= 1) {
        d.fly.state = 'jar';
        this.drops.splice(i, 1);
        const gained = addToJar(this.stats, [d.fly.kind]);
        if (this.jar) {
          this.jar.count = this.stats.caught;
          this.jar.pulse = Math.min(1.2, this.jar.pulse + 0.6 + gained * 0.05);
        }
        this.onEvent('jar', { fly: d.fly, gained });
      }
    }
  }
}

/** @param {{ x: number, y: number }} p @param {{ x: number, y: number }[]} pts @param {number} r @param {number} aspect */
function withinR(p, pts, r, aspect) {
  /** @type {{ i: number, d: number }[]} */
  const out = [];
  pts.forEach((q, i) => { const d = screenDist(p, q, aspect); if (d <= r) out.push({ i, d }); });
  return out.sort((a, b) => a.d - b.d).map((o) => o.i);
}
