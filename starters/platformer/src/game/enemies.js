// Enemies. One kind so far: the CRAWLER walks back and forth on the ground and turns round at walls,
// ledges and spikes. It stops for a moment before it turns (tuning: enemy.turnPause): that pause is
// its "tell", the beat in which a player can read it and choose to jump.
// Touching one from the side hurts; landing on one squashes it (world.js decides which).
//
// To add a kind: give it a character in levels.js LEGEND ({ thing: 'enemy', type: 'hopper' }), a branch
// in update() below for how it moves, and a look in draw/actors.js (enemyLook).
// No drawing here.

export const ENEMY_W = 0.8;
export const ENEMY_H = 0.66;

export function createEnemies(level, tune) {
  const list = level.enemies.map((d, i) => ({
    i, type: d.type,
    home: { x: d.x, y: d.y },
    x: d.x, y: d.y, prevX: d.x, w: ENEMY_W, h: ENEMY_H,
    dir: -1, // they start out walking towards where the player comes from
    pause: 0, // > 0: standing still before turning
    alive: true,
    squish: 0, // > 0: flattened, counting down until it disappears
    walk: 0, // distance walked (for the wobble)
  }));

  // Can a crawler step onto the tile in front of it?
  function blocked(e) {
    const front = e.x + e.dir * (e.w / 2 + 0.05);
    const cx = Math.floor(front);
    const cy = Math.floor(e.y + 0.01);
    if (level.solid(cx, cy) || level.hazard(cx, cy)) return true; // wall or spikes ahead
    return !(level.solid(cx, cy - 1) || level.oneWay(cx, cy - 1)); // nothing to stand on ahead
  }

  return {
    list,
    reset() {
      for (const e of list) Object.assign(e, { x: e.home.x, y: e.home.y, prevX: e.home.x, dir: -1, pause: 0, alive: true, squish: 0, walk: 0 });
    },
    update(dt) {
      const t = tune.enemy;
      for (const e of list) {
        e.prevX = e.x;
        if (e.squish > 0) e.squish = Math.max(0, e.squish - dt);
        if (!e.alive) continue;
        if (e.pause > 0) {
          e.pause -= dt;
          if (e.pause <= 0) e.dir = -e.dir;
          continue;
        }
        if (blocked(e)) e.pause = t.turnPause;
        else {
          e.x += e.dir * t.speed * dt;
          e.walk += t.speed * dt;
        }
      }
    },
  };
}
