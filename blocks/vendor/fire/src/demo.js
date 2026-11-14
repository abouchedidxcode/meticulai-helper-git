// The block demo: one fire in the night, its type and strength on the page, drag and scroll to look at it, click to stoke.
import { patchBlock } from 'patch-block';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import recipe from '../recipe.json';
import { makeBonfire, makeBrazier, makeCampfire, makeCandle, makeCrate, makeFireplace, makeGas, makeGround, makeLine, makeSky, makeTorch, uni } from './dressing.js';
import { FIRE_TYPES, FireLayer } from './fire/index.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const times = { start: performance.now(), ready: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

// Where each type is looked at from: azimuth and elevation in degrees, distance and target height in metres.
const VIEWS = {
	campfire: { az: 25, el: 9, dist: 4.9, ty: 1.02, min: 1, max: 14 },
	candle: { az: 24, el: 7, dist: 0.5, ty: 0.96, min: 0.13, max: 2.6, maxPolar: Math.PI * 0.52 },
	gas: { az: 26, el: 2, dist: 1.5, ty: 1.12, min: 0.3, max: 8 },
	brazier: { az: 24, el: 7, dist: 3.6, ty: 1.15, min: 0.8, max: 10 },
	fireplace: { az: 20, el: 4, dist: 3.5, ty: 0.92, min: 1.1, max: 8, azLimit: 1.1 },
	crate: { az: 32, el: 9, dist: 4.3, ty: 0.95, min: 1, max: 12 },
	line: { az: 16, el: 9, dist: 6.6, ty: 0.85, min: 1.6, max: 18 },
	torch: { az: 26, el: 0, dist: 1.9, ty: 1.98, min: 0.42, max: 8, azLimit: 1.5, maxPolar: Math.PI * 0.72 },
	bonfire: { az: 32, el: 5, dist: 12, ty: 2.7, min: 2.6, max: 28 },
};
const RESOLUTION = { half: 0.5, third: 0.34, full: 1 };

const defaults = Object.fromEntries(recipe.block.controls.map((c) => [c.id, c.default]));
const values = { ...defaults };
let block = null;
let app = null;

function trouble(title, ...lines) {
	$('nogl').querySelector('h1').textContent = title;
	const card = $('nogl').querySelector('.body');
	card.textContent = '';
	for (const line of lines) card.append(Object.assign(document.createElement('p'), { textContent: line }));
	$('nogl').classList.add('on');
	$('cover').classList.remove('on');
}

