// What is drawn over the view (plain HTML, coloured from the palette):
//   - the crosshair: a dot; a ring when something can be used (it fills while you hold); a danger-coloured
//     lock when a spark would be guided to a shade
//   - the use prompt: "E  Light the lantern"
//   - threat hints: a soft danger-coloured glow on the edge of the screen pointing at every shade that is
//     close but out of view (behind you = bottom of the screen)
//   - a cold rim round the screen that grows as a shade gets very near
// Hearts and the lantern count use the base UI (ui.hud) from game.js.
//
// What to change: the styles in CSS below; how far hints reach (tuning: shades.hintRange).

const CSS = (c) => `
.fp-hud { position: fixed; inset: 0; pointer-events: none; z-index: 5; font-family: var(--font); }
.fp-cross { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%;
  background: ${c.ink}; box-shadow: 0 0 0 1.5px ${c.edge}aa; transition: width .08s, height .08s, margin .08s, background .08s, border-color .08s; border: 0 solid ${c.ink}; }
.fp-cross.use { width: 30px; height: 30px; margin: -15px 0 0 -15px; border: 2.5px solid ${c.accent}; box-shadow: 0 0 10px ${c.accent}aa;
  background: radial-gradient(circle, ${c.accent}00 30%, transparent 31%), conic-gradient(${c.accent}cc var(--p, 0%), ${c.accent}00 0); }
.fp-cross.lock { width: 34px; height: 34px; margin: -17px 0 0 -17px; background: transparent; border: 2.5px dashed ${c.danger}; box-shadow: none; }
.fp-cross.kick { transform: scale(1.5); transition: none; }
.fp-prompt { position: absolute; left: 50%; top: calc(50% + 34px); transform: translateX(-50%); padding: 7px 14px 7px 8px; border-radius: 999px;
  background: ${c.dark}cc; color: ${c.bright}; font-size: 16px; font-weight: 600; white-space: nowrap; opacity: 0; transition: opacity .12s; display: flex; gap: 9px; align-items: center; }
.fp-prompt.on { opacity: 1; }
.fp-prompt kbd { background: ${c.accent}; color: ${c.dark}; border: 0; font-size: 13px; font-weight: 800; padding: 3px 8px; }
.fp-hint { position: absolute; width: 190px; height: 190px; margin: -95px 0 0 -95px; border-radius: 50%; opacity: 0;
  background: radial-gradient(circle, ${c.danger}cc 0%, ${c.danger}55 35%, ${c.danger}00 70%); }
.fp-rim { position: absolute; inset: 0; opacity: 0; background: radial-gradient(ellipse at center, ${c.dark}00 55%, ${c.danger}66 100%); }
`;

export function createHud({ look, count = 6 }) {
  // The crosshair is `ink` (made to read over the game) with an outline of the opposite tone; the prompt is
  // always bright text on a dark pill, whatever the palette.
  const inkIsLight = look.luminance(look.ink) > 0.4;
  const colors = {
    ink: look.ink,
    edge: inkIsLight ? look.shade(look.shadow, -0.6) : look.shade(look.light, 0.6),
    dark: look.shade(look.shadow, -0.6),
    bright: look.shade(look.light, 0.7),
    accent: look.accent[0],
    danger: look.danger,
  };
  const style = document.createElement('style');
  style.textContent = CSS(colors);
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.className = 'fp-hud';
  root.innerHTML = `<div class="fp-rim"></div>${'<div class="fp-hint"></div>'.repeat(count)}<div class="fp-cross"></div><div class="fp-prompt"><kbd>E</kbd><span></span></div>`;
  document.body.appendChild(root);
  const cross = root.querySelector('.fp-cross');
  const prompt = root.querySelector('.fp-prompt');
  const promptText = prompt.querySelector('span');
  const rim = root.querySelector('.fp-rim');
  const hints = [...root.querySelectorAll('.fp-hint')];
  let kick = 0;
  let last = '';

  return {
    show(on) { root.hidden = !on; },
    kick() { kick = 0.09; }, // the crosshair jumps when you act

    // focus: { label } or null (something usable is looked at); lock: a spark would be guided to a shade.
    setAim(focus, lock, progress = 0) {
      cross.style.setProperty('--p', `${Math.round(progress * 100)}%`);
      const cls = `fp-cross${focus ? ' use' : lock ? ' lock' : ''}${kick > 0 ? ' kick' : ''}`;
      if (cross.className !== cls) cross.className = cls;
      const text = focus ? focus.label : '';
      if (text !== last) {
        last = text;
        if (text) promptText.textContent = text;
        prompt.classList.toggle('on', !!text);
      }
    },

    // threats: [{ angle (radians from straight ahead, + = to the right), dist, urgent }], range in metres.
    setThreats(dt, threats, range, halfFov) {
      kick = Math.max(0, kick - dt);
      let rimK = 0;
      hints.forEach((el, i) => {
        const th = threats[i];
        const near = th ? Math.max(0, 1 - th.dist / range) : 0;
        if (th) rimK = Math.max(rimK, Math.max(0, 1 - th.dist / (range * 0.4)));
        // Only for shades you cannot see: the hint fades in as one leaves the view.
        const outside = th ? Math.min(1, Math.max(0, (Math.abs(th.angle) - halfFov * 0.8) / 0.25)) : 0;
        const k = near * outside;
        if (k <= 0.01) { if (el.style.opacity !== '0') el.style.opacity = '0'; return; }
        // Round the edge of the screen: right = right, behind = bottom.
        const x = 50 + Math.sin(th.angle) * 52;
        const y = 50 - Math.cos(th.angle) * 54;
        el.style.left = `${Math.min(101, Math.max(-1, x))}%`;
        el.style.top = `${Math.min(101, Math.max(-1, y))}%`;
        el.style.opacity = String(Math.min(1, (0.25 + 0.75 * k) * (th.urgent ? 1.4 : 1)));
        el.style.transform = `scale(${0.7 + k * 0.9 + (th.urgent ? 0.4 : 0)})`;
      });
      rim.style.opacity = String(Math.min(0.9, rimK));
    },
  };
}
