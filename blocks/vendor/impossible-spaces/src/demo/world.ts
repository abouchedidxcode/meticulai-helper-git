// Builds the gallery from level.json: lightmapped rooms, their colliders, and the portals between them.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
	cameraWorldMatrix,
	float,
	luminance,
	mix,
	mx_noise_float,
	normalMap,
	normalView,
	pmremTexture,
	positionView,
	positionViewDirection,
	positionWorld,
	texture,
	uniform,
	uv,
	vec3,
	vec4,
} from 'three/tsl';
import { type PortalFrame, PortalSystem } from '../lib/index.ts';

interface MaterialDef {
	color: [number, number, number];
	rough?: number;
	tex?: string;
	tile?: number;
	spec?: number;
	emissive?: boolean;
}
interface RoomDef {
	id: string;
	origin: [number, number, number];
	atlas: number;
	fog: { color: [number, number, number]; density: number } | null;
	instanceOf: string | null;
	offset: [number, number, number] | null;
}
interface QuadDef {
	room: string;
	mat: string;
	p: number[];
	normal: number[];
	uv0: number[];
	uv1?: number[];
	emit?: [number, number, number];
	bakeOnly?: boolean;
	smooth?: [number, number];
}
interface ColliderDef {
	room: string;
	c: [number, number, number];
	h: [number, number, number];
	q?: [number, number, number, number];
	basis?: [number[], number[], number[]];
}
interface PortalDef {
	id: string;
	room: string;
	pos: [number, number, number];
	right: [number, number, number];
	up: [number, number, number];
	normal: [number, number, number];
	w: number;
	h: number;
	link: string;
	walk: boolean;
}
export interface DynamicDef {
	room: string;
	kind: 'ball' | 'box';
	pos: [number, number, number];
	r?: number;
}
export interface LevelData {
	materials: Record<string, MaterialDef>;
	rooms: RoomDef[];
	quads: QuadDef[];
	colliders: ColliderDef[];
	portals: PortalDef[];
	dynamics: DynamicDef[];
	spawn: { room: string; pos: [number, number, number]; yaw: number };
}

export interface World {
	level: LevelData;
	physics: RAPIER.World;
	portals: PortalSystem;
	frames: Map<string, PortalFrame>;
	maps: Record<string, { color: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture }>;
	environment: THREE.Texture;
	/** Every picture the rooms use, to hand the graphics card one at a time before the first look. */
	textures: THREE.Texture[];
	/** The baked light on the surface under `point` (looking along `down`) in a room, or false if there is none. */
	lightAt(room: string, point: THREE.Vector3, down: THREE.Vector3, out: THREE.Color): boolean;
}

/** A small readable copy of a room's baked light. */
interface Probe {
	data: Uint8ClampedArray;
	max: number;
	gamma: number;
}
const PROBE = 512;
const decode = (p: Probe, i: number) => p.max * (p.data[i] / 255) ** p.gamma;

/** A room's overall colour, from its baked light: what a view of it too small to draw is filled with. */
function average(probe: Probe): THREE.Color {
	let r = 0;
	let g = 0;
	let b = 0;
	let n = 0;
	for (let i = 0; i < probe.data.length; i += 4 * 7) {
		r += Math.min(decode(probe, i), 3);
		g += Math.min(decode(probe, i + 1), 3);
		b += Math.min(decode(probe, i + 2), 3);
		n++;
	}
	const k = 0.55 / Math.max(1, n);
	return new THREE.Color(r * k, g * k, b * k);
}

const base = import.meta.env.BASE_URL;

