// Packs the baked light (bake/<room>.exr, half floats, about 65 MB) into what the demo downloads:
// public/lightmaps/<room>.webp, eight bits a channel, and public/lightmaps.json with each one's range.
//   node tools/pack-lightmaps.mjs [--scale 0.5] [--denoise 2] [--only a,b]      (needs ffmpeg with libwebp on the PATH)
//
// - The light is stored as (L / max)^(1/2.2): the same share of the codes to dark and bright as a photo has.
//   `max` is the room's own, a little over its brightest surface (sun patches above 8 are clipped: they are
//   white on screen long before).
// - Texels no surface uses are filled in from their neighbours first, so nothing dark bleeds into a surface's
//   edge when the picture is compressed or filtered.
// - A little noise goes in before rounding to eight bits, so a slow gradient on a plain wall doesn't step.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const flag = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const quality = Number(flag('quality', 100));
const DENOISE = Number(flag('denoise', 2));
const RANGE = Number(flag('range', 0.06));
const DITHER = flag('dither', 'rect');
const only = flag('only', '');
const SCALE = Number(flag('scale', 0.5));
const GAMMA = 2.2;
const CAP = 8;
const from = join(root, 'bake');
const to = join(root, 'public', 'lightmaps');
mkdirSync(to, { recursive: true });

