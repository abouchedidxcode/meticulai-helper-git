// Turns the level definition into public/level.json: quads with texture and lightmap coordinates,
// colliders, portals. The Blender bake (tools/bake.py) and the demo both read that one file.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildLevel, MATERIALS } from './level-def.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const L = buildLevel();
const PAD = 2;
const MAX_DENSITY = 110;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const corner = (q, i) => q.p.slice(3 * i, 3 * i + 3);
const NORMALS = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };
const NATURAL = { x: [0, 2, 1], y: [1, 0, 2], z: [2, 0, 1] }; // axis index, then the two natural axes' indices

let bad = 0;
for (const q of L.quads) {
	const [p0, p1, p3] = [corner(q, 0), corner(q, 1), corner(q, 3)];
	const n = cross(sub(p1, p0), sub(p3, p0));
	const l = len(n) || 1;
	q.normal = n.map((v) => v / l);
	if (q.n) {
		const want = NORMALS[q.n];
		if (q.normal[0] * want[0] + q.normal[1] * want[1] + q.normal[2] * want[2] < 0.99) bad++;
	}
	q.size = [(len(sub(p1, p0)) + len(sub(corner(q, 2), p3))) / 2, (len(sub(p3, p0)) + len(sub(corner(q, 2), p1))) / 2];
	// texture coordinates in metres over the tile size
	const tile = MATERIALS[q.mat]?.tile ?? 1;
	if (q.n) {
		const [, a, b] = NATURAL[q.n[1]];
		q.uv0 = [0, 1, 2, 3].flatMap((i) => [corner(q, i)[a] / tile, corner(q, i)[b] / tile]);
	} else {
		const [w, h] = q.size;
		q.uv0 = [0, 0, w / tile, 0, w / tile, h / tile, 0, h / tile];
	}
}
if (bad) throw new Error(`${bad} quads face the wrong way`);

// Two surfaces in the same plane, facing the same way and overlapping, fight for depth on screen: refuse them.
// (Also told: same-facing surfaces closer than 3 mm, which fight at a distance.)
{
	const groups = new Map();
	for (const q of L.quads) {
		if (!q.n || q.bakeOnly) continue;
		const axis = NATURAL[q.n[1]];
		const xs = [0, 1, 2, 3].map((i) => corner(q, i)[axis[1]]);
		const ys = [0, 1, 2, 3].map((i) => corner(q, i)[axis[2]]);
		const rect = { q, level: corner(q, 0)[axis[0]], a0: Math.min(...xs), a1: Math.max(...xs), b0: Math.min(...ys), b1: Math.max(...ys) };
		// (only true rectangles: a round cap's strips share edges, and their bounds overlap without the strips doing so)
		if (!xs.every((x) => Math.abs(x - rect.a0) < 1e-6 || Math.abs(x - rect.a1) < 1e-6) || !ys.every((y) => Math.abs(y - rect.b0) < 1e-6 || Math.abs(y - rect.b1) < 1e-6)) continue;
		const key = `${q.room}|${q.n}`;
		groups.set(key, [...(groups.get(key) ?? []), rect]);
	}
	const clashes = [];
	const close = [];
	for (const [key, rects] of groups)
		for (let i = 0; i < rects.length; i++)
			for (let j = i + 1; j < rects.length; j++) {
				const [r, t] = [rects[i], rects[j]];
				const gap = Math.abs(r.level - t.level);
				if (gap > 0.003) continue;
				const w = Math.min(r.a1, t.a1) - Math.max(r.a0, t.a0);
				const h = Math.min(r.b1, t.b1) - Math.max(r.b0, t.b0);
				if (w <= 1e-6 || h <= 1e-6) continue;
				(gap < 1e-6 ? clashes : close).push(`${key} at ${r.level.toFixed(3)}: ${r.q.mat} and ${t.q.mat}, ${w.toFixed(3)} x ${h.toFixed(3)} m around (${((Math.max(r.a0, t.a0) + Math.min(r.a1, t.a1)) / 2).toFixed(2)}, ${((Math.max(r.b0, t.b0) + Math.min(r.b1, t.b1)) / 2).toFixed(2)})`);
			}
	const NL = String.fromCharCode(10) + '  ';
	if (close.length) console.log(`${close.length} pairs of surfaces under 3 mm apart:` + NL + close.join(NL));
	if (clashes.length) throw new Error(`${clashes.length} pairs of surfaces lie in one another:` + NL + clashes.join(NL));
}

