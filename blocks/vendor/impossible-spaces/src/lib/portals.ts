// Portals for three.js on WebGPU: join any two rectangular openings so that looking, walking and
// throwing through them is seamless. Each room is a group; a view only ever draws one room.
import * as THREE from 'three/webgpu';
import { screenUV, texture } from 'three/tsl';

export interface FrameSpec {
	id?: string;
	/** The room this opening is in (and is seen from). */
	room: string;
	/** Centre of the opening. */
	position: THREE.Vector3Like;
	/** Unit axes: the opening spans `right` × `up` and is looked into against `normal`. */
	right: THREE.Vector3Like;
	up: THREE.Vector3Like;
	normal: THREE.Vector3Like;
	width: number;
	height: number;
}

export interface PortalOptions {
	/** How many portals deep a view may go before the last one is drawn as a flat colour. */
	maxDepth?: number;
	/** Most views drawn in one frame, the main one aside. */
	budget?: number;
	/** The least share of the screen (0..1) a view is drawn for; smaller ones are a flat colour. */
	minShare?: number;
	/** MSAA samples of the views (match the renderer's). */
	samples?: number;
	/** Called before each view is drawn, with the room it shows (to set a background, fog and the like for it). */
	onView?: (room: string) => void;
}

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _half = new THREE.Matrix4().makeRotationY(Math.PI);

export class PortalFrame {
	readonly id: string;
	readonly room: string;
	readonly position = new THREE.Vector3();
	readonly right = new THREE.Vector3();
	readonly up = new THREE.Vector3();
	readonly normal = new THREE.Vector3();
	readonly width: number;
	readonly height: number;
	readonly matrix = new THREE.Matrix4();
	readonly inverse = new THREE.Matrix4();
	readonly plane = new THREE.Plane();
	/** The opening this one leads to. */
	link: PortalFrame | null = null;
	/** World on this side to world on the other side. */
	readonly through = new THREE.Matrix4();
	/** The rotation part of `through`. */
	readonly turn = new THREE.Quaternion();
	/** How much bigger things are on the other side. */
	scale = 1;
	readonly mesh: THREE.Mesh;
	private readonly view: ReturnType<typeof texture>;

	constructor(spec: FrameSpec, placeholder: THREE.Texture) {
		this.id = spec.id ?? `frame${Math.random().toString(36).slice(2, 8)}`;
		this.room = spec.room;
		this.position.copy(spec.position);
		this.right.copy(spec.right).normalize();
		this.up.copy(spec.up).normalize();
		this.normal.copy(spec.normal).normalize();
		this.width = spec.width;
		this.height = spec.height;
		this.matrix.makeBasis(this.right, this.up, this.normal).setPosition(this.position);
		this.inverse.copy(this.matrix).invert();
		this.plane.setFromNormalAndCoplanarPoint(this.normal, this.position);
		// The surface is an open box behind the opening, so the near plane never cuts through it as a camera crosses.
		const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, name: 'portal' });
		this.view = texture(placeholder, screenUV);
		material.colorNode = this.view as never;
		material.fog = false;
		this.mesh = new THREE.Mesh(BOX, material);
		this.mesh.name = `portal:${this.id}`;
		this.mesh.matrixAutoUpdate = false;
		this.mesh.frustumCulled = false;
		this.mesh.visible = false;
		this.setDepth(0.004);
	}

	/** The size things keep their proportions by: a door is 1, a mouse hole a tenth. */
	get size(): number {
		return Math.min(1, this.width, this.height);
	}

	setDepth(depth: number): void {
		_m.makeScale(this.width, this.height, depth);
		this.mesh.matrix.multiplyMatrices(this.matrix, _m);
		this.mesh.matrixWorldNeedsUpdate = true;
	}

	show(t: THREE.Texture): void {
		this.view.value = t;
	}

	/** Whether the segment from → to goes in through this opening. */
	crossed(from: THREE.Vector3, to: THREE.Vector3): boolean {
		const d0 = this.plane.distanceToPoint(from);
		const d1 = this.plane.distanceToPoint(to);
		if (!(d0 > 0 && d1 <= 0)) return false;
		_v.lerpVectors(from, to, d0 / (d0 - d1)).applyMatrix4(this.inverse);
		return Math.abs(_v.x) <= this.width / 2 && Math.abs(_v.y) <= this.height / 2;
	}

	/** Signed distance in front of the opening, and whether the point is within its outline (grown by `margin`). */
	facing(p: THREE.Vector3, margin = 0): { distance: number; inside: boolean } {
		_v.copy(p).applyMatrix4(this.inverse);
		return { distance: _v.z, inside: Math.abs(_v.x) <= this.width / 2 + margin && Math.abs(_v.y) <= this.height / 2 + margin };
	}
}