export async function loadWorld(renderer: THREE.WebGPURenderer, scene: THREE.Scene, progress: (share: number, words: string) => void): Promise<World> {
	progress(0, 'Loading the rooms');
	const level: LevelData = await (await fetch(`${base}level.json`)).json();
	await RAPIER.init();
	const physics = new RAPIER.World({ x: 0, y: 0, z: 0 });
	// Behind everything is the room's own overall colour, not a sky: where two surfaces meet along an edge they
	// don't share end to end, a pixel between them can show what's behind, and a bright sky there sparkles.
	// The sky is a surface at the top of each rooflight.
	const behind = uniform(new THREE.Color(0.5, 0.5, 0.5));
	const tones = new Map<string, THREE.Color>();
	scene.backgroundNode = behind;
	const portals = new PortalSystem(renderer, scene, { maxDepth: 5, budget: 10, samples: 4, minShare: 0.00015, onView: (room) => behind.value.copy(tones.get(room) ?? behind.value) });

	// textures
	const loader = new THREE.TextureLoader();
	const aniso = 8;
	const tile = async (name: string, kind: string, srgb: boolean) => {
		const t = await loader.loadAsync(`${base}assets/materials/${name}_${kind}.jpg`);
		t.wrapS = t.wrapT = THREE.RepeatWrapping;
		t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
		t.anisotropy = aniso;
		return t;
	};
	const maps: World['maps'] = {};
	const names = [...new Set(Object.values(level.materials).map((m) => m.tex).filter((t): t is string => !!t))];
	await Promise.all(
		names.map(async (n) => {
			const [color, normal, rough] = await Promise.all([tile(n, 'color', true), tile(n, 'normal', false), tile(n, 'rough', false)]);
			maps[n] = { color, normal, rough };
		}),
	);
	progress(0.5, 'Loading the light');
	// The baked light: one picture a room, eight bits a channel, stored as (light / max)^(1/gamma)
	// (tools/pack-lightmaps.mjs). A small copy of each is kept readable, for lighting what stands on a floor.
	const ranges: Record<string, { max: number; gamma: number }> = await (await fetch(`${base}lightmaps.json`)).json();
	const lightmaps = new Map<string, THREE.Texture>();
	const probes = new Map<string, Probe>();
	const folder = new URLSearchParams(location.search).get('lightmaps') ?? 'lightmaps';
	await Promise.all(
		level.rooms
			.filter((r) => !r.instanceOf)
			.map(async (r) => {
				const blob = await (await fetch(`${base}${folder}/${r.id}.webp`)).blob();
				const [full, small] = await Promise.all([createImageBitmap(blob), createImageBitmap(blob, { resizeWidth: PROBE, resizeHeight: PROBE, resizeQuality: 'medium' })]);
				const t = new THREE.Texture(full);
				t.flipY = false;
				t.minFilter = THREE.LinearFilter;
				t.magFilter = THREE.LinearFilter;
				t.generateMipmaps = false;
				t.colorSpace = THREE.NoColorSpace;
				t.needsUpdate = true;
				lightmaps.set(r.id, t);
				const canvas = new OffscreenCanvas(PROBE, PROBE);
				const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
				ctx.drawImage(small, 0, 0);
				small.close();
				probes.set(r.id, { data: ctx.getImageData(0, 0, PROBE, PROBE).data, ...ranges[r.id] });
			}),
	);

	// what glossy floors reflect, and what lights the things you can carry
	const pmrem = new THREE.PMREMGenerator(renderer);
	const environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
	// materials, one per room and surface
	const cache = new Map<string, THREE.Material>();
	const material = (room: RoomDef, name: string, emit?: number[]): THREE.Material => {
		const key = `${room.instanceOf ?? room.id}:${name}:${emit?.join(',') ?? ''}`;
		const hit = cache.get(key);
		if (hit) return hit;
		const def = level.materials[name];
		const m = new THREE.MeshBasicNodeMaterial();
		m.fog = false;
		// Every number that differs from one surface or room to the next goes in as a uniform, never as a constant
		// in the shader: then all the plain surfaces share one program, all the textured ones another, and so on.
		// A program's first draw holds up the graphics card for a moment, so the fewer the better.
		const tint = (c: number[]) => uniform(new THREE.Color(c[0], c[1], c[2]));
		let out;
		if (emit) {
			// as bright as the bake needs is far brighter than the screen can show; shown that bright, a thin
			// light far away shimmers along its edges, so what's drawn stops just past white
			const k = Math.min(1, 5 / Math.max(emit[0], emit[1], emit[2]));
			// and a light thinner than a pixel on screen fades instead of sparkling (uv1 runs 0..1 across it)
			const across = uv(1).fwidth();
			const thick = across.x.max(across.y).reciprocal().mul(0.7).clamp(0.12, 1);
			out = tint([emit[0] * k, emit[1] * k, emit[2] * k]).mul(thick);
		}
		else {
			const range = ranges[room.instanceOf ?? room.id];
			const light = texture(lightmaps.get(room.instanceOf ?? room.id)!, uv(1)).rgb.pow(2.2).mul(uniform(range.max));
			const set = def.tex ? maps[def.tex] : null;
			let albedo = set ? texture(set.color, uv()).rgb : vec3(tint(def.color) as never);
			// a slow drift in tone, so a tiled floor doesn't read as tiles
			if (set) albedo = albedo.mul(mx_noise_float(positionWorld.mul(0.6)).mul(0.07).add(1));
			out = albedo.mul(light);
			if (def.spec) {
				const n = set ? vec3(normalMap(texture(set.normal, uv())) as never) : normalView;
				const rough = set ? texture(set.rough, uv()).r.mul(uniform((def.rough ?? 0.6) / 0.5)).clamp(0.08, 1) : uniform(def.rough ?? 0.5);
				const view = positionViewDirection;
				const fresnel = float(0.04).add(float(0.96).mul(n.dot(view).clamp(0, 1).oneMinus().pow(5)));
				const mirror = cameraWorldMatrix.mul(vec4(view.negate().reflect(n), 0)).xyz.normalize();
				const sky = pmremTexture(environment, mirror, rough).rgb;
				// reflections follow the light that reaches the spot
				const reach = luminance(light).mul(0.55).clamp(0, 1.4);
				out = out.add(sky.mul(fresnel).mul(reach).mul(uniform(def.spec)));
			}
		}
		// (haze is in every room's program, at nothing where there is none, so a hazy room needs no program of its own)
		const haze = positionView.length().mul(uniform(room.fog?.density ?? 0)).negate().exp().oneMinus();
		out = mix(out, tint(room.fog?.color ?? [0, 0, 0]), haze);
		m.colorNode = out;
		// (which program it is: the warm-up draws one of each first)
		m.name = emit ? 'light' : def.tex ? 'textured' : def.spec ? 'shine' : 'plain';
		cache.set(key, m);
		return m;
	};

	// geometry, one mesh per room and surface
	const byRoom = new Map<string, Map<string, QuadDef[]>>();
	for (const q of level.quads) {
		if (q.bakeOnly) continue;
		const key = q.emit ? `${q.mat}|${q.emit.join(',')}` : q.mat;
		const r = byRoom.get(q.room) ?? new Map<string, QuadDef[]>();
		byRoom.set(q.room, r);
		r.set(key, [...(r.get(key) ?? []), q]);
	}
	const geometries = new Map<string, { geometry: THREE.BufferGeometry; mat: string; emit?: number[] }[]>();
	for (const [roomId, groups] of byRoom) {
		const list: { geometry: THREE.BufferGeometry; mat: string; emit?: number[] }[] = [];
		for (const quads of groups.values()) {
			const n = quads.length;
			const position = new Float32Array(n * 12);
			const normal = new Float32Array(n * 12);
			const uv0 = new Float32Array(n * 8);
			const uv1 = new Float32Array(n * 8);
			const index: number[] = [];
			quads.forEach((q, k) => {
				position.set(q.p, 12 * k);
				for (let i = 0; i < 4; i++) {
					if (q.smooth) {
						const dx = q.p[3 * i] - q.smooth[0];
						const dz = q.p[3 * i + 2] - q.smooth[1];
						const l = Math.hypot(dx, dz) || 1;
						normal.set([dx / l, 0, dz / l], 12 * k + 3 * i);
					} else normal.set(q.normal, 12 * k + 3 * i);
				}
				uv0.set(q.uv0, 8 * k);
				uv1.set(q.uv1 ?? [0, 0, 1, 0, 1, 1, 0, 1], 8 * k);
				index.push(4 * k, 4 * k + 1, 4 * k + 2, 4 * k, 4 * k + 2, 4 * k + 3);
			});
			const g = new THREE.BufferGeometry();
			g.setAttribute('position', new THREE.BufferAttribute(position, 3));
			g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
			g.setAttribute('uv', new THREE.BufferAttribute(uv0, 2));
			g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
			g.setIndex(index);
			g.computeBoundingSphere();
			list.push({ geometry: g, mat: quads[0].mat, emit: quads[0].emit });
		}
		geometries.set(roomId, list);
	}
	for (const room of level.rooms) {
		const group = portals.room(room.id);
		for (const { geometry, mat, emit } of geometries.get(room.instanceOf ?? room.id) ?? []) {
			const mesh = new THREE.Mesh(geometry, material(room, mat, emit));
			if (room.offset) mesh.position.set(...room.offset);
			mesh.updateMatrixWorld();
			group.add(mesh);
		}
		const tone = room.fog ? new THREE.Color(...room.fog.color) : average(probes.get(room.instanceOf ?? room.id)!);
		tones.set(room.id, tone);
		portals.setFallback(room.id, tone);
	}

	// portals
	const frames = new Map<string, PortalFrame>();
	for (const p of level.portals) {
		frames.set(
			p.id,
			portals.frame({ id: p.id, room: p.room, position: new THREE.Vector3(...p.pos), right: new THREE.Vector3(...p.right), up: new THREE.Vector3(...p.up), normal: new THREE.Vector3(...p.normal), width: p.w, height: p.h }),
		);
	}
	for (const p of level.portals) if (p.id < p.link) portals.link(frames.get(p.id)!, frames.get(p.link)!);

	// colliders
	const q = new THREE.Quaternion();
	const m = new THREE.Matrix4();
	for (const c of level.colliders) {
		if (c.h[0] <= 0 || c.h[1] <= 0 || c.h[2] <= 0) continue;
		const desc = RAPIER.ColliderDesc.cuboid(c.h[0], c.h[1], c.h[2]).setTranslation(c.c[0], c.c[1], c.c[2]);
		if (c.q) desc.setRotation({ x: c.q[0], y: c.q[1], z: c.q[2], w: c.q[3] });
		if (c.basis) {
			m.makeBasis(new THREE.Vector3(...c.basis[0]), new THREE.Vector3(...c.basis[1]), new THREE.Vector3(...c.basis[2]));
			q.setFromRotationMatrix(m);
			desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
		}
		desc.setFriction(0.8);
		physics.createCollider(desc);
	}
	// the baked light, readable: what stands on a floor is lit by what the floor gets
	const roomOf = new Map(level.rooms.map((r) => [r.id, r]));
	const baked = new Map<string, QuadDef[]>();
	for (const quad of level.quads) if (quad.uv1) baked.set(quad.room, [...(baked.get(quad.room) ?? []), quad]);
	const local = new THREE.Vector3();
	const lightAt = (roomId: string, point: THREE.Vector3, down: THREE.Vector3, out: THREE.Color): boolean => {
		const room = roomOf.get(roomId)!;
		const source = room.instanceOf ?? room.id;
		local.copy(point);
		if (room.offset) local.set(point.x - room.offset[0], point.y - room.offset[1], point.z - room.offset[2]);
		let best = Infinity;
		let u1 = 0;
		let v1 = 0;
		for (const quad of baked.get(source) ?? []) {
			const facing = quad.normal[0] * down.x + quad.normal[1] * down.y + quad.normal[2] * down.z;
			if (facing > -0.3) continue;
			const p = quad.p;
			const t = ((p[0] - local.x) * quad.normal[0] + (p[1] - local.y) * quad.normal[1] + (p[2] - local.z) * quad.normal[2]) / facing;
			if (t < -0.05 || t >= best) continue;
			const hx = local.x + down.x * t - p[0];
			const hy = local.y + down.y * t - p[1];
			const hz = local.z + down.z * t - p[2];
			const ax = p[3] - p[0];
			const ay = p[4] - p[1];
			const az = p[5] - p[2];
			const bx = p[9] - p[0];
			const by = p[10] - p[1];
			const bz = p[11] - p[2];
			const a = (hx * ax + hy * ay + hz * az) / (ax * ax + ay * ay + az * az);
			const b = (hx * bx + hy * by + hz * bz) / (bx * bx + by * by + bz * bz);
			if (a < 0 || a > 1 || b < 0 || b > 1) continue;
			best = t;
			u1 = quad.uv1![0] + (quad.uv1![2] - quad.uv1![0]) * a;
			v1 = quad.uv1![1] + (quad.uv1![7] - quad.uv1![1]) * b;
		}
		if (best === Infinity) return false;
		const probe = probes.get(source)!;
		const x = Math.min(PROBE - 1, Math.max(0, Math.floor(u1 * PROBE)));
		const y = Math.min(PROBE - 1, Math.max(0, Math.floor(v1 * PROBE)));
		const i = 4 * (y * PROBE + x);
		out.setRGB(decode(probe, i), decode(probe, i + 1), decode(probe, i + 2));
		return true;
	};
	progress(1, 'Loading the light');
	const textures = [...Object.values(maps).flatMap((m) => [m.color, m.normal, m.rough]), ...lightmaps.values()];
	return { level, physics, portals, frames, maps, environment, textures, lightAt };
}
