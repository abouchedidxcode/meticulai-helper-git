// For people working ON the kit: unit tests of the starter's dev menu (no browser).
//   node --test tools/starters/dev-menu.test.mjs
// They test starter/ by default; DEV_MENU_GAME=<game folder> tests another copy (a work copy, or a game).
// The browser half is tools/starters/dev-menu-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GAME = path.resolve(process.env.DEV_MENU_GAME || path.join(KIT, 'starter'));
const load = (rel) => import(pathToFileURL(path.join(GAME, rel)).href);
const { createTuning, parse, flatten, fit } = await load('src/core/dev/tuning.js');
const { createStarterSettings } = await load('src/core/dev/starter.js');
const helperPlugin = (await load('helper-plugin.js')).default;

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}
const fresh = (storage = memStorage()) => createTuning({ storageKey: 't', storage });

// ------------------------------------------------------------------ the registry (from the block's tests) ----

test('registry: captures the default at registration and reports what changed', () => {
  const t = fresh();
  const P = { speed: 6.5, jump: true };
  t.num('Player', 'Speed', P, 'speed', 2, 14, 0.1);
  t.bool('Player', 'Can jump', P, 'jump');
  assert.equal(t.item('player.speed').def, 6.5);
  assert.deepEqual(t.changes(), {});
  t.set('player.speed', 8);
  assert.equal(P.speed, 8);
  assert.ok(t.changed('player.speed'));
  assert.deepEqual(t.changes(), { 'player.speed': 8 });
  t.reset('player.speed');
  assert.equal(P.speed, 6.5);
  assert.deepEqual(t.changes(), {});
});

test('registry: numbers are rounded to the step, may go past the slider, and nonsense is refused', () => {
  const t = fresh();
  const P = { a: 1 };
  t.num('G', 'A', P, 'a', 0, 2, 0.05);
  t.set('g.a', '1,23456789');
  assert.equal(P.a, 1.23457);
  t.set('g.a', 5);
  assert.equal(P.a, 5);
  assert.ok(t.beyond('g.a'));
  assert.equal(t.set('g.a', 'banana'), false);
  assert.equal(P.a, 5);
});

test('registry: pick, colour and bool values are fitted to the control', () => {
  const it = { kind: 'pick', options: ['box', ['ball', 'Ball'], 3] };
  assert.equal(fit(it, 'ball'), 'ball');
  assert.equal(fit(it, '3'), 3);
  assert.equal(fit(it, 'cone'), null);
  assert.equal(fit({ kind: 'color' }, 'F80'), '#ff8800');
  assert.equal(fit({ kind: 'color' }, '#12345'), null);
  assert.equal(fit({ kind: 'bool' }, 'false'), false);
  assert.equal(fit({ kind: 'bool' }, 'yes'), null);
});

test('registry: a colour on a THREE.Color-like object is edited in place', () => {
  const t = fresh();
  const c = { hex: 'ff0000', getHexString() { return this.hex; }, set(v) { this.hex = v.slice(1); } };
  t.color('Look', 'Sky', { sky: c }, 'sky');
  assert.equal(t.get('look.sky'), '#ff0000');
  t.set('look.sky', '#00ff00');
  assert.equal(c.hex, '00ff00');
  assert.ok(t.changed('look.sky'));
});

test('registry: only the diff is stored, and a fresh page re-applies it as each control registers', () => {
  const st = memStorage();
  const a = fresh(st);
  const P = { speed: 6.5, other: 1 };
  a.num('Player', 'Speed', P, 'speed', 2, 14, 0.1);
  a.num('Player', 'Other', P, 'other', 0, 2, 0.1);
  a.set('player.speed', 9);
  const saved = JSON.parse(st.getItem('t'));
  assert.deepEqual(Object.keys(saved.v), ['player.speed']);
  assert.deepEqual(saved.v['player.speed'], { v: 9, base: 6.5 });
  const Q = { speed: 6.5, other: 1 };
  const b = fresh(st);
  b.num('Player', 'Speed', Q, 'speed', 2, 14, 0.1);
  assert.equal(Q.speed, 9);
  assert.equal(b.item('player.speed').def, 6.5, 'the default is still the game\'s, not the stored value');
});

