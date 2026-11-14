// The demo proper: a walk through a gallery of impossible rooms. demo/main.ts loads this behind the page's
// loading bar and steers it from the block page's controls.
import * as THREE from 'three/webgpu';
import { type Input, Player } from './player.ts';
import { Props } from './props.ts';
import { loadWorld, type World } from './world.ts';

export interface Values {
	room: string;
	depth: number;
	views: number;
	outlines: boolean;
	fov: number;
	speed: number;
	[id: string]: number | boolean | string;
}

/** Where each choice of `room` puts you: room, feet (in the room's own coordinates), yaw, pitch. */
const STARTS: Record<string, [string, [number, number, number], number, number]> = {
	tunnel: ['a', [1.8, 0, 8.3], -0.62, 0],
	hut: ['b', [2.0, 0, 8.2], -0.83, 0],
	corridor: ['ring0', [1.4, 0, 8.0], -1.25, 0],
	stairs: ['stair', [1.2, 0, 1.1], -Math.PI / 2, 0.2],
	wall: ['l', [3.0, 0, 4.6], 0, 0],
	table: ['s', [1.2, 0, 5.6], -0.95, -0.05],
};

type Quality = 'low' | 'medium' | 'high';
interface PatchHost {
	quality?: Quality;
	addEventListener?: (type: string, listener: () => void) => void;
}
const host = (): PatchHost | undefined => (window as unknown as { patch?: PatchHost }).patch;
/** A turn for the browser, and for the graphics card to finish what it was sent. */
const settle = (renderer: THREE.WebGPURenderer) =>
	Promise.race([(renderer.backend as unknown as { device: GPUDevice }).device.queue.onSubmittedWorkDone(), new Promise((r) => setTimeout(r, 250))]).then(() => new Promise<void>((r) => setTimeout(r, 0)));

export class App {
	visible = true;
	readonly input: Input = { forward: 0, strafe: 0, run: false, jump: false };
	private falling = 0;
	private readonly outlines: THREE.Mesh[] = [];
	private quality: Quality = host()?.quality ?? 'high';

	private constructor(
		readonly canvas: HTMLCanvasElement,
		readonly renderer: THREE.WebGPURenderer,
		readonly scene: THREE.Scene,
		readonly camera: THREE.PerspectiveCamera,
		readonly world: World,
		readonly player: Player,
		readonly props: Props,
		readonly values: Values,
	) {}

	static async create(canvas: HTMLCanvasElement, values: Values, progress: (share: number, words: string) => void): Promise<App> {
		const params = new URLSearchParams(location.search);
		const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
		await renderer.init();
		renderer.toneMapping = THREE.NeutralToneMapping;
		renderer.toneMappingExposure = Number(params.get('exposure') ?? 1.05);
		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(values.fov, window.innerWidth / window.innerHeight, 0.03, 600);
		progress(0.08, 'Loading the rooms');
		const world = await loadWorld(renderer, scene, (share, words) => progress(0.08 + share * 0.37, words));
		const player = new Player(world.physics, world.portals, camera);
		const props = new Props(world);
		const app = new App(canvas, renderer, scene, camera, world, player, props, values);
		app.fit();
		// where each opening is, for the "Show openings" switch
		const edge = new THREE.MeshBasicNodeMaterial({ color: 0xff6a1a, side: THREE.DoubleSide, name: 'outline' });
		for (const f of world.portals.frames) {
			// a band just inside the opening's edge, a hair in front of it
			const t = 0.035 * f.size;
			const at = (x: number, y: number) => new THREE.Vector3().copy(f.position).addScaledVector(f.right, x).addScaledVector(f.up, y).addScaledVector(f.normal, 0.004 * f.size);
			const [w, h] = [f.width / 2, f.height / 2];
			const outer = [at(-w, -h), at(w, -h), at(w, h), at(-w, h)];
			const inner = [at(-w + t, -h + t), at(w - t, -h + t), at(w - t, h - t), at(-w + t, h - t)];
			const geometry = new THREE.BufferGeometry().setFromPoints([...outer, ...inner]);
			geometry.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
			const band = new THREE.Mesh(geometry, edge);
			band.frustumCulled = false;
			world.portals.room(f.room).add(band);
			app.outlines.push(band);
		}
		app.apply();
		app.restart();
		await app.warm((share, words) => progress(0.45 + share * 0.55, words));
		app.listen();
		host()?.addEventListener?.('qualitychange', () => {
			app.quality = host()?.quality ?? 'high';
			app.apply();
			app.fit();
		});
		return app;
	}