/** A small fast random, the same every run, so a rebuild gives the same files. */
function mulberry(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const ranges = {};
let before = 0;
let after = 0;
for (const name of readdirSync(from).filter((f) => f.endsWith('.exr') && (!only || only.split(',').includes(f.slice(0, -4)))).sort()) {
	const room = name.slice(0, -4);
	const file = readFileSync(join(from, name));
	before += file.length;
	const exr = new EXRLoader().setDataType(THREE.FloatType).parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.length));
	const { width: w, height: h } = exr;
	const src = exr.data;
	const step = src.length / (w * h);
	const rgb = new Float32Array(w * h * 3);
	const used = new Uint8Array(w * h);
	const values = [];
	for (let p = 0; p < w * h; p++) {
		const [r, g, b] = [src[p * step], src[p * step + 1], src[p * step + 2]];
		rgb[3 * p] = r;
		rgb[3 * p + 1] = g;
		rgb[3 * p + 2] = b;
		if (r + g + b > 0) {
			used[p] = 1;
			if (p % 7 === 0) values.push(Math.max(r, g, b));
		}
	}
	values.sort((a, b) => a - b);
	const max = Math.min(CAP, Math.max(0.25, values[Math.floor(values.length * 0.9995)] * 1.1));
	// fill what no surface uses from what is next to it, a ring at a time
	let edge = used;
	for (let pass = 0; pass < 12; pass++) {
		const next = edge.slice();
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				const p = y * w + x;
				if (edge[p]) continue;
				let n = 0;
				let r = 0;
				let g = 0;
				let b = 0;
				for (let dy = -1; dy <= 1; dy++)
					for (let dx = -1; dx <= 1; dx++) {
						const xx = x + dx;
						const yy = y + dy;
						if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
						const q = yy * w + xx;
						if (!edge[q]) continue;
						n++;
						r += rgb[3 * q];
						g += rgb[3 * q + 1];
						b += rgb[3 * q + 2];
					}
				if (!n) continue;
				rgb[3 * p] = r / n;
				rgb[3 * p + 1] = g / n;
				rgb[3 * p + 2] = b / n;
				next[p] = 1;
			}
		edge = next;
	}
	// The bake's own grain (it is sampled light) costs more bytes than everything else in the picture, so it is
	// smoothed away first: each texel takes the average of its neighbours that are close to it in brightness,
	// which leaves a shadow's edge alone.
	for (let pass = 0; pass < DENOISE; pass++) {
		const copy = rgb.slice();
		const R = 2;
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				const p = y * w + x;
				if (!edge[p]) continue;
				const l0 = copy[3 * p] + copy[3 * p + 1] + copy[3 * p + 2];
				const tol = l0 * RANGE + 1e-4;
				let n = 0;
				let r = 0;
				let g = 0;
				let b = 0;
				for (let dy = -R; dy <= R; dy++) {
					const yy = y + dy;
					if (yy < 0 || yy >= h) continue;
					for (let dx = -R; dx <= R; dx++) {
						const xx = x + dx;
						if (xx < 0 || xx >= w) continue;
						const q = yy * w + xx;
						if (!used[q]) continue;
						const d = Math.abs(copy[3 * q] + copy[3 * q + 1] + copy[3 * q + 2] - l0);
						if (d > tol) continue;
						const k = 1 - d / tol;
						n += k;
						r += copy[3 * q] * k;
						g += copy[3 * q + 1] * k;
						b += copy[3 * q + 2] * k;
					}
				}
				if (n > 0) {
					rgb[3 * p] = r / n;
					rgb[3 * p + 1] = g / n;
					rgb[3 * p + 2] = b / n;
				}
			}
	}
	// the rest takes the room's average, so the codec has nothing sharp to spend bits on
	let mean = [0, 0, 0];
	let count = 0;
	for (let p = 0; p < w * h; p += 5) if (used[p]) { mean[0] += rgb[3 * p]; mean[1] += rgb[3 * p + 1]; mean[2] += rgb[3 * p + 2]; count++; }
	mean = mean.map((v) => v / Math.max(1, count));
	// The picture is stored at `SCALE` of the bake's size (each texel the average of the ones it covers).
	// Baked light is soft: the sun's edge is 20 cm wide by the time it reaches a floor.
	const W = Math.round(w * SCALE);
	const H = Math.round(h * SCALE);
	const k = Math.round(1 / SCALE);
	const random = mulberry(w * 31 + room.length * 977 + room.charCodeAt(0));
	const bytes = Buffer.alloc(W * H * 3);
	for (let y = 0; y < H; y++)
		for (let x = 0; x < W; x++) {
			// (noise of one code before rounding, the same on all three channels of a texel so it adds no colour)
			const noise = DITHER === 'tri' ? random() - random() : DITHER === 'rect' ? random() - 0.5 : 0;
			for (let c = 0; c < 3; c++) {
				let v = 0;
				let n = 0;
				for (let dy = 0; dy < k; dy++)
					for (let dx = 0; dx < k; dx++) {
						const p = (y * k + dy) * w + x * k + dx;
						if (!edge[p]) continue;
						v += rgb[3 * p + c];
						n++;
					}
				v = n ? v / n : mean[c];
				const code = Math.pow(Math.min(Math.max(v, 0), max) / max, 1 / GAMMA) * 255 + noise;
				bytes[3 * (y * W + x) + c] = Math.max(0, Math.min(255, Math.round(code)));
			}
		}
	const outputs = args.includes('--try')
		? [
				[`lossless-${DITHER}-d${DENOISE}`, ['-lossless', '1', '-compression_level', '6']],
			]
		: [['', quality >= 100 ? ['-lossless', '1', '-compression_level', '6'] : ['-quality', String(quality), '-compression_level', '6']]];
	const sizes = [];
	for (const [tag, opts] of outputs) {
		const out = args.includes('--try') ? join(root, 'work', 'lm-try', `${room}-${tag}.webp`) : join(to, `${room}.webp`);
		mkdirSync(dirname(out), { recursive: true });
		const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', '-', '-c:v', 'libwebp', ...opts, '-frames:v', '1', out], { input: bytes });
		if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
		sizes.push(`${tag} ${(statSync(out).size / 1048576).toFixed(2)}`);
		if (!args.includes('--try')) after += statSync(out).size;
	}
	ranges[room] = { max: Math.round(max * 1000) / 1000, gamma: GAMMA, size: W };
	console.log(`${room}: ${W}px, max ${max.toFixed(2)}, MB:${sizes.join(',')}`);
}
if (!args.includes('--try')) {
	writeFileSync(join(root, 'public', 'lightmaps.json'), JSON.stringify(ranges));
	console.log(`${(before / 1048576).toFixed(1)} MB of EXR -> ${(after / 1048576).toFixed(2)} MB of WebP`);
}