test('registry: a saved value is dropped when the game\'s own default has changed since', () => {
  const st = memStorage();
  const a = fresh(st);
  a.num('Player', 'Speed', { speed: 6.5 }, 'speed', 2, 14, 0.1);
  a.set('player.speed', 9);
  const Q = { speed: 7 };
  const b = fresh(st);
  b.num('Player', 'Speed', Q, 'speed', 2, 14, 0.1);
  assert.equal(Q.speed, 7);
  assert.deepEqual(b.dropped, ['player.speed']);
  assert.deepEqual(b.changes(), {});
});

test('registry: useStored: false ignores earlier values', () => {
  const st = memStorage();
  const a = fresh(st);
  a.num('G', 'X', { x: 1 }, 'x', 0, 2, 0.1);
  a.set('g.x', 2);
  const b = createTuning({ storageKey: 't', storage: st, useStored: false });
  const Q = { x: 1 };
  b.num('G', 'X', Q, 'x', 0, 2, 0.1);
  assert.equal(Q.x, 1);
});

test('registry: copies a header line and compact JSON, and pastes it back', () => {
  const t = fresh();
  const P = { a: 1, b: false };
  t.num('G', 'A', P, 'a', 0, 5, 0.5);
  t.bool('G', 'B', P, 'b');
  t.set('g.a', 2.5);
  t.set('g.b', true);
  const text = t.copyText({ title: 'My Game', when: new Date('2026-11-14T10:00:00Z') });
  const [head, body] = text.split('\n');
  assert.match(head, /^\/\/ My Game 2026-11-14 10:00: 2 values changed/);
  assert.equal(body, '{"g.a":2.5,"g.b":true}');
  t.resetAll();
  assert.equal(P.a, 1);
  const r = t.apply(parse('Here you go:\n```\n' + text + '\n```'));
  assert.deepEqual(r.used.sort(), ['g.a', 'g.b']);
  assert.equal(P.a, 2.5);
  assert.equal(P.b, true);
});

test('registry: paste accepts the tuning.json shape and the old { tune } shape', () => {
  assert.deepEqual(flatten({ player: { runSpeed: { value: 8, min: 2 } }, feel: { invincible: true } }), { 'player.runSpeed': 8, 'feel.invincible': true });
  assert.deepEqual(flatten({ tune: { 'a.b': 1 } }), { 'a.b': 1 });
  assert.equal(parse('no json here'), null);
});

test('registry: apply: replace puts the rest back, on top keeps it; unknown ids are kept for later', () => {
  const t = fresh();
  const P = { a: 1, b: 1 };
  t.num('G', 'A', P, 'a', 0, 5, 1);
  t.num('G', 'B', P, 'b', 0, 5, 1);
  t.set('g.a', 3);
  t.apply({ 'g.b': 4 }, false);
  assert.deepEqual([P.a, P.b], [3, 4]);
  const r = t.apply({ 'g.b': 2, 'later.c': 7 }, true);
  assert.deepEqual([P.a, P.b], [1, 2]);
  assert.deepEqual(r.unknown, ['later.c']);
  const Q = { c: 0 };
  t.num('Later', 'C', Q, 'c', 0, 10, 1);
  assert.equal(Q.c, 7, 'a control that registers late still gets its value');
});

test('registry: keeps three slots to compare feels', () => {
  const t = fresh();
  const P = { a: 1 };
  t.num('G', 'A', P, 'a', 0, 10, 1);
  t.set('g.a', 3);
  t.saveSlot('A');
  t.set('g.a', 7);
  t.saveSlot('B');
  assert.equal(t.activeSlot(), 'B');
  t.loadSlot('A');
  assert.equal(P.a, 3);
  assert.equal(t.activeSlot(), 'A');
  assert.equal(t.loadSlot('C'), false);
});

