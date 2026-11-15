// The racing HUD the base UI doesn't have: a big centre banner (3, 2, 1, GO, FINAL LAP,
// WRONG WAY), a speed read-out, the drift-boost meter and the running order. Plain HTML over
// the canvas. Colours come from the palette: text is look.ink with a halo of the opposite
// brightness (so it reads over a bright sky and a dark road alike), and the panel text is
// checked against the panel so it stays readable in every palette. Position, lap and times
// use the base ui.hud (see game.js).
//
// All timing is counted in game steps (update(dt)), never with wall-clock timers.

const CSS = `
.race-banner { position: fixed; left: 50%; top: 31%; transform: translate(-50%, -50%) scale(0.8); pointer-events: none; z-index: 4;
  font: 800 84px/1 system-ui, sans-serif; letter-spacing: 0.02em; color: var(--race-ink); opacity: 0; white-space: nowrap;
  text-shadow: 0 3px 0 var(--race-halo), 0 0 22px var(--race-halo); transition: opacity 0.12s, transform 0.12s; }
.race-banner.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.race-banner.small { font-size: 38px; }
.race-banner.accent { color: var(--accent); }
.race-banner.danger { color: var(--danger); }
.race-banner small { display: block; font-size: 20px; font-weight: 600; margin-top: 10px; letter-spacing: 0.04em; }
.race-speed { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); pointer-events: none; z-index: 4; text-align: center; color: var(--race-ink);
  font: 800 56px/1 system-ui, sans-serif; font-variant-numeric: tabular-nums; text-shadow: 0 2px 0 var(--race-halo), 0 0 16px var(--race-halo); }
.race-speed small { font-size: 16px; font-weight: 600; margin-left: 6px; opacity: 0.85; }
.race-boost { width: 190px; height: 10px; margin: 8px auto 0; border-radius: 6px; background: var(--race-panel); overflow: hidden; }
.race-boost i { display: block; height: 100%; width: 0; background: var(--race-panel-ink); border-radius: 6px; }
.race-boost.ready i { background: var(--accent); }
.race-boost.firing i { background: var(--accent); width: 100% !important; opacity: 0.7; }
.race-order { position: fixed; left: 22px; bottom: 22px; pointer-events: none; z-index: 4; color: var(--race-panel-ink); font: 600 15px/1.5 system-ui, sans-serif;
  background: var(--race-panel); border-radius: 10px; padding: 8px 14px; min-width: 120px; }
.race-order b { color: var(--race-you); }
`;

export function createRaceHud(look) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  // Pick colours that read: a dark panel with pale text, and a halo opposite to the ink.
  const dark = (c) => look.luminance(c) < 0.12;
  const panel = dark(look.shadow) ? look.shadow : look.shade(look.shadow, -0.6);
  const vars = {
    '--race-ink': look.ink,
    '--race-halo': dark(look.ink) ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.32)',
    '--race-panel': `${panel}cc`,
    '--race-panel-ink': look.shade(look.light, 0.6),
    '--race-you': dark(look.accent[0]) ? look.shade(look.accent[0], 0.5) : look.accent[0],
  };
  for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  const make = (cls, html = '') => {
    const e = document.createElement('div');
    e.className = cls;
    e.innerHTML = html;
    e.hidden = true;
    document.body.appendChild(e);
    return e;
  };
  const banner = make('race-banner');
  const speed = make('race-speed', '<span>0</span><small>km/h</small><div class="race-boost"><i></i></div>');
  const order = make('race-order');
  const number = speed.querySelector('span');
  const meter = speed.querySelector('.race-boost');
  const fill = meter.querySelector('i');
  let left = 0; // seconds the banner stays
  let held = ''; // a banner that stays while a condition lasts (wrong way)
  let shown = '';
  let orderHtml = '';

  const hud = {
    /** Show a banner for `seconds`. kind: '' | 'small' | 'accent' | 'danger' (may be combined). */
    say(text, seconds = 0.9, kind = '', sub = '') {
      banner.className = `race-banner on ${kind}`;
      banner.innerHTML = sub ? `${text}<small>${sub}</small>` : text;
      left = seconds;
      shown = text;
    },
    /** A banner that stays while you keep calling it (call hold('') to drop it). */
    hold(text, sub = '') {
      if (text === held) return;
      held = text;
      if (text) {
        banner.className = 'race-banner on small danger';
        banner.innerHTML = `${text}<small>${sub}</small>`;
        left = 0;
      } else if (left <= 0) banner.classList.remove('on');
    },
    update(dt) {
      if (left > 0) {
        left -= dt;
        if (left <= 0 && !held) banner.classList.remove('on');
        else if (left <= 0) { const h = held; held = ''; hud.hold(h); }
      }
    },
    setSpeed(kmh) {
      const text = String(Math.round(kmh));
      if (number.textContent !== text) number.textContent = text;
    },
    /** share 0..1 of a full charge; ready = enough for a boost; firing = boosting now. */
    setBoost(share, ready, firing) {
      fill.style.width = `${Math.round(share * 100)}%`;
      meter.classList.toggle('ready', ready);
      meter.classList.toggle('firing', firing);
    },
    /** names in race order; `you` = index of the player in that list. */
    setOrder(names, you) {
      const html = names.map((n, i) => (i === you ? `<b>${i + 1}  ${n}</b>` : `${i + 1}  ${n}`)).join('<br>');
      if (html !== orderHtml) order.innerHTML = orderHtml = html;
    },
    show(on) {
      speed.hidden = order.hidden = !on;
      banner.hidden = !on;
      if (!on) { banner.classList.remove('on'); left = 0; held = ''; }
    },
    get text() { return left > 0 || held ? (held || shown) : ''; },
  };
  return hud;
}