/**
 * An open box: x, y in ±0.5 at its rim (z 0), back to z −1, without its front. The rim is the opening exactly,
 * so no part of the box shows round it; the back is a touch wider, so its sides never lie in a wall that carries
 * on behind the opening.
 */
const BOX = (() => {
	const g = new THREE.BufferGeometry();
	const b = 0.504;
	const p = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0, -b, -b, -1, b, -b, -1, b, b, -1, -b, b, -1];
	g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
	g.setIndex([4, 5, 6, 4, 6, 7, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5, 3, 7, 6, 3, 6, 2, 0, 1, 5, 0, 5, 4]);
	return g;
})();

interface View {
	room: string;
	world: THREE.Matrix4;
	portal: PortalFrame | null;
	exit: PortalFrame | null;
	rect: [number, number, number, number];
	depth: number;
	children: View[];
	target: THREE.RenderTarget | null;
}

export class PortalSystem {
	readonly frames: PortalFrame[] = [];
	readonly rooms = new Map<string, THREE.Group>();
	maxDepth: number;
	budget: number;
	/** The least share of the screen a view is drawn for. */
	minShare: number;
	/** For finding faults: draw every view with the plain projection (nothing clipped behind the far opening). */
	debugPlain = false;
	/** What the last frame drew: views, and how deep. */
	readonly stats = { views: 0, depth: 0, cut: 0 };
	private readonly byRoom = new Map<string, PortalFrame[]>();
	private readonly targets: THREE.RenderTarget[] = [];
	private readonly flat = new Map<string, THREE.DataTexture>();
	private readonly placeholder: THREE.DataTexture;
	private readonly eye = new THREE.PerspectiveCamera();
	private readonly samples: number;
	private readonly onView: (room: string) => void;
	private readonly size = new THREE.Vector2();
	private used = 0;

	constructor(
		readonly renderer: THREE.WebGPURenderer,
		readonly scene: THREE.Scene,
		options: PortalOptions = {},
	) {
		this.maxDepth = options.maxDepth ?? 4;
		this.budget = options.budget ?? 10;
		this.minShare = options.minShare ?? 0.0006;
		this.samples = options.samples ?? 4;
		this.onView = options.onView ?? (() => {});
		this.placeholder = solid(new THREE.Color(0, 0, 0));
		this.eye.matrixAutoUpdate = false;
		this.eye.matrixWorldAutoUpdate = false;
	}

	/** The group that holds everything in a room. A view draws exactly one of these. */
	room(id: string): THREE.Group {
		let g = this.rooms.get(id);
		if (!g) {
			g = new THREE.Group();
			g.name = `room:${id}`;
			g.visible = false;
			this.rooms.set(id, g);
			this.scene.add(g);
		}
		return g;
	}

	/** The colour a room's portals fall back to once a view is too deep to draw. */
	setFallback(room: string, color: THREE.Color): void {
		this.flat.set(room, solid(color));
	}

	frame(spec: FrameSpec): PortalFrame {
		const f = new PortalFrame(spec, this.placeholder);
		this.frames.push(f);
		const list = this.byRoom.get(f.room) ?? [];
		list.push(f);
		this.byRoom.set(f.room, list);
		this.room(f.room).add(f.mesh);
		return f;
	}

