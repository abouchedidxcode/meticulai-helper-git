// Frame-stepped walks: node scripts/walk.mjs <scenario> [--every 1] [--size 1280x720] [--out work/walks]
// Every frame is stepped by hand (no clock), so a pop or a seam shows up as one frame in the strip.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { open, serve } from './lib.mjs';

const H = Math.PI / 2;
// start: room, feet (room coordinates), yaw, pitch. steps: frames at dt, with held input and turn rates (rad/s).
export const SCENARIOS = {
	'tunnel-slow': { start: ['a', [5.2, 0, 5.0], -H, 0], steps: [{ n: 200, dt: 1 / 240, forward: 1 }] },
	'tunnel-run': { start: ['a', [3.5, 0, 5.0], -H, 0], steps: [{ n: 60, dt: 1 / 60, forward: 1, run: true }] },
	'tunnel-back': { start: ['a', [5.45, 0, 5.0], H, 0], steps: [{ n: 200, dt: 1 / 240, forward: -1 }] },
	'tunnel-strafe': { start: ['a', [5.3, 0, 4.6], 0, 0], steps: [{ n: 120, dt: 1 / 240, strafe: 1 }] },
	'tunnel-graze': { start: ['a', [5.35, 0, 4.4], -2.57, 0], steps: [{ n: 220, dt: 1 / 240, forward: 1 }] },
	'tunnel-stop': { start: ['a', [5.72, 0, 5.0], -H, 0], steps: [{ n: 36, dt: 1 / 240, forward: 1 }, { n: 60, dt: 1 / 60, yawRate: 3.2 }, { n: 30, dt: 1 / 60, pitchRate: 1.5 }, { n: 30, dt: 1 / 60, pitchRate: -3 }] },
	'tunnel-through': { start: ['a', [4.2, 0, 5.0], -H, 0], steps: [{ n: 400, dt: 1 / 30, forward: 1, run: true }] },
	hut: { start: ['b', [3.6, 0, 5.0], -H, 0], steps: [{ n: 110, dt: 1 / 120, forward: 1 }] },
	'hut-out': { start: ['h', [1.6, 0, 6.0], H, 0], steps: [{ n: 120, dt: 1 / 120, forward: 1 }] },
	door: { start: ['a', [12.6, 0, 5.0], -H, 0], steps: [{ n: 110, dt: 1 / 120, forward: 1 }] },
	ring: { start: ['ring0', [4.5, 0, 8.0], 0, 0], steps: [{ n: 30, dt: 1 / 30, forward: 1 }, { n: 15, dt: 1 / 30, yawRate: H / 0.5 }, { n: 40, dt: 1 / 30, forward: 1 }, { n: 15, dt: 1 / 30, yawRate: -H / 0.5 }, { n: 80, dt: 1 / 30, forward: 1 }, { n: 15, dt: 1 / 30, yawRate: -H / 0.5 }, { n: 80, dt: 1 / 30, forward: 1 }, { n: 15, dt: 1 / 30, yawRate: -H / 0.5 }, { n: 80, dt: 1 / 30, forward: 1 }, { n: 15, dt: 1 / 30, yawRate: -H / 0.5 }, { n: 45, dt: 1 / 30, forward: 1 }, { n: 15, dt: 1 / 30, yawRate: -H / 0.5 }, { n: 20, dt: 1 / 30 }] },
	'ring-cut': { start: ['ring0', [5.2, 0, 1.0], H, 0], steps: [{ n: 150, dt: 1 / 240, forward: 1 }] },
	stairs: { start: ['stair', [0.4, 0, 1.1], -H, 0.25], steps: [{ n: 240, dt: 1 / 30, forward: 1 }] },
	'stairs-seam': { start: ['stair', [5.7, 2.3, 1.1], -H, 0.2], steps: [{ n: 120, dt: 1 / 240, forward: 1 }] },
	'stairs-down': { start: ['stair', [1.2, 0, 1.1], H, -0.5], steps: [{ n: 160, dt: 1 / 60, forward: 1 }] },
	gravity: { start: ['l', [3.0, 0, 2.2], 0, 0], steps: [{ n: 150, dt: 1 / 60, forward: 1 }, { n: 60, dt: 1 / 60, yawRate: 1.6 }] },
	table: { start: ['s', [2.5, 0, 1.8], 0, 0], steps: [{ n: 80, dt: 1 / 60, forward: 1 }, { n: 60, dt: 1 / 60, forward: 1, yawRate: 0.5 }, { n: 60, dt: 1 / 60, yawRate: 2.0 }] },
	mouse: { start: ['s', [6.4, 0, 3.5], -H, 0], steps: [{ n: 80, dt: 1 / 60, forward: 1 }, { n: 100, dt: 1 / 60, forward: 1 }] },
};

