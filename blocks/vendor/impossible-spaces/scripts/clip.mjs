// A clip of two walks, frame by frame at 60 fps, 1080p, no HUD: node scripts/clip.mjs [out.mp4] [--takes tunnel,table]
// The look is a loose spring with a little overshoot and drift, so it reads as a hand on a mouse.
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { open, serve } from './lib.mjs';

const H = Math.PI / 2;
const TAKES = {
	// round the short box, then into it and on, and on
	tunnel: {
		start: ['a', [2.3, 0, 8.5], -0.75, -0.03],
		actions: [
			{ wait: 0.35 },
			{ goto: [4.15, 5.15], radius: 0.45, bias: -0.22 },
			{ hold: 0.5, forward: 1, yaw: -H, pitch: -0.02 },
			{ hold: 1.9, forward: 1, yaw: -H, pitch: 0.0, run: true },
			{ hold: 0.65, forward: 0.9, strafe: -0.44, yaw: -H - 0.45, pitch: -0.03, run: true },
			{ hold: 1.3, forward: 1, yaw: -H, pitch: 0.01, run: true },
		],
	},
	// the door on the table, then through the big one and out across the tabletop
	table: {
		start: ['s', [2.75, 0, 2.7], -2.3, -0.42],
		actions: [
			{ wait: 1.0 },
			{ turn: 0.08, pitch: -0.04, dur: 0.75 },
			{ hold: 1.45, forward: 1, yaw: 0.05, pitch: -0.03 },
			{ hold: 1.25, forward: 1, yaw: 0.0, pitch: -0.08 },
			{ turn: 0.55, pitch: 0.28, dur: 0.9 },
			{ turn: 2.7, pitch: 0.12, dur: 1.4 },
			{ wait: 0.5 },
		],
	},
	// the small black hut, and what is in it
	hut: {
		start: ['b', [1.2, 0, 7.4], -1.0, -0.02],
		actions: [
			{ wait: 0.3 },
			{ goto: [3.7, 5.0], radius: 0.4, bias: -0.15 },
			{ hold: 1.6, forward: 1, yaw: -H, pitch: 0.0 },
			{ hold: 1.2, forward: 1, yaw: -H, pitch: 0.42 },
			{ turn: -H + 0.7, pitch: 0.2, dur: 1.0 },
		],
	},
};

const args = process.argv.slice(2);
const outFile = args.find((a) => a.endsWith('.mp4')) ?? 'shots/walk.mp4';
const takes = (args[args.indexOf('--takes') + 1] && args.includes('--takes') ? args[args.indexOf('--takes') + 1] : 'tunnel,table').split(',');
const frames = 'work/clip';
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const server = await serve('dist');
const { browser, page, errors } = await open(`${server.url}?test&nohud`, { width: 1920, height: 1080 });
let n = 0;
for (const name of takes) {
	const take = TAKES[name];
	await page.evaluate(({ take }) => {
		const d = window.__demo;
		const o = d.world.level.rooms.find((r) => r.id === take.start[0]).origin;
		d.restart();
		d.player.place(take.start[0], { x: o[0] + take.start[1][0], y: o[1] + take.start[1][1], z: o[2] + take.start[1][2] }, take.start[2], take.start[3]);
		for (let i = 0; i < 30; i++) d.frame(1 / 60);
		// the hand: yaw and pitch chase a target on an underdamped spring, with slow drift on top
		window.__bot = { actions: take.actions.map((a) => ({ ...a })), i: 0, t: 0, time: 0, yaw: take.start[2], pitch: take.start[3], vy: 0, vp: 0, ty: take.start[2], tp: take.start[3] };
	}, { take });
	await page.waitForTimeout(300);
	for (;;) {
		const done = await page.evaluate(() => {
			const d = window.__demo;
			const b = window.__bot;
			const dt = 1 / 60;
			const a = b.actions[b.i];
			if (!a) return true;
			const input = { forward: 0, strafe: 0, run: false, jump: false };
			const near = (target, from) => from + Math.atan2(Math.sin(target - from), Math.cos(target - from));
			b.t += dt;
			b.time += dt;
			let over = false;
			if (a.wait !== undefined) over = b.t >= a.wait;
			else if (a.turn !== undefined) {
				b.ty = near(a.turn, b.ty);
				b.tp = a.pitch ?? b.tp;
				over = b.t >= a.dur;
			} else if (a.hold !== undefined) {
				if (a.yaw !== undefined) b.ty = near(a.yaw, b.ty);
				if (a.pitch !== undefined) b.tp = a.pitch;
				input.forward = a.forward ?? 0;
				input.strafe = a.strafe ?? 0;
				input.run = !!a.run;
				over = b.t >= a.hold;
			} else if (a.goto) {
				const o = d.world.level.rooms.find((r) => r.id === d.player.room).origin;
				const dx = o[0] + a.goto[0] - d.player.position.x;
				const dz = o[2] + a.goto[1] - d.player.position.z;
				// the feet go to the point; the eyes wander off it by `bias`, most at the start
				const left = Math.hypot(dx, dz);
				const fade = Math.min(1, left / 2.5);
				b.ty = near(Math.atan2(-dx, -dz) + (a.bias ?? 0) * fade, b.ty);
				b.tp = a.pitch ?? b.tp;
				input.forward = 1;
				input.strafe = (a.bias ?? 0) * fade * 0.9;
				input.run = !!a.run;
				over = left < (a.radius ?? 0.3) || b.t > 8;
			}
			if (over) {
				b.i++;
				b.t = 0;
			}
			const drift = 0.006 * Math.sin(b.time * 1.7) + 0.004 * Math.sin(b.time * 3.1 + 1);
			const w = 7.5;
			const z = 0.62;
			b.vy += (w * w * (b.ty + drift - b.yaw) - 2 * z * w * b.vy) * dt;
			b.vp += (w * w * (b.tp + drift * 0.6 - b.pitch) - 2 * z * w * b.vp) * dt;
			b.yaw += b.vy * dt;
			b.pitch += b.vp * dt;
			d.player.yaw = b.yaw;
			d.player.pitch = b.pitch;
			d.frame(dt, input);
			return false;
		});
		if (done) break;
		await page.screenshot({ path: join(frames, `${String(n++).padStart(5, '0')}.png`) });
	}
	console.log(name, 'frames so far', n);
}
if (errors.length) console.log('ERRORS\n' + [...new Set(errors)].slice(0, 10).join('\n'));
await browser.close();
server.stop();
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '60', '-i', join(frames, '%05d.png'), '-c:v', 'libx264', '-crf', '15', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile]);
console.log('wrote', outFile, (n / 60).toFixed(1), 's');
