// Tunable numbers ("tuning"), and the dev panel that changes them while the game runs.
//
// The numbers live in src/tuning.json, grouped:
//   { "player": { "runSpeed": { "value": 6.5, "min": 2, "max": 14, "step": 0.1,
//                               "label": "Run speed", "help": "Metres per second." } } }
// A value can also be true/false (shown as a checkbox).
//
// In code, read them through `tune`, every time you need them (so panel changes apply at once):
//   import { tune } from '../core/settings.js';
//   speed = tune.player.runSpeed;
//
// Add one from code without touching the JSON (it is written into tuning.json on the next save):
//   define('enemy', 'chaseSpeed', { value: 4, min: 0, max: 10, step: 0.1, label: 'Chase speed' });
//
// The panel: press the backquote key (`, top-left of most keyboards). Changed rows turn amber.
// "Save for my agent" writes every value into src/tuning.json (dev server only), so the
// agent sees exactly what the player liked. "Copy" puts the changed values on the clipboard.

import tuningFile from '../tuning.json';

const defs = structuredClone(tuningFile); // group -> id -> { value, min, max, ... }
export const tune = {}; // group -> id -> current value (what the game reads)
let baseline = {}; // values in the file (to highlight changes)

for (const [group, items] of Object.entries(defs)) {
  tune[group] = {};
  baseline[group] = {};
  for (const [id, def] of Object.entries(items)) {
    tune[group][id] = def.value;
    baseline[group][id] = def.value;
  }
}

export function define(group, id, def) {
  defs[group] ??= {};
  tune[group] ??= {};
  baseline[group] ??= {};
  if (!(id in defs[group])) {
    defs[group][id] = { ...def };
    tune[group][id] = def.value;
    baseline[group][id] = def.value;
    panel?.rebuild();
  }
  return tune[group][id];
}

export function set(group, id, value) {
  tune[group][id] = value;
  panel?.refresh();
}

// Values that differ from the file, flat: { "player.runSpeed": 8 }
export function changedValues() {
  const out = {};
  for (const [group, items] of Object.entries(tune)) {
    for (const [id, v] of Object.entries(items)) {
      if (v !== baseline[group][id]) out[`${group}.${id}`] = v;
    }
  }
  return out;
}

// The full file contents with the current values.
function fileWithCurrentValues() {
  const out = structuredClone(defs);
  for (const [group, items] of Object.entries(out)) {
    for (const id of Object.keys(items)) items[id].value = tune[group][id];
  }
  return out;
}

const title = (s) => s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

let panel = null;

// enabled: show the panel at all. canSave: the dev server is there to receive "Save for my agent".
export function installSettingsPanel({ enabled = true, canSave = false } = {}) {
  if (!enabled) return null;

  const root = document.createElement('aside');
  root.className = 'dev-panel';
  root.hidden = true;
  document.body.appendChild(root);

  const rows = []; // { group, id, row, slider, number, check }
  let status = null;

  function build() {
    root.innerHTML = '';
    rows.length = 0;

    const head = document.createElement('header');
    head.innerHTML = '<strong>Tuning</strong><span class="dev-panel-hint">` to close</span>';
    root.appendChild(head);

    const body = document.createElement('div');
    body.className = 'dev-panel-body';
    root.appendChild(body);

    for (const [group, items] of Object.entries(defs)) {
      const box = document.createElement('details');
      box.open = true;
      const sum = document.createElement('summary');
      sum.textContent = title(group);
      box.appendChild(sum);

      for (const [id, def] of Object.entries(items)) {
        const row = document.createElement('label');
        row.className = 'dev-row';
        row.title = `${def.help ?? ''}${def.help ? '\n' : ''}${group}.${id}`;
        const name = document.createElement('span');
        name.className = 'dev-name';
        name.textContent = def.label ?? title(id);
        row.appendChild(name);

        const entry = { group, id, row };
        if (typeof def.value === 'boolean') {
          const check = document.createElement('input');
          check.type = 'checkbox';
          check.addEventListener('change', () => {
            tune[group][id] = check.checked;
            refresh();
          });
          row.appendChild(check);
          entry.check = check;
        } else {
          const slider = document.createElement('input');
          slider.type = 'range';
          slider.min = def.min ?? 0;
          slider.max = def.max ?? Math.max(1, def.value * 2);
          slider.step = def.step ?? 0.01;
          const number = document.createElement('input');
          number.type = 'number';
          number.step = slider.step;
          const apply = (v) => {
            const n = Number(v);
            if (Number.isFinite(n)) tune[group][id] = n;
            refresh();
          };
          slider.addEventListener('input', () => apply(slider.value));
          slider.addEventListener('change', () => slider.blur()); // arrows go back to the game
          number.addEventListener('change', () => apply(number.value));
          row.append(slider, number);
          Object.assign(entry, { slider, number });
        }
        // Click the name of a changed row to put it back.
        name.addEventListener('click', (e) => {
          if (tune[group][id] === baseline[group][id]) return;
          e.preventDefault();
          tune[group][id] = baseline[group][id];
          refresh();
        });
        rows.push(entry);
        box.appendChild(row);
      }
      body.appendChild(box);
    }

    const foot = document.createElement('footer');
    const save = button('Save for my agent', async () => {
      try {
        const res = await fetch('/__helper/tuning', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ values: fileWithCurrentValues() }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        baseline = structuredClone(tune);
        say('Saved to src/tuning.json. Your agent will see it.');
        refresh();
      } catch (err) {
        say(`Could not save (${err.message}). Use Copy instead.`);
      }
    });
    save.hidden = !canSave;
    const copy = button('Copy', async () => {
      const text = JSON.stringify(changedValues(), null, 2);
      try {
        await navigator.clipboard.writeText(text);
        say('Changed values copied. Paste them to your agent.');
      } catch {
        say(text);
      }
    });
    const reset = button('Reset all', () => {
      for (const [group, items] of Object.entries(baseline)) Object.assign(tune[group], items);
      refresh();
    });
    foot.append(save, copy, reset);
    status = document.createElement('p');
    status.className = 'dev-status';
    foot.appendChild(status);
    root.appendChild(foot);
    refresh();
  }

  function button(text, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }

  function say(text) {
    status.textContent = text;
  }

  function refresh() {
    for (const r of rows) {
      const v = tune[r.group][r.id];
      if (r.check) r.check.checked = v;
      else {
        r.slider.value = v;
        if (document.activeElement !== r.number) r.number.value = Math.round(v * 1000) / 1000;
      }
      r.row.classList.toggle('changed', v !== baseline[r.group][r.id]);
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote') return;
    if (e.target?.tagName === 'TEXTAREA') return;
    e.preventDefault();
    root.hidden = !root.hidden;
    if (!root.hidden) refresh();
  });

  panel = { root, rebuild: build, refresh, toggle: () => (root.hidden = !root.hidden) };
  build();
  return panel;
}
