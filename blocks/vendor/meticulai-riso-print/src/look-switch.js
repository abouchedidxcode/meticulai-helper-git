// One game, several looks. The game is one thing; the look is another.
//
// Game code asks for materials by ROLE (looks.mat(INK.ENEMY), looks.mat(INK.WALL, MODE.WOOD)) and draws with
// looks.view.render(scene, camera). It never knows which look is on. Switching the look swaps every role's
// material in the scene and the frame renderer; positions, rules and timing stay exactly the same.
//
// No three.js import here: a look brings its own materials and view.
//
//   const looks = createLookSwitch({ looks: { riso: risoLook, plain: plainLook }, renderer });
//   const m = looks.mat(INK.WALL, MODE.WOOD);       // a material for the active look, tagged with its role
//   looks.set('plain', scene);                        // swap materials in `scene` and the view, live
//   looks.view.render(scene, camera);
//
// A look is { mat(id, mode, glow, side) -> Material, createView(renderer) -> View }.
// A View has: activate(), render(scene, camera, vmScene?, vmCamera?), resize(w, h), setPixelRatio(px),
// setPalette(name, instant?), tickPalette(dt), fx (screen-signal numbers it may ignore).

/**
 * Pick the starting look: ?look=<name> in the URL, then the saved choice, then `fallback`.
 * @param {string[]} names
 * @param {{ fallback?: string, param?: string, storageKey?: string|null, search?: string, storage?: Storage|null }} [o]
 */
export function pickLook(names, { fallback = names[0], param = 'look', storageKey = null, search, storage } = {}) {
  try {
    const q = new URLSearchParams(search ?? globalThis.location?.search ?? '').get(param);
    if (q && names.includes(q)) return q;
    const st = storage === undefined ? globalThis.localStorage : storage;
    if (storageKey && st) {
      const s = JSON.parse(st.getItem(storageKey));
      if (names.includes(s)) return s;
    }
  } catch (e) { /* storage is optional */ }
  return names.includes(fallback) ? fallback : names[0];
}

/**
 * @param {{ looks: Record<string, {mat: Function, createView: Function}>, renderer?: any, initial?: string,
 *           storageKey?: string|null, param?: string }} o
 */
export function createLookSwitch({ looks, renderer = null, initial, storageKey = null, param = 'look' }) {
  const names = Object.keys(looks);
  let name = initial && names.includes(initial) ? initial : pickLook(names, { storageKey, param });
  const views = new Map();

  function view(n = name) {
    let v = views.get(n);
    if (!v && renderer) {
      v = looks[n].createView(renderer);
      views.set(n, v);
    }
    return v;
  }

  /** A material for the active look, tagged with its role so set() can swap it later. */
  function mat(id, mode = 0, glow = 0, side = 0) {
    const m = looks[name].mat(id, mode, glow, side);
    m.userData = m.userData || {};
    m.userData.inkRole = { id, mode, glow, side };
    return m;
  }

  /** Swap every role-tagged material under `root` to the active look. Untagged materials are left alone. */
  function restyle(root) {
    if (!root) return 0;
    let n = 0;
    const swap = (m) => {
      const r = m && m.userData && m.userData.inkRole;
      if (!r) return m;
      n++;
      return mat(r.id, r.mode, r.glow, r.side);
    };
    root.traverse((o) => {
      if (!o.material) return;
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
    return n;
  }

  const api = {
    names,
    get name() { return name; },
    get view() { return view(); },
    mat,
    restyle,
    /**
     * Switch look live. Pass every scene that holds role materials (world, view model...).
     * Returns false if the name is unknown or already active.
     */
    set(next, ...scenes) {
      if (!names.includes(next) || next === name) return false;
      name = next;
      if (storageKey) {
        try { globalThis.localStorage?.setItem(storageKey, JSON.stringify(next)); } catch (e) { /* optional */ }
      }
      for (const s of scenes) restyle(s);
      const v = view();
      if (v && v.activate) v.activate();
      return true;
    },
    /** The next look in the list (for a "change look" key). */
    next(...scenes) {
      return api.set(names[(names.indexOf(name) + 1) % names.length], ...scenes);
    },
  };
  const v = view();
  if (v && v.activate) v.activate();
  return api;
}