	/** Joins two openings, both ways. They must have the same proportions; a size difference scales what goes through. */
	link(a: PortalFrame, b: PortalFrame): void {
		for (const [from, to] of [
			[a, b],
			[b, a],
		]) {
			from.link = to;
			from.scale = to.width / from.width;
			_m.makeScale(from.scale, from.scale, from.scale);
			from.through.copy(to.matrix).multiply(_half).multiply(_m).multiply(from.inverse);
			const ra = new THREE.Quaternion().setFromRotationMatrix(from.matrix);
			const rb = new THREE.Quaternion().setFromRotationMatrix(to.matrix);
			from.turn.copy(rb).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)).multiply(ra.invert());
		}
	}

	in(room: string): readonly PortalFrame[] {
		return this.byRoom.get(room) ?? [];
	}

	/** The opening in `room` that the segment from → to goes in through, if any. */
	crossing(room: string, from: THREE.Vector3, to: THREE.Vector3): PortalFrame | null {
		for (const f of this.in(room)) if (f.link && f.crossed(from, to)) return f;
		return null;
	}

	/** Draws `room` from `camera`, with everything seen through its openings. */
	render(camera: THREE.PerspectiveCamera, room: string): void {
		const { renderer } = this;
		renderer.getDrawingBufferSize(this.size);
		if (this.targets.length && (this.targets[0].width !== this.size.x || this.targets[0].height !== this.size.y)) {
			for (const t of this.targets) t.dispose();
			this.targets.length = 0;
		}
		camera.updateMatrixWorld();
		if (camera.coordinateSystem !== renderer.coordinateSystem) {
			camera.coordinateSystem = renderer.coordinateSystem;
			camera.updateProjectionMatrix();
		}
		// what is seen through what, breadth first so the budget goes to the nearest views
		const root: View = { room, world: camera.matrixWorld.clone(), portal: null, exit: null, rect: [-1, -1, 1, 1], depth: 0, children: [], target: null };
		this.used = 0;
		this.stats.cut = 0;
		this.stats.depth = 0;
		let level = [root];
		while (level.length) {
			const next: View[] = [];
			for (const view of level) {
				_m.copy(view.world).invert();
				const viewProjection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, _m);
				const eye = new THREE.Vector3().setFromMatrixPosition(view.world);
				for (const f of this.in(view.room)) {
					if (!f.link || f === view.exit) continue;
					if (f.plane.distanceToPoint(eye) <= 0) continue;
					// (an opening at or behind the one we look out of isn't in this view at all)
					if (view.exit && behind(f, view.exit.plane)) continue;
					const rect = bounds(f, viewProjection, view.rect);
					if (!rect) continue;
					const child: View = { room: f.link.room, world: new THREE.Matrix4().multiplyMatrices(f.through, view.world), portal: f, exit: f.link, rect, depth: view.depth + 1, children: [], target: null };
					view.children.push(child);
					next.push(child);
				}
			}
			// the biggest on screen first; a view too small to tell is a flat colour
			next.sort((a, b) => share(b) - share(a));
			level = [];
			for (const child of next) {
				if (child.depth <= this.maxDepth && this.used < this.budget && share(child) >= this.minShare) {
					child.target = this.target(this.used++);
					level.push(child);
					this.stats.depth = Math.max(this.stats.depth, child.depth);
				} else this.stats.cut++;
			}
		}
		this.stats.views = this.used;
		const previous = renderer.getRenderTarget();
		this.draw(root, camera);
		renderer.setRenderTarget(previous);
	}

	private draw(view: View, camera: THREE.PerspectiveCamera): void {
		for (const child of view.children) if (child.target) this.draw(child, camera);
		for (const [id, group] of this.rooms) group.visible = id === view.room;
		for (const f of this.in(view.room)) f.mesh.visible = false;
		const eye = _v.setFromMatrixPosition(view.world);
		const eyeScale = view.world.getMaxScaleOnAxis();
		// how far the near plane's corners are from the eye, in near planes
		const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
		const corner = Math.sqrt(1 + tan * tan * (1 + camera.aspect * camera.aspect));
		for (const child of view.children) {
			const f = child.portal!;
			f.mesh.visible = true;
			f.show(child.target ? child.target.texture : (this.flat.get(f.link!.room) ?? this.placeholder));
			// deep enough that the near plane stays inside the box while a camera is at the opening
			const need = camera.near * eyeScale * corner * 1.6;
			f.setDepth(f.plane.distanceToPoint(eye) < need * 4 ? need : 0.004 * f.size);
		}
		const { renderer } = this;
		this.onView(view.room);
		if (!view.exit) {
			renderer.setRenderTarget(null);
			renderer.render(this.scene, camera);
			return;
		}
		const cam = this.eye;
		cam.coordinateSystem = renderer.coordinateSystem;
		cam.matrixWorld.copy(view.world);
		cam.matrixWorldInverse.copy(view.world).invert();
		// nothing behind the opening we look out of may show: its plane becomes the near plane
		const exit = view.exit;
		const plane = new THREE.Plane().copy(exit.plane);
		plane.constant += 0.02 * exit.size;
		plane.applyMatrix4(cam.matrixWorldInverse);
		// (with the eye at the opening itself the plain projection does: its near plane is already past it)
		if (plane.constant > -camera.near || this.debugPlain) cam.projectionMatrix.copy(camera.projectionMatrix);
		else oblique(camera.projectionMatrix, plane, cam.projectionMatrix);
		cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
		renderer.setRenderTarget(view.target);
		renderer.render(this.scene, cam);
	}

	private target(i: number): THREE.RenderTarget {
		let t = this.targets[i];
		if (!t) {
			t = new THREE.RenderTarget(this.size.x, this.size.y, { type: THREE.HalfFloatType, samples: this.samples, depthBuffer: true });
			t.texture.name = `portal-view-${i}`;
			t.texture.minFilter = THREE.LinearFilter;
			t.texture.magFilter = THREE.LinearFilter;
			t.texture.generateMipmaps = false;
			this.targets[i] = t;
		}
		return t;
	}

	/** Makes the pictures for `count` views now, so the first deep look doesn't have to. */
	prepare(count: number): void {
		this.renderer.getDrawingBufferSize(this.size);
		for (let i = 0; i < count; i++) this.target(i);
	}

	dispose(): void {
		for (const t of this.targets) t.dispose();
		this.targets.length = 0;
	}
}