function start() {
	const canvas = $('view');
	let renderer;
	try {
		renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('capture') });
	} catch {
		trouble('This demo needs a graphics card', "The fire is drawn with WebGL 2, and this browser can't give it one.", 'It plays in Patch Desktop, and in any recent browser with hardware acceleration turned on.');
		block.ready();
		return null;
	}
	renderer.debug.checkShaderErrors = false;
	// Start where a laptop can hold it. Slow frames step this down further (see frame()).
	const ratios = [Math.min(devicePixelRatio, 1.5), 1, 0.75].filter((v, i, a) => a.indexOf(v) === i && v <= Math.min(devicePixelRatio, 1.5));
	let ratioStep = 0;
	renderer.setPixelRatio(ratios[0]);
	renderer.setSize(innerWidth, innerHeight, false);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFShadowMap;

	canvas.addEventListener('webglcontextlost', (e) => {
		e.preventDefault();
		trouble('The graphics card stopped answering', 'Reload the page, or restart your browser if that does not help.');
	});

	const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 120);
	const controls = new OrbitControls(camera, canvas);
	controls.enableDamping = true;
	controls.enablePan = false;
	controls.maxPolarAngle = Math.PI * 0.53;
	controls.autoRotateSpeed = 1.1;

	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0, 0, 0);
	scene.add(makeSky(), makeGround());
	scene.add(new THREE.AmbientLight(0x3a4054, 0.16));
	// what a fire in a room throws back off the room
	const bounce = new THREE.PointLight(0xff8f45, 0, 0, 2);
	scene.add(bounce);

	const torch = makeTorch();
	const dress = { campfire: makeCampfire(), torch, candle: makeCandle(), gas: makeGas(), brazier: makeBrazier(), fireplace: makeFireplace(), bonfire: makeBonfire(), crate: makeCrate(), line: makeLine() };
	for (const d of Object.values(dress)) scene.add(d.set);

	const layer = new FireLayer(renderer, { resolution: RESOLUTION[defaults.resolution] });
	const fire = layer.add({ type: defaults.type, phase: 0 });
	scene.add(fire);

	let bounceStrength = 0;
	function applyFire() {
		const type = values.type;
		const base = FIRE_TYPES[type].size;
		fire.setType(type, base * values.size);
		if (dress[type].fuel) fire.setFuel(dress[type].fuel, dress[type].fixed ? fire.size : base);
		fire.intensity = values.intensity;
		fire.wind = values.wind;
		fire.windDirection = THREE.MathUtils.degToRad(values.direction);
		fire.smoke = values.smoke;
		fire.embers = values.embers;
		fire.lightStrength = values.light;
		fire.speed = values.speed;
		const d = dress[type];
		// what scales with the fire scales from the ground, so the flame stays on it
		fire.position.copy(d.flameAt);
		if (!d.fixed) fire.position.multiplyScalar(values.size);
		uni.uCenter.value.copy(fire.position);
		uni.uK.value = type === 'torch' ? fire.size * 1.1 : fire.size;
		uni.uAsh.value = d.ash;
		uni.uFoot.value.set(...(d.foot ?? [0, 0])).multiplyScalar(1 / 0.72);
		uni.uLightFloor.value = d.floor ?? 0.55;
		bounceStrength = d.bounce?.strength ?? 0;
		if (d.bounce) bounce.position.fromArray(d.bounce.at);
		for (const [name, x] of Object.entries(dress)) x.set.visible = name === type && values.dressing;
		if (type === 'torch') {
			// the flame burns on the head, so the head grows with it, and the pole a little
			torch.head.scale.setScalar(values.size);
			torch.pole.scale.set(Math.sqrt(values.size), 1, Math.sqrt(values.size));
		} else if (!d.fixed) d.set.scale.setScalar(values.size);
	}

	function setView(v) {
		const a = THREE.MathUtils.degToRad(v.az);
		const e = THREE.MathUtils.degToRad(v.el);
		// without damping, an update drops whatever a drag left moving
		controls.enableDamping = false;
		controls.update();
		controls.target.set(0, v.ty, 0);
		camera.position.set(Math.sin(a) * Math.cos(e) * v.dist, v.ty + Math.sin(e) * v.dist, Math.cos(a) * Math.cos(e) * v.dist);
		controls.minDistance = v.min;
		controls.maxDistance = v.max;
		controls.maxPolarAngle = v.maxPolar ?? Math.PI * 0.53;
		controls.minAzimuthAngle = v.azLimit ? -v.azLimit : -Infinity;
		controls.maxAzimuthAngle = v.azLimit ? v.azLimit : Infinity;
		controls.update();
		controls.enableDamping = true;
	}

	function set(id, value) {
		if (values[id] === value) return;
		values[id] = value;
		if (id === 'type') setView(VIEWS[value]);
		else if (id === 'resolution') layer.resolution = RESOLUTION[value];
		else if (id === 'bloom') layer.bloom = value;
		else if (id === 'exposure') layer.exposure = value;
		else if (id === 'turn') controls.autoRotate = value;
		applyFire();
	}

	function reset() {
		for (const c of recipe.block.controls) {
			values[c.id] = c.default;
		}
		layer.resolution = RESOLUTION[values.resolution];
		layer.bloom = values.bloom;
		layer.exposure = values.exposure;
		controls.autoRotate = values.turn;
		fire.boost = 0;
		fire.boostTarget = 0;
		fire.phase = 0;
		for (const b of fire.bursts) b.visible = false;
		applyFire();
		setView(VIEWS[values.type]);
		block.state({ ...defaults });
	}

	function resize() {
		renderer.setSize(innerWidth, innerHeight, false);
		camera.aspect = innerWidth / innerHeight;
		camera.updateProjectionMatrix();
	}
	addEventListener('resize', resize);

	// ---------- direct control: drag looks around, scroll pushes in, a click on the fire stokes it ----------
	const ray = new THREE.Raycaster();
	const ndc = new THREE.Vector2();
	const overFire = (e) => {
		const box = canvas.getBoundingClientRect();
		ndc.set(((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1);
		ray.setFromCamera(ndc, camera);
		return fire.hitBy(ray);
	};
	let down = null;
	const firstMove = () => $('hint').classList.add('used');
	canvas.addEventListener('pointerdown', (e) => {
		down = { x: e.clientX, y: e.clientY, at: performance.now() };
		firstMove();
	});
	canvas.addEventListener('pointermove', (e) => {
		if (!down) canvas.classList.toggle('over', overFire(e));
	});
	canvas.addEventListener('pointerup', (e) => {
		if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && performance.now() - down.at < 500 && overFire(e)) fire.stoke();
		down = null;
	});
	canvas.addEventListener('wheel', firstMove, { passive: true });

	// ---------- the frame ----------
	let last = performance.now();
	let visible = true;
	let slow = 0;
	let frames = 0;
	function draw(dt) {
		layer.update(dt);
		uni.uFlicker.value = fire.fireUniforms.uFlicker.value;
		bounce.intensity = bounceStrength * uni.uFlicker.value * values.light;
		controls.update();
		layer.render(scene, camera);
	}
	function frame(now) {
		requestAnimationFrame(frame);
		if (!visible) {
			last = now;
			return;
		}
		const dt = now - last;
		last = now;
		draw(Math.min(dt, 100) / 1000);
		// A machine that can't hold 30 frames a second gets fewer pixels, a step at a time.
		frames++;
		slow += dt > 33 ? 1 : 0;
		if (frames >= 90) {
			if (slow > 70 && ratioStep < ratios.length - 1) {
				ratioStep++;
				renderer.setPixelRatio(ratios[ratioStep]);
				resize();
			}
			frames = 0;
			slow = 0;
		}
	}

	// ---------- warm-up: compile everything, draw everything once, wait for the GPU, then show ----------
	const gl = renderer.getContext();
	async function fence() {
		const f = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
		gl.flush();
		const t0 = performance.now();
		while (gl.clientWaitSync(f, 0, 0) === gl.TIMEOUT_EXPIRED && performance.now() - t0 < 8000) await sleep(4);
		gl.deleteSync(f);
	}
	async function warm() {
		applyFire();
		setView(VIEWS[values.type]);
		block.progress(0.1, 'Building shaders');
		await nextFrame();
		for (const d of Object.values(dress)) d.set.visible = true;
		renderer.setRenderTarget(layer.rtScene);
		const compiling = [renderer.compileAsync(scene, camera)];
		renderer.setRenderTarget(null);
		compiling.push(layer.compileAsync(camera));
		await Promise.all(compiling);
		block.progress(0.55, 'Lighting the fires');
		// Every type once, wide and close, stoked, under the cover: nothing compiles after ready.
		const order = [...Object.keys(VIEWS).filter((t) => t !== defaults.type), defaults.type];
		let n = 0;
		for (const type of order) {
			values.type = type;
			applyFire();
			for (const close of [false, true]) {
				const v = VIEWS[type];
				setView({ ...v, dist: close ? v.dist * 0.4 : v.dist });
				if (!close) fire.stoke();
				draw(1 / 60);
				await fence();
				await nextFrame();
			}
			block.progress(0.55 + (0.3 * ++n) / order.length, 'Lighting the fires');
		}
		reset0();
		// the settled view, still under the cover, until frames are on time
		for (let i = 0, good = 0, t0 = performance.now(); good < 10 && performance.now() - t0 < 5000; i++) {
			const before = performance.now();
			draw(1 / 60);
			await fence();
			await nextFrame();
			good = performance.now() - before < 28 ? good + 1 : 0;
		}
		// Showing a canvas can stall its next frame, so the cover comes off a little before ready, under the page's loader.
		$('cover').classList.remove('on');
		last = performance.now();
		for (let i = 0; i < 20; i++) {
			const now = await nextFrame().then(() => performance.now());
			draw(Math.min(now - last, 100) / 1000);
			last = now;
		}
		$('hint').classList.add('on');
		times.ready = performance.now() - times.start;
		block.ready();
		requestAnimationFrame((t) => {
			last = t;
			frame(t);
		});
	}
	function reset0() {
		values.type = defaults.type;
		fire.boost = 0;
		fire.boostTarget = 0;
		fire.phase = 0;
		for (const b of fire.bursts) b.visible = false;
		applyFire();
		setView(VIEWS[values.type]);
	}

	return {
		renderer,
		camera,
		controls,
		scene,
		layer,
		fire,
		values,
		set,
		reset,
		setView,
		draw,
		warm,
		VIEWS,
		setVisible: (on) => {
			visible = on;
		},
	};
}

block = patchBlock({
	...recipe.block,
	onSet(id, value) {
		app?.set(id, value);
	},
	onTrigger(id) {
		if (id === 'reset') app?.reset();
		else if (id === 'stoke') app?.fire.stoke();
	},
	onVisible(on) {
		app?.setVisible(on);
	},
});

app = start();
if (app) {
	window.__block = { app, block, renderer: app.renderer, times };
	app.warm().catch((e) => {
		console.error(e);
		trouble('The fire could not start', String(e?.message ?? e));
		block.ready();
	});
}
