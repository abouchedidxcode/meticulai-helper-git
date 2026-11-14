# Save progress (localStorage, versioned)

**Problem:** progress is lost on reload, or an old save from a previous version crashes the new game.

Save a small plain object under a key named after the game, with a **version number**. On load, upgrade old
versions step by step; if anything is wrong, start fresh instead of crashing.

**Where:** new file `src/core/save.js` (it is engine-level: keep it if you replace the game).

```js
// file: src/core/save.js
import helper from '../../helper.json';

const VERSION = 2;
const KEY = `save:${helper.gameName}`;

const DEFAULTS = { version: VERSION, bestTime: null, levelsDone: [], settings: { volume: 0.8 } };

// One function per old version: turns version n into version n + 1.
const UPGRADES = {
  1: (old) => ({ ...old, version: 2, levelsDone: old.level ? Array.from({ length: old.level }, (_, i) => i + 1) : [] }),
};

function fresh() {
  return structuredClone(DEFAULTS);
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    let data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || typeof data.version !== 'number') return fresh();
    if (data.version > VERSION) return fresh(); // from a newer build: don't guess
    while (data.version < VERSION) {
      const up = UPGRADES[data.version];
      if (!up) return fresh();
      data = up(data);
    }
    // Fill in fields added since (so code can trust every field exists).
    return { ...fresh(), ...data, settings: { ...DEFAULTS.settings, ...data.settings } };
  } catch {
    return fresh(); // private mode, full storage, broken JSON: play on without a save
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, version: VERSION }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
```

Use it: `const save = loadSave();` at start; after a win `save.bestTime = Math.min(save.bestTime ?? Infinity, run.time); writeSave(save);`.
Save at meaningful moments (level done, settings changed), not every frame.

**Check it works:** win once, reload the page, and `JSON.parse(localStorage.getItem('save:' + document.title))`
in the console shows your best time. Then set it to `'{"version":1,"level":3}'`, reload: no crash, and
`levelsDone` is `[1,2,3]`.

**Common wrong version:** `JSON.parse(localStorage.getItem('save'))` with no try/catch and no version (one
format change and every returning player's game crashes on load), a generic key like `'save'` (two games on the
same site overwrite each other), or saving with `?bot=1`/`?test=1` on (tests pollute the player's save: skip
`writeSave` when `ctx.flags.bot || ctx.flags.test`).
