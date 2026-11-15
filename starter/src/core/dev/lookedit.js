// The dev menu's Look controls: every colour role and light number of palette.json (core/look.js), and the vibe
// chooser. Games build their materials once from the palette, so the world's colours change when the palette is
// saved and the page loads again (the menu does that for you and keeps the address). Two things change at once:
// brightness (exposure) and the colours of the text and cards over the game.
//
//   POST /__helper/palette { palette }   writes palette.json (dev server only)
//   GET  /__helper/vibes                 the kit's vibes, if the game sits inside a kit folder
//   POST /__helper/vibe { id }           puts one on (writes palette.json, or runs the kit's tools/vibes/apply.mjs)

import { look, applyLookToUI } from '../look.js';

const G_COL = 'Palette: colours', G_SKY = 'Palette: sky', G_LIGHT = 'Palette: light and sun', G_LOOK = 'Look';
const LATER = 'Shows after "Save palette" (the page loads again).';

const COLOURS = [
  ['base0', 'Ground', () => look.base[0], (v) => { look.base[0] = v; }, 'Most of the world: the main ground colour.'],
  ['base1', 'Ground, darker partner', () => look.base[1], (v) => { look.base[1] = v; }, 'The second ground colour, for variety and shade.'],
  ['base2', 'Rock, walls, buildings', () => look.base[2], (v) => { look.base[2] = v; }, 'Structures: rock, walls, big shapes.'],
  ['base3', 'Paths, smaller structures', () => look.base[3], (v) => { look.base[3] = v; }, 'Paths and secondary structures.'],
  ['accent0', 'Things that matter', () => look.accent[0], (v) => { look.accent[0] = v; }, 'Pickups, the goal, the thing to follow. Also the colour of the main button.'],
  ['accent1', 'Second accent', () => look.accent[1], (v) => { look.accent[1] = v; }, 'A partner for the accent colour. Keep accents rare.'],
  ['danger', 'Things that hurt', () => look.danger, (v) => { look.danger = v; }, 'Only for things that hurt the player.'],
  ['player', 'The player', () => look.player, (v) => { look.player = v; }, 'The player\'s own colour. It should stand out from the ground.'],
  ['shadow', 'Darkest shade', () => look.shadow, (v) => { look.shadow = v; }, 'Undersides, far shapes, drop shadows. Also the colour of the cards.'],
  ['light', 'Brightest shade', () => look.light, (v) => { look.light = v; }, 'Highlights, glows, sparks.'],
  ['ink', 'Text over the game', () => look.ink, (v) => { look.ink = v; }, 'Text and lines drawn over the game. Changes at once.'],
];
const SKY = [
  ['top', 'Sky, high up'], ['horizon', 'Sky at the horizon'], ['below', 'Below the horizon'], ['sun', 'Glow around the sun'],
];
const LIGHT_COLOURS = [
  ['sun', 'Sunlight colour'], ['ambient', 'Light from the sky'], ['ground', 'Light bounced off the ground'], ['fog', 'Mist colour'],
];
const LIGHT_NUMBERS = [
  ['exposure', 'Brightness', 0.2, 3, 0.05, 'How bright the whole picture is. Changes at once.'],
  ['sunElevation', 'Sun height (degrees)', 0, 90, 1, `0 = on the horizon (long shadows), 90 = straight above. ${LATER}`],
  ['sunAzimuth', 'Sun direction (degrees)', 0, 360, 1, `Which way the light comes from, round the compass. ${LATER}`],
  ['sunStrength', 'Sunlight strength', 0, 8, 0.1, `0 = no direct sun. ${LATER}`],
  ['ambientStrength', 'Brightness in the shade', 0, 4, 0.05, `How bright the parts are that the sun does not reach. ${LATER}`],
  ['fogAmount', 'Mist', 0, 1, 0.01, `0 = clear to the edge of sight, 1 = thick. ${LATER}`],
];

/**
 * @param {object} a { tuning, view, canSave, say(text), getMode(), copy(text) -> Promise<boolean> }
 * @returns {{ shortList: Array, changed(): number, vibes: Promise }}
 */
