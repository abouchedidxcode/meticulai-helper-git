// Realistic Procedural Dungeons: generates a crypt from a seed and walks it in first person. This page is the block's demo, and the place to start
// from: everything else is in src/dungeon. Add ?debug to the address to get `window.__dungeon`, for measuring.
import { Color, MeshDepthMaterial, NearestFilter, PointLight, RGBADepthPacking, TextureLoader, WebGLRenderTarget } from 'three';
import { buildCrypt } from './dungeon/crypt.js';
import { floorAt } from './dungeon/floors.js';
import { createView, CELL_M } from './dungeon/view.js';
import { createWalker } from './dungeon/walker.js';
import { patchBlock } from './patch-block.js';

const WALK = 2.9; // Cells a second. A cell is 1.5 m.
const RUN = 4.4;
const EYE = 1.07; // Cells above the floor.
const LOOK = 0.0021;

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || 1337;

let view;
let dungeon;
let level;
let walker;
let lamps;
let shadowLights;
let paused = false;
let visible = true;
let time = 0;
let last = 0;
let eyeFloor = 0;
const keys = new Set();

// Patch's page talks to the demo through this. Outside Patch it does nothing that matters.
const block = patchBlock({
	onVisible(on) {
		visible = on;
		last = performance.now();
	},
});

// Says how far it has got, and gives the browser a turn so that it can show it.
function say(value, label) {
	$('cover').textContent = label;
	block.progress(value, label);
	return new Promise((resolve) => setTimeout(resolve));
}

const buildLevel = () => new Promise((resolve, reject) => {
	const worker = new Worker(new URL('./dungeon/build-worker.js', import.meta.url), { type: 'module' });
	worker.onerror = (e) => reject(new Error(e.message));
	worker.onmessage = ({ data }) => {
		if (data.type === 'masonry') {
			view.setMasonry(data);
			worker.postMessage({ type: 'level', id: 1, params: { seed, rooms: 24, loops: 0.3, decor: 0.6, theme: 'verdant' } });
			return;
		}
		worker.terminate();
		resolve(data);
	};
	worker.postMessage({ type: 'masonry' });
});

// The eye rides over steps rather than jolting up each one. With no `dt` it goes straight there.
function syncEye(dt = 10) {
	const floor = floorAt(dungeon, walker.x + dungeon.W / 2, walker.z + dungeon.H / 2);
	eyeFloor += (floor - eyeFloor) * (1 - Math.exp(-dt * 11));
	view.rig.eye.set(walker.x * CELL_M, (eyeFloor + EYE + Math.sin(walker.bob) * 0.012) * CELL_M, walker.z * CELL_M);
	view.rig.eyeYaw = walker.yaw;
	view.rig.eyePitch = walker.pitch;
}

const LAMP_LOOK = { candle: { color: new Color(0xd8d6c8), power: 0.95 }, door: { color: new Color(0xd8d6c8), power: 0.6 }, ember: { color: new Color(0xf2b47e), power: 1.5 } };
const LAMP_FADE = [9, 13]; // Cells from the eye over which a lamp's real light goes out.
let lampCheck = 0;

function seesLamp(lamp, ex, ez) {
	const steps = Math.ceil(Math.hypot(lamp.x - ex, lamp.z - ez) * 3);
	for (let i = 1; i < steps; i++) {
		const t = i / steps;
		const x = Math.floor(ex + (lamp.x - ex) * t + dungeon.W / 2);
		const z = Math.floor(ez + (lamp.z - ez) * t + dungeon.H / 2);
		if (dungeon.grid[z * dungeon.W + x] !== 1) return false;
	}
	return true;
}