	/** Every view through an opening is a screen-sized picture, so the screen's pixels are capped (about 1440p). */
	fit(): void {
		const cap = this.quality === 'high' ? 4.2e6 : 2.2e6;
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2, Math.sqrt(cap / (window.innerWidth * window.innerHeight))));
		this.renderer.setSize(window.innerWidth, window.innerHeight, false);
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
	}

	/** The controls' values, onto the things they steer. */
	private apply(): void {
		const v = this.values;
		const less = this.quality === 'high' ? 0 : this.quality === 'medium' ? 1 : 2;
		this.world.portals.maxDepth = Math.max(0, Math.min(v.depth, 6 - less));
		this.world.portals.budget = Math.max(1, Math.min(v.views, less === 0 ? 12 : less === 1 ? 6 : 4));
		for (const o of this.outlines) o.visible = v.outlines;
		if (this.camera.fov !== v.fov) {
			this.camera.fov = v.fov;
			this.camera.updateProjectionMatrix();
		}
		this.player.speed = v.speed;
	}

	set(id: string, value: number | boolean | string): void {
		this.values[id] = value;
		this.apply();
		if (id === 'room') this.restart();
	}

	trigger(id: string): void {
		if (id === 'ball') this.props.bring(this.player);
	}

	/** Back to the start of the chosen room, everything where it was. */
	restart(): void {
		this.player.ignore = null;
		const [room, at, yaw, pitch] = STARTS[this.values.room] ?? STARTS.tunnel;
		const o = this.world.level.rooms.find((r) => r.id === room)!.origin;
		this.props.reset();
		this.player.place(room, new THREE.Vector3(o[0] + at[0], o[1] + at[1], o[2] + at[2]), yaw, pitch);
	}

	/** One step of the walk and one picture. */
	frame(dt: number, held: Input = this.input): void {
		this.player.update(dt, held);
		// off the edge of everything: back to the start
		this.falling = this.player.grounded ? 0 : this.falling + dt;
		if (this.falling > 5) {
			this.falling = 0;
			this.restart();
		}
		this.props.before(this.player);
		this.world.physics.timestep = Math.max(dt, 1e-4);
		this.world.physics.step();
		this.props.after();
		this.world.portals.render(this.camera, this.player.room);
	}

	/**
	 * Draws everything once behind the cover, a little at a time: each texture, then every room through every
	 * opening, with a wait on the graphics card between them. Nothing is left to build on a first look, and no
	 * one step holds the page.
	 */
	private async warm(progress: (share: number, words: string) => void): Promise<void> {
		const { renderer, world, camera } = this;
		const portals = world.portals;
		// how long each step took, the wait on the graphics card included: scripts/page-visit.mjs prints it (LAPS=1)
		const laps: [string, number][] = [];
		(window as unknown as { __laps: unknown }).__laps = laps;
		let mark = performance.now();
		const lap = (name: string) => {
			const now = performance.now();
			laps.push([name, Math.round(now - mark)]);
			mark = now;
		};
		let n = 0;
		for (const t of world.textures) {
			renderer.initTexture(t);
			if (++n % 3 === 0) {
				progress(0.3 * (n / world.textures.length), 'Loading the rooms');
				await settle(renderer);
				lap(`textures ${n}`);
			}
		}
		portals.prepare(12);
		await settle(renderer);
		lap('targets');
		// A program's first draw holds up the graphics card, and with it every page in the browser, for a moment.
		// There are only a handful of programs here (each surface's own numbers are uniforms), so one surface of
		// each kind is built ahead, then drawn on its own, one a turn. The rest are built as the views below
		// first show them, which costs no new program.
		for (const group of portals.rooms.values()) group.visible = true;
		for (const o of this.outlines) o.visible = true;
		const meshes: THREE.Object3D[] = [];
		this.scene.traverse((o) => {
			if ((o as THREE.Mesh).isMesh || (o as THREE.Line).isLine) meshes.push(o);
		});
		const kinds = new Map<string, THREE.Object3D>();
		for (const o of meshes) {
			const kind = ((o as THREE.Mesh).material as THREE.Material).name;
			if (!kinds.has(kind)) kinds.set(kind, o);
			o.visible = false;
		}
		for (const o of kinds.values()) o.visible = true;
		await renderer.compileAsync(this.scene, camera);
		await settle(renderer);
		lap('compile');
		for (const o of kinds.values()) o.visible = false;
		for (const [kind, o] of kinds) {
			const culled = o.frustumCulled;
			o.frustumCulled = false;
			o.visible = true;
			renderer.render(this.scene, camera);
			o.visible = false;
			o.frustumCulled = culled;
			await settle(renderer);
			lap(`first ${kind}`);
		}
		for (const o of meshes) o.visible = true;
		for (const f of portals.frames) f.mesh.visible = false;
		for (const p of this.props.list) {
			p.twin.visible = false;
			p.shadow.visible = false;
		}
		const depth = portals.maxDepth;
		const budget = portals.budget;
		portals.maxDepth = 6;
		portals.budget = 12;
		const keep = { near: camera.near, position: camera.position.clone(), quaternion: camera.quaternion.clone(), up: camera.up.clone() };
		let done = 0;
		for (const f of portals.frames) {
			camera.near = 0.03 * f.size;
			camera.updateProjectionMatrix();
			camera.position.copy(f.position).addScaledVector(f.normal, 1.5 * f.size).addScaledVector(f.right, 0.2 * f.size);
			camera.up.copy(f.up);
			camera.lookAt(f.position);
			camera.updateMatrixWorld();
			portals.render(camera, f.room);
			progress(0.3 + 0.65 * (++done / portals.frames.length), 'Building the views');
			await settle(renderer);
			lap(`view ${f.id} (${portals.stats.views})`);
		}
		portals.maxDepth = depth;
		portals.budget = budget;
		camera.near = keep.near;
		camera.up.copy(keep.up);
		camera.position.copy(keep.position);
		camera.quaternion.copy(keep.quaternion);
		camera.updateProjectionMatrix();
		this.apply();
		this.restart();
		// the things you carry, and the walk itself, once
		this.props.bring(this.player);
		for (let i = 0; i < 4; i++) {
			this.frame(1 / 60);
			await settle(renderer);
			lap(`frame ${i}`);
		}
		this.restart();
		this.frame(1 / 60);
		await settle(renderer);
		progress(1, 'Ready');
	}

	private listen(): void {
		const { canvas, player, props, input } = this;
		const keys = new Set<string>();
		const read = () => {
			input.forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
			input.strafe = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
			input.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
			input.jump = keys.has('Space');
		};
		const locked = () => document.pointerLockElement === canvas;
		window.addEventListener('keydown', (e) => {
			if (e.repeat) return;
			keys.add(e.code);
			if (e.code === 'KeyE') props.grab(player);
			if (e.code === 'KeyR') this.restart();
			if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
			read();
		});
		window.addEventListener('keyup', (e) => {
			keys.delete(e.code);
			read();
		});
		window.addEventListener('blur', () => {
			keys.clear();
			read();
		});
		document.addEventListener('mousemove', (e) => {
			if (locked()) player.look(e.movementX * 0.0022, e.movementY * 0.0022);
		});
		document.addEventListener('pointerlockchange', () => document.body.classList.toggle('looking', locked()));
		canvas.addEventListener('mousedown', (e) => {
			if (!locked()) {
				Promise.resolve(canvas.requestPointerLock()).catch(() => {});
				return;
			}
			if (e.button === 0 && !props.toss(player)) props.grab(player);
		});
		window.addEventListener('resize', () => this.fit());
	}

	/** Starts the demo's own loop (the page's tests step it by hand instead). */
	run(): void {
		let last = performance.now();
		this.renderer.setAnimationLoop(() => {
			const now = performance.now();
			const dt = Math.min((now - last) / 1000, 1 / 30);
			last = now;
			if (this.visible) this.frame(dt);
		});
	}
}
