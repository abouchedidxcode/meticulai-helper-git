// Frame cost at 1080p, uncapped: each frame is drawn and waited on (GPU included), from fixed spots.
// Run it with nothing else on the graphics card.
import { open, serve } from './lib.mjs';

const H = Math.PI / 2;
const SPOTS = {
	'stairs, looking up (deepest)': ['stair', [1.2, 0, 1.1], -H, 0.25],
	'tunnel mouth': ['a', [4.3, 0, 5.3], -1.45, 0],
	'gallery, tunnel and doors': ['a', [1.8, 0, 8.3], -0.62, 0],
	'inside the tunnel': ['lt', [8, 0, 1], -H, 0],
	'table room': ['s', [1.2, 0, 5.6], -0.95, 0],
	'hall': ['h', [1.5, 0, 6], -H, 0],
};
const server = await serve('dist');
const { browser, page, errors } = await open(`${server.url}?test&nohud`, { width: 1920, height: 1080 });
for (const [name, [room, p, yaw, pitch]] of Object.entries(SPOTS)) {
	const r = await page.evaluate(async ({ room, p, yaw, pitch }) => {
		const d = window.__demo;
		const o = d.world.level.rooms.find((r) => r.id === room).origin;
		d.player.place(room, { x: o[0] + p[0], y: o[1] + p[1], z: o[2] + p[2] }, yaw, pitch);
		const device = d.renderer.backend.device;
		const times = [];
		for (let i = 0; i < 240; i++) {
			const t0 = performance.now();
			d.player.yaw = yaw + 0.05 * Math.sin(i * 0.1);
			d.frame(1 / 60);
			await device.queue.onSubmittedWorkDone();
			if (i >= 40) times.push(performance.now() - t0);
		}
		times.sort((a, b) => a - b);
		return { median: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * 0.95)], views: d.world.portals.stats.views, depth: d.world.portals.stats.depth };
	}, { room, p, yaw, pitch });
	console.log(`${name}: ${(1000 / r.median).toFixed(0)} fps (median ${r.median.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms), ${r.views} views, ${r.depth} deep`);
}
if (errors.length) console.log('ERRORS\n' + [...new Set(errors)].slice(0, 10).join('\n'));
await browser.close();
server.stop();