// Only two lamps at a time can have real shadows. A lamp that has a place keeps its one brightness, fading only with distance, and gives
// the place up only to a lamp that's clearly nearer, by fading right out first. Nothing here moves as you move except that fade, so
// nothing can pulse. A lamp you can see goes ahead of one behind a wall. Their shadow maps are drawn once when they arrive, as the
// stone doesn't move. Most of the light is baked anyway, so this is only the shape in it.
function placeLights(dt) {
	const ex = view.rig.eye.x / CELL_M;
	const ez = view.rig.eye.z / CELL_M;
	lampCheck -= dt;
	if (lampCheck <= 0) {
		lampCheck = 0.12;
		const score = (lamp) => {
			const dist = Math.hypot(lamp.x - ex, lamp.z - ez);
			return dist < 30 && seesLamp(lamp, ex, ez) ? dist : dist * 1.5 + 3;
		};
		const ranked = lamps.map((lamp) => ({ lamp, score: score(lamp) })).sort((a, b) => a.score - b.score);
		for (const { lamp, score: s } of ranked.slice(0, shadowLights.length)) {
			if (shadowLights.some((slot) => slot.lamp === lamp)) continue;
			const free = shadowLights.find((slot) => !slot.lamp);
			if (free) {
				free.lamp = lamp;
				free.leaving = false;
				free.light.position.set(lamp.x * CELL_M, lamp.y * CELL_M, lamp.z * CELL_M);
				free.light.color.copy(LAMP_LOOK[lamp.kind].color);
				free.light.intensity = 0;
				free.light.shadow.needsUpdate = true;
				view.renderer.shadowMap.needsUpdate = true;
				continue;
			}
			// Everyone's taken: whoever's furthest goes, if it's clearly further than this one, so two near-equals don't trade places.
			const worst = shadowLights.filter((slot) => !slot.leaving).sort((a, b) => score(b.lamp) - score(a.lamp))[0];
			if (worst && score(worst.lamp) > s + 2.5) worst.leaving = true;
		}
	}
	for (const slot of shadowLights) {
		let goal = 0;
		if (slot.lamp && !slot.leaving) {
			const dist = Math.hypot(slot.lamp.x - ex, slot.lamp.z - ez);
			const k = Math.min(1, Math.max(0, (LAMP_FADE[1] - dist) / (LAMP_FADE[1] - LAMP_FADE[0])));
			goal = LAMP_LOOK[slot.lamp.kind].power * k * k * (3 - 2 * k);
		}
		slot.light.intensity += (goal - slot.light.intensity) * Math.min(1, dt * 3);
		if (slot.leaving && slot.light.intensity < 0.015) {
			slot.lamp = null;
			slot.leaving = false;
			slot.light.intensity = 0;
		}
	}
}

function makeShadowLights() {
	return [0, 1].map(() => {
		// No further than the baked light reaches: beyond that it would light up rooms only while it held a place.
		const light = new PointLight(0xffffff, 0, 9, 2);
		light.castShadow = true;
		light.shadow.mapSize.set(512, 512);
		light.shadow.bias = -0.002;
		light.shadow.normalBias = 0.04;
		light.shadow.radius = 4;
		light.shadow.camera.near = 0.2;
		light.shadow.camera.far = 22;
		light.shadow.autoUpdate = false;
		view.scene.add(light);
		return { light, lamp: null, leaving: false };
	});
}

// The contact shadows read the level's depth, at half size, drawn before the scene each frame.
function setUpDepth() {
	const { renderer: gl, scene, camera, POST } = view;
	const target = new WebGLRenderTarget(2, 2);
	target.texture.generateMipmaps = false;
	// Exact values: a blended depth is a depth nothing is at.
	target.texture.minFilter = NearestFilter;
	target.texture.magFilter = NearestFilter;
	const material = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
	const clear = new Color();
	POST.ao.uniforms.tZ.value = target.texture;
	POST.fin.uniforms.uAO.value = 1;
	view.beforeScene = () => {
		const w = Math.max(2, POST.w >> 1);
		const h = Math.max(2, POST.h >> 1);
		if (target.width !== w || target.height !== h) target.setSize(w, h);
		const ao = POST.ao.uniforms;
		ao.uNear.value = camera.near;
		ao.uFar.value = camera.far;
		ao.uLens.value = camera.projectionMatrix.elements[5];
		const mask = camera.layers.mask;
		const alpha = gl.getClearAlpha();
		gl.getClearColor(clear);
		scene.overrideMaterial = material;
		camera.layers.set(0);
		gl.setRenderTarget(target);
		gl.setClearColor(0xffffff, 1);
		gl.clear();
		gl.render(scene, camera);
		scene.overrideMaterial = null;
		camera.layers.mask = mask;
		gl.setClearColor(clear, alpha);
		gl.setRenderTarget(null);
	};
}

