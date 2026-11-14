// Fire you can place in any three.js scene (WebGL2). A FireLayer owns the passes; each Fire it makes is an Object3D
// holding the lights, so it goes in your scene like anything else. See README.md.
import * as THREE from 'three';
import { LOOP, MAX_EMBERS, burstVertex, emberFragment, emberVertex, fireGLSL, flicker, windBend } from './shader.js';

export { LOOP, flicker };

// Each type is the same volume, stretched: size in metres per flame-space metre, and the shape inside that.
// `on` shapes the flame to what's burning, in metres per `size`: see shapeOn and shapeOut.
export const FIRE_TYPES = {
	campfire: { size: 1, width: 1, height: 1, spread: 1, light: 1, embers: 380, smoke: 1 },
	// on a head about 5 cm in radius and 21 cm tall, standing at the head's foot
	torch: { size: 0.34, width: 0.66, height: 1.02, spread: 0.48, light: 1.15, embers: 90, smoke: 0.7, on: { radius: 0.15, tall: 0.62, flare: 0.3, body: 1.42, climb: 1 } },
	// a still flame on a wick: narrow at the foot and blue there, a belly, then a point
	candle: { size: 0.056, width: 0.78, height: 0.62, spread: 0.18, light: 13, lightColor: 0xffb26b, embers: 0, smoke: 0.1, calm: 0.84, heat: 1.1, blueFoot: 1, on: { radius: 0.1, tall: 0.24, flare: 1.7, body: 1.5 } },
	// out of a nozzle, steady and blue
	gas: { size: 0.3, width: 1, height: 1, spread: 0.24, light: 2.6, lightColor: 0x9dbcff, embers: 0, smoke: 0, calm: 1, blue: 1, on: { radius: 0.082, tall: 1.12 } },
	// out of a bowl's mouth, held to it, then free
	brazier: { size: 0.56, width: 1, height: 0.92, spread: 0.92, light: 1.5, embers: 240, smoke: 0.8, on: { radius: 0.5, tall: 0.42, flare: 0.12, body: 0.5 } },
	// a wide, low fire along the logs at the back of a hearth
	fireplace: { size: 0.5, width: 1, height: 0.9, spread: 0.22, light: 1.7, embers: 110, smoke: 0.3, repeat: 0.5, on: { radius: 0.09, tall: 0.5, flare: 1.7, body: 0.5, climb: 0.2, halfWidth: 0.8, halfDepth: 0.02 } },
	// a tall square pyre: flames through the stack and a tower of fire off the top
	bonfire: { size: 2, width: 1, height: 1.38, spread: 0.6, light: 1.25, embers: 640, smoke: 1.1, on: { radius: 0.02, tall: 0.88, flare: 0, body: 1, climb: 0, halfWidth: 0.27, halfDepth: 0.27, rows: { apart: 0.205, x: 0.05, z: 0.1525, out: 0.13 } } },
	// flames climbing every side of a box
	crate: { size: 0.8, width: 0.9, height: 1.12, spread: 0.46, light: 1.3, embers: 280, smoke: 0.8, soot: 0.6, on: { radius: 0.015, tall: 0.85, flare: 0, body: 0.8, climb: 0, halfWidth: 0.385, halfDepth: 0.385, rows: { apart: 0.17, x: 0, z: 0, out: 0.07 } } },
	// a front of flame along a line on the ground
	// a row of small fires, so it reads as flames from any side, end-on too
	line: { size: 0.72, width: 0.86, height: 0.98, spread: 0.46, light: 2.2, embers: 520, smoke: 0.6, stretch: 1.05, halfWidth: 3.6, halfDepth: 0.05 },
};

/** A shape for a flame burning on a thing, its flames climbing its sides. Sizes in metres, from its foot: a radius, or a width and depth. */
export const shapeOn = ({ radius = 0, width = 0, depth = 0, height, climb = 1, flare = 0.3, body = width || depth ? 0.8 : 1.4, rows }, size) => ({
	radius: (radius || 0.02) / size,
	halfWidth: width / 2 / size,
	halfDepth: depth / 2 / size,
	tall: height / size,
	climb,
	flare,
	body,
	rows,
});

