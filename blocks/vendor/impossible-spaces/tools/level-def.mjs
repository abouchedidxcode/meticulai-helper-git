// The demo: a calm gallery whose exhibits are impossible. Each room stands on its own, far from the
// others; every doorway between them is a portal.
import { createLevel } from './dsl.mjs';

export const MATERIALS = {
	wall: { color: [0.8, 0.79, 0.76], rough: 0.92 },
	ceil: { color: [0.83, 0.83, 0.81], rough: 0.95 },
	white: { color: [0.84, 0.84, 0.83], rough: 0.6 },
	oak: { tex: 'oak', tile: 1.7, color: [0.4, 0.27, 0.16], rough: 0.55, spec: 1 },
	concrete: { tex: 'concrete', tile: 2.0, color: [0.47, 0.47, 0.46], rough: 0.7, spec: 0.7 },
	marble: { tex: 'marble', tile: 1.5, color: [0.74, 0.73, 0.71], rough: 0.25, spec: 1.2 },
	planks: { tex: 'planks', tile: 1.6, color: [0.035, 0.035, 0.035], rough: 0.7, spec: 0.6 },
	frame: { color: [0.03, 0.028, 0.026], rough: 0.35, spec: 0.35 },
	terracotta: { color: [0.52, 0.2, 0.12], rough: 0.92 },
	sage: { color: [0.3, 0.37, 0.3], rough: 0.9 },
	ink: { color: [0.04, 0.06, 0.13], rough: 0.7 },
	ochre: { color: [0.72, 0.46, 0.1], rough: 0.7 },
	red: { color: [0.5, 0.05, 0.04], rough: 0.7 },
	light: { color: [1, 1, 1], emissive: true },
};

const DOOR_H = 2.2;
const LIGHT = [26, 25.4, 24];
const SKY = [1.75, 2.1, 2.6];