// Input.
addEventListener('keydown', (e) => {
	if (!e.repeat) keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
addEventListener('resize', () => view?.resize());
canvas.addEventListener('click', () => {
	if (document.pointerLockElement !== canvas) canvas.requestPointerLock()?.catch?.(() => {});
});
document.addEventListener('pointerlockchange', () => {
	$('hint').classList.toggle('off', document.pointerLockElement === canvas);
	if (document.pointerLockElement !== canvas) keys.clear();
});
canvas.addEventListener('mousemove', (e) => {
	if (document.pointerLockElement !== canvas) return;
	const k = LOOK * (view.rig.fov / 72);
	walker.yaw -= e.movementX * k;
	walker.pitch = Math.max(-1.35, Math.min(1.35, walker.pitch - e.movementY * k));
});

function tick(now) {
	requestAnimationFrame(tick);
	const raw = now - last;
	last = now;
	if (paused || !visible) return;
	const dt = Math.min(raw / 1000, 0.05);
	const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
	const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
	const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
	walker.step(dt, f, s, run ? RUN : WALK);
	time += dt;
	syncEye(dt);
	placeLights(dt);
	view.frame(time, dt);
}

async function start() {
	try {
		view = createView(canvas, { pixelCap: Math.min(devicePixelRatio, 1.25), checkShaders: true });
	} catch (e) {
		$('cover').textContent = `This needs WebGL 2: ${e?.message ?? ''}`;
		return;
	}
	view.rig.t = 1;
	view.rig.fov = 72;
	await say(0.05, 'Cutting the stone');
	const loader = new TextureLoader();
	const scan = async (base) => {
		const [color, normal, roughness, height] = await Promise.all(['baseColor', 'normal', 'roughness', 'displacement'].map((map) => loader.loadAsync(`${base}_${map}.jpg`)));
		return { color, normal, roughness, height };
	};
	const [wall, floor, plaster] = await Promise.all([scan('./assets/materials/medievalBlocks05/medieval_blocks_05'), scan('./assets/materials/dirtFloor/dirt_floor'), scan('./assets/materials/medievalWall01/medieval_wall_01')]);
	view.setScans({ wall, floor, plaster });
	await say(0.3, 'Forging the dungeon');
	const built = await buildLevel();
	dungeon = built.dungeon;
	level = built.level;
	view.setLevel(dungeon, level, { reveal: false });
	await say(0.6, 'Raising the vaults');
	lamps = buildCrypt(view, dungeon, level);
	shadowLights = makeShadowLights();
	setUpDepth();
	walker = createWalker(dungeon);
	walker.start();
	syncEye();
	for (let i = 0; i < 40; i++) placeLights(0.1);
	await say(0.9, 'Lighting the candles');
	// Once through, so nothing stalls on the first real frame.
	view.frame(0, 0);
	view.frame(0, 0);
	if (params.has('debug')) {
		window.__dungeon = {
			view,
			dungeon,
			level,
			walker,
			floorAt: (x, z) => floorAt(dungeon, x + dungeon.W / 2, z + dungeon.H / 2),
			pause(on) {
				paused = on;
			},
			/** Stands anywhere and looks anywhere. Positions are in cells. */
			look(x, z, yawDegrees, pitchDegrees = 0) {
				paused = true;
				walker.x = x;
				walker.z = z;
				walker.yaw = (yawDegrees * Math.PI) / 180;
				walker.pitch = (pitchDegrees * Math.PI) / 180;
				syncEye();
				lampCheck = 0;
				for (let i = 0; i < 40; i++) placeLights(0.1);
				view.frame(time, 0);
				view.frame(time, 0);
			},
			ready: true,
		};
	}
	last = performance.now();
	requestAnimationFrame(tick);
	$('cover').classList.add('off');
	block.ready();
}

start().catch((e) => {
	console.error(e);
	$('cover').textContent = `It stopped: ${e?.message ?? e}`;
});
