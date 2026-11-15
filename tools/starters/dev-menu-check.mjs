#!/usr/bin/env node
// For people working ON the kit: prove the starter's dev menu works, in one hidden browser session.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { bad, ok, runTool, say } from '../lib/log.mjs';
import { gameDir, pretty } from '../lib/paths.mjs';
import { launch, newGamePage, openGame, withBrowserLock } from '../lib/browser.mjs';
import { ensureServer, stopServer } from '../lib/server.mjs';

const HELP = `
node tools/starters/dev-menu-check.mjs [--dir <game folder>] [--shots <folder>] [--keep-server]

Kit maintenance. Opens a game made from the starter in the hidden browser and checks its dev menu (the backquote key):
  1. with the menu closed, nothing of it can be seen, in the page or in __game.capture()
  2. it opens on the short list; a slider changes the game's number while the game runs
  3. Speed changes how fast game time runs
  4. the free camera moves, and the game's own camera is not touched
  5. No HUD hides what is drawn on top; Everything and Search show every control
  6. Save for my agent, Save palette and Screenshot write their files (which are put back afterwards)

  --shots <folder>  also save pictures of the menu (open, everything, mid-drag, free camera, narrow window)
  --keep-server     leave the game's dev server running afterwards
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await runTool(async () => {
  const { values: a } = getArgs({ shots: { type: 'string' }, 'keep-server': { type: 'boolean' } }, HELP);
  const dir = gameDir(a.dir);
  const fails = [];
  const fail = (m) => { fails.push(m); bad(m); };
  const check = (cond, good, wrong) => { if (cond) ok(good); else fail(wrong); return !!cond; };
  const shotsDir = a.shots ? path.resolve(a.shots) : null;
  if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });

  const tuningFile = path.join(dir, 'src', 'tuning.json');
  const paletteFile = path.join(dir, 'palette.json');
  const keepDir = path.join(dir, '.helper');
  const shotFolder = path.join(dir, 'playtest-notes', 'shots');
  const before = {
    tuning: fs.readFileSync(tuningFile, 'utf8'),
    palette: fs.existsSync(paletteFile) ? fs.readFileSync(paletteFile, 'utf8') : null,
    keeps: new Set(fs.existsSync(keepDir) ? fs.readdirSync(keepDir) : []),
    shots: new Set(fs.existsSync(shotFolder) ? fs.readdirSync(shotFolder) : []),
  };

  const { url, started } = await ensureServer(dir, { quiet: true });
  let t0 = Date.now();
  try {
    await withBrowserLock(async () => {
      t0 = Date.now(); // the time with the browser open (not the wait for our turn)
      const browser = await launch();
      try {
        const { page, problems, navigations } = await newGamePage(browser);
        const shot = async (name) => { if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${name}.png`) }); };
        const dev = () => page.evaluate(() => window.__game.dev.state());
        const menuReady = () => page.evaluate(() => window.__game.dev.ready.then((m) => !!m));
        const errors = async () => [...(await page.evaluate(() => (window.__game.errors || []).map((x) => String(x?.message || x)))), ...problems];
        const value = (id) => page.evaluate((i) => window.__game.dev.tuning.get(i), id);
        const center = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return b ? { ...b, x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; };
        const press = (label) => page.locator('.devm header button', { hasText: label }).first().click();

        // ---- 1. closed: nothing of the menu in the page or in capture()
        await openGame(page, `${url}/?test=1&autostart=1&seed=1&mute=1`);
        check(await menuReady(), 'The menu\'s code loads on a ?test=1 page.', 'The dev menu did not load on a ?test=1 page.');
        let st = await dev();
        const hiddenNow = await page.evaluate(() => {
          const seen = (el) => !!el && !el.hidden && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
          return { panel: seen(document.querySelector('.devm')), tab: seen(document.querySelector('.devm-tab')), built: document.querySelectorAll('.devm .row').length };
        });
        check(!st.open && !hiddenNow.panel && !hiddenNow.tab && hiddenNow.built === 0, 'Closed, in a hidden browser: no panel, no tab, no rows built.', `Closed, something of the menu shows: ${JSON.stringify(hiddenNow)}`);
        await page.evaluate(() => window.__game.pause());
        await sleep(150);
        const cap1 = await page.evaluate(() => window.__game.capture());
        const pic1 = await page.screenshot();
        const tag = await page.addStyleTag({ content: '.devm, .devm-tab, .devm-note { display: none !important; }' });
        const pic2 = await page.screenshot();
        await tag.evaluate((n) => n.remove());
        check(pic1.equals(pic2), 'A picture of the page is the same with the menu taken out: nothing of it was showing.', 'A picture of the page changes when the menu is taken out: something of it was showing while closed.');
        await page.evaluate(() => window.__game.dev.open());
        await sleep(350);
        const cap2 = await page.evaluate(() => window.__game.capture());
        check(cap1 === cap2 && cap1.startsWith('data:image/png'), '__game.capture() gives the same picture with the menu open as closed.', '__game.capture() changed when the menu opened.');
        await page.evaluate(() => { window.__game.dev.close(); window.__game.resume(); });

        // ---- 2. open on the short list; a slider changes the number while the game runs
        await openGame(page, `${url}/?dev=open&test=1&autostart=1&seed=1&mute=1`);
        await menuReady();
        await sleep(400);
        st = await dev();
        check(st.open && st.built && st.view === 'simple', `It opens on the short list (${st.rows} rows drawn, ${st.controls} controls in all).`, `It did not open on the short list: ${JSON.stringify({ open: st.open, built: st.built, view: st.view })}`);
        check(!st.missingEssentials.length && !st.presetProblems.length, 'Every essential and every preset value matches a control.', `Essentials or presets name controls that do not exist: ${JSON.stringify({ missing: st.missingEssentials, presets: st.presetProblems })}`);
        await shot('1-essentials');
        const first = await page.evaluate(() => document.querySelector('.devm .sec.simple:not(.folded) .row.num')?.dataset.id);
        const v0 = await value(first);
        const tA = await page.evaluate(() => window.__game.time);
        const r = await center(`.devm .sec.simple .row[data-id="${first}"] input[type=range]`);
        await page.mouse.move(r.x - r.width * 0.2, r.y);
        await page.mouse.down();
        await page.mouse.move(r.x + r.width * 0.3, r.y, { steps: 6 });
        await sleep(400);
        const mid = await page.evaluate(() => ({ peek: document.querySelector('.devm').classList.contains('peek'), live: document.querySelectorAll('.devm .row.live').length }));
        await shot('2-mid-drag');
        await page.mouse.up();
        await sleep(350);
        const v1 = await value(first);
        const tB = await page.evaluate(() => window.__game.time);
        check(v1 !== v0 && v1 > v0, `Dragging the "${first}" slider changed the game's number (${v0} -> ${v1}).`, `Dragging the "${first}" slider did not change the number (${v0} -> ${v1}).`);
        check(mid.peek && mid.live === 1, 'While dragging, the rest of the menu fades and the row stays.', `While dragging, the menu did not fade as it should: ${JSON.stringify(mid)}`);
        check(tB > tA, 'The game kept running behind the open menu.', 'The game clock stopped while the menu was open.');
        st = await dev();
        check(st.changed === 1, 'The change is counted ("1 changed").', `Expected 1 changed value, the menu says ${st.changed}.`);
        await shot('3-changed');

        // ---- 3. speed
        const rate = async (ms) => page.evaluate(async (wait) => {
          const a0 = performance.now(), g0 = window.__game.time;
          await new Promise((res) => setTimeout(res, wait));
          return (window.__game.time - g0) / ((performance.now() - a0) / 1000);
        }, ms);
        const r1 = await rate(1200);
        await page.locator('.devm .seg.speed button[data-v="0.25"]').click();
        const rQ = await rate(1600);
        await page.locator('.devm .seg.speed button[data-v="2"]').click();
        const r2 = await rate(1200);
        await page.locator('.devm .seg.speed button[data-v="1"]').click();
        const q = rQ / r1, d = r2 / r1;
        check(q > 0.15 && q < 0.4, `Speed 1/4: game time ran at ${q.toFixed(2)} of normal.`, `Speed 1/4 should run game time at about 0.25 of normal; measured ${q.toFixed(2)} (normal ${r1.toFixed(2)}, quarter ${rQ.toFixed(2)} game s per s).`);
        check(d > 1.5 && d < 2.5, `Speed 2: game time ran at ${d.toFixed(2)} of normal.`, `Speed 2 should run game time at about twice normal; measured ${d.toFixed(2)}.`);

        // ---- 4. free camera
        const cams = () => page.evaluate(() => {
          const t = window.__game.dev.menu.tools;
          return { used: Array.from(t.camera().matrixWorld.elements), game: Array.from(t.gameCamera().matrixWorld.elements), fov: t.camera().fov, state: window.__game.state };
        });
        const same = (x, y) => x.every((v, i) => Math.abs(v - y[i]) < 1e-9);
        await press('Freeze');
        await sleep(200);
        const c0 = await cams();
        const g0 = await page.evaluate(() => window.__game.time);
        await page.keyboard.press('KeyC');
        await sleep(150);
        st = await dev();
        check(st.fly && st.frozen, 'C starts the free camera (with the game frozen).', `The free camera did not start: ${JSON.stringify({ fly: st.fly, frozen: st.frozen })}`);
        await page.keyboard.down('KeyW');
        await sleep(500);
        await page.keyboard.up('KeyW');
        await page.mouse.move(400, 360);
        await page.mouse.down();
        await page.mouse.move(520, 300, { steps: 5 });
        await page.mouse.up();
        await page.mouse.wheel(0, -300);
        await sleep(200);
        const c1 = await cams();
        await shot('4-free-camera');
        check(!same(c1.used, c0.used), 'W, a drag and the wheel moved the free camera.', 'The free camera did not move.');
        check(same(c1.game, c0.game), 'The game\'s own camera did not move while the free camera flew.', 'The game\'s own camera moved while the free camera was on.');
        // the game running: the free camera's keys must not reach the player
        await press('Freeze');
        const p0 = (await cams()).state.player;
        await page.keyboard.down('KeyD');
        await sleep(500);
        await page.keyboard.up('KeyD');
        const p1 = (await cams()).state.player;
        if (p0 && p1) check(Math.hypot(p1.x - p0.x, p1.z - p0.z) < 0.05, 'With the game running, the free camera\'s keys did not move the player.', `The player moved while the free camera had the keys (${JSON.stringify(p0)} -> ${JSON.stringify(p1)}).`);
        await press('Freeze');
        await sleep(150);
        const c2 = await cams();
        await page.keyboard.press('Escape');
        await sleep(200);
        st = await dev();
        const c3 = await cams();
        check(!st.fly && same(c3.used, c2.game) && same(c3.game, c2.game), 'Esc leaves it: the picture is drawn with the game\'s camera again, exactly where the game had it.', 'After leaving the free camera the game\'s camera is not as the game left it.');
        check((await page.evaluate(() => window.__game.state.scene)) === 'playing', 'Esc in the free camera did not pause the game.', 'Esc in the free camera paused the game.');
        const g1 = await page.evaluate(() => window.__game.time);
        check(g1 > g0, 'Step and Freeze: the clock only moved while unfrozen.', 'The game clock did not move at all around the free camera test.');
        await page.keyboard.press('Period');
        await page.keyboard.press('Period');
        const g2 = await page.evaluate(() => window.__game.time);
        check(Math.abs(g2 - g1 - 2 / 60) < 1e-6, 'The . key steps the frozen game by exactly one tick each.', `Two steps should move the clock by ${(2 / 60).toFixed(4)} s; it moved ${(g2 - g1).toFixed(4)} s.`);
        await page.keyboard.press('Backslash');
        st = await dev();
        check(!st.frozen, 'The \\ key runs the game again.', 'The \\ key did not unfreeze the game.');

        // ---- 5. No HUD, Everything, Search
        const hudSeen = () => page.evaluate(() => getComputedStyle(document.querySelector('.ui')).visibility !== 'hidden');
        await page.keyboard.press('KeyH');
        await sleep(100);
        const hud1 = await hudSeen();
        await shot('5-no-hud');
        await page.keyboard.press('KeyH');
        await sleep(100);
        check(!hud1 && (await hudSeen()), 'H hides everything drawn on top of the picture, and brings it back.', 'No HUD did not hide (or did not bring back) the game\'s UI.');
        await page.locator('.devm .seg.view button', { hasText: 'Everything' }).click();
        await sleep(300);
        st = await dev();
        const shownRows = await page.evaluate(() => [...document.querySelectorAll('.devm .sec.group .row')].filter((el) => el.offsetParent !== null).length);
        check(st.view === 'all' && shownRows > 20, `Everything shows the full list (${shownRows} rows).`, `Everything did not show the full list (${shownRows} rows, view ${st.view}).`);
        await shot('6-everything');
        await page.keyboard.press('Slash');
        await page.keyboard.type('gravity');
        await sleep(200);
        const found = await page.evaluate(() => ({ hits: document.querySelector('.devm .hits').textContent, rows: [...document.querySelectorAll('.devm .sec.group .row')].filter((el) => el.offsetParent !== null).length, scene: window.__game.state.scene }));
        check(found.rows >= 1 && found.rows < 8 && found.scene === 'playing', `Search finds controls (${found.hits}); typing in it did not reach the game.`, `Search went wrong: ${JSON.stringify(found)}`);
        await shot('7-search');
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        check((await page.evaluate(() => window.__game.state.scene)) === 'playing', 'Esc in the search box clears it without pausing the game.', 'Esc in the search box paused the game.');

        // ---- 6. saves: tuning, screenshot, palette (the files are put back at the end)
        await page.locator('.devm footer button', { hasText: 'Save for my agent' }).click();
        await sleep(600);
        const saved = JSON.parse(fs.readFileSync(tuningFile, 'utf8'));
        const [grp, key] = first.split('.');
        st = await dev();
        check(saved[grp]?.[key]?.value === v1 && st.changed === 0, `Save for my agent wrote ${first} = ${v1} into src/tuning.json, and nothing shows as changed any more.`, `Save for my agent: the file has ${saved[grp]?.[key]?.value}, expected ${v1}; the menu still shows ${st.changed} changed.`);
        check(Object.keys(saved).join() === Object.keys(JSON.parse(before.tuning)).join() && saved[grp][key].min === JSON.parse(before.tuning)[grp][key].min, 'The saved file keeps the same groups and ranges.', 'The saved tuning.json lost groups or ranges.');

        await page.locator('.devm header button', { hasText: 'Screenshot' }).click();
        await sleep(900);
        const newShots = (fs.existsSync(shotFolder) ? fs.readdirSync(shotFolder) : []).filter((f) => !before.shots.has(f));
        const said = await page.evaluate(() => document.querySelector('.devm .msg').textContent);
        check(newShots.length === 1 && /^shot-.*\.png$/.test(newShots[0]) && said.includes(newShots[0]) && fs.statSync(path.join(shotFolder, newShots[0])).size > 5000, `Screenshot saved ${newShots[0]} and said where.`, `Screenshot did not save a picture (new files: ${newShots.join(', ') || 'none'}; the menu said "${said}").`);
        await page.locator('.devm header button', { hasText: 'Copy view' }).click();

        const exp0 = await value('palette.exposure');
        await page.evaluate(() => { const t = window.__game.dev.tuning; t.set('palette.exposure', 1.45); t.set('palette.accent0', '#33ddff'); });
        await sleep(350);
        const live = await page.evaluate(() => ({ accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() }));
        check(live.accent === '#33ddff', 'A palette colour used by the UI changes at once.', `The UI accent colour did not follow the palette control (it is "${live.accent}").`);
        st = await dev();
        check(st.paletteChanged === 2 && st.changed === 0, 'Palette changes are counted apart from tuning changes.', `Palette changes are miscounted: ${JSON.stringify({ palette: st.paletteChanged, tuning: st.changed })}`);
        await page.locator('.devm .seg.view button', { hasText: 'Essentials' }).click();
        const lookHd = page.locator('.devm .sec.simple > .hd', { hasText: 'Look' });
        await lookHd.scrollIntoViewIfNeeded();
        await sleep(200);
        await shot('8-look');
        const navs = navigations();
        await page.locator('.devm .sec.simple button[data-id="palette.save"]').click();
        for (let i = 0; i < 60 && navigations() === navs; i++) await sleep(100);
        await sleep(300);
        await openGameAgain(page);
        const pal = JSON.parse(fs.readFileSync(paletteFile, 'utf8'));
        check(navigations() > navs, 'Save palette loads the page again by itself.', 'Save palette did not load the page again.');
        check(pal.light?.exposure === 1.45 && pal.colors?.accent?.[0] === '#33ddff', 'Save palette wrote palette.json (brightness 1.45, the new accent colour).', `palette.json does not hold the saved values: exposure ${pal.light?.exposure}, accent ${pal.colors?.accent?.[0]} (was ${exp0}).`);
        await menuReady();
        st = await dev();
        const url2 = page.url();
        check(st.open && /dev=open/.test(url2) && /seed=1/.test(url2) && (await value('palette.exposure')) === 1.45, 'After loading again the address is kept, the menu is open, and the game reads the new palette.', `After the reload: open ${st.open}, address ${url2}, exposure ${await value('palette.exposure')}.`);
        const keeps = (fs.existsSync(keepDir) ? fs.readdirSync(keepDir) : []).filter((f) => !before.keeps.has(f) && f.startsWith('palette.before-'));
        check(before.palette === null || keeps.length === 1, 'The old palette.json was kept in .helper/.', `Expected one kept copy of the old palette in .helper/, found ${keeps.length}.`);
        st = await dev();
        say(`  vibes the menu found for this game: ${st.vibes ?? 'not asked yet'}`);

        // ---- pictures of a narrow window
        if (shotsDir) {
          await page.setViewportSize({ width: 900, height: 600 });
          await sleep(400);
          await shot('9-narrow-900x600');
          await page.setViewportSize({ width: 1280, height: 720 });
        }

        const errs = await errors();
        check(!errs.length, 'No errors in the page through all of it.', `Errors in the page:\n${[...new Set(errs)].slice(0, 6).map((e) => `          ${e.slice(0, 300)}`).join('\n')}`);
      } finally {
        await browser.close().catch(() => {});
      }
    }, { label: 'dev menu check' });
  } finally {
    // put the game's files back as they were
    fs.writeFileSync(tuningFile, before.tuning);
    if (before.palette !== null) fs.writeFileSync(paletteFile, before.palette);
    for (const f of fs.existsSync(keepDir) ? fs.readdirSync(keepDir) : []) if (!before.keeps.has(f) && f.startsWith('palette.before-')) fs.rmSync(path.join(keepDir, f), { force: true });
    for (const f of fs.existsSync(shotFolder) ? fs.readdirSync(shotFolder) : []) if (!before.shots.has(f) && f.startsWith('shot-')) fs.rmSync(path.join(shotFolder, f), { force: true });
    if (started && !a['keep-server']) await stopServer(dir).catch(() => {});
  }

  say('');
  say(`  (${((Date.now() - t0) / 1000).toFixed(0)} s with the browser open)`);
  if (shotsDir) say(`  pictures: ${pretty(shotsDir)}`);
  if (fails.length) { say(`FAILED: ${fails.length} problem${fails.length > 1 ? 's' : ''} with the dev menu.`); return 1; }
  say('PASSED: the dev menu works.');
  return 0;
});

async function openGameAgain(page) {
  for (let i = 0; i < 240; i++) {
    const ready = await page.evaluate(() => !!(window.__game && window.__game.ready && window.__game.dev)).catch(() => false);
    if (ready) return;
    await sleep(250);
  }
}
