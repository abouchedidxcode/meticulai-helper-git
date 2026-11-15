// Skip buttons and named moments for testing (?test=1).
//
// The game registers moments it can jump to:
//   testmode.add('last-spark', 'Last spark', () => { ... });
// Then:
//   - with ?test=1 a button "Last spark" appears top-right,
//   - window.__game.skipTo('last-spark') runs it (from tools/play/record.mjs: `skip last-spark`).
// Good moments to register: 'start' (skip the intro), 'level2', 'boss', 'end', 'invincible'.

export function createTestMode({ enabled }) {
  const moments = new Map(); // name -> { label, run }
  let bar = null;

  if (enabled) {
    bar = document.createElement('nav');
    bar.className = 'test-bar';
    bar.setAttribute('aria-label', 'Test shortcuts');
    document.body.appendChild(bar);
    document.body.classList.add('test-mode');
  }

  function addButton(name, label, run) {
    if (!bar) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.moment = name;
    b.addEventListener('click', () => {
      run();
      b.blur(); // give the keys back to the game
    });
    bar.appendChild(b);
  }

  return {
    enabled,
    add(name, label, run) {
      moments.set(name, { label, run });
      addButton(name, label, run);
    },
    // A button that isn't a named moment (e.g. "Leave a note").
    addButton(label, run) {
      addButton('', label, run);
    },
    names: () => [...moments.keys()],
    // Every moment with its button text: [{ name, label }] (the dev menu's "Skip to" buttons).
    list: () => [...moments].map(([name, m]) => ({ name, label: m.label })),
    skipTo(name) {
      const m = moments.get(name);
      if (!m) {
        console.warn(`skipTo: no moment called "${name}". Known: ${[...moments.keys()].join(', ')}`);
        return false;
      }
      m.run();
      return true;
    },
  };
}
