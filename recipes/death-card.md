# A death card that says why

**Problem:** "Game over" teaches nothing; the player should know what got them and what to try next.

Track the **last thing that hurt the player** (what, where, and a tip), then pass it to `ctx.end`. The starter's
end card shows `heading`, `reason` and `stats`.

**Where:** new file `src/game/causes.js`; call `causes.note(...)` wherever damage happens, and
`causes.endRun(...)` when health reaches 0.

```js
// file: src/game/causes.js
// One sentence per cause: what happened + what to try. Keep them short and kind.
const TIPS = {
  stone: 'A rolling stone flattened you. Stones wobble before they roll: watch the worn tracks.',
  fall: 'You fell off the edge. The dark spot under you shows where you will land.',
  enemy: 'The guard caught you mid-swing. When it glows, step back, then hit it while it recovers.',
  time: 'The light ran out. The high platforms have shortcuts.',
};

export function createCauses({ end }) {
  let last = null;
  const counts = {};

  return {
    // what: a key of TIPS. where: optional short place name ('the bridge').
    note(what, where = '') {
      last = { what, where };
      counts[what] = (counts[what] ?? 0) + 1;
    },
    endRun({ won = false, stats = [] } = {}) {
      let reason = won ? '' : TIPS[last?.what] ?? 'You ran out of hearts.';
      if (!won && last?.where) reason = `${reason} (It happened at ${last.where}.)`;
      // The most common cause this run is worth a stat: it shows a pattern.
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (!won && top) stats = [...stats, ['Most hits from', top[0]]];
      end({ won, heading: won ? 'You made it' : 'Not this time', reason, stats });
      last = null;
      for (const k of Object.keys(counts)) delete counts[k];
    },
  };
}
```

In `game.js`: `const causes = createCauses({ end: ctx.end });` then on damage `causes.note('stone')`, and when
health hits 0 (after a short slow-motion beat) `causes.endRun({ stats: [['Time', '1:42']] })`.

**Check it works:** `__game.skipTo('lose')` (or get hit until dead) shows a card whose sentence names what hit
you; `__game.state.scene` is `'over'`.

**Common wrong version:** showing the card in the same frame as the hit (the player never sees the blow: hold
a 0.5-1 s slow-motion beat first), blaming the player ("You were too slow"), or one generic message for every
cause.
