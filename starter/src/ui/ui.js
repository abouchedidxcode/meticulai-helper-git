// Screens and HUD, in plain HTML over the canvas (styles in ui.css).
//
//   const ui = createUI({ gameName, tagline, controls });
//   ui.showTitle(onStart)                                   title screen
//   ui.showPause({ onResume, onRestart })                   pause screen (main.js wires Esc)
//   ui.showEnd({ won, heading, reason, stats, onRestart })  end card: ALWAYS say why it ended
//   ui.hideScreens()
//   ui.hud.set('sparks', { icon: 'spark', text: '3 / 12' })
//   ui.hud.set('health', { icon: 'heart', count: 2, max: 3 })
//   ui.hud.punch('sparks')                                  little bump when a number changes
//   ui.toast('Watch the rolling stones', 2500)
//   ui.icon('spark')                                        an inline SVG string
//
// controls: [{ keys: ['W', 'A', 'S', 'D'], label: 'Move' }, ...]

import './ui.css';

// Simple line icons (24x24, stroke = currentColor). Add your own in the same style.
const ICONS = {
  spark: '<path d="M12 3l1.8 6.2L20 12l-6.2 1.8L12 21l-1.8-7.2L4 12l6.2-2.8z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  restart: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v4h4"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h1M10 10h1M14 10h1M18 10h0M7 14h10"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  stone: '<circle cx="12" cy="13" r="7"/><path d="M9 11l2 2M14 10l1 3"/>',
  drop: '<path d="M12 3v14"/><path d="M6 11l6 6 6-6"/><path d="M5 21h14"/>',
  note: '<path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h6"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
};

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createUI({ gameName = 'My Game', tagline = '', controls = [], alwaysShowControls = false } = {}) {
  const root = el('div', 'ui');
  document.body.appendChild(root);

  const hudEl = el('div', 'hud');
  const screen = el('div', 'screen');
  screen.hidden = true;
  const toastEl = el('div', 'toast');
  root.append(hudEl, screen, toastEl);

  const controlsHtml = () =>
    `<div class="controls-card">${controls
      .map((c) => `<div class="control"><span class="keys">${c.keys.map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join('')}</span><span>${escapeHtml(c.label)}</span></div>`)
      .join('')}</div>`;

  if (alwaysShowControls) {
    const fixed = el('div', 'controls-fixed', controlsHtml());
    root.appendChild(fixed);
  }

  let current = null; // which screen is showing
  let keyHandler = null;

  function show(name, html, keys) {
    current = name;
    toastEl.classList.remove('on');
    screen.className = `screen screen-${name}`;
    screen.innerHTML = html;
    screen.hidden = false;
    if (keyHandler) window.removeEventListener('keydown', keyHandler);
    keyHandler = keys ?? null;
    if (keyHandler) window.addEventListener('keydown', keyHandler);
    screen.querySelector('button.primary')?.focus({ preventScroll: true });
  }

  const ui = {
    root,
    icon,
    get screen() {
      return current;
    },

    showTitle(onStart) {
      show(
        'title',
        `<div class="card title-card">
          <h1>${escapeHtml(gameName)}</h1>
          ${tagline ? `<p class="tagline">${escapeHtml(tagline)}</p>` : ''}
          <button type="button" class="primary">${icon('play')}<span>Play</span></button>
          <p class="hint">Press Enter or click Play</p>
          ${controlsHtml()}
        </div>`,
        (e) => {
          if (e.code === 'Enter' || e.code === 'Space') {
            e.preventDefault();
            onStart();
          }
        },
      );
      screen.querySelector('button.primary').addEventListener('click', onStart);
    },

    showPause({ onResume, onRestart }) {
      show(
        'pause',
        `<div class="card">
          <h2>${icon('pause')} Paused</h2>
          <div class="row">
            <button type="button" class="primary resume">${icon('play')}<span>Resume</span></button>
            <button type="button" class="restart">${icon('restart')}<span>Restart</span></button>
          </div>
          <p class="hint">Esc to resume, R to restart</p>
          ${controlsHtml()}
        </div>`,
        (e) => {
          if (e.code === 'KeyR') onRestart();
        },
      );
      screen.querySelector('.resume').addEventListener('click', onResume);
      screen.querySelector('.restart').addEventListener('click', onRestart);
    },

    // The end card says WHY: "A rolling stone hit you" beats "Game over".
    showEnd({ won, heading, reason, stats = [], onRestart }) {
      show(
        'end',
        `<div class="card end-card ${won ? 'won' : 'lost'}">
          <div class="end-icon">${icon(won ? 'spark' : 'flag')}</div>
          <h2>${escapeHtml(heading ?? (won ? 'You did it' : 'Not this time'))}</h2>
          ${reason ? `<p class="reason">${escapeHtml(reason)}</p>` : ''}
          ${stats.length ? `<dl class="stats">${stats.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>` : ''}
          <button type="button" class="primary">${icon('restart')}<span>Play again</span></button>
          <p class="hint">Press Enter</p>
        </div>`,
        (e) => {
          if (e.code === 'Enter') {
            e.preventDefault();
            onRestart();
          }
        },
      );
      screen.querySelector('button.primary').addEventListener('click', onRestart);
    },

    hideScreens() {
      current = null;
      screen.hidden = true;
      screen.innerHTML = '';
      if (keyHandler) window.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    },

    hud: {
      items: new Map(),
      set(id, { icon: iconName, text, count, max }) {
        let item = this.items.get(id);
        if (!item) {
          item = el('div', `hud-item hud-${id}`);
          hudEl.appendChild(item);
          this.items.set(id, item);
        }
        let html;
        if (max !== undefined) {
          html = Array.from({ length: max }, (_, i) => icon(iconName, i < count ? 'full' : 'empty')).join('');
        } else {
          html = `${icon(iconName)}<span>${escapeHtml(text)}</span>`;
        }
        if (item.innerHTML !== html) item.innerHTML = html;
      },
      punch(id) {
        const item = this.items.get(id);
        if (!item) return;
        item.classList.remove('punch');
        void item.offsetWidth; // restart the CSS animation
        item.classList.add('punch');
      },
      show(on) {
        hudEl.hidden = !on;
      },
    },

    toast(text, ms = 2200) {
      toastEl.textContent = text;
      toastEl.classList.add('on');
      clearTimeout(ui._toastTimer);
      ui._toastTimer = setTimeout(() => toastEl.classList.remove('on'), ms);
    },
  };
  return ui;
}
