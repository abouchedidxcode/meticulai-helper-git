// Writes the Structure choice's pictures, thumbs/structures/<id>.webp: each structure standing, from its own framing,
// 112 x 112 (the block page draws them at 56 x 56), captured from the demo in headless Chromium with WebGPU, muted.
//
//   npm run dev   (in another terminal), then: node make-thumbs.mjs [url, default http://127.0.0.1:5361/]
//
// Needs Playwright's Chromium (CHROME=<path to chrome.exe> to use another) and ffmpeg (with libwebp) on PATH.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { structures } from './make-recipe.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] ?? 'http://127.0.0.1:5361/';
const out = path.join(here, 'thumbs', 'structures');
fs.mkdirSync(out, { recursive: true });
// How each sits in its square: closer than the demo's own framing, a little higher
const POSE = {
	barn: { distance: 13.5, pitch: 0.24, yaw: -0.62, target: [0, 0, 2.2] },
	tower: { distance: 19.5, pitch: 0.16, yaw: -0.55, target: [0, 0, 5.6] },
	wall: { distance: 11.5, pitch: 0.2, yaw: -0.48, target: [0, 0, 1.15] },
	chimney: { distance: 16, pitch: 0.14, yaw: -0.6, target: [0, 0, 5.2] },
};
const browser = await chromium.launch({
	executablePath: process.env.CHROME || undefined,
	headless: true,
	args: ['--mute-audio', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
});
const page = await browser.newPage({ viewport: { width: 448, height: 448 } });
await page.goto(url);
await page.waitForFunction(() => window.__block?.app, null, { timeout: 60000 });
for (const [id] of structures) {
	await page.evaluate(async ([id, pose]) => {
		const a = window.__block.app;
		a.v.structure = id;
		a.set('structure', id);
		while (!a.site.ready) await new Promise((r) => setTimeout(r, 50));
		a.still(true);
		const o = a.orbit;
		o.want.target.set(...pose.target);
		Object.assign(o.want, { distance: pose.distance, pitch: pose.pitch, yaw: pose.yaw });
		o.ease = 50;
		await new Promise((r) => setTimeout(r, 1200));
	}, [id, POSE[id]]);
	const png = path.join(out, `${id}.png`);
	await page.screenshot({ path: png });
	const webp = path.join(out, `${id}.webp`);
	execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-vf', 'scale=112:112:flags=lanczos', '-c:v', 'libwebp', '-quality', '86', webp]);
	fs.rmSync(png);
	console.log(`${id}: ${fs.statSync(webp).size} bytes`);
}
await browser.close();
