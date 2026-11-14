// Takes candidate cover pictures: the barn being knocked down, mid-collapse, from a low three-quarter view, 1920 x 1080
// in headless Chromium with WebGPU, muted. Writes shots/cover-<n>.png; the chosen one becomes cover.jpg (1280 x 720).
//
//   npm run dev   (in another terminal), then: node make-cover.mjs [url, default http://127.0.0.1:5361/]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] ?? 'http://127.0.0.1:5361/';
const out = path.join(here, 'shots');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
	executablePath: process.env.CHROME || undefined,
	headless: true,
	args: ['--mute-audio', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(url);
await page.waitForFunction(() => window.__block?.app, null, { timeout: 60000 });
// Soften the barn a little first: two shots at the front's left bay, then wait for it to settle
await page.evaluate(async () => {
	const a = window.__block.app;
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	a.still(true);
	a.v.shake = false;
	a.set('shake', false);
	const o = a.orbit;
	o.want.target.set(-0.2, 0, 2.2);
	Object.assign(o.want, { distance: 15.5, pitch: 0.12, yaw: -0.78 });
	o.ease = 50;
	await sleep(600);
	for (const p of [[-3.6, -2.4, 1.1], [-2.4, -2.45, 2.3]]) {
		a.shoot(o.target.clone().set(...p));
		await sleep(900);
	}
	await sleep(1500);
	// The money shot: a heavy ball into the front corner post, then frames as the corner goes
	a.v.ball = 0.24;
	a.set('ball', 0.24);
	a.shoot(o.target.clone().set(-3.6, -2.4, 2.2));
	await sleep(150);
	a.shoot(o.target.clone().set(-1.2, -2.4, 2.6));
});
for (let k = 0; k < 10; k++) {
	await page.waitForTimeout(110);
	await page.screenshot({ path: path.join(out, `cover-${k}.png`) });
}
await browser.close();
console.log(`shots/cover-0..9.png`);