/** How much of the screen a view covers, 0..1. */
function share(v: View): number {
	return ((v.rect[2] - v.rect[0]) * (v.rect[3] - v.rect[1])) / 4;
}

function solid(c: THREE.Color): THREE.DataTexture {
	const t = new THREE.DataTexture(new Float32Array([c.r, c.g, c.b, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
	t.needsUpdate = true;
	return t;
}

/**
 * A projection whose near plane is `plane` (view space, visible side positive) and whose far plane is at infinity,
 * for depth from 0 to 1. Only the depth row changes, so the picture lines up with the plain projection's.
 */
export function oblique(projection: THREE.Matrix4, plane: THREE.Plane, out: THREE.Matrix4): THREE.Matrix4 {
	const e = out.copy(projection).elements;
	const n = plane.normal;
	const reach = Math.abs(n.x) / projection.elements[0] + Math.abs(n.y) / projection.elements[5] - n.z;
	if (reach <= 1e-6) return out;
	const a = 0.999 / reach;
	e[2] = a * n.x;
	e[6] = a * n.y;
	e[10] = a * n.z;
	e[14] = a * plane.constant;
	return out;
}

/** Whether all of an opening lies on or behind `plane`. */
function behind(f: PortalFrame, plane: THREE.Plane): boolean {
	const limit = 1e-3 * f.size;
	for (const sx of [-0.5, 0.5])
		for (const sy of [-0.5, 0.5]) {
			_v.set(sx * f.width, sy * f.height, 0).applyMatrix4(f.matrix);
			if (plane.distanceToPoint(_v) > limit) return false;
		}
	return true;
}

const _corners = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];

/** The opening's bounds on screen (−1..1), cut to `within`, or null when none of it shows. */
function bounds(f: PortalFrame, viewProjection: THREE.Matrix4, within: [number, number, number, number]): [number, number, number, number] | null {
	const hw = f.width / 2;
	const hh = f.height / 2;
	const local = [
		[-hw, -hh],
		[hw, -hh],
		[hw, hh],
		[-hw, hh],
	];
	for (let i = 0; i < 4; i++) _corners[i].set(local[i][0], local[i][1], 0, 1).applyMatrix4(f.matrix).applyMatrix4(viewProjection);
	// clip the quad to in front of the eye
	const EPS = 1e-5;
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	let any = false;
	const add = (x: number, y: number, w: number) => {
		any = true;
		x0 = Math.min(x0, x / w);
		x1 = Math.max(x1, x / w);
		y0 = Math.min(y0, y / w);
		y1 = Math.max(y1, y / w);
	};
	for (let i = 0; i < 4; i++) {
		const a = _corners[i];
		const b = _corners[(i + 1) % 4];
		if (a.w > EPS) add(a.x, a.y, a.w);
		if (a.w > EPS !== b.w > EPS) {
			const t = (EPS - a.w) / (b.w - a.w);
			add(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, EPS);
		}
	}
	if (!any) return null;
	x0 = Math.max(x0, within[0]);
	y0 = Math.max(y0, within[1]);
	x1 = Math.min(x1, within[2]);
	y1 = Math.min(y1, within[3]);
	if (x1 - x0 <= 1e-4 || y1 - y0 <= 1e-4) return null;
	return [x0, y0, x1, y1];
}
