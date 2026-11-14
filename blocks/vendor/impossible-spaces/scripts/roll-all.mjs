// Rolls a ball in through every walkable opening and checks where it comes out, how fast and which way is down.
import { open, serve } from './lib.mjs';

const server = await serve('dist');
const { browser, page, errors } = await open(`${server.url}?test&nohud`, { width: 640, height: 360 });
const results = await page.evaluate(() => {
	const d = window.__demo;
	const V = d.camera.position.constructor;
	const out = [];
	for (const def of d.world.level.portals.filter((p) => p.walk)) {
		const f = d.world.frames.get(def.id);
		d.restart();
		const p = d.props.list[0];
		const s = f.size < 1 ? f.size : 1;
		// a ball the opening's size, on its sill, rolling in; its down is the opening's down
		if (s !== 1) {
			p.scale = s;
			p.collider.setRadius(p.size * s);
		}
		const r = p.size * s;
		const at = new V().copy(f.position).addScaledVector(f.up, -f.height / 2 + r + 0.01 * s).addScaledVector(f.normal, 0.5 * s);
		p.room = f.room;
		d.world.portals.room(f.room).add(p.mesh, p.shadow);
		p.down.copy(f.up).negate();
		p.body.setTranslation(at, true);
		p.last.copy(at);
		const v = new V().copy(f.normal).multiplyScalar(-2.5 * s);
		p.body.setLinvel(v, true);
		p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
		d.player.place(f.room, new V().copy(f.position).addScaledVector(f.normal, 30), 0);
		let crossed = -1;
		let speedIn = 0;
		let speedOut = 0;
		let twin = false;
		for (let i = 0; i < 90 && crossed < 0; i++) {
			const before = p.body.linvel();
			speedIn = Math.hypot(before.x, before.y, before.z);
			const was = new V().copy(p.last);
			d.props.before(d.player);
			d.world.physics.timestep = 1 / 120;
			d.world.physics.step();
			d.props.after();
			twin = twin || p.twin.visible;
			if (p.room !== f.room || p.scale !== s || p.last.distanceTo(was) > 1) {
				crossed = i;
				const after = p.body.linvel();
				speedOut = Math.hypot(after.x, after.y, after.z);
			}
		}
		const want = f.link;
		const downWant = new V().copy(f.up).negate().applyQuaternion(f.turn);
		const along = new V().copy(p.body.linvel()).normalize().dot(want.normal);
		out.push({ id: def.id, ok: crossed >= 0 && p.room === want.room && Math.abs(p.scale - s * f.scale) < 1e-6 && p.down.distanceTo(downWant) < 1e-3 && along > 0.7 && twin, crossed, room: p.room, scale: +p.scale.toFixed(3), speed: +(speedOut / Math.max(1e-9, speedIn * f.scale)).toFixed(2), along: +along.toFixed(2), twin });
	}
	d.restart();
	return out;
});
for (const r of results) if (!r.ok) console.log('FAILED', JSON.stringify(r));
console.log(`${results.filter((r) => r.ok).length} of ${results.length} openings: ball crossed, right room, size, down, heading and speed; drawn on both sides`);
console.log('speed kept (out / in × scale):', [...new Set(results.map((r) => r.speed))].join(', '));
if (errors.length) console.log('ERRORS\n' + [...new Set(errors)].slice(0, 10).join('\n'));
await browser.close();
server.stop();
