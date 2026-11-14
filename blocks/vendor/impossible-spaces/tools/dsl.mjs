// A tiny level DSL: axis-aligned faces with rectangular holes, openings with reveals, boxes, portals.
// Everything becomes quads (4 corners, CCW seen from the front), box colliders and portal frames.
// Three.js axes: x east, y up, z south. Units: metres.

export const AX = { x: 0, y: 1, z: 2 };
// Natural 2D axes of a face by its normal axis, and the (U, V) order whose cross product is the normal.
const NATURAL = { x: ['z', 'y'], y: ['x', 'z'], z: ['x', 'y'] };
const ORDER = { '+x': ['y', 'z'], '-x': ['z', 'y'], '+y': ['z', 'x'], '-y': ['x', 'z'], '+z': ['x', 'y'], '-z': ['y', 'x'] };

export function createLevel() {
	const L = { rooms: [], quads: [], colliders: [], portals: [], dynamics: [], spawn: null, materials: {} };
	let off = [0, 0, 0];
	let cur = null;

	const P = (x, y, z) => [x + off[0], y + off[1], z + off[2]];

	function room(id, origin, opts = {}) {
		cur = { id, origin, atlas: opts.atlas ?? 1024, fog: opts.fog ?? null, ambient: opts.ambient ?? [1, 1, 1], instanceOf: null, offset: null, ghosts: opts.ghosts ?? [] };
		off = origin;
		L.rooms.push(cur);
		return cur;
	}

	/** A copy of a room somewhere else: same geometry and lightmap, its own portals. */
	function instance(id, of, origin) {
		const src = L.rooms.find((r) => r.id === of);
		const d = [origin[0] - src.origin[0], origin[1] - src.origin[1], origin[2] - src.origin[2]];
		const r = { id, origin, atlas: src.atlas, fog: src.fog, ambient: src.ambient, instanceOf: of, offset: d, ghosts: [] };
		L.rooms.push(r);
		for (const c of L.colliders.filter((c) => c.room === of)) L.colliders.push({ ...c, room: id, c: [c.c[0] + d[0], c.c[1] + d[1], c.c[2] + d[2]] });
		cur = r;
		off = origin;
		return r;
	}

	function quad(mat, p0, p1, p2, p3, o = {}) {
		const q = { room: cur.id, mat, p: [...p0, ...p1, ...p2, ...p3], ...o };
		L.quads.push(q);
		return q;
	}

	function collider(lo, hi, o = {}) {
		const a = P(...lo);
		const b = P(...hi);
		L.colliders.push({ room: cur.id, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], h: [Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, Math.abs(b[2] - a[2]) / 2], ...o });
	}

	/** A free collider box given by centre, half extents and quaternion, in the room's local space. */
	function colliderAt(c, h, q) {
		L.colliders.push({ room: cur.id, c: P(...c), h, q });
	}

	/**
	 * One axis-aligned face. `n` is its normal ('+x'...), `level` its coordinate on that axis,
	 * r1/r2 its extent on the face's natural axes (x: z,y; y: x,z; z: x,y), holes as [a0,a1,b0,b1] in the same axes.
	 * Returns the solid cells (after merging), for colliders.
	 */
	/** The solid cells of a rectangle with holes, merged: [a0, a1, b0, b1] each. */
	function cellsOf(r1, r2, holes = []) {
		const as = [...new Set([r1[0], r1[1], ...holes.flatMap((h) => [h[0], h[1]])])].filter((v) => v >= r1[0] - 1e-9 && v <= r1[1] + 1e-9).sort((a, b) => a - b);
		const bs = [...new Set([r2[0], r2[1], ...holes.flatMap((h) => [h[2], h[3]])])].filter((v) => v >= r2[0] - 1e-9 && v <= r2[1] + 1e-9).sort((a, b) => a - b);
		const inHole = (a, b) => holes.some((h) => a > h[0] && a < h[1] && b > h[2] && b < h[3]);
		// rows of merged spans
		let rows = [];
		for (let j = 0; j + 1 < bs.length; j++) {
			const spans = [];
			let start = null;
			for (let i = 0; i + 1 < as.length; i++) {
				const solid = !inHole((as[i] + as[i + 1]) / 2, (bs[j] + bs[j + 1]) / 2);
				if (solid && start === null) start = as[i];
				if (!solid && start !== null) {
					spans.push([start, as[i]]);
					start = null;
				}
			}
			if (start !== null) spans.push([start, as[as.length - 1]]);
			rows.push({ b0: bs[j], b1: bs[j + 1], spans });
		}
		// merge rows with identical spans
		const cells = [];
		const open = new Map();
		for (const row of rows) {
			const next = new Map();
			for (const s of row.spans) {
				const key = `${s[0]}:${s[1]}`;
				const prev = open.get(key);
				if (prev && Math.abs(prev[3] - row.b0) < 1e-9) {
					prev[3] = row.b1;
					next.set(key, prev);
				} else {
					const cell = [s[0], s[1], row.b0, row.b1];
					cells.push(cell);
					next.set(key, cell);
				}
			}
			open.clear();
			for (const [k, v] of next) open.set(k, v);
		}
		return cells;
	}

	function face(mat, n, level, r1, r2, holes = [], o = {}) {
		const axis = n[1];
		const [na, nb] = NATURAL[axis];
		const cells = cellsOf(r1, r2, holes);
		const [ua, va] = ORDER[n];
		const at = (a, b) => {
			const v = { [axis]: level, [na]: a, [nb]: b };
			return P(v.x, v.y, v.z);
		};
		for (const [a0, a1, b0, b1] of cells) {
			// corners in (U, V) order so that U × V = n
			const nat = { [na]: [a0, a1], [nb]: [b0, b1] };
			const U = nat[ua];
			const V = nat[va];
			const pt = (u, v) => {
				const c = { [axis]: level, [ua]: u, [va]: v };
				return P(c.x, c.y, c.z);
			};
			quad(mat, pt(U[0], V[0]), pt(U[1], V[0]), pt(U[1], V[1]), pt(U[0], V[1]), { n, ...o });
		}
		void at;
		return cells;
	}

	/** Collider slabs behind a face's solid cells (thickness away from the normal). */
	function slabs(n, level, cells, thick) {
		const axis = n[1];
		const [na, nb] = NATURAL[axis];
		const s = n[0] === '+' ? -1 : 1;
		for (const [a0, a1, b0, b1] of cells) {
			const lo = { [axis]: Math.min(level, level + s * thick), [na]: a0, [nb]: b0 };
			const hi = { [axis]: Math.max(level, level + s * thick), [na]: a1, [nb]: b1 };
			collider([lo.x, lo.y, lo.z], [hi.x, hi.y, hi.z]);
		}
	}

	/**
	 * A room's inside: six faces looking inwards. `mats` {floor, wall, ceil} or per face ('+x' is the wall at lo.x).
	 * `holes` per face normal, in that face's natural axes.
	 */
	function shell(lo, hi, mats, holes = {}, o = {}) {
		const faces = [
			['+x', lo[0], [lo[2], hi[2]], [lo[1], hi[1]]],
			['-x', hi[0], [lo[2], hi[2]], [lo[1], hi[1]]],
			['+y', lo[1], [lo[0], hi[0]], [lo[2], hi[2]]],
			['-y', hi[1], [lo[0], hi[0]], [lo[2], hi[2]]],
			['+z', lo[2], [lo[0], hi[0]], [lo[1], hi[1]]],
			['-z', hi[2], [lo[0], hi[0]], [lo[1], hi[1]]],
		];
		for (const [n, level, r1, r2] of faces) {
			if (o.skip?.includes(n)) continue;
			const mat = mats[n] ?? (n === '+y' ? mats.floor : n === '-y' ? mats.ceil : mats.wall);
			// `cut`: where something stands on this face and has its own surface there; drawn as a hole, still solid
			const cut = o.cut?.[n] ?? [];
			face(mat, n, level, r1, r2, [...(holes[n] ?? []), ...cut], o.faceOpts?.[n] ?? {});
			if (o.collide !== false) slabs(n, level, cellsOf(r1, r2, holes[n] ?? []), o.thick ?? 0.5);
		}
	}

	/** A solid box seen from outside. With holes it becomes hollow-walled (colliders are slabs of `thick`). */
	function box(lo, hi, mat, o = {}) {
		const mats = typeof mat === 'string' ? {} : mat;
		const base = typeof mat === 'string' ? mat : mat.all;
		const faces = [
			['-x', lo[0], [lo[2], hi[2]], [lo[1], hi[1]]],
			['+x', hi[0], [lo[2], hi[2]], [lo[1], hi[1]]],
			['-y', lo[1], [lo[0], hi[0]], [lo[2], hi[2]]],
			['+y', hi[1], [lo[0], hi[0]], [lo[2], hi[2]]],
			['-z', lo[2], [lo[0], hi[0]], [lo[1], hi[1]]],
			['+z', hi[2], [lo[0], hi[0]], [lo[1], hi[1]]],
		];
		const hollow = o.holes && Object.keys(o.holes).length > 0;
		for (const [n, level, r1, r2] of faces) {
			if (o.skip?.includes(n)) continue;
			face(mats[n] ?? base, n, level, r1, r2, [...(o.holes?.[n] ?? []), ...(o.cut?.[n] ?? [])], { lm: o.lm, ...(o.faceOpts ?? {}) });
			if (hollow && o.collide !== false) slabs(n, level, cellsOf(r1, r2, o.holes?.[n] ?? []), o.thick ?? 0.3);
		}
		if (!hollow && o.collide !== false) collider(lo, hi);
	}

	/**
	 * An opening through a face: a rectangular tube from `level` going `depth` against the normal, lined with `mat`,
	 * and (optionally) a portal frame at its back, facing along the normal. r1/r2 in the face's natural axes.
	 */
	function opening(n, level, r1, r2, depth, o = {}) {
		const axis = n[1];
		const s = n[0] === '+' ? 1 : -1;
		const [na, nb] = NATURAL[axis];
		const back = level - s * depth;
		const ext = { [axis]: [Math.min(level, back), Math.max(level, back)], [na]: r1, [nb]: r2 };
		if (depth > 0) {
			for (const k of [na, nb]) {
				const others = NATURAL[k];
				const joint = o.joint ?? 0;
				for (const [sign, lvl] of [['+', ext[k][0]], ['-', ext[k][1]]]) {
					const ra = [...ext[others[0]]];
					const rb = [...ext[others[1]]];
					if (joint > 0) {
						// last `joint` metres before the portal plane lined with the joint material
						const which = others[0] === axis ? ra : rb;
						const j0 = s > 0 ? [back, back + joint] : [back - joint, back];
						const rest = s > 0 ? [back + joint, level] : [level, back - joint];
						const mk = (rng, m) => {
							const A = others[0] === axis ? rng : ra;
							const B = others[0] === axis ? rb : rng;
							face(m, sign + k, lvl, A, B, [], { lm: o.lm });
						};
						void which;
						mk(j0, o.jointMat ?? 'frame');
						mk(rest, o.mat ?? 'frame');
					} else face(o.mat ?? 'frame', sign + k, lvl, ra, rb, [], { lm: o.lm });
				}
			}
		}
		if (o.portal) {
			const c = { [axis]: back, [na]: (r1[0] + r1[1]) / 2, [nb]: (r2[0] + r2[1]) / 2 };
			const normal = [0, 0, 0];
			normal[AX[axis]] = s;
			const up = o.up ?? [0, 1, 0];
			// width runs along right = up × normal, height along up
			const right = [up[1] * normal[2] - up[2] * normal[1], up[2] * normal[0] - up[0] * normal[2], up[0] * normal[1] - up[1] * normal[0]];
			const size = { [na]: r1[1] - r1[0], [nb]: r2[1] - r2[0] };
			const along = (v) => Math.abs(v[AX[na]]) > 0.5 ? size[na] : size[nb];
			const p = { id: o.portal, room: cur.id, pos: P(c.x, c.y, c.z), right, up, normal, w: along(right), h: along(up), walk: o.walk !== false, plug: o.plug !== false, depth, glow: o.glow ?? [1.2, 1.2, 1.2] };
			L.portals.push(p);
			if (p.walk) {
				// a ledge under the opening and a little behind the plane, so a body half through still stands
				const k = Math.min(1, p.w);
				const t = 0.3 * k;
				const behind = 0.7 * k;
				const cz = (depth - behind) / 2;
				const len = (depth + behind) / 2;
				const centre = [0, 1, 2].map((i) => p.pos[i] + up[i] * (-p.h / 2 - t / 2) + normal[i] * cz);
				L.colliders.push({ room: cur.id, c: centre, h: [p.w / 2, t / 2, len], basis: [right, up, normal] });
			}
			return p;
		}
		return null;
	}

	/** A prism around a vertical axis: side quads and a top cap. */
	function cyl(c, r, y0, y1, mat, o = {}) {
		const n = o.n ?? 16;
		const pts = [];
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2;
			pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
		}
		for (let i = 0; i < n; i++) {
			const a = pts[i];
			const b = pts[(i + 1) % n];
			// outward: going counter-clockwise seen from above (x toward z is clockwise from +y), so order b, a
			quad(mat, P(b[0], y0, b[1]), P(a[0], y0, a[1]), P(a[0], y1, a[1]), P(b[0], y1, b[1]), { lm: o.lm, smooth: [c[0] + off[0], c[1] + off[2]] });
		}
		// top cap as strips
		for (let i = 0; i < n / 2 - 1; i++) {
			const a = pts[i];
			const b = pts[i + 1];
			const c2 = pts[n - 2 - i];
			const d = pts[n - 1 - i];
			quad(o.capMat ?? mat, P(c2[0], y1, c2[1]), P(b[0], y1, b[1]), P(a[0], y1, a[1]), P(d[0], y1, d[1]), { lm: o.lm, n: '+y' });
		}
		if (o.collide !== false) collider([c[0] - r * 0.8, y0, c[1] - r * 0.8], [c[0] + r * 0.8, y1, c[1] + r * 0.8]);
	}

	function link(a, b) {
		const pa = L.portals.find((p) => p.id === a);
		const pb = L.portals.find((p) => p.id === b);
		if (!pa || !pb) throw new Error(`link: missing ${a} or ${b}`);
		pa.link = b;
		pb.link = a;
	}

	/** Copies a room's portals into an instance, with new ids. */
	function instancePortals(of, suffix) {
		const src = L.rooms.find((r) => r.id === of);
		const d = [cur.origin[0] - src.origin[0], cur.origin[1] - src.origin[1], cur.origin[2] - src.origin[2]];
		for (const p of L.portals.filter((p) => p.room === of)) L.portals.push({ ...p, id: p.id.replace(/0$/, '') + suffix, room: cur.id, pos: [p.pos[0] + d[0], p.pos[1] + d[1], p.pos[2] + d[2]], link: undefined });
	}

	function dynamic(kind, pos, o = {}) {
		L.dynamics.push({ room: cur.id, kind, pos: P(...pos), ...o });
	}

	function spawn(pos, yaw) {
		L.spawn = { room: cur.id, pos: P(...pos), yaw };
	}

	return { L, P, room, instance, instancePortals, quad, collider, colliderAt, face, slabs, shell, box, opening, cyl, link, dynamic, spawn, get cur() { return cur; } };
}
