// "Does the game actually work?" Loads it in the hidden browser and checks: it says it's ready, it runs for a
// couple of seconds without errors, and the screen isn't black. Used by serve.mjs --check and ship.mjs.
import { HelperError, detail, say } from './log.mjs';
import { canvasStats, launch, newGamePage, openGame, withBrowserLock } from './browser.mjs';
import { sleep } from './proc.mjs';

/** Returns { ok, problems: [plain strings], warnings: [plain strings], stats } */
export async function checkGame(url, { timeout = 60000, runMs = 2000, label = 'check' } = {}) {
  return withBrowserLock(async () => {
    const browser = await launch();
    const problems = [], warnings = [];
    let stats = null;
    try {
      const { page, problems: pageProblems } = await newGamePage(browser);
      try {
        await openGame(page, url, { timeout });
      } catch (e) {
        if (!(e instanceof HelperError)) throw e;
        problems.push(e.message.replace(/^./, (c) => c.toUpperCase()));
        for (const g of e.gameErrors || []) problems.push(`Game error: ${g}`);
        problems.push(...pageProblems);
        return { ok: false, problems: dedupe(problems), warnings, stats };
      }
      const f0 = await page.evaluate(() => window.__game.frames || 0);
      await sleep(runMs);
      const info = await page.evaluate(() => ({
        frames: window.__game.frames || 0,
        errors: (Array.isArray(window.__game.errors) ? window.__game.errors : []).map((x) => String(x?.message || x)),
      }));
      for (const g of info.errors) problems.push(`Game error: ${g}`);
      problems.push(...pageProblems);
      if (info.frames <= f0) warnings.push('The game did not draw any new frames for 2 seconds (it may be frozen, or paused on purpose).');
      stats = await canvasStats(page);
      detail({ frames: [f0, info.frames], screen: stats });
      if (stats.lit < 0.01) problems.push('The screen is black: nothing visible was drawn. (Check the camera, the lights, and that the renderer is added to the page.)');
    } finally {
      await browser.close().catch(() => {});
    }
    return { ok: problems.length === 0, problems: dedupe(problems), warnings, stats };
  }, { label });
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
}

/** Print the problems found by checkGame in plain words. */
export function printProblems(result, max = 8) {
  say('\nThe game has a problem:');
  for (const p of result.problems.slice(0, max)) say(`  - ${p.length > 400 ? p.slice(0, 400) + '...' : p}`);
  if (result.problems.length > max) say(`  ...and ${result.problems.length - max} more.`);
}