test('registry: presets apply on top of the defaults without piling up, and checkPresets finds stale keys', () => {
  const t = fresh();
  const P = { a: 1, b: 1 };
  t.num('G', 'A', P, 'a', 0, 10, 1);
  t.num('G', 'B', P, 'b', 0, 10, 1);
  t.addPresets([
    { name: 'Fast', about: 'quick', values: { 'g.a': 5 } },
    { name: 'Slow', about: 'calm', values: { 'g.b': 0, 'g.gone': 1, 'g.a': 99 } },
  ]);
  t.applyPreset('fast');
  assert.deepEqual([P.a, P.b], [5, 1]);
  assert.equal(t.activePreset(), 'fast');
  t.applyPreset('slow');
  assert.deepEqual([P.a, P.b], [99, 0], 'Fast\'s value did not stay');
  const problems = t.checkPresets().map((p) => `${p.id}: ${p.problem}`);
  assert.deepEqual(problems.sort(), ['g.a: out of range (0..10)', 'g.gone: no such control']);
});

test('registry: save: false keeps a control out of storage and copies; buttons and readouts are not values', () => {
  const st = memStorage();
  const t = fresh(st);
  const D = { god: false };
  let ran = 0;
  t.bool('Debug', 'God mode', D, 'god', { save: false });
  t.button('Debug', 'Kick', () => ran++);
  t.readout('Debug', 'Height', () => '1 m');
  t.set('debug.god', true);
  assert.equal(D.god, true);
  assert.deepEqual(t.changes(), {});
  assert.deepEqual(JSON.parse(st.getItem('t')).v, {});
  t.item('debug.kick').run();
  assert.equal(ran, 1);
  assert.equal(t.get('debug.height'), undefined);
});

test('registry: registering an id again keeps the first default (hot reload)', () => {
  const t = fresh();
  const P = { a: 1 };
  t.num('G', 'A', P, 'a', 0, 10, 1);
  t.set('g.a', 4);
  t.num('G', 'A', P, 'a', 0, 10, 1);
  assert.equal(t.item('g.a').def, 1);
  assert.ok(t.changed('g.a'));
});

test('registry: group() chains the shorthands', () => {
  const t = fresh();
  const P = { a: 1, b: true };
  t.group('Player').num('A', P, 'a', 0, 2, 0.1).bool('B', P, 'b');
  assert.deepEqual(t.items().map((i) => i.id), ['player.a', 'player.b']);
});

test('registry: rebase makes the current values the defaults, only for the ids given', () => {
  const t = fresh();
  const P = { a: 1, b: 1 };
  t.num('G', 'A', P, 'a', 0, 10, 1);
  t.num('G', 'B', P, 'b', 0, 10, 1);
  t.set('g.a', 5);
  t.set('g.b', 6);
  t.rebase(['g.a']);
  assert.deepEqual(t.changes(), { 'g.b': 6 });
  assert.equal(t.item('g.a').def, 5);
});

test('registry: essentials list the ids that match no control', () => {
  const t = fresh();
  t.num('G', 'A', { a: 1 }, 'a', 0, 10, 1);
  t.setEssentials([['Main', [['The A', 'g.a'], ['Gone', 'g.zzz']]]]);
  assert.deepEqual(t.missingEssentials(), ['g.zzz']);
});

// ------------------------------------------------------------------ settings.js: the exports game code uses ----

const FILE = {
  player: {
    runSpeed: { value: 6.5, min: 2, max: 14, step: 0.1, label: 'Run speed', help: 'Top speed.' },
    gravity: { value: 26, min: 8, max: 60, step: 0.5 },
  },
  feel: { invincible: { value: false, label: 'Invincible' } },
  look: { sky: { value: '#88aaff' }, mood: { value: 'calm', options: ['calm', 'storm'] } },
};
const settings = (o = {}) => createStarterSettings(FILE, { storage: memStorage(), loadMenu: async () => ({ installMenu: () => ({ fake: true }) }), ...o });

test('tune holds the file values, grouped the same way, and the file is not mutated', () => {
  const s = settings();
  assert.equal(s.tune.player.runSpeed, 6.5);
  assert.equal(s.tune.feel.invincible, false);
  assert.equal(s.tuning.item('player.gravity').label, 'Gravity');
  assert.equal(s.tuning.item('player.runSpeed').hint, 'Top speed.');
  assert.equal(s.tuning.item('feel.invincible').kind, 'bool');
  assert.equal(s.tuning.item('look.sky').kind, 'color');
  assert.equal(s.tuning.item('look.mood').kind, 'pick');
  s.set('player', 'runSpeed', 9);
  assert.equal(s.tune.player.runSpeed, 9);
  assert.equal(FILE.player.runSpeed.value, 6.5);
});