const args = process.argv.slice(2);
const name = args[0];
const flag = (k, d) => {
	const i = args.indexOf(`--${k}`);
	return i < 0 ? d : args[i + 1];
};
const every = Number(flag('every', 1));
const size = flag('size', '1280x720').split('x').map(Number);
const outRoot = flag('out', 'work/walks');
const scenario = SCENARIOS[name];
if (!scenario) throw new Error(`no scenario ${name}: ${Object.keys(SCENARIOS).join(', ')}`);
const out = join(outRoot, name);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const server = await serve('dist');
const { browser, page, errors } = await open(`${server.url}?test&nohud`, { width: size[0], height: size[1] });
await page.evaluate(({ room, p, yaw, pitch }) => {
	const d = window.__demo;
	const o = d.world.level.rooms.find((r) => r.id === room).origin;
	d.player.place(room, { x: o[0] + p[0], y: o[1] + p[1], z: o[2] + p[2] }, yaw, pitch);
	d.frame(0);
}, { room: scenario.start[0], p: scenario.start[1], yaw: scenario.start[2], pitch: scenario.start[3] });
await page.waitForTimeout(800);
const log = [];
let f = 0;
let shot = 0;
for (const step of scenario.steps) {
	for (let i = 0; i < step.n; i++) {
		const state = await page.evaluate((s) => {
			const d = window.__demo;
			d.player.yaw += (s.yawRate ?? 0) * s.dt;
			d.player.pitch += (s.pitchRate ?? 0) * s.dt;
			d.frame(s.dt, { forward: s.forward ?? 0, strafe: s.strafe ?? 0, run: !!s.run, jump: !!s.jump });
			const p = d.player;
			const o = d.world.level.rooms.find((r) => r.id === p.room).origin;
			return { room: p.room, x: +(p.position.x - o[0]).toFixed(3), y: +(p.position.y - o[1]).toFixed(3), z: +(p.position.z - o[2]).toFixed(3), scale: p.scale, grounded: p.grounded, views: d.world.portals.stats.views };
		}, step);
		log.push(state);
		if (f % every === 0) await page.screenshot({ path: join(out, `${String(shot++).padStart(4, '0')}.png`) });
		f++;
	}
}
writeFileSync(join(out, 'log.json'), JSON.stringify(log));
await browser.close();
server.stop();

// how much each frame differs from the one before: a pop is a spike
const stats = execFileSync('ffmpeg', ['-hide_banner', '-i', join(out, '%04d.png'), '-vf', 'tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const diffs = [...stats.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
const sorted = [...diffs].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
const spikes = diffs.map((d, i) => ({ i: i + 1, d })).filter((e) => e.d > Math.max(median * 4, median + 3));
const rooms = [];
for (const [i, s] of log.entries()) if (!rooms.length || rooms.at(-1).room !== s.room) rooms.push({ frame: i, room: s.room, scale: s.scale });
console.log(JSON.stringify({ name, frames: f, shots: shot, median: +median.toFixed(3), max: +Math.max(...diffs).toFixed(3), spikes: spikes.slice(0, 12), rooms, end: log.at(-1), maxViews: Math.max(...log.map((l) => l.views)) }));
if (errors.length) console.log('ERRORS\n' + [...new Set(errors)].slice(0, 12).join('\n'));
// a strip of the frames, small
const cols = Math.min(shot, 8);
const pick = Math.max(1, Math.ceil(shot / 32));
try {
	execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(out, '%04d.png'), '-vf', `select=not(mod(n\\,${pick})),scale=320:-1,tile=${cols}x${Math.ceil(shot / pick / cols)}`, '-frames:v', '1', join(out, 'strip.png')]);
} catch (e) {
	console.log('strip failed', e.message);
}
