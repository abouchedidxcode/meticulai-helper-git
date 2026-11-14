// A first visit to a real block page, as a person's: a new profile, muted. What no other check sees: whether the page
// AROUND the demo freezes, from navigation on, including while the demo loads, since the demo's graphics work can
// block the whole browser's. Serves this demo's bytes in another public block's frame, because that page needs no
// signing in. (After tools/page-visit.mjs in patch/animals.)
//   node scripts/page-visit.mjs <demo url> [--seconds 25] [--width 2560 --height 1400 --scale 1.5] [--as-is]
// --as-is leaves the page's own demo in the frame: a control. PATCH_CHROME picks the browser; HEADLESS=1 hides it
// (a covered or hidden window runs at 1 frame a second, so gaps of exactly 1,000 ms mean the run is invalid).
// The pointer is never taken: every page gets a pretend pointer lock.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const val = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const url = argv[0];
const seconds = +val('--seconds', 25);
const W = +val('--width', 2560);
const H = +val('--height', 1400);
const scale = val('--scale', '1.5');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'block-visit-'));
const ctx = await chromium.launchPersistentContext(dir, { executablePath: process.env.PATCH_CHROME || undefined, headless: !!process.env.HEADLESS, viewport: process.env.HEADLESS ? { width: Math.round(W / +scale), height: Math.round(H / +scale) } : null, args: [...(process.env.HEADLESS ? ['--ignore-gpu-blocklist', '--use-angle=d3d11'] : []), '--mute-audio', '--disable-features=CalculateNativeWinOcclusion', `--window-size=${W},${H}`, `--force-device-scale-factor=${scale}`] });
const page = ctx.pages()[0] ?? (await ctx.newPage());
const host = 'https://01a19535087b743e889a204f1b45a12d-staging.patchusercontent.com';
if (!argv.includes('--as-is')) {
	await ctx.route(`${host}/**`, async (route) => {
		const u = new URL(route.request().url());
		const r = await route.fetch({ url: url.replace(/\/$/, '') + u.pathname + u.search });
		await route.fulfill({ response: r });
	});
}
await ctx.addInitScript(() => {
	let locked = null;
	const fire = () => document.dispatchEvent(new Event('pointerlockchange'));
	Element.prototype.requestPointerLock = function () {
		locked = this;
		queueMicrotask(fire);
		return Promise.resolve();
	};
	Document.prototype.exitPointerLock = function () {
		locked = null;
		queueMicrotask(fire);
	};
	Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get: () => locked });
});
// Runs in the page and in the demo's frame: every gap between frames and every long task, from the very start.
await ctx.addInitScript(() => {
	const M = (window.__v = { gaps: [], long: [], frames: 0, marks: [] });
	let last = performance.now();
	const tick = (now) => {
		const d = now - last;
		M.frames++;
		if (d > 50) M.gaps.push([Math.round(now - d), Math.round(d)]);
		last = now;
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	try {
		new PerformanceObserver((l) => {
			for (const e of l.getEntries()) if (e.duration > 50) M.long.push([Math.round(e.startTime), Math.round(e.duration)]);
		}).observe({ entryTypes: ['longtask'] });
	} catch {}
});
// What reaches the screen: a corner of the page changes every frame, so a gap in the screencast means nothing was shown,
// which is what a person sees as a freeze, whichever process caused it.
await page.addInitScript(() => {
	if (window.top !== window) return;
	addEventListener('DOMContentLoaded', () => {
		const d = document.createElement('div');
		d.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;z-index:99999;pointer-events:none';
		document.documentElement.append(d);
		let k = 0;
		const beat = () => {
			d.style.background = k++ % 2 ? '#010101' : '#020202';
			requestAnimationFrame(beat);
		};
		beat();
	});
});
const cdp = await ctx.newCDPSession(page);
const shown = [];
cdp.on('Page.screencastFrame', async (e) => {
	shown.push(Date.now());
	await cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
});
if (!process.env.NO_SCREENCAST) await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 10, maxWidth: 320, maxHeight: 180, everyNthFrame: 1 });
const t0 = Date.now();
const timeline = [];
await page.goto('https://staging.patch.gg/patch/ocean');
const frame = () => page.frames().find((f) => f.url().includes('patchusercontent'));
let readyAt = 0;
while (Date.now() - t0 < (+val("--give-up", 90)) * 1000) {
	const r = await frame()?.evaluate(() => (window.__block?.times?.ready ? window.__block.boot ?? true : 0)).catch(() => 0);
	if (r) {
		readyAt = Date.now() - t0;
		console.log(`demo said ready at ${(readyAt / 1000).toFixed(1)} s`, JSON.stringify(r));
		break;
	}
	if (argv.includes('--as-is') && Date.now() - t0 > 20000) break;
	await new Promise((go) => setTimeout(go, 200));
}
await new Promise((go) => setTimeout(go, 4000));
// Then what a person does, through the page's own message channel. `--steps` is a JSON list of [type, id, value, wait s].
const steps = JSON.parse(val('--steps', '[]'));
for (const [type, id, value, wait] of steps) {
	timeline.push([Date.now() - t0, `${type} ${id}${value === undefined || value === null ? '' : `=${value}`}`]);
	if (type === 'fullscreen') await page.locator('button[aria-label="Fullscreen"], button[aria-label="Leave fullscreen"]').first().click();
	else await page.evaluate(([t, i, v]) => document.querySelector('iframe[sandbox]').contentWindow.postMessage({ channel: 'patch-block', type: t, id: i, value: v }, '*'), [type, id, value]);
	await new Promise((go) => setTimeout(go, (wait ?? 2) * 1000));
}
await new Promise((go) => setTimeout(go, seconds * 1000));
const at = (ms) => [...timeline].reverse().find(([t]) => t <= ms)?.[1] ?? '(loading)';
const gaps = [];
for (let i = 1; i < shown.length; i++) if (shown[i] - shown[i - 1] > 120) gaps.push([shown[i - 1] - t0, shown[i] - shown[i - 1]]);
console.log(`on screen: ${shown.length} frames; gaps over 120 ms (s from navigation, ms, after what):`);
for (const [a, d] of gaps) console.log(`  ${(a / 1000).toFixed(2)} s  ${d} ms  ${a < readyAt ? 'before ready' : 'after ready'}  ${at(a)}`);
if (!gaps.length) console.log('  none');
const report = async (name, f) => {
	const m = await f.evaluate(() => ({ ...window.__v, origin: performance.timeOrigin })).catch(() => null);
	if (!m) return console.log(name, 'not reachable');
	const over = (n) => m.gaps.filter(([, d]) => d > n);
	console.log(`${name}: ${m.frames} frames; over 100 ms: ${over(100).length}, over 250 ms: ${over(250).length}; worst ${Math.max(0, ...m.gaps.map(([, d]) => d))} ms`);
	console.log(`  gaps over 100 ms (start ms from this frame's start, length): ${over(100).map(([a, d]) => `${d}@${a}`).join(' ') || 'none'}`);
	console.log(`  long tasks over 150 ms: ${m.long.filter(([, d]) => d > 150).map(([a, d]) => `${d}@${a}`).join(' ') || 'none'}`);
};
if (process.env.LAPS) console.log(JSON.stringify(await frame()?.evaluate(() => ({ settle: window.__settle, laps: window.__laps, lift: window.__lift })).catch(() => null)));
await report('patch page', page.mainFrame());
const f = frame();
if (f) await report('demo frame', f);
await ctx.close();
fs.rmSync(dir, { recursive: true, force: true });
