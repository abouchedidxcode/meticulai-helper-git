// Stills from given poses: node scripts/shot.mjs <out-dir> name=room:x,y,z:yaw:pitch ...  [--size 1280x720] [--dist]
// Positions are feet, in the room's own coordinates (its origin is added).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { open, serve } from './lib.mjs';

const args = process.argv.slice(2);
const out = args.shift();
const size = (args.find((a) => a.startsWith('--size='))?.slice(7) ?? '1280x720').split('x').map(Number);
const poses = args.filter((a) => !a.startsWith('--'));
mkdirSync(out, { recursive: true });
const server = await serve(args.includes('--dist') ? 'dist' : 'dist');
const query = args.find((a) => a.startsWith('--query='))?.slice(8) ?? '';
const { browser, page, errors } = await open(`${server.url}?test&nohud${query ? '&' + query : ''}`, { width: size[0], height: size[1] });
console.log('ready:', await page.evaluate(() => !!window.__demo?.ready));
for (const pose of poses) {
	const [name, spec] = pose.split('=');
	if (spec.startsWith('@')) {
		// in front of an opening, the body's up the opening's up: @id:distance:yaw:pitch:side (yaw 0 looks in)
		const [id, dist = '1', yaw = '0', pitch = '0', side = '0'] = spec.slice(1).split(':');
		const info = await page.evaluate(({ id, dist, yaw, pitch, side }) => {
			const d = window.__demo;
			const T = d.camera.position.constructor;
			const Q = d.camera.quaternion.constructor;
			const f = d.world.frames.get(id);
			const s = f.size;
			const feet = new T().copy(f.position).addScaledVector(f.up, -f.height / 2).addScaledVector(f.normal, dist * s).addScaledVector(f.right, side * s);
			const frame = new Q().setFromRotationMatrix(d.camera.matrix.clone().makeBasis(f.right, f.up, f.normal));
			d.player.place(f.room, feet, yaw, pitch, frame, s < 1 ? s : 1);
			for (let i = 0; i < 30; i++) d.frame(1 / 120);
			d.frame(0);
			return { ...d.world.portals.stats };
		}, { id, dist: Number(dist), yaw: Number(yaw), pitch: Number(pitch), side: Number(side) });
		await page.waitForTimeout(150);
		await page.screenshot({ path: join(out, `${name}.png`) });
		console.log(name, JSON.stringify(info));
		continue;
	}
	const [room, pos, yaw = '0', pitch = '0'] = spec.split(':');
	const p = pos.split(',').map(Number);
	const info = await page.evaluate(
		({ room, p, yaw, pitch }) => {
			const d = window.__demo;
			const o = d.world.level.rooms.find((r) => r.id === room).origin;
			d.player.place(room, { x: o[0] + p[0], y: o[1] + p[1], z: o[2] + p[2] }, yaw, pitch);
			d.frame(0);
			d.frame(0);
			return { ...d.world.portals.stats };
		},
		{ room, p, yaw: Number(yaw), pitch: Number(pitch) },
	);
	await page.waitForTimeout(150);
	await page.screenshot({ path: join(out, `${name}.png`) });
	console.log(name, JSON.stringify(info));
}
if (errors.length) console.log('ERRORS\n' + [...new Set(errors)].slice(0, 20).join('\n'));
await browser.close();
server.stop();