test('changedValues uses the old "group.id" keys, including values the game sets directly', () => {
  const s = settings();
  s.set('player', 'runSpeed', 8);
  s.tune.feel.invincible = true; // the island's cheat key writes tune directly
  assert.deepEqual(s.changedValues(), { 'player.runSpeed': 8, 'feel.invincible': true });
});

test('define adds a value from code and it goes into the saved file', () => {
  const s = settings();
  assert.equal(s.define('enemy', 'chaseSpeed', { value: 4, min: 0, max: 10, step: 0.1, label: 'Chase speed' }), 4);
  assert.equal(s.define('enemy', 'chaseSpeed', { value: 99 }), 4, 'a second define does not replace it');
  assert.equal(s.tune.enemy.chaseSpeed, 4);
  s.set('enemy', 'chaseSpeed', 5);
  const out = s.fileWithCurrentValues();
  assert.deepEqual(out.enemy.chaseSpeed, { value: 5, min: 0, max: 10, step: 0.1, label: 'Chase speed' });
  assert.deepEqual(Object.keys(out), ['player', 'feel', 'look', 'enemy']);
});

test('"Save for my agent" posts { values } in the tuning.json format to /__helper/tuning, then nothing shows as changed', async () => {
  const s = settings();
  s.set('player', 'gravity', 30);
  const extra = { x: 1 };
  s.tuning.num('Extra', 'X', extra, 'x', 0, 2, 0.1); // a control the file does not hold
  s.tuning.set('extra.x', 2);
  let sent = null;
  const was = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent = { url, init }; return { ok: true, status: 200 }; };
  try {
    assert.match(await s.saveForAgent(), /Saved to src\/tuning.json/);
  } finally { globalThis.fetch = was; }
  assert.equal(sent.url, '/__helper/tuning');
  assert.equal(sent.init.method, 'POST');
  const body = JSON.parse(sent.init.body);
  assert.deepEqual(Object.keys(body), ['values']);
  assert.deepEqual(body.values.player.gravity, { value: 30, min: 8, max: 60, step: 0.5 });
  assert.deepEqual(s.changedValues(), { 'extra.x': 2 }, 'only the file\'s values became defaults');
});

test('a value the maker changed in the menu comes back on the next visit; set() from code does not; a new default wins', () => {
  const st = memStorage();
  const a = settings({ storage: st });
  a.tuning.set('player.runSpeed', 10); // what a slider does
  a.set('player', 'gravity', 40); // what game code does
  const b = settings({ storage: st });
  assert.equal(b.tune.player.runSpeed, 10);
  assert.equal(b.tune.player.gravity, 26);
  const edited = structuredClone(FILE);
  edited.player.runSpeed.value = 7; // the agent changed the default in tuning.json
  const c = createStarterSettings(edited, { storage: st });
  assert.equal(c.tune.player.runSpeed, 7, 'the stale value is dropped');
});

test('storage is per game (the key comes from settings.js) and a shipped game keeps nothing', () => {
  const st = memStorage();
  const a = settings({ storage: st, storageKey: 'game-one.tuning' });
  a.tuning.set('player.runSpeed', 10);
  assert.ok(st.map.has('game-one.tuning'));
  assert.equal(settings({ storage: st, storageKey: 'game-two.tuning' }).tune.player.runSpeed, 6.5);
  const shipped = settings({ storage: st, storageKey: 'game-one.tuning', devMode: false });
  assert.equal(shipped.tune.player.runSpeed, 6.5, 'players never get the maker\'s kept values');
});

// ------------------------------------------------------------------ dev: the game's own things ----

