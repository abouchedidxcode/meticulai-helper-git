// Looks for depth fighting: every view is drawn twice, the second time with the camera nudged by a tenth of a
// pixel, and areas that flip between two surfaces are flagged. Steady surfaces barely change under such a nudge;
// two surfaces fighting for depth swap in stripes.
//   node scripts/zfight.mjs <out-dir> [--keep 24]
// Views: at every opening (both sides are separate openings) from three distances, three sideways offsets (one
// grazing) and two heights, looking down at the sill, at the middle and through; and sweeps round every room.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, serve } from './lib.mjs';

const args = process.argv.slice(2);
const out = args[0] ?? 'work/zfight';
const keep = Number(args[args.indexOf('--keep') + 1] && args.includes('--keep') ? args[args.indexOf('--keep') + 1] : 24);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const server = await serve('dist');
const { browser, page, errors } = await open(`${server.url}?test&nohud`, { width: 1280, height: 720 });

// the list of views, made in the page (it has the level)
const views = await page.evaluate(() => {
	const d = window.__demo;
	const V = d.camera.position.constructor;
	const list = [];
	for (const def of d.world.level.portals) {
		const f = d.world.frames.get(def.id);
		const s = f.size;
		const sill = new V().copy(f.position).addScaledVector(f.up, -f.height / 2);
		for (const eye of [1.62, 0.8])
			for (const back of [0.45, 1.3, 3.2])
				for (const side of [0, 0.4 * f.width / s, -1.3 * f.width / s]) {
					const at = new V().copy(sill).addScaledVector(f.up, eye * s).addScaledVector(f.normal, back * s).addScaledVector(f.right, side * s);
					const targets = {
						sill: new V().copy(sill).addScaledVector(f.normal, 0.1 * s),
						middle: f.position.clone(),
						through: new V().copy(f.position).addScaledVector(f.normal, -3 * s),
					};
					for (const [look, target] of Object.entries(targets)) list.push({ id: `${def.id} ${look} eye${eye} back${back} side${side.toFixed(1)}`, group: def.id, room: f.room, at: at.toArray(), target: target.toArray(), up: f.up.toArray(), scale: s });
				}
	}
	// round each room, from places a person can stand: a few steps in from every opening, eight ways, level, down and up
	for (const def of d.world.level.portals) {
		const f = d.world.frames.get(def.id);
		const s = f.size;
		const feet = new V().copy(f.position).addScaledVector(f.up, -f.height / 2).addScaledVector(f.normal, 2.4 * s).addScaledVector(f.right, 0.9 * s);
		const at = new V().copy(feet).addScaledVector(f.up, 1.62 * s);
		for (let k = 0; k < 8; k++)
			for (const pitch of [0, -0.75, 0.55]) {
				const yaw = (k / 8) * Math.PI * 2 + 0.13;
				const dir = new V().addScaledVector(f.normal, Math.cos(yaw) * Math.cos(pitch)).addScaledVector(f.right, Math.sin(yaw) * Math.cos(pitch)).addScaledVector(f.up, Math.sin(pitch));
				list.push({ id: `${f.room} from ${def.id} yaw${k} pitch${pitch}`, group: `room ${f.room}`, room: f.room, at: at.toArray(), target: at.clone().add(dir).toArray(), up: f.up.toArray(), scale: s });
			}
	}
	// drawing the view, and reading it back through a 2D canvas
	const c2 = document.createElement('canvas');
	c2.width = d.renderer.domElement.width;
	c2.height = d.renderer.domElement.height;
	const ctx = c2.getContext('2d', { willReadFrequently: true });
	const M = d.camera.matrix.constructor;
	window.__z = {
		draw(v, nudge) {
			const cam = d.camera;
			cam.near = 0.03 * v.scale;
			cam.updateProjectionMatrix();
			cam.position.set(v.at[0], v.at[1], v.at[2]);
			cam.up.set(v.up[0], v.up[1], v.up[2]);
			cam.lookAt(v.target[0], v.target[1], v.target[2]);
			if (nudge) {
				cam.rotateY(1.1e-4);
				cam.rotateX(0.7e-4);
				cam.translateX(1.5e-4 * v.scale);
			}
			cam.updateMatrixWorld(true);
			d.world.portals.render(cam, v.room);
			ctx.drawImage(d.renderer.domElement, 0, 0);
			return ctx.getImageData(0, 0, c2.width, c2.height);
		},
		test(v) {
			const a = this.draw(v, false).data;
			const b = this.draw(v, true).data;
			const w = c2.width;
			const h = c2.height;
			const mask = new Uint8Array(w * h);
			let lit = 0;
			for (let i = 0, p = 0; p < w * h; i += 4, p++) {
				lit += a[i] + a[i + 1] + a[i + 2];
				if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 80) mask[p] = 1;
			}
			// areas, not edges: a pixel counts when most of its neighbourhood flipped too
			let count = 0;
			let x0 = w, y0 = h, x1 = 0, y1 = 0;
			for (let y = 1; y < h - 1; y++)
				for (let x = 1; x < w - 1; x++) {
					const p = y * w + x;
					if (!mask[p]) continue;
					const n = mask[p - 1] + mask[p + 1] + mask[p - w] + mask[p + w] + mask[p - w - 1] + mask[p - w + 1] + mask[p + w - 1] + mask[p + w + 1];
					if (n >= 5) {
						count++;
						if (x < x0) x0 = x;
						if (x > x1) x1 = x;
						if (y < y0) y0 = y;
						if (y > y1) y1 = y;
					}
				}
			this.mask = mask;
			return { count, box: count ? [x0, y0, x1, y1] : null, lit: lit / (w * h * 3) };
		},
		/** The view with what flipped painted red, as a picture. */
		marked(v) {
			this.test(v);
			const img = this.draw(v, false);
			const w = c2.width;
			for (let p = 0; p < this.mask.length; p++) {
				if (!this.mask[p]) continue;
				const m = this.mask;
				const n = (m[p - 1] ?? 0) + (m[p + 1] ?? 0) + (m[p - w] ?? 0) + (m[p + w] ?? 0) + (m[p - w - 1] ?? 0) + (m[p - w + 1] ?? 0) + (m[p + w - 1] ?? 0) + (m[p + w + 1] ?? 0);
				if (n < 5) continue;
				img.data[4 * p] = 255;
				img.data[4 * p + 1] = 0;
				img.data[4 * p + 2] = 40;
			}
			ctx.putImageData(img, 0, 0);
			return c2.toDataURL('image/jpeg', 0.85);
		},
	};
	void M;
	return list;
});

