// Walks in through every walkable opening, frame by frame (1/240 s), straight and slanted, and reports any
// that fail to cross or pop: node scripts/all.mjs [portal ids...]
// Each frame is read back in the page and compared with the one before; a pop is a frame unlike both neighbours.
import { open, serve } from './lib.mjs';

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const server = await serve('dist');
const { browser, page, errors } = await open(`${server.url}?test&nohud`, { width: 960, height: 540 });
const ids = await page.evaluate(() => window.__demo.world.level.portals.filter((p) => p.walk).map((p) => p.id));
const results = [];
for (const id of ids) {
	if (only.length && !only.includes(id)) continue;
	for (const mode of ['straight', 'slant']) {
		const r = await page.evaluate(({ id, mode }) => {
			const d = window.__demo;
			const T = d.camera.position.constructor;
			const Q = d.camera.quaternion.constructor;
			const f = d.world.frames.get(id);
			const s = f.size;
			// stand in front of it, feet on its sill, the body's up the opening's up, facing in
			const feet = new T().copy(f.position).addScaledVector(f.up, -f.height / 2).addScaledVector(f.normal, 0.55 * s + (mode === 'slant' ? 0.1 * s : 0)).addScaledVector(f.right, mode === 'slant' ? 0.12 * f.width : 0);
			const frame = new Q().setFromRotationMatrix(d.camera.matrix.clone().makeBasis(f.right, f.up, f.normal));
			d.restart();
			d.player.place(f.room, feet, mode === 'slant' ? 0.5 : 0, mode === 'slant' ? -0.2 : 0, frame, s < 1 ? s : 1);
			for (let i = 0; i < 20; i++) d.frame(1 / 120);
			const c2 = (window.__small ??= Object.assign(document.createElement('canvas'), { width: 480, height: 270 }));
			const ctx = c2.getContext('2d', { willReadFrequently: true });
			let last = null;
			let crossed = -1;
			let passed = false;
			const keep = d.player.onPass;
			d.player.onPass = (through) => {
				passed = true;
				keep(through);
			};
			const diffs = [];
			let dark = 0;
			for (let i = 0; i < 150; i++) {
				passed = false;
				d.frame(1 / 240, { forward: 1, strafe: 0, run: false, jump: false });
				if (passed && crossed < 0) crossed = i;
				ctx.drawImage(d.renderer.domElement, 0, 0, 480, 270);
				const now = ctx.getImageData(0, 0, 480, 270).data;
				let sum = 0;
				let lit = 0;
				if (last) for (let k = 0; k < now.length; k += 4) sum += Math.abs(now[k] - last[k]) + Math.abs(now[k + 1] - last[k + 1]) + Math.abs(now[k + 2] - last[k + 2]);
				for (let k = 0; k < now.length; k += 16) lit += now[k] + now[k + 1] + now[k + 2];
				if (lit / (now.length / 16) / 3 < 2) dark++;
				if (last) diffs.push(sum / (now.length / 4) / 3);
				last = now;
				if (crossed >= 0 && i > crossed + 30) break;
			}
			d.player.onPass = keep;
			let worst = 0;
			let at = -1;
			for (let i = 1; i + 1 < diffs.length; i++) {
				const jump = diffs[i] - (diffs[i - 1] + diffs[i + 1]) / 2;
				if (jump > worst) {
					worst = jump;
					at = i + 1;
				}
			}
			return { id, mode, crossed, to: `${d.player.room}${d.player.scale !== 1 ? ' x' + d.player.scale.toFixed(1) : ''}`, pop: +worst.toFixed(2), popAt: at, atCross: crossed > 0 ? +diffs[crossed - 1].toFixed(2) : null, before: crossed > 3 ? +diffs[crossed - 3].toFixed(2) : null, dark };
		}, { id, mode });
		results.push(r);
		if (r.crossed < 0 || r.pop > 4 || r.dark) console.log('LOOK', JSON.stringify(r));
	}
}
const failed = results.filter((r) => r.crossed < 0);
const popped = results.filter((r) => r.pop > 4);
console.log(`${results.length} runs, ${failed.length} did not cross, ${popped.length} with a jump over 4, ${results.filter((r) => r.dark).length} with a black frame; largest jump ${Math.max(...results.map((r) => r.pop))} (frame-to-frame change while walking: ${Math.min(...results.map((r) => r.before ?? 9)).toFixed(2)} to ${Math.max(...results.map((r) => r.before ?? 0)).toFixed(2)})`);
if (errors.length) console.log('ERRORS\n' + [...new Set(errors)].slice(0, 10).join('\n'));
await browser.close();
server.stop();
