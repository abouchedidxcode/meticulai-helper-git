// The dev menu, put together: the panel (panel.js), the game-wide tools (tools.js) and the Look controls
// (lookedit.js). Loaded by ../settings.js only when the menu is on (the dev server, ?test=1, or ?dev=1), so a
// shipped game never downloads it for its players.

import { createPanel } from './panel.js';
import { createTools } from './tools.js';
import { createLookEditor } from './lookedit.js';

/**
 * @param {object} a { tuning, tune, canSave, save, game, params }
 *   game = what main.js handed over (all optional): { name, loop, view, input, audio, testmode, notes, flags,
 *          pointerLock, getGame, getMode, restart }
 */
export function installMenu({ tuning, tune, canSave, save, game = {}, params = new URLSearchParams(location.search) }) {
  let panel = null;
  const tools = createTools({ ...game, tune }, {
    canSave,
    say: (t) => panel?.say(t),
    flash: (t, ms) => panel?.flash(t, ms),
  });

  // ---- sound: the three volumes are tuning values already; the switch is for working in silence
  if (tools.has.mute) {
    tuning.add({
      id: 'dev.mute', kind: 'bool', group: 'Audio', label: 'Mute', save: false,
      hint: 'Silence the game while you work. Kept in this browser only: it is not saved into the game.',
      get: () => tools.muted,
      set: (v) => { tools.setMuted(v); tuning.setUi('mute', !!v); },
    });
    if (tuning.ui('mute', false)) tools.setMuted(true);
    // touching the main volume means you want to hear it
    tuning.onChange((it) => { if (it?.id === 'audio.master' && tools.muted) { tools.setMuted(false); tuning.setUi('mute', false); } });
  }

  // ---- look: palette roles, light, vibes
  const lookEd = createLookEditor({
    tuning, view: game.view, canSave,
    say: (t) => panel?.say(t),
    getMode: game.getMode,
    copy: (t) => panel.copyText(t),
  });

  // ---- skip buttons: every moment the game registered with testmode.add (the same list ?test=1 shows)
  function syncMoments() {
    const tm = game.testmode;
    if (!tm) return;
    const list = tm.list?.() ?? tm.names?.().map((name) => ({ name, label: name })) ?? [];
    for (const m of list) {
      const id = `skip.${m.name}`;
      if (tuning.item(id)) continue;
      tuning.add({
        id, kind: 'button', group: 'Skip to', label: m.label || m.name, save: false, dev: true,
        hint: `Jump straight to this moment. (For your agent: __game.skipTo('${m.name}').)`,
        run: () => tm.skipTo(m.name),
      });
    }
  }

  // In a hidden test browser (recordings, previews, checks) nothing of the menu shows unless the address asks.
  const asked = params.get('dev');
  const hiddenBrowser = !!navigator.webdriver;
  const shown = !hiddenBrowser || (asked !== null && asked !== '0' && asked !== 'false');
  panel = createPanel(tuning, {
    tools, canSave, save,
    gameName: game.name,
    showTab: shown,
    open: asked === 'open' || (!hiddenBrowser && tuning.ui('open', false)),
    beforeBuild: syncMoments,
    shortExtras: () => [
      ['Sound', [['Everything', 'audio.master'], ['Music', 'audio.music'], ['Sound effects', 'audio.sfx'], ['Mute', 'dev.mute']]],
      ...lookEd.shortList,
    ],
  });
  lookEd.vibes.then(() => panel.rebuild());

  return {
    tools, panel, look: lookEd,
    holdsMouse: () => panel.open || tools.fly,
    setOpen: (on) => panel.setOpen(on),
    refresh: () => panel.refresh(),
    state: () => ({
      on: true, loaded: true, shown, open: panel.open, built: panel.built, view: panel.view, width: panel.width,
      frozen: tools.frozen, speed: tools.speed, fly: tools.fly, noHud: tools.noHud, muted: tools.muted, bot: tools.bot,
      controls: tuning.items().length, rows: panel.rows(), changed: tuning.count(),
      missingEssentials: tuning.missingEssentials(), presetProblems: tuning.checkPresets(),
      paletteChanged: lookEd.changed(), vibes: lookEd.vibeState.list?.length ?? null,
      stats: tools.stats(),
    }),
  };
}
