// Before/after stills of the places that fought for depth: node scripts/zshot.mjs <out-dir> <tag>
// Each view is saved plain, and again with what flips under a tenth-of-a-pixel nudge painted red.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, serve } from './lib.mjs';

// room, eye and target in the room's own coordinates, and the size of whoever looks (1, or 0.1 on the table)
const VIEWS = {
	'hut-door': ['b', [3.7, 1.62, 5.05], [5.25, 0, 5.0], 1],
	'hut-door-low': ['b', [4.2, 0.8, 5.25], [4.8, 0, 4.9], 1],
	'tunnel-mouth': ['a', [4.7, 1.62, 5.0], [5.75, 0, 5.0], 1],
	'tunnel-far-mouth': ['a', [9.3, 1.62, 5.2], [8.3, 0, 5.0], 1],
	'table-door': ['s', [3.42, 0.912, 3.66], [3.335, 0.75, 3.65], 0.1],
	'hall-looking-back': ['h', [1.5, 1.62, 6.05], [-0.15, 0, 6.0], 1],
	'tunnel-looking-out': ['lt', [1.4, 1.62, 1.0], [-0.2, 0, 1.0], 1],
};

const out = process.argv[2] ?? 'shots/zfight';
const tag = process.argv[3] ?? 'after';
mkdirSync(out, { recursive: true });
const server = await serve('dist');
const { browser, page } = await open(`${server.url}?test&nohud`, { width: 1280, height: 720 });
for (const [name, [room, eye, target, scale]] of Object.entries(VIEWS)) {
	const r = await page.evaluate(({ room, eye, target, scale }) => {
		const d = window.__demo;
		const o = d.world.level.rooms.find((x) => x.id === room).origin;
		const c2 = (window.__c2 ??= Object.assign(document.createElement('canvas'), { width: d.renderer.domElement.width, height: d.renderer.domElement.height }));
		const ctx = c2.getContext('2d', { willReadFrequently: true });
		const draw = (nudge) => {
			const cam = d.camera;
			cam.near = 0.03 * scale;
			cam.updateProjectionMatrix();
			cam.position.set(o[0] + eye[0], o[1] + eye[1], o[2] + eye[2]);
			cam.up.set(0, 1, 0);
			cam.lookAt(o[0] + target[0], o[1] + target[1], o[2] + target[2]);
			if (nudge) {
				cam.rotateY(1.1e-4);
				cam.rotateX(0.7e-4);
				cam.translateX(1.5e-4 * scale);
			}
			cam.updateMatrixWorld(true);
			d.world.portals.render(cam, room);
			ctx.drawImage(d.renderer.domElement, 0, 0);
			return ctx.getImageData(0, 0, c2.width, c2.height);
		};
		const b = draw(true).data;
		const img = draw(false);
		const a = img.data;
		const w = c2.width;
		const n = w * c2.height;
		const mask = new Uint8Array(n);
		for (let i = 0, p = 0; p < n; i += 4, p++) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 80) mask[p] = 1;
		let count = 0;
		for (let p = w + 1; p < n - w - 1; p++) {
			if (!mask[p]) continue;
			if (mask[p - 1] + mask[p + 1] + mask[p - w] + mask[p + w] + mask[p - w - 1] + mask[p - w + 1] + mask[p + w - 1] + mask[p + w + 1] < 5) continue;
			count++;
			a[4 * p] = 255;
			a[4 * p + 1] = 0;
			a[4 * p + 2] = 40;
		}
		ctx.putImageData(img, 0, 0);
		const marked = c2.toDataURL('image/jpeg', 0.9);
		draw(false);
		return { count, marked };
	}, { room, eye, target, scale });
	await page.waitForTimeout(80);
	await page.screenshot({ path: join(out, `${name}-${tag}.png`) });
	writeFileSync(join(out, `${name}-${tag}-flips.jpg`), Buffer.from(r.marked.split(',')[1], 'base64'));
	console.log(name, tag, r.count, 'px flipping');
}
await browser.close();
server.stop();