export function buildLevel() {
	const d = createLevel();
	const { room, instance, instancePortals, quad, collider, colliderAt, face, slabs, shell, box, opening, cyl, link, dynamic, spawn, P } = d;
	const base = { floor: 'oak', wall: 'wall', ceil: 'ceil' };
	const door = (n, level, r1, id, o = {}) => opening(n, level, r1, [0, DOOR_H], 0.25, { portal: id, ...o });
	// a rooflight: a well up through the ceiling, and the sky as a surface at its top (drawn, not baked: the bake has a real sky)
	const skylight = (y, r1, r2, depth = 0.6) => {
		opening('-y', y, r1, r2, depth, { mat: 'ceil' });
		face('light', '-y', y + depth, r1, r2, [], { emit: SKY, appOnly: true });
	};
	const panel = (y, r1, r2, e = LIGHT) => face('light', '-y', y - 0.012, r1, r2, [], { emit: e });
	const bench = (x0, z0, x1, z1) => {
		const along = x1 - x0 > z1 - z0;
		box([x0, 0.39, z0], [x1, 0.45, z1], 'oak');
		if (along) {
			box([x0 + 0.1, 0, z0 + 0.04], [x0 + 0.16, 0.39, z1 - 0.04], 'frame', { skip: ['-y', '+y'], collide: false });
			box([x1 - 0.16, 0, z0 + 0.04], [x1 - 0.1, 0.39, z1 - 0.04], 'frame', { skip: ['-y', '+y'], collide: false });
		} else {
			box([x0 + 0.04, 0, z0 + 0.1], [x1 - 0.04, 0.39, z0 + 0.16], 'frame', { skip: ['-y', '+y'], collide: false });
			box([x0 + 0.04, 0, z1 - 0.16], [x1 - 0.04, 0.39, z1 - 0.1], 'frame', { skip: ['-y', '+y'], collide: false });
		}
		collider([x0, 0, z0], [x1, 0.39, z1]);
	};
	/** A canvas on a wall: `n` the wall's normal, `level` the wall, natural-axis extents. */
	const canvas = (n, level, r1, r2, mat) => {
		const s = n[0] === '+' ? 1 : -1;
		const a = n[1];
		const t = 0.035;
		const lo = { x: 0, y: 0, z: 0 };
		const hi = { x: 0, y: 0, z: 0 };
		const nat = { x: ['z', 'y'], y: ['x', 'z'], z: ['x', 'y'] }[a];
		lo[a] = Math.min(level, level + s * t);
		hi[a] = Math.max(level, level + s * t);
		[lo[nat[0]], hi[nat[0]]] = r1;
		[lo[nat[1]], hi[nat[1]]] = r2;
		box([lo.x, lo.y, lo.z], [hi.x, hi.y, hi.z], mat, { skip: [(s > 0 ? '-' : '+') + a], collide: false });
	};

	// ---------------------------------------------------------------- Gallery A: the tunnel
	room('a', [0, 0, 0], { atlas: 2048 });
	shell([0, 0, 0], [14, 4.6, 10], { floor: 'concrete', wall: 'wall', ceil: 'ceil' }, {
		'+x': [[4.5, 5.5, 0, DOOR_H]],
		'-x': [[4.5, 5.5, 0, DOOR_H]],
		'-y': [[2, 4.4, 2.5, 7.5], [5.8, 8.2, 2.5, 7.5], [9.6, 12, 2.5, 7.5]],
	}, { cut: { '+y': [[5.5, 8.5, 3.6, 6.4]] } });
	door('+x', 0, [4.5, 5.5], 'a_w');
	door('-x', 14, [4.5, 5.5], 'a_e');
	for (const r of [[2, 4.4], [5.8, 8.2], [9.6, 12]]) {
		skylight(4.6, r, [2.5, 7.5]);
		box([r[0], 4.6, 4.95], [r[1], 5.0, 5.05], 'frame', { collide: false, skip: ['-x', '+x'] });
	}
	// the piece: three metres of concrete tunnel
	box([5.5, 0, 3.6], [8.5, 2.8, 6.4], 'concrete', { skip: ['-y'], thick: 0.3, holes: { '-x': [[4, 6, 0, 2.2]], '+x': [[4, 6, 0, 2.2]], '+z': [[6.4, 7.6, 1.1, 1.9]] } });
	opening('-x', 5.5, [4, 6], [0, 2.2], 0.3, { portal: 'a_t1', mat: 'concrete', joint: 0.03, glow: [2.0, 1.9, 1.75] });
	opening('+x', 8.5, [4, 6], [0, 2.2], 0.3, { portal: 'a_t2', mat: 'concrete', joint: 0.03, glow: [2.0, 1.9, 1.75] });
	opening('+z', 6.4, [6.4, 7.6], [1.1, 1.9], 0.3, { portal: 'a_win', walk: false, mat: 'concrete', joint: 0.03, glow: [1.4, 1.33, 1.2] });
	bench(1.6, 0.9, 3.6, 1.4);
	bench(10.4, 8.6, 12.4, 9.1);
	canvas('+z', 0, [9.2, 11.6], [1.1, 2.9], 'ink');
	canvas('-z', 10, [2.0, 3.6], [1.2, 2.6], 'ochre');
	dynamic('ball', [3.4, 0.2, 7.2]);
	dynamic('box', [2.6, 0.2, 6.6]);
	spawn([1.8, 0, 8.3], -0.62);

	// ---------------------------------------------------------------- the long tunnel behind it
	room('lt', [0, 0, 100], { atlas: 2048 });
	shell([0, 0, 0], [32, 2.2, 2], { floor: 'concrete', wall: 'concrete', ceil: 'concrete' }, {
		'+x': [[0, 2, 0, 2.2]],
		'-x': [[0, 2, 0, 2.2]],
		'-z': [[15.4, 16.6, 1.1, 1.9]],
	});
	opening('+x', 0, [0, 2], [0, 2.2], 0, { portal: 'lt_0', glow: [1.6, 1.6, 1.6] });
	opening('-x', 32, [0, 2], [0, 2.2], 0, { portal: 'lt_32', glow: [1.6, 1.6, 1.6] });
	opening('-z', 2, [15.4, 16.6], [1.1, 1.9], 0.3, { portal: 'lt_win', walk: false, mat: 'concrete', joint: 0.03, glow: [1.6, 1.6, 1.6] });
	for (let x = 2; x < 32; x += 4) face('light', '-y', 2.19, [x - 0.08, x + 0.08], [0.2, 1.8], [], { emit: [64, 62, 57] });
	link('a_t1', 'lt_0');
	link('a_t2', 'lt_32');
	link('a_win', 'lt_win');

	// ---------------------------------------------------------------- Gallery B: the hut
	room('b', [100, 0, 0], { atlas: 2048 });
	shell([0, 0, 0], [12, 4.6, 10], base, {
		'+x': [[4.5, 5.5, 0, DOOR_H]],
		'-x': [[4.5, 5.5, 0, DOOR_H]],
		'-y': [[1.2, 4.0, 3, 7], [8.0, 10.8, 3, 7]],
	}, { cut: { '+y': [[4.7, 7.3, 3.7, 6.3]] } });
	door('+x', 0, [4.5, 5.5], 'b_w');
	door('-x', 12, [4.5, 5.5], 'b_e');
	for (const r of [[1.2, 4.0], [8.0, 10.8]]) {
		skylight(4.6, r, [3, 7]);
		box([r[0], 4.6, 4.95], [r[1], 5.0, 5.05], 'frame', { collide: false, skip: ['-x', '+x'] });
	}
	box([4.7, 0, 3.7], [7.3, 2.8, 6.3], 'planks', { skip: ['-y'], thick: 0.3, holes: { '-x': [[4.5, 5.5, 0, DOOR_H]] } });
	opening('-x', 4.7, [4.5, 5.5], [0, DOOR_H], 0.2, { portal: 'b_hut', glow: [1.4, 1.4, 1.4] });
	bench(8.6, 1.0, 10.6, 1.5);
	canvas('-z', 10, [1.4, 3.8], [1.1, 2.9], 'red');
	canvas('+z', 0, [1.6, 3.0], [1.2, 2.6], 'sage');
	link('a_e', 'b_w');

	// ---------------------------------------------------------------- the hall inside the hut
	room('h', [100, 0, 100], { atlas: 2048 });
	shell([0, 0, 0], [16, 8, 12], { floor: 'marble', wall: 'wall', ceil: 'ceil' }, {
		'+x': [[5.5, 6.5, 0, DOOR_H]],
		'-y': [[3, 13, 4, 8]],
	});
	opening('+x', 0, [5.5, 6.5], [0, DOOR_H], 0.2, { portal: 'h_door', glow: [0.7, 0.68, 0.64] });
	skylight(8, [3, 13], [4, 8], 1.0);
	for (const x of [5.5, 8, 10.5]) box([x - 0.08, 8, 4], [x + 0.08, 8.7, 8], 'frame', { collide: false, skip: ['-z', '+z'] });
	for (const x of [4, 8, 12]) for (const z of [2.2, 9.8]) box([x - 0.3, 0, z - 0.3], [x + 0.3, 8, z + 0.3], 'concrete', { skip: ['-y', '+y'] });
	bench(6.8, 5.75, 9.2, 6.25);
	box([12.6, 0, 5.4], [13.8, 0.9, 6.6], 'white');
	canvas('-x', 16, [3.5, 8.5], [1.4, 5.2], 'ink');
	canvas('+z', 0, [5.6, 7.4], [1.2, 3.4], 'ochre');
	canvas('+z', 0, [8.6, 10.4], [1.2, 3.4], 'red');
	dynamic('ball', [4.5, 0.3, 6.0], { r: 0.28 });
	link('b_hut', 'h_door');

	// ---------------------------------------------------------------- the ring: one corridor, three places
	room('ring0', [200, 0, 0], { atlas: 2048 });
	shell([0, 0, 0], [9, 3, 9], base, { '-z': [[4, 5, 0, DOOR_H]] });
	box([2, 0, 2], [7, 3, 7], 'concrete', { skip: ['-y', '+y'] });
	door('-z', 9, [4, 5], 'ring_door0');
	opening('+x', 4.5, [0, 2], [0, 3], 0, { portal: 'ring_a0', plug: false });
	opening('-x', 4.5, [0, 2], [0, 3], 0, { portal: 'ring_b0', plug: false });
	canvas('+x', 0, [3.4, 5.6], [0.95, 2.35], 'ochre');
	canvas('-x', 9, [3.4, 5.6], [0.95, 2.35], 'ink');
	canvas('+z', 0, [6.3, 7.9], [0.95, 2.35], 'red');
	panel(3, [1.2, 7.8], [0.8, 1.2]);
	panel(3, [1.2, 7.8], [7.8, 8.2]);
	panel(3, [0.8, 1.2], [2.4, 6.6]);
	panel(3, [7.8, 8.2], [2.4, 6.6]);
	instance('ring1', 'ring0', [200, 0, 100]);
	instancePortals('ring0', '1');
	instance('ring2', 'ring0', [200, 0, 200]);
	instancePortals('ring0', '2');
	link('b_e', 'ring_door0');
	link('ring_a0', 'ring_b1');
	link('ring_a1', 'ring_b2');
	link('ring_a2', 'ring_b0');

	// ---------------------------------------------------------------- the niche, second time round
	room('n', [300, 0, 0], { atlas: 1024 });
	shell([0, 0, 0], [5, 3.2, 5], { floor: 'concrete', wall: 'terracotta', ceil: 'ceil' }, { '+z': [[2, 3, 0, DOOR_H]], '-y': [[1.5, 3.5, 2.0, 4.0]] });
	door('+z', 0, [2, 3], 'n_door');
	skylight(3.2, [1.5, 3.5], [2.0, 4.0], 0.5);
	box([2.05, 0, 2.65], [2.95, 1.5, 3.35], 'marble');
	bench(0.35, 1.2, 0.85, 3.2);
	link('ring_door1', 'n_door');

	// ---------------------------------------------------------------- the stair that never arrives
	const W = 2.2;
	const LAND = 2.4;
	const STEPS = 14;
	const RISE = 0.18;
	const RUN = 0.28;
	const FL = STEPS * RUN;
	const SH = STEPS * RISE;
	const CEIL = 2.8;
	const fogColor = [0.86, 0.85, 0.82];
	room('stair', [300, 0, 100], { atlas: 1024, fog: { color: fogColor, density: 0.05 }, ghosts: [[LAND + FL, SH, 0], [-(LAND + FL), -SH, 0], [2 * (LAND + FL), 2 * SH, 0], [-2 * (LAND + FL), -2 * SH, 0]] });
	slabs('+y', 0, face('concrete', '+y', 0, [0, LAND], [0, W]), 0.5);
	for (let i = 0; i < STEPS; i++) {
		face('concrete', '-x', LAND + i * RUN, [0, W], [i * RISE, (i + 1) * RISE]);
		face('concrete', '+y', (i + 1) * RISE, [LAND + i * RUN, LAND + (i + 1) * RUN], [0, W]);
	}
	{
		const len = Math.hypot(FL - RUN, SH);
		const ang = Math.atan2(SH, FL - RUN);
		const mx = LAND + (FL - RUN) / 2;
		const my = SH / 2;
		const t = 0.15;
		colliderAt([mx + Math.sin(ang) * t, my - Math.cos(ang) * t, W / 2], [len / 2, t, W / 2], [0, 0, Math.sin(ang / 2), Math.cos(ang / 2)]);
		collider([LAND + FL - RUN, SH - 0.3, 0], [LAND + FL, SH, W]);
	}
	slabs('+z', 0, face('wall', '+z', 0, [0, LAND], [0, CEIL], [[0.7, 1.7, 0, DOOR_H]]), 0.5);
	slabs('-z', W, face('wall', '-z', W, [0, LAND], [0, CEIL], [[0.7, 1.7, 0, DOOR_H]]), 0.5);
	quad('wall', P(LAND, 0, 0), P(LAND + FL, SH, 0), P(LAND + FL, SH + CEIL, 0), P(LAND, CEIL, 0));
	quad('wall', P(LAND + FL, SH, W), P(LAND, 0, W), P(LAND, CEIL, W), P(LAND + FL, SH + CEIL, W));
	collider([LAND, -1, -0.5], [LAND + FL, SH + CEIL, 0]);
	collider([LAND, -1, W], [LAND + FL, SH + CEIL, W + 0.5]);
	face('ceil', '-y', CEIL, [0, LAND], [0, W]);
	quad('ceil', P(LAND, CEIL, 0), P(LAND + FL, CEIL + SH, 0), P(LAND + FL, CEIL + SH, W), P(LAND, CEIL, W));
	door('+z', 0, [0.7, 1.7], 'st_n');
	door('-z', W, [0.7, 1.7], 'st_s');
	opening('+x', 0, [0, W], [0, CEIL], 0, { portal: 'st_low', plug: false });
	opening('-x', LAND + FL, [0, W], [SH, SH + CEIL], 0, { portal: 'st_up', plug: false });
	face('light', '-y', CEIL - 0.012, [0.6, 1.8], [0.5, 1.7], [], { emit: [16, 15.6, 14.6] });
	// what closes the far ends of the stair in the bake: soft light, as the haze reads
	for (const k of [3, -2]) {
		const ox = k * (LAND + FL);
		const oy = k * SH;
		quad('light', P(ox, oy, 0), P(ox, oy, W), P(ox, oy + CEIL, W), P(ox, oy + CEIL, 0), { bakeOnly: true, emit: [1.2, 1.2, 1.15] });
	}
	link('ring_door2', 'st_n');
	link('st_low', 'st_up');

	// ---------------------------------------------------------------- the lobby
	room('l', [400, 0, 0], { atlas: 1024 });
	shell([0, 0, 0], [6, 3.2, 6], base, {
		'+x': [[2.5, 3.5, 0, DOOR_H]],
		'+z': [[2.5, 3.5, 0, DOOR_H]],
		'-x': [[2.5, 3.5, 0, DOOR_H]],
	});
	door('+x', 0, [2.5, 3.5], 'l_w');
	door('+z', 0, [2.5, 3.5], 'l_n', { glow: [1.6, 1.6, 1.7] });
	door('-x', 6, [2.5, 3.5], 'l_e');
	panel(3.2, [2, 4], [2, 4]);
	bench(2.0, 5.2, 4.0, 5.7);
	canvas('-z', 6, [0.5, 1.7], [1.2, 2.4], 'sage');
	link('st_s', 'l_w');

	// ---------------------------------------------------------------- the room you enter on its wall
	room('d', [400, 0, 100], { atlas: 2048 });
	shell([0, 0, 0], [5, 4.5, 9], base, { '+z': [[0, 2.2, 1.75, 2.75]], '-y': [[1.2, 3.8, 2.5, 6.5]] });
	opening('+z', 0, [0, 2.2], [1.75, 2.75], 0.25, { portal: 'd_door', up: [1, 0, 0] });
	skylight(4.5, [1.2, 3.8], [2.5, 6.5], 0.7);
	box([1.2, 4.5, 4.45], [3.8, 5.0, 4.55], 'frame', { collide: false, skip: ['-x', '+x'] });
	bench(1.6, 3.2, 3.6, 3.7);
	bench(1.6, 6.4, 3.6, 6.9);
	box([3.9, 0, 7.6], [4.5, 1.1, 8.2], 'white');
	canvas('+x', 0, [3.0, 5.4], [1.0, 3.2], 'ink');
	canvas('-x', 5, [2.2, 3.8], [1.3, 2.9], 'ochre');
	canvas('-z', 9, [1.6, 3.4], [1.2, 3.0], 'red');
	dynamic('ball', [0.7, 0.2, 5.0]);
	link('l_n', 'd_door');

	// ---------------------------------------------------------------- the room with the table
	room('s', [500, 0, 0], { atlas: 2048 });
	shell([0, 0, 0], [8, 3.4, 7], base, {
		'+x': [[3, 4, 0, DOOR_H], [1.0, 1.1, 0, 0.22]],
		'+z': [[2, 3, 0, DOOR_H]],
		'-x': [[3, 4, 0, DOOR_H]],
		'-z': [[5.5, 6.5, 0, DOOR_H]],
		'-y': [[2.6, 5.4, 2.2, 5.2]],
	});
	door('+x', 0, [3, 4], 's_w');
	door('+z', 0, [2, 3], 's_table_door', { glow: [1.5, 1.4, 1.2] });
	door('-x', 8, [3, 4], 's_mouse_door', { glow: [1.2, 1.1, 1.0] });
	door('-z', 7, [5.5, 6.5], 's_exit');
	opening('+x', 0, [1.0, 1.1], [0, 0.22], 0.025, { portal: 's_mouse', lm: 6 });
	skylight(3.4, [2.6, 5.4], [2.2, 5.2], 0.6);
	box([2.6, 3.4, 3.65], [5.4, 3.85, 3.75], 'frame', { collide: false, skip: ['-x', '+x'] });
	// the table and what is on it
	box([3.2, 0.71, 3.2], [4.8, 0.75, 4.1], 'oak', { lm: 5, cut: { '+y': [[3.3, 3.34, 3.585, 3.715]] } });
	for (const [x, z] of [[3.26, 3.26], [4.69, 3.26], [3.26, 3.99], [4.69, 3.99]]) box([x, 0, z], [x + 0.05, 0.71, z + 0.05], 'frame', { skip: ['-y', '+y'] });
	box([3.3, 0.75, 3.585], [3.34, 0.99, 3.715], 'white', { skip: ['-y'], collide: false, lm: 10, holes: { '+x': [[3.6, 3.7, 0.75, 0.97]] } });
	collider([3.3, 0.75, 3.585], [3.34, 0.99, 3.6]);
	collider([3.3, 0.75, 3.7], [3.34, 0.99, 3.715]);
	collider([3.3, 0.97, 3.6], [3.34, 0.99, 3.7]);
	opening('+x', 3.34, [3.6, 3.7], [0.75, 0.97], 0.01, { portal: 's_tiny', lm: 10, glow: [1.2, 1.2, 1.2] });
	box([3.95, 0.75, 3.42], [4.17, 0.782, 3.58], 'ink', { skip: ['-y'], lm: 8 });
	box([3.97, 0.782, 3.43], [4.16, 0.806, 3.57], 'ochre', { skip: ['-y'], lm: 8 });
	box([4.0, 0.806, 3.45], [4.15, 0.824, 3.56], 'red', { skip: ['-y'], lm: 8 });
	box([3.62, 0.75, 3.9], [3.8, 0.757, 3.907], 'ochre', { skip: ['-y'], lm: 8 });
	cyl([4.45, 3.82], 0.042, 0.75, 0.845, 'white', { lm: 8, n: 16 });
	bench(0.9, 5.9, 2.9, 6.4);
	canvas('-x', 8, [0.8, 2.4], [1.2, 2.6], 'sage');
	canvas('+z', 0, [4.2, 6.8], [1.0, 2.8], 'ink');
	dynamic('ball', [5.6, 0.2, 2.4]);
	link('l_e', 's_w');
	link('s_table_door', 's_tiny');
	link('s_mouse_door', 's_mouse');
	link('s_exit', 'a_w');

	void cyl;
	return d.L;
}