export function createLookEditor({ tuning, view, canSave, say, getMode, copy }) {
  const ids = [];
  const add = (def) => { ids.push(def.id); tuning.add({ save: false, ...def }); };
  const ui = () => { try { applyLookToUI(); } catch { /* a game without the starter's UI */ } };

  for (const [key, label, get, set, hint] of COLOURS) {
    add({ id: `palette.${key}`, kind: 'color', group: G_COL, label, hint: key === 'ink' ? hint : `${hint} ${['accent0', 'shadow', 'danger'].includes(key) ? 'The cards and buttons change at once; the world after "Save palette".' : LATER}`, get, set: (v) => { set(v); ui(); } });
  }
  for (const [key, label] of SKY) {
    add({ id: `palette.sky.${key}`, kind: 'color', group: G_SKY, label, hint: LATER, get: () => look.sky[key], set: (v) => { look.sky[key] = v; } });
  }
  for (const [key, label, min, max, step, hint] of LIGHT_NUMBERS) {
    add({
      id: `palette.${key}`, kind: 'num', group: G_LIGHT, label, hint, min, max, step,
      get: () => look.lighting[key],
      set: (v) => {
        look.lighting[key] = v;
        if (key === 'exposure' && view?.renderer) view.renderer.toneMappingExposure = v;
      },
    });
  }
  for (const [key, label] of LIGHT_COLOURS) {
    add({ id: `palette.light.${key}`, kind: 'color', group: G_LIGHT, label, hint: LATER, get: () => look.lighting[key], set: (v) => { look.lighting[key] = v; } });
  }

  const changed = () => ids.filter((id) => tuning.changed(id)).length;

  /** palette.json as the game reads it, with the current values */
  function palette() {
    const L = look.lighting;
    return {
      name: look.name,
      colors: { base: [...look.base], accent: [...look.accent], danger: look.danger, player: look.player, shadow: look.shadow, light: look.light, ink: look.ink },
      sky: { top: look.sky.top, horizon: look.sky.horizon, below: look.sky.below, sun: look.sky.sun },
      light: {
        sun: L.sun, sunStrength: L.sunStrength, ambient: L.ambient, ground: L.ground, ambientStrength: L.ambientStrength,
        fog: L.fog, fogAmount: L.fogAmount, exposure: L.exposure, sunElevation: L.sunElevation, sunAzimuth: L.sunAzimuth,
      },
      notes: look.notes || 'The game reads this file (src/core/look.js): change a colour here and the whole game follows.',
    };
  }

  /** Load the page again at the same address (a run in progress starts again by itself, so the game stays on screen). */
  function reload() {
    const p = new URLSearchParams(location.search);
    if (getMode?.() === 'playing' || getMode?.() === 'paused') p.set('autostart', '1');
    const next = p.toString();
    if (next !== location.search.replace(/^\?/, '')) location.search = next;
    else location.reload();
  }

  async function post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.ok) throw new Error(out.error || `HTTP ${res.status}`);
    return out;
  }

  if (canSave) {
    add({
      id: 'palette.save', kind: 'button', group: G_LOOK, label: 'Save palette for my agent',
      hint: 'Writes these colours and light into palette.json, then loads the page again so the whole world takes them. The address stays the same.',
      run: async () => {
        try { await post('/__helper/palette', { palette: palette() }); say('Saved palette.json. Loading the game again...'); reload(); }
        catch (err) { say(`Could not save the palette (${err.message}). Use "Copy palette" and paste it to your agent.`); }
      },
    });
  }
  add({
    id: 'palette.copy', kind: 'button', group: G_LOOK, label: 'Copy palette',
    hint: 'The colours and light as text (a whole palette.json): paste it to your agent.',
    run: async () => { say((await copy(JSON.stringify(palette(), null, 2))) ? 'Palette copied. Paste it to your agent ("make this my palette.json").' : 'Could not reach the clipboard.'); },
  });
  add({
    id: 'palette.undo', kind: 'button', group: G_LOOK, label: 'Undo colour changes',
    hint: 'Put every colour and light number back to what palette.json says.',
    run: () => { for (const id of ids) if (tuning.changed(id)) tuning.reset(id); say('Colours and light are back to palette.json.'); },
  });

  // ---- vibes: whole looks from the kit, flipped through while the game is on screen
  const vibeState = { list: null, current: null, error: '' };
  async function putOn(id) {
    const v = vibeState.list?.find((x) => x.id === id);
    if (!v) return;
    say(`Putting on "${v.name}"...`);
    try {
      await post('/__helper/vibe', { id });
      tuning.setUi('vibe', id);
      say(`"${v.name}" is on. Loading the game again...`);
      reload();
    } catch (err) { say(`Could not put on "${v.name}" (${err.message}).`); }
  }
  const vibes = !canSave ? Promise.resolve(null) : fetch('/__helper/vibes')
    .then((r) => (r.ok ? r.json() : null))
    .then((out) => {
      const list = Array.isArray(out?.vibes) ? out.vibes : [];
      vibeState.list = list;
      vibeState.current = out?.current ?? null;
      if (!list.length) {
        add({ id: 'palette.vibe', kind: 'readout', group: G_LOOK, label: 'Vibes', hint: 'Vibes are ready-made looks that come with the kit (its vibes/ folder).', read: () => 'None found: this game is not inside a kit folder.' });
        return list;
      }
      add({
        id: 'palette.vibe', kind: 'custom', group: G_LOOK, label: 'Vibe',
        hint: 'A vibe is a whole look from the kit: colours, light and sometimes a drawing style. Putting one on replaces palette.json and loads the page again.',
        search: list.map((v) => `${v.name} ${v.id}`).join(' '),
        build(el, h) {
          el.classList.add('vibe');
          const top = h('div', 'vrow');
          const name = h('span', 'name', 'Vibe');
          const prev = h('button', null, '‹'), next = h('button', null, '›');
          const sel = h('select');
          prev.type = next.type = 'button'; prev.tabIndex = next.tabIndex = sel.tabIndex = -1;
          prev.title = 'Put on the one before (the page loads again)';
          next.title = 'Put on the next one (the page loads again)';
          sel.title = 'Choose a vibe, then "Put it on"';
          list.forEach((v) => { const op = h('option', null, v.name); op.value = v.id; sel.append(op); });
          const start = list.find((v) => v.id === vibeState.current) ? vibeState.current : list.find((v) => v.id === tuning.ui('vibe', null))?.id ?? null;
          if (start) sel.value = start; else { const none = h('option', null, 'Choose...'); none.value = ''; sel.prepend(none); sel.value = ''; }
          const go = h('button', 'go', 'Put it on');
          go.type = 'button'; go.tabIndex = -1; go.title = 'Use this vibe: replaces palette.json and loads the page again';
          top.append(name, prev, sel, next, go);
          const chips = h('div', 'chips');
          const line = h('p', 'vline');
          el.append(top, chips, line);
          const show = () => {
            const v = list.find((x) => x.id === sel.value);
            chips.textContent = '';
            for (const c of v?.swatch ?? []) { const i = h('i'); i.style.background = c; chips.append(i); }
            line.textContent = v ? `${v.one_line || ''}${v.look && v.look !== 'none' ? `  Drawing style: ${v.look}.` : ''}${v.id === vibeState.current ? '  (on now)' : ''}` : `${list.length} ready-made looks from the kit. ‹ › flips through them.`;
            go.disabled = !v || v.id === vibeState.current;
          };
          const step = (d) => { const i = list.findIndex((x) => x.id === sel.value); const n = list[(i + d + list.length) % list.length] ?? list[0]; sel.value = n.id; show(); putOn(n.id); };
          prev.addEventListener('click', () => { prev.blur(); step(-1); });
          next.addEventListener('click', () => { next.blur(); step(1); });
          go.addEventListener('click', () => { go.blur(); putOn(sel.value); });
          sel.addEventListener('change', () => { sel.blur(); show(); });
          show();
          return () => {};
        },
      });
      return list;
    })
    .catch(() => { vibeState.list = []; return []; });

  const shortList = [['Look', [
    ['Vibe', 'palette.vibe'],
    ['Brightness', 'palette.exposure'],
    ['Sun height', 'palette.sunElevation'],
    ['Sun direction', 'palette.sunAzimuth'],
    ['Mist', 'palette.fogAmount'],
    ['Ground colour', 'palette.base0'],
    ['Colour of things that matter', 'palette.accent0'],
    ['Colour of the player', 'palette.player'],
    ['Sky colour', 'palette.sky.top'],
    ['Save palette for my agent', 'palette.save'],
    ['Copy palette', 'palette.copy'],
    ['Undo colour changes', 'palette.undo'],
  ]]];

  return { shortList, changed, vibes, palette, vibeState, ids };
}