test('dev calls register controls when the menu is on, and do nothing at all when it is off', () => {
  for (const devMode of [true, false]) {
    const s = settings({ devMode });
    let n = 0, on = false, lvl = '1', hour = 3;
    s.dev.button('Cheats', 'Give coins', () => n++, 'Ten coins.');
    s.dev.toggle('Cheats', 'Noclip', () => on, (v) => { on = v; });
    s.dev.readout('Player', 'Speed', () => '3 m/s');
    s.dev.pick('World', 'Level', ['1', '2'], () => lvl, (v) => { lvl = v; });
    s.dev.slider('World', 'Hour', () => hour, (v) => { hour = v; }, { min: 0, max: 24, step: 0.5 });
    s.dev.essentials([['Move', [['How fast', 'player.runSpeed']]]]);
    s.dev.presets([{ name: 'Quick', about: 'Fast.', values: { 'player.runSpeed': 9 } }]);
    const count = s.tuning.items().length;
    if (!devMode) {
      assert.equal(count, 5, 'only the file\'s own values');
      assert.equal(s.dev.on, false);
      assert.equal(s.tuning.essentials.length + s.tuning.presets.length, 0);
      continue;
    }
    assert.equal(count, 10);
    assert.equal(s.tuning.item('cheats.give-coins').hint, 'Ten coins.');
    s.tuning.item('cheats.give-coins').run();
    s.tuning.set('cheats.noclip', true);
    s.tuning.set('world.level', '2');
    s.tuning.set('world.hour', 12);
    assert.deepEqual([n, on, lvl, hour], [1, true, '2', 12]);
    assert.deepEqual(s.changedValues(), {}, 'the game\'s own controls are never saved into tuning.json');
    assert.deepEqual(s.tuning.missingEssentials(), []);
    s.tuning.applyPreset('quick');
    assert.equal(s.tune.player.runSpeed, 9);
  }
});

test('installSettingsPanel loads the menu only when it is wanted, once', async () => {
  let loads = 0;
  const loadMenu = async () => { loads++; return { installMenu: (a) => ({ got: a }) }; };
  const off = settings({ devMode: false, loadMenu });
  assert.equal(off.installSettingsPanel({ enabled: true, canSave: true }), null);
  const notEnabled = settings({ loadMenu });
  assert.equal(notEnabled.installSettingsPanel({ enabled: false }), null);
  assert.equal(notEnabled.dev.view('cam'), 'cam', 'no menu: the game camera is used');
  assert.equal(notEnabled.dev.holdsMouse(), false);
  const forced = settings({ loadMenu, forced: true });
  assert.ok(forced.installSettingsPanel({ enabled: false }), '?dev=1 shows it even where main.js would not');
  const s = settings({ loadMenu, gameName: 'Test Game' });
  assert.equal(s.installSettingsPanel({ enabled: true, canSave: true, game: { pointerLock: true } }), s.dev);
  assert.equal(s.installSettingsPanel({ enabled: true }), null, 'a second call does nothing');
  const m = await s.dev.ready;
  assert.equal(m.got.canSave, true);
  assert.equal(m.got.game.name, 'Test Game');
  assert.equal(m.got.game.pointerLock, true);
  assert.equal(loads, 2);
});

// ------------------------------------------------------------------ the dev server's endpoints ----

function fakeServer(root) {
  const plugin = helperPlugin();
  plugin.configResolved({ root });
  let mw = null;
  plugin.configureServer({ middlewares: { use: (fn) => { mw = fn; } } });
  return async (method, url, body, headers = {}) => {
    const req = new EventEmitter();
    Object.assign(req, { method, url, headers: { host: 'localhost:5173', ...headers }, destroy() {} });
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, body: '' };
    const done = new Promise((resolve) => { res.end = (t) => { res.body = t; resolve(); }; });
    const nextCalled = new Promise((resolve) => mw(req, res, resolve));
    process.nextTick(() => { if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end'); });
    await Promise.race([done, nextCalled]);
    return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null };
  };
}
function tempGame() {
  // A game folder inside a fake kit that links to the real vibes, like my-game/ inside a copy of the kit.
  const kit = fs.mkdtempSync(path.join(os.tmpdir(), 'devmenu-kit-'));
  fs.symlinkSync(path.join(KIT, 'vibes'), path.join(kit, 'vibes'));
  const game = path.join(kit, 'my-game');
  fs.mkdirSync(path.join(game, 'src'), { recursive: true });
  fs.writeFileSync(path.join(game, 'helper.json'), '{"gameName":"T"}');
  fs.writeFileSync(path.join(game, 'palette.json'), '{"colors":{"base":["#111111"]}}\n');
  return { kit, game };
}