const results = [];
let blank = 0;
for (let i = 0; i < views.length; i += 40) {
	const chunk = views.slice(i, i + 40);
	const r = await page.evaluate((chunk) => chunk.map((v) => window.__z.test(v)), chunk);
	r.forEach((x, k) => {
		results.push({ ...chunk[k], ...x });
		if (x.lit < 1) blank++;
	});
}
const flagged = results.filter((r) => r.count >= 30).sort((a, b) => b.count - a.count);
const groups = new Map();
for (const f of flagged) groups.set(f.group, [...(groups.get(f.group) ?? []), f]);
console.log(`${views.length} views, ${flagged.length} flagged (30+ pixels flipping), in ${groups.size} places${blank ? `, ${blank} blank reads` : ''}`);
for (const [g, list] of groups) console.log(`  ${g}: ${list.length} views, worst ${list[0].count} px  (${list[0].id})`);
// stills of the worst view of each place, both draws, and the flagged area marked
let n = 0;
for (const [g, list] of [...groups].slice(0, keep)) {
	const v = list[0];
	const name = `${String(n++).padStart(2, '0')}-${g.replace(/[^a-z0-9_]+/gi, '-')}`;
	await page.evaluate((v) => window.__z.draw(v, false), v);
	await page.waitForTimeout(60);
	await page.screenshot({ path: join(out, `${name}.png`) });
	const url = await page.evaluate((v) => window.__z.marked(v), v);
	writeFileSync(join(out, `${name}-marked.jpg`), Buffer.from(url.split(',')[1], 'base64'));
}
writeFileSync(join(out, 'flagged.json'), JSON.stringify(flagged.map(({ id, group, room, at, target, up, scale, count, box }) => ({ id, group, room, at, target, up, scale, count, box })), null, 1));
if (errors.length) console.log('ERRORS\n' + [...new Set(errors)].slice(0, 10).join('\n'));
await browser.close();
server.stop();
