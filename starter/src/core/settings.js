// Tunable numbers ("tuning"), and the dev menu that changes them while the game runs.
//
// The numbers live in src/tuning.json, grouped:
//   { "player": { "runSpeed": { "value": 6.5, "min": 2, "max": 14, "step": 0.1,
//                               "label": "Run speed", "help": "Metres per second." } } }
// A value can also be true/false (a switch), have "options": ["day", "dusk"] (a choice), or be "#rrggbb" (a colour).
//
// In code, read them through `tune`, every time you need them (so menu changes apply at once):
//   import { tune } from '../core/settings.js';
//   speed = tune.player.runSpeed;
//
// Add one from code without touching the JSON (it is written into tuning.json on the next save):
//   define('enemy', 'chaseSpeed', { value: 4, min: 0, max: 10, step: 0.1, label: 'Chase speed' });
//
// THE DEV MENU: press the backquote key (`, top-left of most keyboards) or F2. It is on in the dev server and on
// ?test=1 pages; in a shipped game only with ?dev=1 in the address (for the maker, never for players). ?dev=0 hides
// it, ?dev=open opens it at once. It has every number above as a slider, and tools that work on any game: freeze,
// step, speed, a free camera, hide the HUD, screenshot, restart, the computer playing, skip buttons, colours and
// light, vibes, sound. "Save for my agent" writes every value into src/tuning.json (dev server only).
//
// A game adds its own things with `dev` (also ctx.dev inside createGame). Each is one line, and does nothing at all
// in a shipped game:
//   dev.button('Cheats', 'Give 10 coins', () => { coins += 10; });
//   dev.toggle('Cheats', 'Walk through walls', () => noclip, (on) => { noclip = on; });
//   dev.readout('Player', 'Speed', () => speed.toFixed(1) + ' m/s');
//   dev.pick('World', 'Level', ['1', '2', '3'], () => level, (v) => loadLevel(v));
//   dev.slider('World', 'Time of day', () => hour, (v) => { hour = v; }, { min: 0, max: 24, step: 0.5 });
//   dev.essentials([['The jump', [['How high', 'player.jumpSpeed', 'A hint in plain words'], ['Weight', 'player.gravity']]]]);
//   dev.presets([{ name: 'Floaty', about: 'Light and slow to fall.', values: { 'player.gravity': 14 } }]);
// Essentials is the short plain-words list the menu opens on (ids are "<group>.<id>" from tuning.json). Without one
// the menu makes its own from the first few numbers of each group.
//
// The menu's code is in core/dev/ and is only loaded when the menu is on.

import tuningFile from '../tuning.json';
import helper from '../../helper.json';
import { createStarterSettings, slug } from './dev/starter.js';

const params = new URLSearchParams(location.search);
const has = (name) => params.has(name) && params.get(name) !== '0' && params.get(name) !== 'false';
const devMode = params.get('dev') !== '0' && (import.meta.env.DEV || has('test') || has('dev'));

export const { tune, define, set, changedValues, installSettingsPanel, tuning, dev } = createStarterSettings(tuningFile, {
  storageKey: `${slug(helper.gameName) || 'my-game'}.tuning`, // kept changes are per game
  gameName: helper.gameName,
  devMode,
  forced: has('dev'),
});