test('POST /__helper/palette writes a clean palette.json, keeps the old one, and refuses bad input and other websites', async () => {
  const { kit, game } = tempGame();
  try {
    const call = fakeServer(game);
    const good = { name: 'Mine', colors: { base: ['#93AD5E', '#6f8f4a'], accent: ['#f2a65a'], ink: '#f6f3ea' }, sky: { top: '#7fb0e0' }, light: { exposure: 1.2345, fog: '#cccccc' }, evil: '<script>' };
    let r = await call('POST', '/__helper/palette', { palette: good });
    assert.equal(r.status, 200);
    const written = JSON.parse(fs.readFileSync(path.join(game, 'palette.json'), 'utf8'));
    assert.deepEqual(written.colors.base, ['#93ad5e', '#6f8f4a']);
    assert.equal(written.light.exposure, 1.235);
    assert.equal(written.evil, undefined, 'unknown fields do not get in');
    assert.equal(fs.readdirSync(path.join(game, '.helper')).filter((f) => f.startsWith('palette.before-')).length, 1);
    for (const bad of [{}, { colors: { base: ['red'] } }, { colors: { base: ['#111111'], danger: 'url(x)' } }, { colors: { base: ['#111111'] }, light: { exposure: 'big' } }]) {
      r = await call('POST', '/__helper/palette', { palette: bad });
      assert.equal(r.status, 400, JSON.stringify(bad));
    }
    r = await call('POST', '/__helper/palette', { palette: good }, { origin: 'https://evil.example' });
    assert.equal(r.status, 403);
  } finally { fs.rmSync(kit, { recursive: true, force: true }); }
});

test('GET /__helper/vibes lists the kit\'s real vibes; POST /__helper/vibe puts one on (the kit tool, else the palette)', async () => {
  const { kit, game } = tempGame();
  try {
    const call = fakeServer(game);
    const r = await call('GET', '/__helper/vibes');
    assert.equal(r.status, 200);
    const real = fs.readdirSync(path.join(KIT, 'vibes')).filter((d) => fs.existsSync(path.join(KIT, 'vibes', d, 'vibe.json')));
    assert.ok(r.json.vibes.length >= 40, `found ${r.json.vibes.length} of ${real.length} vibes`);
    const v = r.json.vibes[0];
    assert.ok(v.id && v.name && Array.isArray(v.swatch) && v.swatch.length >= 3);
    // no tools/vibes/apply.mjs in this fake kit: the palette is written directly
    const put = await call('POST', '/__helper/vibe', { id: v.id });
    assert.equal(put.status, 200);
    assert.equal(put.json.how, 'palette');
    const pal = JSON.parse(fs.readFileSync(path.join(game, 'palette.json'), 'utf8'));
    assert.ok(/^#[0-9a-f]{6}$/.test(pal.colors.base[0]));
    assert.equal((await call('GET', '/__helper/vibes')).json.current, v.id, 'the vibe on now is recognised');
    assert.equal((await call('POST', '/__helper/vibe', { id: '../etc' })).status, 400);
    assert.equal((await call('POST', '/__helper/vibe', { id: 'no-such-vibe' })).status, 404);
  } finally { fs.rmSync(kit, { recursive: true, force: true }); }
});

test('POST /__helper/shot saves only real PNGs into playtest-notes/shots/', async () => {
  const { kit, game } = tempGame();
  try {
    const call = fakeServer(game);
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const r = await call('POST', '/__helper/shot', { png: `data:image/png;base64,${png.toString('base64')}` });
    assert.equal(r.status, 200);
    assert.match(r.json.file, /^playtest-notes\/shots\/shot-.*\.png$/);
    assert.ok(fs.existsSync(path.join(game, r.json.file)));
    assert.equal((await call('POST', '/__helper/shot', { png: 'data:image/png;base64,aGVsbG8gd29ybGQ=' })).status, 400);
    assert.equal((await call('POST', '/__helper/shot', { png: 'file:///etc/passwd' })).status, 400);
  } finally { fs.rmSync(kit, { recursive: true, force: true }); }
});
