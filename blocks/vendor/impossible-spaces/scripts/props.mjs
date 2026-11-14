// Things through openings: rolled, thrown and carried. Logs where each ends up, and saves a strip of one roll.
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { open, serve } from './lib.mjs';

const server = await serve('dist');
const { browser, page, errors } = await open(`${server.url}?test&nohud`);
const out = 'work/props';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const run = (name, setup, frames, shots) =>
	page.evaluate(
		async ({ setup, frames }) => {
			const d = window.__demo;
			const origin = (room) => d.world.level.rooms.find((r) => r.id === room).origin;
			d.restart();
			const p = d.props.list[setup.prop];
			const o = origin(setup.room);
			// move the thing to its start, in the room it starts in
			p.room = setup.room;
			d.world.portals.room(setup.room).add(p.mesh, p.shadow);
			p.body.setTranslation({ x: o[0] + setup.at[0], y: o[1] + setup.at[1], z: o[2] + setup.at[2] }, true);
			p.last.set(o[0] + setup.at[0], o[1] + setup.at[1], o[2] + setup.at[2]);
			p.body.setLinvel({ x: setup.v[0], y: setup.v[1], z: setup.v[2] }, true);
			const c = setup.cam;
			const co = origin(c[0]);
			d.player.place(c[0], { x: co[0] + c[1], y: co[1] + c[2], z: co[2] + c[3] }, c[4], c[5] ?? 0);
			if (setup.hold) {
				d.props.held = p;
				d.player.ignore = p.collider;
			}
			window.__run = { p, frames, i: 0, log: [], setup };
		},
		{ setup, frames },
	).then(async () => {
		let n = 0;
		for (let i = 0; i < frames; i++) {
			const s = await page.evaluate(() => {
				const d = window.__demo;
				const r = window.__run;
				d.frame(1 / 60, r.setup.walk ?? { forward: 0, strafe: 0, run: false, jump: false });
				const t = r.p.body.translation();
				const o = d.world.level.rooms.find((x) => x.id === r.p.room).origin;
				return { room: r.p.room, scale: +r.p.scale.toFixed(3), down: r.p.down.toArray().map((v) => +v.toFixed(2)), at: [t.x - o[0], t.y - o[1], t.z - o[2]].map((v) => +v.toFixed(2)), twin: r.p.twin.visible, player: d.player.room };
			});
			if (shots && i >= shots[0] && i < shots[1]) await page.screenshot({ path: `${out}/${name}-${String(n++).padStart(3, '0')}.png` });
			if (i === frames - 1 || (i > 0 && s.room !== last?.room)) console.log(name, i, JSON.stringify(s));
			var last = s;
		}
		if (n) execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', `${out}/${name}-%03d.png`, '-vf', `select=not(mod(n\\,2)),scale=426:-1,tile=4x${Math.ceil(n / 8)}`, '-frames:v', '1', `${out}/${name}.png`]);
	});

const H = Math.PI / 2;
await run('roll', { prop: 0, room: 'a', at: [4.4, 0.2, 5.3], v: [3.2, 0, 0], cam: ['a', 3.3, 0, 6.6, -1.0] }, 90, [10, 42]);
await run('shrink', { prop: 0, room: 's', at: [2.5, 0.5, 1.3], v: [0, 1.5, -3.5], cam: ['s', 2.1, 0, 2.6, 0.25] }, 150, [8, 40]);
await run('gravity', { prop: 0, room: 'l', at: [3.0, 0.5, 1.4], v: [0, 1.0, -3.5], cam: ['l', 3.0, 0, 3.4, 0] }, 180, [8, 40]);
await run('window', { prop: 0, room: 'a', at: [7.0, 1.5, 7.6], v: [0, 0.6, -5], cam: ['a', 8.6, 0, 8.6, 0.6] }, 120, [6, 38]);
await run('carry', { prop: 0, room: 'a', at: [5.0, 1.5, 5.0], v: [0, 0, 0], cam: ['a', 4.4, 0, 5.0, -H], hold: true, walk: { forward: 1, strafe: 0, run: false, jump: false } }, 120, [10, 42]);
if (errors.length) console.log('ERRORS\n' + [...new Set(errors)].slice(0, 10).join('\n'));
await browser.close();
server.stop();
