// The waves: a TABLE of who appears, how many, when and where. The director below reads it.
// To change the game's content, edit WAVES; you should not need to touch the code under it.
//
// A wave is { name, groups: [...] } and ends when every group has appeared and nothing is left alive.
// A group:
//   kind       a row from KINDS in enemies.js ('creeper', 'ram', 'spitter', or one you add)
//   count      how many
//   at         seconds after the wave starts
//   whenLeft   optional: appear EARLY if this few enemies are left (keeps a good player busy)
//   where      a gate letter from the map ('a'..'d'), 'far' (the gate farthest from the player),
//              'any' (a random gate not near the player), or 'ring' (around the player, 7-9 m out)
// A wave with boss: true brings the boss in (boss.js) and ends when it is beaten.

export const WAVES = [
  { name: 'Creepers', groups: [
    { kind: 'creeper', count: 3, at: 0.1, where: 'ring' },
    { kind: 'creeper', count: 4, at: 5, where: 'a' },
    { kind: 'creeper', count: 5, at: 11, whenLeft: 0, where: 'c' },
    { kind: 'creeper', count: 5, at: 17, whenLeft: 0, where: 'any' },
  ] },
  { name: 'Bramble rams', groups: [
    { kind: 'creeper', count: 4, at: 0.3, where: 'b' },
    { kind: 'ram', count: 1, at: 2.5, where: 'far' },
    { kind: 'creeper', count: 5, at: 9, whenLeft: 0, where: 'any' },
    { kind: 'ram', count: 2, at: 15, whenLeft: 0, where: 'far' },
    { kind: 'creeper', count: 5, at: 21, whenLeft: 0, where: 'ring' },
  ] },
  { name: 'Spitters', groups: [
    { kind: 'spitter', count: 2, at: 0.3, where: 'far' },
    { kind: 'creeper', count: 4, at: 3, where: 'any' },
    { kind: 'ram', count: 1, at: 9, whenLeft: 0, where: 'any' },
    { kind: 'spitter', count: 3, at: 14, whenLeft: 0, where: 'any' },
    { kind: 'creeper', count: 6, at: 19, whenLeft: 1, where: 'ring' },
    { kind: 'ram', count: 1, at: 25, whenLeft: 1, where: 'far' },
  ] },
  { name: 'Old Bramble', boss: true, groups: [] },
];

export function createWaves({ arena, enemies, boss, rng, tune, waves = WAVES }) {
  const gateList = Object.values(arena.gates).flat();
  const far = (p) => gateList.reduce((best, g) => (Math.hypot(g.x - p.x, g.z - p.z) > Math.hypot(best.x - p.x, best.z - p.z) ? g : best), gateList[0]);

  // Pick `count` free spots for a group. Never closer to the player than tune.enemies.safeSpawn.
  function spots(where, count, p) {
    const safe = tune.enemies.safeSpawn;
    let base = null;
    if (where === 'far') base = far(p);
    else if (where === 'any') {
      const ok = gateList.filter((g) => Math.hypot(g.x - p.x, g.z - p.z) > safe + 3);
      base = ok.length ? rng.pick(ok) : far(p);
    } else if (arena.gates[where]) base = rng.pick(arena.gates[where]);
    if (base && Math.hypot(base.x - p.x, base.z - p.z) < safe) base = far(p);

    const out = [];
    for (let i = 0; i < count; i++) {
      let spot = null;
      for (let tries = 0; tries < 16 && !spot; tries++) {
        const a = rng.range(0, Math.PI * 2);
        const r = base ? (i === 0 && tries === 0 ? 0 : rng.range(0.8, 1.6 + count * 0.4)) : rng.range(7, 9);
        const x = (base ? base.x : p.x) + Math.cos(a) * r;
        const z = (base ? base.z : p.z) + Math.sin(a) * r;
        if (arena.isFree(x, z, 0.9) && Math.hypot(x - p.x, z - p.z) >= safe) spot = { x, z };
      }
      out.push(spot ?? far(p));
    }
    return out;
  }

  const d = {
    waves,
    index: 0,
    time: 0,
    state: 'fight', // 'fight' | 'break' | 'done'
    breakLeft: 0,
    next: 0, // the next group to appear
    get wave() {
      return waves[d.index];
    },

    begin(index) {
      d.index = Math.min(index, waves.length - 1);
      d.time = 0;
      d.next = 0;
      d.state = 'fight';
      d.bossCalled = false;
    },

    // One fixed step. Returns 'cleared' when a wave is beaten, 'next' when the following one starts,
    // 'won' when the last one is beaten; otherwise null.
    update(dt, playerPos) {
      if (d.state === 'done') return null;
      if (d.state === 'break') {
        d.breakLeft -= dt;
        if (d.breakLeft > 0) return null;
        d.begin(d.index + 1);
        return 'next';
      }
      const w = d.wave;
      d.time += dt;
      while (d.next < w.groups.length) {
        const g = w.groups[d.next];
        const early = g.whenLeft !== undefined && enemies.count <= g.whenLeft;
        if (d.time < g.at && !early) break;
        for (const s of spots(g.where, g.count, playerPos)) enemies.spawn(g.kind, s.x, s.z);
        d.next++;
      }
      if (w.boss && !d.bossCalled && d.time > 1) {
        d.bossCalled = true;
        boss.arrive(arena.bossSpot.x, arena.bossSpot.z);
      }
      const bossDone = !w.boss || (d.bossCalled && boss.dead);
      if (d.next >= w.groups.length && bossDone && (w.boss || enemies.count === 0)) {
        if (d.index >= waves.length - 1) {
          d.state = 'done';
          return 'won';
        }
        d.state = 'break';
        d.breakLeft = tune.waves.breakTime;
        return 'cleared';
      }
      return null;
    },
  };
  return d;
}