/** Shelf packing of rects (w, h in texels, padding included) into a square of `size`. */
function pack(rects, size) {
	const order = rects.map((r, i) => i).sort((a, b) => rects[b].h - rects[a].h);
	let x = 0;
	let y = 0;
	let shelf = 0;
	for (const i of order) {
		const r = rects[i];
		if (r.w > size) return false;
		if (x + r.w > size) {
			x = 0;
			y += shelf;
			shelf = 0;
		}
		if (y + r.h > size) return false;
		r.x = x;
		r.y = y;
		x += r.w;
		shelf = Math.max(shelf, r.h);
	}
	return true;
}

const stats = [];
for (const room of L.rooms) {
	if (room.instanceOf) continue;
	const quads = L.quads.filter((q) => q.room === room.id && !q.bakeOnly && !q.emit);
	const size = room.atlas;
	const rectsAt = (density) =>
		quads.map((q) => ({
			w: Math.max(2, Math.ceil(q.size[0] * density * (q.lm ?? 1))) + 2 * PAD,
			h: Math.max(2, Math.ceil(q.size[1] * density * (q.lm ?? 1))) + 2 * PAD,
		}));
	let lo = 2;
	let hi = MAX_DENSITY;
	let best = null;
	for (let k = 0; k < 24; k++) {
		const mid = (lo + hi) / 2;
		const rects = rectsAt(mid);
		if (pack(rects, size)) {
			best = { rects, density: mid };
			lo = mid;
		} else hi = mid;
	}
	if (!best) throw new Error(`room ${room.id} does not fit its lightmap`);
	const fits = rectsAt(MAX_DENSITY);
	if (pack(fits, size)) best = { rects: fits, density: MAX_DENSITY };
	quads.forEach((q, i) => {
		const r = best.rects[i];
		const [x0, y0, x1, y1] = [(r.x + PAD) / size, (r.y + PAD) / size, (r.x + r.w - PAD) / size, (r.y + r.h - PAD) / size];
		q.uv1 = [x0, y0, x1, y0, x1, y1, x0, y1];
	});
	room.density = best.density;
	stats.push(`${room.id}: ${quads.length} quads, ${best.density.toFixed(1)} px/m in ${size}`);
}

const round = (v) => Math.round(v * 1e5) / 1e5;
const out = {
	materials: MATERIALS,
	rooms: L.rooms,
	quads: L.quads.map((q) => ({
		room: q.room,
		mat: q.mat,
		p: q.p.map(round),
		normal: q.normal.map(round),
		uv0: q.uv0.map(round),
		uv1: q.uv1?.map((v) => Math.round(v * 1e6) / 1e6),
		emit: q.emit,
		appOnly: q.appOnly || undefined,
		bakeOnly: q.bakeOnly || undefined,
		smooth: q.smooth,
	})),
	colliders: L.colliders,
	portals: L.portals,
	dynamics: L.dynamics,
	spawn: L.spawn,
};
for (const p of out.portals) if (!p.link) throw new Error(`portal ${p.id} is not linked`);
for (const p of out.portals) {
	const o = out.portals.find((x) => x.id === p.link);
	const k = o.w / p.w;
	if (Math.abs(o.h / p.h - k) > 1e-3) throw new Error(`portal ${p.id} and ${o.id} differ in shape: ${p.w}x${p.h} vs ${o.w}x${o.h}`);
}
writeFileSync(join(here, '..', 'public', 'level.json'), JSON.stringify(out));
console.log(stats.join('\n'));
console.log(`${out.quads.length} quads, ${out.colliders.length} colliders, ${out.portals.length} portals`);