/** A shape for a flame rising out of an opening, with the fire standing `below` metres under the rim. A radius, or a width and depth. */
export const shapeOut = ({ radius = 0, width = 0, depth = 0, below = 0.14, free = 0.1 }, size) => ({
	radius: (radius || 0.02) / size,
	halfWidth: width / 2 / size,
	halfDepth: depth / 2 / size,
	tall: (below + free) / size,
	climb: 0,
	flare: 0.12,
	body: 0.5,
});

const BURSTS = 3;
const BURST_EMBERS = 140;
const BURST_SPAN = 2.5;

const rng = (seed) => {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

const emberSeeds = (() => {
	const seeds = new Float32Array(MAX_EMBERS * 4);
	const r = rng(2024);
	for (let i = 0; i < seeds.length; i++) seeds[i] = r();
	return new THREE.BufferAttribute(seeds, 4);
})();
const emberPositions = new THREE.BufferAttribute(new Float32Array(MAX_EMBERS * 3), 3);
const emberGeometry = (count) => {
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', emberPositions);
	g.setAttribute('seed', emberSeeds);
	g.setDrawRange(0, count);
	return g;
};

// A cylinder from y = 0 to 1, radius 1. Only the fire's pixels pay, and offscreen fires are culled.
const proxyGeometry = new THREE.CylinderGeometry(1.03, 1.03, 1, 32).translate(0, 0.5, 0);

const fullscreenVertex = /* glsl */ `out vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Fire extends THREE.Object3D {
	constructor(layer, options = {}) {
		super();
		const type = FIRE_TYPES[options.type ?? 'campfire'];
		if (!type) throw new Error(`no fire type ${options.type}; there are ${Object.keys(FIRE_TYPES).join(', ')}`);
		this.layer = layer;
		/** Metres per flame-space metre: 1 is a campfire about 1.9 m tall. Set by the type unless you say. */
		this.size = options.size ?? type.size;
		this.type_ = { ...type, ...options.look };
		if (options.length) this.type_.halfWidth = options.length / 2 / this.size;
		// What it's burning on or coming out of, if you say: it replaces the type's own.
		this.on = options.around ? shapeOn(options.around, this.size) : options.outOf ? shapeOut(options.outOf, this.size) : type.on;
		/** How strong it burns, 0.3 (dying) to 1.6 (roaring): height, colour, brightness, embers and light together. */
		this.intensity = options.intensity ?? 1;
		/** How hard it blows. 0 stands straight, 1 is a gale: the top of a campfire leans over by a metre or more. */
		this.wind = options.wind ?? 0;
		/** Where the wind blows, in radians round Y from +X. */
		this.windDirection = options.windDirection ?? 0;
		this.smoke = options.smoke ?? 1;
		this.embers = options.embers ?? 1;
		this.lightStrength = options.light ?? 1;
		this.speed = options.speed ?? 1;
		// A fire's own place in the loop, so a row of torches doesn't move as one.
		this.phase = options.phase ?? (layer.fires.length * 0.381966) % 1;
		this.boost = 0;
		this.boostTarget = 0;
		if (options.position) this.position.fromArray(options.position);

		/** What's burning, flames attach to it: up to 6 pieces, each { from: [x, y, z], to: [x, y, z], radius } in metres from the fire's position. */
		this.fuel = [];
		if (options.fuel) this.setFuel(options.fuel, this.size);
		this.fuelA = Array.from({ length: 6 }, () => new THREE.Vector4());
		this.fuelB = Array.from({ length: 6 }, () => new THREE.Vector4());
		// One volume, or a row of them for a long fire. Each draws on its own, so a row reads right from any side.
		this.parts = [];
		this.fireUniforms = this.part(0).u;
		this.proxy = this.parts[0].proxy;

		const shape = { uShape: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() }, uFoot: { value: new THREE.Vector2() }, uWorld: { value: 1 } };
		const shared = { uScale: layer.emberScale, tDepth: layer.depthUniform, uRes: layer.fullRes, ...shape };
		this.emberShape = shape;
		this.emberUniforms = { ...shared, uPhase: this.fireUniforms.uPhase, uFlicker: this.fireUniforms.uFlicker };
		const emberMaterial = layer.emberMaterial.clone();
		emberMaterial.uniforms = this.emberUniforms;
		this.points = new THREE.Points(emberGeometry(type.embers), emberMaterial);
		this.points.frustumCulled = false;
		layer.emberScene.add(this.points);
		this.bursts = [];
		for (let i = 0; i < BURSTS; i++) {
			const material = layer.burstMaterial.clone();
			material.uniforms = { ...shared, uAge: { value: BURST_SPAN } };
			const p = new THREE.Points(emberGeometry(BURST_EMBERS), material);
			p.frustumCulled = false;
			p.visible = false;
			layer.emberScene.add(p);
			this.bursts.push(p);
		}
		this.nextBurst = 0;

		this.light = null;
		this.fill = null;
		if (options.lights !== false) {
			this.light = new THREE.PointLight(type.lightColor ?? 0xff8f45, 1, 0, 2);
			if (options.shadow !== false) {
				this.light.castShadow = true;
				this.light.shadow.mapSize.set(1024, 1024);
				this.light.shadow.radius = 5;
				this.light.shadow.bias = -0.002;
				this.light.shadow.normalBias = 0.012;
			}
			// the flame is tall, so a second light higher up fills the hard shadow of the first
			this.fill = new THREE.PointLight(type.lightColor ?? 0xff9a50, 1, 0, 2);
			this.add(this.light, this.fill);
		}
		this.tick(0);
	}

	part(i) {
		const layer = this.layer;
		if (!this.parts[i]) {
			const u = {
				tDepth: layer.depthUniform,
				uFireRes: layer.fireRes,
				uProj: layer.projUniform,
				uFirePx: layer.firePx,
				uCamFwd: layer.camFwd,
				uPhase: { value: 0 },
				uFlicker: { value: 1 },
				uFirePos: { value: new THREE.Vector3() },
				uFireSize: { value: 1 },
				uFireA: { value: new THREE.Vector4() },
				uFireB: { value: new THREE.Vector4() },
				uFireBound: { value: new THREE.Vector3() },
				uFireC: { value: new THREE.Vector4() },
				uFireD: { value: new THREE.Vector4() },
				uFireE: { value: new THREE.Vector4() },
				uFireG: { value: 1 },
				uFireH: { value: new THREE.Vector4() },
				uFuelA: { value: this.fuelA },
				uFuelB: { value: this.fuelB },
				uFuelN: { value: 0 },
			};
			const proxy = new THREE.Mesh(proxyGeometry, layer.fireMaterial.clone());
			proxy.material.uniforms = u;
			layer.fireScene.add(proxy);
			this.parts[i] = { proxy, u };
		}
		return this.parts[i];
	}

	/** Says what's burning, in metres from the fire's position at a fire size of `scale`. Flames lick off it. */
	setFuel(pieces = [], scale = this.size) {
		this.fuel = pieces.slice(0, 6).map(({ from, to, radius }) => ({ a: from.map((x) => x / scale), b: to.map((x) => x / scale), r: radius / scale }));
	}

	/** Another type's shape, keeping everything you've set but the size, which comes from the type unless you say. */
	setType(name, size) {
		const type = FIRE_TYPES[name];
		if (!type) throw new Error(`no fire type ${name}`);
		this.type_ = type;
		this.on = type.on;
		this.fuel = [];
		this.size = size ?? type.size;
		if (this.light) {
			this.light.color.set(type.lightColor ?? 0xff8f45);
			this.fill.color.set(type.lightColor ?? 0xff9a50);
		}
	}

	/** Throw something on it: it flares up for a couple of seconds and sends up a burst of embers. */
	stoke(amount = 1) {
		this.boostTarget = Math.min(this.boostTarget + 0.5 * amount, 0.9);
		if (!this.type_.embers) return;
		const burst = this.bursts[this.nextBurst];
		this.nextBurst = (this.nextBurst + 1) % BURSTS;
		burst.material.uniforms.uAge.value = 0;
		burst.visible = true;
	}

	/** Moves the fire on by dt seconds. layer.update(dt) does this for every fire. */
	tick(dt) {
		this.phase = (this.phase + (dt * this.speed) / LOOP) % 1;
		const phase = this.phase;
		const fl = flicker(phase);
		const w = phase * Math.PI * 2;
		// The flare rises fast and dies away slowly.
		this.boost += (this.boostTarget - this.boost) * (1 - Math.exp(-dt * 7));
		this.boostTarget *= Math.exp(-dt * 0.9);
		const burn = Math.min(this.intensity + this.boost, 2.2);
		const t = this.type_;
		const on = this.on;
		const heat = THREE.MathUtils.clamp((burn - 1) * 1.15 + (t.heat ?? 0), -0.85, 1.2);
		const W = t.width * burn ** 0.25;
		const H = t.height * burn ** 0.62 * (1 - 0.2 * Math.min(this.wind, 1));
		// Gusts on integer harmonics, so the loop still closes.
		const gust = 1 + 0.22 * Math.sin(w * 5 + 0.7) + 0.13 * Math.sin(w * 11 + 2.2);
		const wx = Math.cos(this.windDirection) * this.wind * gust;
		const wz = Math.sin(this.windDirection) * this.wind * gust;
		const smokeAmount = this.smoke * t.smoke;
		const top = (smokeAmount > 0 ? 4.2 : 2.6) * H;
		const halfX = (on?.halfWidth ?? t.halfWidth ?? 0);
		const halfZ = (on?.halfDepth ?? t.halfDepth ?? 0);
		const lean = windBend(top) * 0.5;
		this.updateWorldMatrix(true, false);
		const at = this.fireUniforms.uFirePos.value.clone().setFromMatrixPosition(this.matrixWorld);
		this.fuel.forEach(({ a, b, r }, i) => {
			this.fuelA[i].set(a[0] / W, a[1] / H, a[2] / W, r / W);
			this.fuelB[i].set(b[0] / W, b[1] / H, b[2] / W, 0);
		});
		let fuelReach = 0;
		for (const { a, b, r } of this.fuel) fuelReach = Math.max(fuelReach, Math.hypot(a[0], a[2]) + r, Math.hypot(b[0], b[2]) + r);
		const rows = on?.rows;
		// A long fire is a row of short ones, each with its own height and place in the loop.
		const count = t.stretch ? Math.max(1, Math.min(24, Math.round((2 * halfX) / t.stretch))) : 1;
		const partHalf = count > 1 ? (halfX / count) * 0.92 : halfX;
		for (let i = 0; i < count; i++) {
			const { proxy, u } = this.part(i);
			proxy.visible = true;
			const rnd = count > 1 ? (Math.sin(i * 12.9898 + 1.7) * 43758.5453) % 1 : 0;
			const k = count > 1 ? 0.82 + 0.4 * Math.abs(rnd) : 1;
			const here = count > 1 ? ((i + 0.5) / count) * 2 - 1 : 0;
			const partH = H * k * (count > 1 ? 1 - 0.28 * Math.max(Math.abs(here) - 0.7, 0) / 0.3 : 1);
			const partPhase = count > 1 ? (phase + i * 0.381966) % 1 : phase;
			const partSmoke = count > 1 && i % 2 === 0 ? 0 : smokeAmount;
			const partTop = (partSmoke > 0 ? 4.2 : 2.6) * partH;
			const partLean = windBend(partTop) * 0.5;
			u.uPhase.value = partPhase;
			u.uFlicker.value = count > 1 ? flicker(partPhase) : fl;
			u.uFireSize.value = this.size;
			u.uFireA.value.set(W, partH, t.spread, heat);
			u.uFireB.value.set(wx, wz, partSmoke, partTop);
			const R = Math.max(W * Math.max(t.spread, 0.72), 0.6) + Math.hypot(wx, wz) * partLean + Math.max(Math.hypot(partHalf, halfZ), fuelReach - 0.3);
			u.uFireBound.value.set(wx * partLean, wz * partLean, R);
			u.uFireC.value.set(on ? 1 : 0, (on?.radius ?? 0) / W, (on?.tall ?? 0) / partH, on?.flare ?? 0);
			u.uFireD.value.set(partHalf / W, halfZ / W, (t.repeat ?? 0) / W, t.calm ?? 0);
			u.uFireE.value.set(on?.climb ?? 0, t.blue ?? 0, t.blueFoot ?? 0, t.soot ?? 0);
			u.uFireG.value = on?.body ?? 1;
			u.uFireH.value.set(rows ? rows.apart / partH : 0, rows ? rows.x / partH : 0, rows ? rows.z / partH : 0, rows ? rows.out / W : 0);
			u.uFuelN.value = this.fuel.length;
			u.uFirePos.value.copy(at);
			u.uFirePos.value.x += here * halfX * this.size;
			proxy.position.set(u.uFirePos.value.x + wx * partLean * this.size, u.uFirePos.value.y - 0.05 * this.size, u.uFirePos.value.z + wz * partLean * this.size);
			proxy.scale.set(R * this.size, (partTop + 0.1) * this.size, R * this.size);
		}
		for (let i = count; i < this.parts.length; i++) this.parts[i].proxy.visible = false;
		const u = this.fireUniforms;
		// the embers and the light belong to the whole fire
		u.uFlicker.value = fl;

		this.points.position.copy(at);
		this.points.scale.setScalar(this.size);
		this.points.geometry.setDrawRange(0, Math.min(MAX_EMBERS, Math.round(t.embers * this.embers * Math.min(0.25 + 0.75 * burn, 1.6))));
		this.emberShape.uShape.value.set(W, H, t.spread);
		this.emberShape.uWind.value.set(wx, wz);
		this.emberShape.uFoot.value.set(halfX * (t.stretch ? 1 / Math.max(W, 0.01) : 1), halfZ);
		this.emberShape.uWorld.value = Math.max(this.size, 0.3);
		for (const b of this.bursts) {
			if (!b.visible) continue;
			const age = b.material.uniforms.uAge;
			age.value += dt;
			if (age.value >= BURST_SPAN) b.visible = false;
			b.position.copy(at);
			b.scale.setScalar(this.size);
		}

		if (this.light) {
			const s = this.size * this.size * t.light * this.lightStrength * 5.5 * fl * fl * Math.min(burn, 1.8) ** 1.5;
			this.light.intensity = s;
			this.fill.intensity = s;
			this.light.position.set(0.06 * Math.sin(w * 11 + 1) * this.size, (0.98 * H + 0.4 * (fl - 1)) * this.size, 0.06 * Math.cos(w * 7 + 2.4) * this.size);
			this.fill.position.set(0, 1.4 * H * this.size, 0);
			if (this.light.castShadow) {
				this.light.shadow.camera.near = 0.08 * this.size;
				this.light.shadow.camera.far = 24 * Math.max(this.size, 1);
			}
		}
	}

	/** True where a ray (world space) goes through the fire's volume, for clicking it. */
	hitBy(raycaster) {
		const hits = [];
		for (const { proxy } of this.parts) if (proxy.visible) proxy.raycast(raycaster, hits);
		return hits.length > 0;
	}

	dispose() {
		this.layer.remove(this);
	}
}

export class FireLayer {
	/**
	 * @param renderer a THREE.WebGLRenderer
	 * @param options.resolution the fire's pixels against the screen's: 0.5 is the setting to use in a game
	 * @param options.samples MSAA for your scene when the layer draws it
	 * @param options.bloom, options.exposure the finish when the layer draws to the canvas
	 */
	constructor(renderer, { resolution = 0.5, samples = 4, bloom = 0.3, exposure = 0.72 } = {}) {
		this.renderer = renderer;
		this.resolution = resolution;
		this.bloom = bloom;
		this.exposure = exposure;
		this.fires = [];
		this.width = 0;
		this.height = 0;
		this.fittedRes = 0;
		this.fireScene = new THREE.Scene();
		this.emberScene = new THREE.Scene();
		this.size_ = new THREE.Vector2();

		this.depthUniform = { value: null };
		this.fireRes = { value: new THREE.Vector2() };
		this.fullRes = { value: new THREE.Vector2() };
		this.projUniform = { value: new THREE.Matrix4() };
		this.camFwd = { value: new THREE.Vector3() };
		this.firePx = { value: 0.002 };
		this.emberScale = { value: 1 };

		const hdr = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
		const depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
		depth.minFilter = depth.magFilter = THREE.NearestFilter;
		this.rtScene = new THREE.WebGLRenderTarget(1, 1, { ...hdr, samples, depthBuffer: true, depthTexture: depth });
		this.rtComposite = new THREE.WebGLRenderTarget(1, 1, { ...hdr, depthBuffer: false });
		this.rtFire = new THREE.WebGLRenderTarget(1, 1, { ...hdr, depthBuffer: false });
		this.rtDown = [];
		this.rtUp = [];
		for (let i = 0; i < 5; i++) {
			this.rtDown.push(new THREE.WebGLRenderTarget(1, 1, { ...hdr, depthBuffer: false }));
			this.rtUp.push(new THREE.WebGLRenderTarget(1, 1, { ...hdr, depthBuffer: false }));
		}

		const fsGeometry = new THREE.BufferGeometry();
		fsGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
		this.fsMesh = new THREE.Mesh(fsGeometry);
		this.fsMesh.frustumCulled = false;
		this.fsScene = new THREE.Scene();
		this.fsScene.add(this.fsMesh);
		this.fsCamera = new THREE.Camera();
		const fs = (fragmentShader, uniforms, extra = {}) =>
			new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: fullscreenVertex, fragmentShader: `layout(location=0) out vec4 outC; in vec2 vUv;\n${fragmentShader}`, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending, ...extra });

		this.fireMaterial = new THREE.ShaderMaterial({
			glslVersion: THREE.GLSL3,
			vertexShader: /* glsl */ `out vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
			fragmentShader: /* glsl */ `
				layout(location=0) out vec4 outC;
				in vec3 vW;
				uniform sampler2D tDepth;
				uniform vec2 uFireRes;
				uniform float uPhase, uFlicker, uFireSize;
				uniform vec3 uFirePos, uCamFwd;
				uniform mat4 uProj;
				${fireGLSL}
				void main() {
					vec2 uv = gl_FragCoord.xy / uFireRes;
					float z = texture(tDepth, uv).r * 2.0 - 1.0;
					vec3 rd = normalize(vW - cameraPosition);
					float tMax = z >= 0.99999 ? 1e6 : (uProj[3][2] / (z + uProj[2][2])) / dot(rd, uCamFwd);
					// eight offsets per pixel over time, whole cycles per loop, so phase 1 is still phase 0
					float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + mod(floor(uPhase * 960.0), 8.0) * 0.61803399);
					outC = marchFire((cameraPosition - uFirePos) / uFireSize, rd, tMax / uFireSize, uPhase, uFlicker, jitter);
				}`,
			side: THREE.BackSide,
			depthTest: false,
			depthWrite: false,
			transparent: true,
			// several fires may overlap: premultiplied over, far to near (three sorts transparent objects that way)
			blending: THREE.CustomBlending,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneMinusSrcAlphaFactor,
			blendSrcAlpha: THREE.OneFactor,
			blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
		});
		const emberBase = { glslVersion: THREE.GLSL3, fragmentShader: emberFragment, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false };
		this.emberMaterial = new THREE.ShaderMaterial({ ...emberBase, vertexShader: emberVertex });
		this.burstMaterial = new THREE.ShaderMaterial({ ...emberBase, vertexShader: burstVertex });

		// scene * (1 - a) + rgb. At lower fire resolution, a joint-bilateral upsample keeps edges on the logs.
		this.compositeMaterial = fs(
			/* glsl */ `
			uniform sampler2D tScene, tFire, tDepth;
			uniform vec2 uFireRes;
			uniform float uBilateral;
			uniform mat4 uProj;
			float lin(float d) { return uProj[3][2] / (d * 2.0 - 1.0 + uProj[2][2]); }
			void main() {
				vec4 f;
				if (uBilateral < 0.5) {
					// a one pixel tent cancels the step jitter, which is spread over 3x3 pixels
					vec2 px = 0.7 / uFireRes;
					f = 0.25 * (texture(tFire, vUv + px * vec2(-1, -1)) + texture(tFire, vUv + px * vec2(1, -1)) + texture(tFire, vUv + px * vec2(-1, 1)) + texture(tFire, vUv + px * vec2(1, 1)));
				} else {
					// nine low-res pixels, a soft kernel that also evens out the step jitter
					vec2 st = vUv * uFireRes - 0.5;
					vec2 i = floor(st + 0.5);
					float d0 = lin(texture(tDepth, vUv).r);
					vec4 sum = vec4(0.0); float W = 0.0;
					for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
						vec2 o = i + vec2(x, y);
						vec2 c = (o + 0.5) / uFireRes;
						vec2 e = o - st;
						float bw = exp(-dot(e, e) * 1.6);
						float dw = exp(-abs(lin(texture(tDepth, c).r) - d0) * 14.0);
						float k = bw * dw + 1e-4;
						sum += texture(tFire, c) * k; W += k;
					}
					f = sum / W;
				}
				outC = vec4(texture(tScene, vUv).rgb * (1.0 - f.a) + f.rgb, 1.0);
			}`,
			{ tScene: { value: null }, tFire: { value: this.rtFire.texture }, tDepth: this.depthUniform, uFireRes: this.fireRes, uBilateral: { value: 0 }, uProj: this.projUniform },
		);
		this.bloomFirst = fs(
			/* glsl */ `
			uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold;
			vec3 pick(vec3 c) { float m = max(c.r, max(c.g, c.b)); float k = smoothstep(uThreshold * 0.7, uThreshold * 1.6, m); return min(c, vec3(12.0)) * k; }
			void main() {
				vec3 c = pick(texture(tSrc, vUv + uTexel * vec2(-1, -1)).rgb) + pick(texture(tSrc, vUv + uTexel * vec2(1, -1)).rgb)
					+ pick(texture(tSrc, vUv + uTexel * vec2(-1, 1)).rgb) + pick(texture(tSrc, vUv + uTexel * vec2(1, 1)).rgb);
				outC = vec4(c * 0.25, 1.0);
			}`,
			{ tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 2.4 } },
		);
		this.bloomDown = fs(
			/* glsl */ `
			uniform sampler2D tSrc; uniform vec2 uTexel;
			void main() {
				vec3 c = texture(tSrc, vUv).rgb * 4.0;
				c += texture(tSrc, vUv + uTexel * vec2(-1, -1)).rgb + texture(tSrc, vUv + uTexel * vec2(1, -1)).rgb
					+ texture(tSrc, vUv + uTexel * vec2(-1, 1)).rgb + texture(tSrc, vUv + uTexel * vec2(1, 1)).rgb;
				outC = vec4(c / 8.0, 1.0);
			}`,
			{ tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
		);
		this.bloomUp = fs(
			/* glsl */ `
			uniform sampler2D tSrc, tPrev; uniform vec2 uTexel; uniform float uMix;
			void main() {
				vec3 c = texture(tPrev, vUv + uTexel * vec2(-1, 0)).rgb + texture(tPrev, vUv + uTexel * vec2(1, 0)).rgb
					+ texture(tPrev, vUv + uTexel * vec2(0, -1)).rgb + texture(tPrev, vUv + uTexel * vec2(0, 1)).rgb;
				c += (texture(tPrev, vUv + uTexel * vec2(-1, -1)).rgb + texture(tPrev, vUv + uTexel * vec2(1, -1)).rgb
					+ texture(tPrev, vUv + uTexel * vec2(-1, 1)).rgb + texture(tPrev, vUv + uTexel * vec2(1, 1)).rgb) * 0.5;
				outC = vec4(c / 6.0 * uMix + texture(tSrc, vUv).rgb, 1.0);
			}`,
			{ tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 0.85 } },
		);
		this.finalMaterial = fs(
			/* glsl */ `
			uniform sampler2D tHdr, tBloom; uniform float uBloom, uExposure;
			vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
			vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
			void main() {
				vec3 c = texture(tHdr, vUv).rgb + texture(tBloom, vUv).rgb * uBloom;
				c = toSrgb(aces(c * uExposure));
				float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
				outC = vec4(c + (n - 0.5) / 255.0, 1.0);
			}`,
			{ tHdr: { value: this.rtComposite.texture }, tBloom: { value: this.rtUp[0].texture }, uBloom: { value: bloom }, uExposure: { value: exposure } },
		);
	}

	/** A new fire. Add it to your scene for its lights; position it, and leave its rotation and scale alone. */
	add(options) {
		const fire = new Fire(this, options);
		this.fires.push(fire);
		return fire;
	}

	remove(fire) {
		const i = this.fires.indexOf(fire);
		if (i < 0) return;
		this.fires.splice(i, 1);
		fire.removeFromParent();
		for (const { proxy } of fire.parts) {
			this.fireScene.remove(proxy);
			proxy.material.dispose();
		}
		this.emberScene.remove(fire.points);
		fire.points.geometry.dispose();
		fire.points.material.dispose();
		for (const b of fire.bursts) {
			this.emberScene.remove(b);
			b.geometry.dispose();
			b.material.dispose();
		}
	}

	update(dt) {
		for (const fire of this.fires) fire.tick(dt);
	}

	_fit(w, h, camera) {
		this.projUniform.value.copy(camera.projectionMatrix);
		this.emberScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
		if (w === this.width && h === this.height && this.fittedRes === this.resolution) return;
		this.width = w;
		this.height = h;
		this.fittedRes = this.resolution;
		const depth = this.rtScene.depthTexture;
		depth.image.width = w;
		depth.image.height = h;
		this.rtScene.setSize(w, h);
		this.rtComposite.setSize(w, h);
		const fw = Math.max(1, Math.round(w * this.resolution));
		const fh = Math.max(1, Math.round(h * this.resolution));
		this.rtFire.setSize(fw, fh);
		this.fireRes.value.set(fw, fh);
		this.fullRes.value.set(w, h);
		this.compositeMaterial.uniforms.uBilateral.value = this.resolution < 1 ? 1 : 0;
		let bw = w;
		let bh = h;
		for (let i = 0; i < this.rtDown.length; i++) {
			bw = Math.max(1, bw >> 1);
			bh = Math.max(1, bh >> 1);
			this.rtDown[i].setSize(bw, bh);
			this.rtUp[i].setSize(bw, bh);
		}
	}

	_pass(material, target) {
		this.fsMesh.material = material;
		this.renderer.setRenderTarget(target);
		this.renderer.render(this.fsScene, this.fsCamera);
	}

	/** The fire pass alone, into layer.rtFire: premultiplied, at layer.resolution. */
	march(camera, depthTexture) {
		const r = this.renderer;
		this.depthUniform.value = depthTexture;
		camera.updateMatrixWorld();
		camera.getWorldDirection(this.camFwd.value);
		this.firePx.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / this.fireRes.value.y;
		const clear = r.getClearColor(new THREE.Color());
		const alpha = r.getClearAlpha();
		r.setRenderTarget(this.rtFire);
		r.setClearColor(0x000000, 0);
		r.clear();
		r.render(this.fireScene, camera);
		r.setClearColor(clear, alpha);
	}

	/**
	 * For a game with its own passes: draws the fire and embers over your resolved scene into `target`, in linear light.
	 * `target` must not hold `depthTexture` or `colorTexture`.
	 */
	drawOver(colorTexture, depthTexture, camera, target) {
		const r = this.renderer;
		this._fit(colorTexture.image.width, colorTexture.image.height, camera);
		this.march(camera, depthTexture);
		this.compositeMaterial.uniforms.tScene.value = colorTexture;
		this._pass(this.compositeMaterial, target);
		const auto = r.autoClear;
		r.autoClear = false;
		r.setRenderTarget(target);
		r.render(this.emberScene, camera);
		r.autoClear = auto;
	}

	/** Draws your scene and the fire to the canvas, with bloom and a filmic tone map. Use it in place of renderer.render. */
	render(scene, camera) {
		const r = this.renderer;
		r.getDrawingBufferSize(this.size_);
		this._fit(this.size_.x, this.size_.y, camera);
		r.setRenderTarget(this.rtScene);
		r.render(scene, camera);
		this.drawOver(this.rtScene.texture, this.rtScene.depthTexture, camera, this.rtComposite);

		let src = this.rtComposite;
		for (let i = 0; i < this.rtDown.length; i++) {
			const m = i === 0 ? this.bloomFirst : this.bloomDown;
			m.uniforms.tSrc.value = src.texture;
			m.uniforms.uTexel.value.set(0.5 / this.rtDown[i].width, 0.5 / this.rtDown[i].height);
			this._pass(m, this.rtDown[i]);
			src = this.rtDown[i];
		}
		let prev = this.rtDown[this.rtDown.length - 1];
		for (let i = this.rtDown.length - 2; i >= 0; i--) {
			this.bloomUp.uniforms.tSrc.value = this.rtDown[i].texture;
			this.bloomUp.uniforms.tPrev.value = prev.texture;
			this.bloomUp.uniforms.uTexel.value.set(0.5 / prev.width, 0.5 / prev.height);
			this._pass(this.bloomUp, this.rtUp[i]);
			prev = this.rtUp[i];
		}
		this.finalMaterial.uniforms.uBloom.value = this.bloom;
		this.finalMaterial.uniforms.uExposure.value = this.exposure;
		this._pass(this.finalMaterial, null);
	}

	/** Starts every shader of the layer compiling without blocking. Await it before the first frame the player sees. */
	async compileAsync(camera) {
		const r = this.renderer;
		const mats = [this.compositeMaterial, this.bloomFirst, this.bloomDown, this.bloomUp, this.finalMaterial];
		const jobs = [];
		const target = r.getRenderTarget();
		r.setRenderTarget(this.rtFire);
		jobs.push(r.compileAsync(this.fireScene, camera), r.compileAsync(this.emberScene, camera));
		for (const m of mats) {
			this.fsMesh.material = m;
			jobs.push(r.compileAsync(this.fsScene, this.fsCamera));
		}
		r.setRenderTarget(target);
		await Promise.all(jobs);
	}
}
