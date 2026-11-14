// The demo's dressing, all code: logs, stones, coals, a torch on a wall, a pyre, the ground and the night sky. Not part
// of the effect: a game brings its own. `uni` is updated by the demo when the fire changes.
import * as THREE from 'three';

function rng(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// A real flame is a big soft light, so nothing should get the hot spot of a point right next to it.
THREE.ShaderChunk.lights_pars_begin = `uniform float uLightFloor;\n${THREE.ShaderChunk.lights_pars_begin.replace('max( pow2( lightDistance ), 0.01 )', 'max( pow2( lightDistance ), uLightFloor )')}`;

export const uni = {
	uFlicker: { value: 1 },
	uCenter: { value: new THREE.Vector3() }, // the fire's base
	uK: { value: 1 }, // how big the fire is, in metres per campfire metre
	uAsh: { value: 1 }, // the ash bed on the ground
	uFoot: { value: new THREE.Vector2() }, // how long and wide the fire stands, per uK
	uLightFloor: { value: 0.55 }, // how close a light counts as, in metres squared: a flame is a soft light, not a point
};

const NOISE = /* glsl */ `
float hash31(vec3 p) { p = fract(floor(p) * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = p - i; f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x), mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x), mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float vfbm(vec3 p) { return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.13 + 3.1) + 0.15 * vnoise(p * 4.7 + 7.7); }
`;

// Adds code to a standard material: `albedo` and `glow` are computed per pixel from object and world position.
function shaded(opts, code, Material = THREE.MeshStandardMaterial) {
	const m = new Material(opts);
	m.customProgramCacheKey = () => code;
	m.onBeforeCompile = (s) => {
		Object.assign(s.uniforms, uni);
		s.vertexShader = s.vertexShader
			.replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nvarying vec3 vW;')
			.replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;\n#ifdef USE_INSTANCING\nvW = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;\n#else\nvW = (modelMatrix * vec4(position, 1.0)).xyz;\n#endif');
		s.fragmentShader = s.fragmentShader
			.replace('#include <common>', `#include <common>\nvarying vec3 vObj;\nvarying vec3 vW;\nuniform float uFlicker, uK, uAsh;\nuniform vec3 uCenter;\nuniform vec2 uFoot;\n${NOISE}`)
			.replace('#include <color_fragment>', `#include <color_fragment>\nvec3 glow = vec3(0.0);\nfloat bump = 0.0;\nvec3 wf = (vW - uCenter) / uK;\n${code}`)
			.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 bSx = dFdx(-vViewPosition), bSy = dFdy(-vViewPosition);
        vec3 bR1 = cross(bSy, normal), bR2 = cross(normal, bSx);
        float bDet = dot(bSx, bR1);
        normal = normalize(abs(bDet) * normal - sign(bDet) * (dFdx(bump) * bR1 + dFdy(bump) * bR2));`)
			.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += glow;');
	};
	return m;
}

// charred logs: black crust in plates, hot cracks low down and near the fire's middle
// (Lambert: char has no shine, and a standard material's highlight shows on albedo this dark)
const logMat = shaded(
	{ color: 0xffffff },
	/* glsl */ `
  vec3 bark = vObj * vec3(30.0, 4.0, 30.0);
  float plate = vfbm(bark);
  float fine = vnoise(vObj * vec3(70.0, 14.0, 70.0));
  float ageing = smoothstep(0.3, 0.8, plate);
  bump = 0.004 * smoothstep(0.38, 0.6, plate);
  diffuseColor.rgb = mix(vec3(0.008, 0.007, 0.006), vec3(0.07, 0.05, 0.036), ageing) * (0.6 + 0.8 * fine);
  float ash = smoothstep(0.62, 0.78, vnoise(vObj * vec3(48.0, 9.0, 48.0)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.27, 0.26), 0.55 * ash * smoothstep(0.1, 0.3, wf.y) * (1.0 - smoothstep(0.32, 0.5, wf.y)));
  diffuseColor.rgb *= 1.0 - 0.85 * smoothstep(0.5, 0.72, wf.y);
  float crack = (1.0 - smoothstep(0.0, 0.03, abs(plate - 0.5))) * smoothstep(0.42, 0.62, vnoise(vObj * vec3(70.0, 12.0, 70.0)));
  float heat = (1.0 - smoothstep(0.04, 0.42, wf.y));
  // the flames wrap the logs, so even their outer faces catch some light
  float wrap = (1.0 - smoothstep(0.1, 1.1, wf.y)) * uFlicker;
  glow = vec3(3.0, 0.7, 0.06) * crack * heat * (0.55 + 0.45 * uFlicker) + diffuseColor.rgb * vec3(1.7, 0.6, 0.16) * wrap;
`,
	THREE.MeshLambertMaterial,
);

// the torch's head: black char and pale ash, lit from all round by its own flames, with embers glowing in the cracks
const headMat = shaded(
	{ color: 0xffffff },
	/* glsl */ `
  float grainH = vfbm(vObj * vec3(150.0, 70.0, 150.0));
  float ashH = smoothstep(0.66, 0.8, vnoise(vObj * vec3(120.0, 80.0, 120.0) + 4.7));
  diffuseColor.rgb = mix(vec3(0.007, 0.006, 0.005), vec3(0.04, 0.03, 0.023), smoothstep(0.34, 0.72, grainH));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.15, 0.14), 0.4 * ashH);
  float upH = smoothstep(0.05, 0.62, wf.y);
  // cracks of ember, redder and fewer low down, that breathe with the fire
  float seam = 1.0 - smoothstep(0.0, 0.016, abs(vfbm(vObj * vec3(62.0, 34.0, 62.0) + 2.1) - 0.5));
  float patchH = smoothstep(0.5, 0.72, vnoise(vObj * vec3(30.0, 18.0, 30.0) + 9.3));
  float ember = seam * patchH * mix(0.3, 1.0, upH) * (0.55 + 0.45 * uFlicker);
  glow = mix(vec3(0.7, 0.04, 0.003), vec3(3.2, 0.8, 0.05), ember * ember) * ember;
  // the flames surround it, so every side catches their light, more towards the top
  glow += diffuseColor.rgb * vec3(3.4, 1.15, 0.26) * mix(0.3, 1.0, upH) * uFlicker;
`,
	THREE.MeshLambertMaterial,
);

function makeLog(rand, length, radius, material = logMat) {
	const g = new THREE.CylinderGeometry(radius * 0.86, radius, length, 14, 10);
	const pos = g.attributes.position;
	const bumps = [rand() * 9, rand() * 9, rand() * 9];
	for (let i = 0; i < pos.count; i++) {
		const a = Math.atan2(pos.getZ(i), pos.getX(i));
		const y = pos.getY(i) / length;
		const k = 1 + 0.11 * Math.sin(a * 3 + bumps[0] + y * 3) + 0.06 * Math.sin(a * 7 + bumps[1] - y * 6) + 0.05 * Math.sin(y * 13 + bumps[2]);
		pos.setX(i, pos.getX(i) * k);
		pos.setZ(i, pos.getZ(i) * k);
	}
	g.computeVertexNormals();
	const m = new THREE.Mesh(g, material);
	m.castShadow = true;
	return m;
}

function placeBetween(m, a, b) {
	m.position.copy(a).add(b).multiplyScalar(0.5);
	m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
}

const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5d5752, roughness: 0.9, flatShading: true });
stoneMat.onBeforeCompile = (s) => {
	s.uniforms.uLightFloor = uni.uLightFloor;
};

function makeStone(seed, size) {
	const r = rng(seed);
	const g = new THREE.IcosahedronGeometry(1, 1);
	const pos = g.attributes.position;
	// the same corner must move the same way in every face it belongs to
	const moved = new Map();
	for (let v = 0; v < pos.count; v++) {
		const key = `${pos.getX(v).toFixed(3)},${pos.getY(v).toFixed(3)},${pos.getZ(v).toFixed(3)}`;
		if (!moved.has(key)) moved.set(key, 0.74 + r() * 0.42);
		const k = moved.get(key);
		pos.setXYZ(v, pos.getX(v) * k, pos.getY(v) * k, pos.getZ(v) * k);
	}
	g.computeVertexNormals();
	const m = new THREE.Mesh(g, stoneMat);
	m.scale.set(size * (1 + r() * 0.35), size * (0.72 + r() * 0.3), size * (1 + r() * 0.2));
	m.rotation.set(r() * 3, r() * 6, r() * 3);
	m.castShadow = true;
	m.receiveShadow = true;
	return m;
}

const coalMat = shaded(
	{ color: 0x0a0807, roughness: 0.9, flatShading: true },
	/* glsl */ `
  float cn = vfbm(wf * 17.0);
  float hot = smoothstep(0.34, 0.66, cn) * (1.0 - smoothstep(0.1, 0.5, length(wf.xz)));
  glow = mix(vec3(0.9, 0.11, 0.01), vec3(4.6, 1.5, 0.14), hot) * hot * (0.6 + 0.4 * uFlicker);
`,
);
function makeCoals(count, radius, scale, seed) {
	const coals = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), coalMat, count);
	const m4 = new THREE.Matrix4();
	const r = rng(seed);
	for (let i = 0; i < count; i++) {
		const a = r() * Math.PI * 2;
		const d = Math.sqrt(r()) * radius;
		const s = (0.018 + r() * r() * 0.05) * scale;
		const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6));
		m4.compose(new THREE.Vector3(Math.cos(a) * d, s * 0.5, Math.sin(a) * d), q, new THREE.Vector3(s, s * 0.7, s));
		coals.setMatrixAt(i, m4);
	}
	coals.receiveShadow = true;
	return coals;
}

function tepee(group, rand, { apex, n, foot, footJitter, radius, turn, over = 1.05 }) {
	for (let i = 0; i < n; i++) {
		const ang = (i / n) * Math.PI * 2 + turn + (rand() - 0.5) * 0.35;
		const R = foot + rand() * footJitter;
		const base = new THREE.Vector3(Math.cos(ang) * R, 0.035, Math.sin(ang) * R);
		const top = new THREE.Vector3((rand() - 0.5) * 0.19 * apex, apex + (rand() * 0.19 - 0.135) * apex, (rand() - 0.5) * 0.19 * apex);
		const dir = top.clone().sub(base);
		const end = base.clone().add(dir.multiplyScalar(over + rand() * 0.14));
		const log = makeLog(rand, base.distanceTo(end), radius * (1 + rand() * 0.44));
		placeBetween(log, base, end);
		group.add(log);
	}
}

export function makeCampfire() {
	const set = new THREE.Group();
	const rand = rng(11);
	tepee(set, rand, { apex: 0.74, n: 6, foot: 0.42, footJitter: 0.1, radius: 0.05, turn: 0.35 });
	for (const [ax, az, bx, bz, r] of [
		[-0.46, 0.14, 0.3, 0.3, 0.06],
		[0.42, -0.32, -0.24, -0.34, 0.052],
	]) {
		const a = new THREE.Vector3(ax, r * 0.8, az);
		const b = new THREE.Vector3(bx, r * 0.9, bz);
		const log = makeLog(rand, a.distanceTo(b), r);
		placeBetween(log, a, b);
		set.add(log);
	}
	const stones = 11;
	for (let i = 0; i < stones; i++) {
		const r = rng(1000 + i);
		const ang = (i / stones) * Math.PI * 2 + (r() - 0.5) * 0.22;
		const R = 0.94 + r() * 0.1;
		const size = 0.13 + r() * 0.11;
		const m = makeStone(100 + i, size);
		m.position.set(Math.cos(ang) * R, size * 0.34, Math.sin(ang) * R);
		set.add(m);
	}
	set.add(makeCoals(90, 0.46, 1, 7));
	return { set, flameAt: new THREE.Vector3(), ash: 1 };
}

function wallMat(color = 0xffffff) {
	return shaded(
		{ color, roughness: 0.93 },
		/* glsl */ `
    float wb = vfbm(vW * 7.0), ws = vnoise(vW * 23.0);
    diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.3, 0.7, wb)) * (0.82 + 0.36 * ws);
  `,
	);
}

function lightFloor0(m) {
	m.onBeforeCompile = (s) => {
		s.uniforms.uLightFloor = uni.uLightFloor;
	};
	return m;
}

// A rough stone wall, and a torch in an iron bracket. The torch's head is `head`, its origin where the flame sits.
export function makeTorch() {
	const set = new THREE.Group();
	const stoneWall = wallMat();
	const r = rng(41);
	const rows = 14;
	const cols = 18;
	const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stoneWall, rows * cols);
	const m4 = new THREE.Matrix4();
	const bw = 0.56;
	const bh = 0.3;
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.035, (r() - 0.5) * 0.05, (r() - 0.5) * 0.025));
			const p = new THREE.Vector3((x - cols / 2 + (y % 2) * 0.5) * bw + (r() - 0.5) * 0.015, (y + 0.5) * bh, -0.56 + (r() - 0.5) * 0.035);
			m4.compose(p, q, new THREE.Vector3(bw * (0.955 + r() * 0.025), bh * (0.93 + r() * 0.04), 0.3 + r() * 0.04));
			blocks.setMatrixAt(y * cols + x, m4);
			const tone = 0.1 + r() * 0.1;
			blocks.setColorAt(y * cols + x, new THREE.Color(tone * 1.06, tone * 0.97, tone * 0.88));
		}
	}
	blocks.receiveShadow = true;
	blocks.castShadow = true;
	set.add(blocks);
	const backing = new THREE.Mesh(new THREE.BoxGeometry(cols * bw, rows * bh, 0.2), lightFloor0(new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 1 })));
	backing.position.set(0, (rows * bh) / 2, -0.62);
	set.add(backing);

	const lightFloor = (m) => {
		m.onBeforeCompile = (s) => {
			s.uniforms.uLightFloor = uni.uLightFloor;
		};
		return m;
	};
	const iron = lightFloor(new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.55, metalness: 0.75, flatShading: true }));
	const wood = lightFloor(new THREE.MeshStandardMaterial({ color: 0x2c1c10, roughness: 0.82 }));
	const rand = rng(5);
	const headAt = new THREE.Vector3(0, 1.72, -0.2);
	const footAt = new THREE.Vector3(0, 0.94, -0.31);
	const pole = makeLog(rand, headAt.distanceTo(footAt), 0.024, wood);
	placeBetween(pole, footAt, headAt);
	set.add(pole);
	const ringAt = footAt.clone().lerp(headAt, 0.3);
	const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.009, 6, 12), iron);
	ring.position.copy(ringAt);
	ring.quaternion.copy(pole.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
	ring.castShadow = true;
	set.add(ring);
	const arm = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.016, Math.abs(ringAt.z + 0.4) + 0.04), iron);
	arm.position.set(0, ringAt.y - 0.01, (ringAt.z - 0.4) / 2);
	arm.castShadow = true;
	set.add(arm);
	const plate = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.2, 0.014), iron);
	plate.position.set(0, ringAt.y, -0.405);
	set.add(plate);

	// Rag and rope soaked in pitch, burning: a lumpy charred bundle with its origin at its foot, where the flame stands.
	const head = new THREE.Group();
	head.position.copy(headAt);
	head.rotation.x = Math.atan2(headAt.z - footAt.z, headAt.y - footAt.y);
	const body = new THREE.Group();
	body.scale.setScalar(0.8);
	head.add(body);
	const profile = [
		[0.02, -0.03],
		[0.05, -0.012],
		[0.056, 0.03],
		[0.06, 0.1],
		[0.058, 0.17],
		[0.048, 0.225],
		[0.028, 0.255],
		[0.001, 0.265],
	];
	const bundleGeo = new THREE.LatheGeometry(new THREE.CatmullRomCurve3(profile.map(([x, y]) => new THREE.Vector3(x, y, 0))).getPoints(22).map((p) => new THREE.Vector2(Math.max(p.x, 0.001), p.y)), 22);
	const bp = bundleGeo.attributes.position;
	for (let i = 0; i < bp.count; i++) {
		const a = Math.atan2(bp.getZ(i), bp.getX(i));
		const y = bp.getY(i);
		const k = 1 + 0.09 * Math.sin(a * 3 + y * 31) + 0.06 * Math.sin(a * 5 - y * 47 + 1.3) + 0.05 * Math.sin(y * 90 + a * 2);
		bp.setX(i, bp.getX(i) * k);
		bp.setZ(i, bp.getZ(i) * k);
	}
	bundleGeo.computeVertexNormals();
	const bundle = new THREE.Mesh(bundleGeo, headMat);
	bundle.castShadow = true;
	body.add(bundle);
	// a rope wound round it, slack in places
	const helix = [];
	for (let i = 0; i <= 54; i++) {
		const f = i / 54;
		const a = f * Math.PI * 2 * 4.2;
		const R = 0.059 + 0.004 * Math.sin(a * 2.3) - 0.012 * Math.max(0, f - 0.8) * 5;
		helix.push(new THREE.Vector3(Math.cos(a) * R, 0.012 + f * 0.195 + 0.004 * Math.sin(a * 1.7), Math.sin(a) * R));
	}
	const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 180, 0.0085, 6), headMat);
	rope.castShadow = true;
	body.add(rope);
	// burnt ends of rag standing out of the top and sides, for the flame to lick
	for (let i = 0; i < 6; i++) {
		const a = rand() * Math.PI * 2;
		const y = 0.2 + rand() * 0.055;
		const R = 0.03 * (0.7 + rand() * 0.4);
		const len = 0.022 + rand() * 0.028;
		const end = new THREE.Mesh(new THREE.ConeGeometry(0.006 + rand() * 0.004, len, 5), headMat);
		end.position.set(Math.cos(a) * R, y, Math.sin(a) * R);
		end.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
		body.add(end);
	}
	set.add(head);
	return { set, head, pole, flameAt: headAt.clone(), ash: 0, fixed: true, floor: 0.16 };
}

// ---------- the other fires ----------

const lit = (m) => {
	m.onBeforeCompile = (s) => {
		s.uniforms.uLightFloor = uni.uLightFloor;
	};
	return m;
};

// Wood the fire is eating: black char in long grain, thin cracks glowing across it. `grain` stretches it along the wood.
const charOf = (grain) =>
	shaded(
		{ color: 0xffffff },
		/* glsl */ `
    vec3 gr = vObj * ${grain};
    float grainC = vfbm(gr);
    float fineC = vnoise(gr * 3.1);
    diffuseColor.rgb = mix(vec3(0.0035, 0.003, 0.0025), vec3(0.028, 0.019, 0.013), smoothstep(0.3, 0.72, grainC)) * (0.65 + 0.7 * fineC);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.066, 0.062), 0.5 * smoothstep(0.7, 0.84, vnoise(gr * 1.7 + 3.1)));
    float seamC = abs(vfbm(gr * 0.8 + 5.3) - 0.5);
    float crackC = (1.0 - smoothstep(0.0, 0.012, seamC)) * smoothstep(0.44, 0.64, vnoise(vW * 7.0));
    glow = mix(vec3(0.7, 0.05, 0.004), vec3(2.8, 0.7, 0.05), crackC) * crackC * (0.55 + 0.45 * uFlicker);
    glow += diffuseColor.rgb * vec3(1.5, 0.52, 0.12) * uFlicker;
    `,
		THREE.MeshLambertMaterial,
	);
const char = charOf('vec3(44.0, 7.0, 44.0)');
const charBoard = charOf('vec3(9.0, 62.0, 40.0)');

// Blackened iron, hot and dull red where the fire is close, and catching its light from all round.
const hotIron = shaded(
	{ color: 0xffffff, roughness: 0.62, metalness: 0.3, flatShading: true },
	/* glsl */ `
  float ironN = vfbm(vW * 24.0);
  diffuseColor.rgb = mix(vec3(0.014, 0.012, 0.011), vec3(0.06, 0.035, 0.022), smoothstep(0.35, 0.75, ironN));
  float close = 1.0 - smoothstep(0.1, 0.62, length(wf));
  glow = vec3(0.95, 0.12, 0.012) * close * close * smoothstep(0.32, 0.6, ironN) * (0.6 + 0.4 * uFlicker);
  glow += diffuseColor.rgb * vec3(2.6, 0.9, 0.22) * (1.0 - smoothstep(0.2, 1.3, length(wf))) * uFlicker;
`,
);

export function makeBrazier() {
	const set = new THREE.Group();
	const rim = 0.98;
	const flameAt = new THREE.Vector3(0, rim - 0.17, 0);
	const profile = [
		[0.001, 0.72],
		[0.12, 0.725],
		[0.23, 0.79],
		[0.3, 0.9],
		[0.33, rim],
		[0.345, rim + 0.012],
		[0.325, rim + 0.016],
		[0.29, 0.92],
		[0.21, 0.82],
		[0.1, 0.765],
		[0.001, 0.76],
	].map(([x, y]) => new THREE.Vector2(x, y));
	const bowl = new THREE.Mesh(new THREE.LatheGeometry(profile, 26), hotIron);
	bowl.castShadow = true;
	bowl.receiveShadow = true;
	set.add(bowl);
	// a band of rivets round the outside, so it reads as made
	const rivets = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.012, 0), hotIron, 18);
	const m4 = new THREE.Matrix4();
	for (let i = 0; i < 18; i++) {
		const a = (i / 18) * Math.PI * 2;
		m4.makeTranslation(Math.cos(a) * 0.325, 0.93, Math.sin(a) * 0.325);
		rivets.setMatrixAt(i, m4);
	}
	set.add(rivets);
	for (let i = 0; i < 3; i++) {
		const a = (i / 3) * Math.PI * 2 + 0.4;
		const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 1, 7), hotIron);
		placeBetween(leg, new THREE.Vector3(Math.cos(a) * 0.46, 0, Math.sin(a) * 0.46), new THREE.Vector3(Math.cos(a) * 0.18, 0.8, Math.sin(a) * 0.18));
		leg.scale.y = 0.85;
		leg.castShadow = true;
		set.add(leg);
		const foot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), hotIron);
		foot.position.set(Math.cos(a) * 0.46, 0.022, Math.sin(a) * 0.46);
		foot.scale.y = 0.6;
		set.add(foot);
	}
	const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 6, 28).rotateX(Math.PI / 2), hotIron);
	ring.position.y = 0.34;
	set.add(ring);
	const coals = makeCoals(70, 0.24, 1.7, 15);
	coals.position.y = rim - 0.19;
	set.add(coals);
	return { set, flameAt, ash: 0, floor: 0.3 };
}

// A wall of rough stone blocks, leaving out a rectangle if asked.
function stoneBlocks({ rows, cols, z, hole = null, seed = 41, bw = 0.56, bh = 0.3, depth = 0.3 }) {
	const stoneWall = wallMat();
	const r = rng(seed);
	const items = [];
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			const px = (x - cols / 2 + (y % 2) * 0.5) * bw;
			const py = (y + 0.5) * bh;
			if (hole && Math.abs(px) < hole.x + bw * 0.5 && py < hole.y + bh * 0.5) continue;
			items.push([px, py]);
		}
	}
	const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stoneWall, items.length);
	const m4 = new THREE.Matrix4();
	items.forEach(([px, py], i) => {
		const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.035, (r() - 0.5) * 0.05, (r() - 0.5) * 0.025));
		m4.compose(new THREE.Vector3(px + (r() - 0.5) * 0.015, py, z + (r() - 0.5) * 0.035), q, new THREE.Vector3(bw * (0.955 + r() * 0.025), bh * (0.93 + r() * 0.04), depth + r() * 0.04));
		blocks.setMatrixAt(i, m4);
		const tone = 0.1 + r() * 0.1;
		blocks.setColorAt(i, new THREE.Color(tone * 1.06, tone * 0.97, tone * 0.88));
	});
	blocks.receiveShadow = true;
	blocks.castShadow = true;
	return blocks;
}

export function makeFireplace() {
	const set = new THREE.Group();
	const open = { x: 0.8, y: 1.08 };
	set.add(stoneBlocks({ rows: 14, cols: 16, z: -0.2, hole: { x: open.x + 0.26, y: open.y + 0.3 }, seed: 77 }));
	// the firebox: sooty stone, black above the fire and lit from it
	const soot = shaded(
		{ color: 0xffffff, roughness: 0.95 },
		/* glsl */ `
    float sootN = vfbm(vW * 9.0), sootS = vnoise(vW * 31.0);
    diffuseColor.rgb = mix(vec3(0.05, 0.043, 0.036), vec3(0.15, 0.13, 0.11), smoothstep(0.3, 0.7, sootN)) * (0.8 + 0.4 * sootS);
    diffuseColor.rgb *= mix(1.0, 0.16, smoothstep(0.1, 1.1, wf.y));
    float behind = 1.0 - smoothstep(0.0, 0.9, length(wf.xy * vec2(0.6, 1.0)));
    glow = diffuseColor.rgb * vec3(2.8, 0.95, 0.24) * behind * uFlicker;
    `,
	);
	const stoneTone = wallMat(0x2c2722);
	const box = (w, h, d, x, y, z, m = soot) => {
		const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
		b.position.set(x, y, z);
		b.receiveShadow = true;
		b.castShadow = true;
		set.add(b);
		return b;
	};
	box(2.2, 1.5, 0.12, 0, 0.75, -0.86); // back
	box(0.2, 1.5, 0.86, -open.x - 0.12, 0.75, -0.46); // sides
	box(0.2, 1.5, 0.86, open.x + 0.12, 0.75, -0.46);
	box(2.0, 0.3, 0.86, 0, open.y + 0.2, -0.46); // roof
	// the surround: a pier each side, a great lintel, and a mantel shelf on top
	box(0.56, open.y + 0.04, 0.4, -open.x - 0.28, (open.y + 0.04) / 2, -0.02, stoneTone);
	box(0.56, open.y + 0.04, 0.4, open.x + 0.28, (open.y + 0.04) / 2, -0.02, stoneTone);
	box(2.74, 0.36, 0.44, 0, open.y + 0.2, -0.02, stoneTone);
	box(3.0, 0.1, 0.56, 0, open.y + 0.43, 0.02, stoneTone);
	// the hearth stone
	const hearth = box(2.7, 0.08, 1.05, 0, 0.04, -0.12, soot);
	hearth.castShadow = false;
	// an iron dog at each end, and logs lying across it, burning
	const rand = rng(61);
	for (const x of [-0.5, 0.5]) {
		box(0.04, 0.16, 0.5, x, 0.16, -0.46, hotIron);
	}
	const flameAt = new THREE.Vector3(0, 0.1, -0.5);
	const fuel = [];
	const across = (x0, x1, y, z, r) => {
		const log = makeLog(rand, Math.abs(x1 - x0), r, char);
		const a = new THREE.Vector3(x0, y, z);
		const b = new THREE.Vector3(x1, y + 0.012, z + 0.02);
		placeBetween(log, a, b);
		set.add(log);
		fuel.push({ from: a.clone().sub(flameAt).toArray(), to: b.clone().sub(flameAt).toArray(), radius: r });
	};
	// one log at the front, one behind, one laid across them: the fire stands in behind the front one
	across(-0.68, 0.62, 0.2, -0.33, 0.072);
	across(-0.6, 0.7, 0.22, -0.56, 0.078);
	across(-0.46, 0.5, 0.345, -0.45, 0.062);
	const coals = makeCoals(110, 0.62, 1.15, 33);
	coals.scale.z = 0.42;
	coals.position.set(0, 0.08, -0.45);
	set.add(coals);
	return { set, flameAt, fuel, ash: 0, fixed: true, floor: 0.2, bounce: { at: [0, 0.9, 1.6], strength: 3 } };
}

export function makeCandle() {
	const set = new THREE.Group();
	const tableY = 0.8;
	const wood = shaded(
		{ color: 0xffffff, roughness: 0.62 },
		/* glsl */ `
    float plank = floor(vW.z * 5.2 + 7.0);
    float line = smoothstep(0.0, 0.015, abs(fract(vW.z * 5.2 + 7.0) - 0.02));
    float woodN = vfbm(vec3(vW.x * 3.0 + plank * 7.0, vW.y, vW.z * 48.0));
    diffuseColor.rgb = mix(vec3(0.05, 0.026, 0.012), vec3(0.17, 0.09, 0.04), woodN) * mix(0.14, 1.0, line) * (0.75 + 0.5 * fract(plank * 0.37));
    `,
	);
	const table = new THREE.Mesh(new THREE.BoxGeometry(5, 0.08, 3), wood);
	table.position.y = tableY - 0.04;
	table.receiveShadow = true;
	set.add(table);
	const wax = shaded(
		{ color: 0xffffff, roughness: 0.42 },
		/* glsl */ `
    float waxN = vnoise(vObj * vec3(70.0, 30.0, 70.0));
    diffuseColor.rgb = vec3(0.36, 0.3, 0.21) * (0.92 + 0.12 * waxN);
    // the flame shines through the top of the wax
    float through = exp(-max(length(wf * vec3(1.0, 0.62, 1.0)) - 0.2, 0.0) * 1.5);
    glow = vec3(0.42, 0.14, 0.024) * through * through * uFlicker;
    `,
	);
	const height = 0.13;
	const y0 = tableY + 0.015;
	const profile = [
		[0.021, -0.006],
		[0.0195, height - 0.018],
		[0.0208, height - 0.007],
		[0.0185, height],
		[0.0145, height - 0.0035],
		[0.008, height - 0.0075],
		[0.001, height - 0.0085],
	].map(([x, y]) => new THREE.Vector2(x, y));
	const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), wax);
	body.position.y = y0;
	body.castShadow = true;
	set.add(body);
	// runs of wax down the side
	const rand = rng(19);
	for (let i = 0; i < 7; i++) {
		const a = rand() * Math.PI * 2;
		const len = 0.025 + rand() * 0.07;
		const drip = new THREE.Mesh(new THREE.CapsuleGeometry(0.0035 + rand() * 0.0025, len, 3, 8), wax);
		drip.position.set(Math.cos(a) * 0.0196, y0 + height - 0.008 - len / 2, Math.sin(a) * 0.0196);
		set.add(drip);
	}
	const dish = new THREE.Mesh(
		new THREE.LatheGeometry(
			[
				[0.001, 0.016],
				[0.05, 0.012],
				[0.075, 0.018],
				[0.082, 0.026],
				[0.085, 0.022],
				[0.078, 0.008],
				[0.05, 0],
				[0.001, 0],
			].map(([x, y]) => new THREE.Vector2(x, y)),
			26,
		),
		lit(new THREE.MeshStandardMaterial({ color: 0x8a6a35, roughness: 0.45, metalness: 0.75 })),
	);
	dish.position.y = tableY + 0.003;
	dish.castShadow = true;
	set.add(dish);
	const wickTop = y0 + height + 0.012;
	const wickMat = shaded(
		{ color: 0x050403, roughness: 1 },
		/* glsl */ `
    glow = vec3(3.2, 0.55, 0.05) * smoothstep(0.1, 0.32, wf.y) * (0.6 + 0.4 * uFlicker);
    `,
	);
	const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0014, 0.019, 6), wickMat);
	wick.position.set(0.0006, wickTop - 0.0095, 0);
	wick.rotation.z = -0.12;
	set.add(wick);
	return { set, flameAt: new THREE.Vector3(0, y0 + height - 0.004, 0), ash: 0, fixed: true, floor: 0.06 };
}

export function makeGas() {
	const set = new THREE.Group();
	const steel = shaded(
		{ color: 0xffffff, roughness: 0.5, metalness: 0.2 },
		/* glsl */ `
    float steelN = vfbm(vW * vec3(14.0, 5.0, 14.0));
    diffuseColor.rgb = mix(vec3(0.06, 0.062, 0.068), vec3(0.17, 0.175, 0.18), steelN);
    // the bands of colour steel takes on near a flame, straw to blue, and a scorch above
    float nearJet = smoothstep(-0.95, 0.0, wf.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.3, 0.2, 0.08), vec3(0.09, 0.1, 0.17), smoothstep(0.35, 0.8, nearJet)), nearJet * nearJet * 0.8);
    `,
	);
	const concrete = lit(new THREE.MeshStandardMaterial({ color: 0x3b3a38, roughness: 0.96, flatShading: true }));
	const block = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.62), concrete);
	block.position.y = 0.11;
	block.castShadow = true;
	block.receiveShadow = true;
	set.add(block);
	const top = 1.02;
	const pipe = new THREE.Mesh(
		new THREE.LatheGeometry(
			[
				[0.001, 0.22],
				[0.055, 0.22],
				[0.055, 0.25],
				[0.035, 0.26],
				[0.035, top - 0.13],
				[0.055, top - 0.125],
				[0.055, top - 0.095],
				[0.04, top - 0.09],
				[0.032, top - 0.03],
				[0.027, top],
				[0.016, top],
				[0.012, top - 0.03],
				[0.001, top - 0.03],
			].map(([x, y]) => new THREE.Vector2(x, y)),
			22,
		),
		steel,
	);
	pipe.castShadow = true;
	set.add(pipe);
	// a valve wheel, so it's plainly gas
	const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.008, 6, 18), lit(new THREE.MeshStandardMaterial({ color: 0x6a1410, roughness: 0.55, metalness: 0.3 })));
	wheel.position.set(0.1, 0.52, 0);
	wheel.rotation.y = Math.PI / 2;
	set.add(wheel);
	const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6), steel);
	stem.position.set(0.055, 0.52, 0);
	stem.rotation.z = Math.PI / 2;
	set.add(stem);
	return { set, flameAt: new THREE.Vector3(0, top + 0.001, 0), ash: 0, fixed: true, floor: 0.3 };
}

// A tall crib of logs laid criss-cross, hollow, burning from the middle out.
export function makeBonfire() {
	const set = new THREE.Group();
	const rand = rng(23);
	const fuel = [];
	const layers = 8;
	const span = 1.9;
	const step = 0.205;
	for (let l = 0; l < layers; l++) {
		const alongX = l % 2 === 0;
		const count = l < 2 ? 4 : 2;
		for (let i = 0; i < count; i++) {
			const off = count === 2 ? (i ? 0.72 : -0.72) : -0.72 + (i * 1.44) / 3;
			const y = 0.1 + l * step + (rand() - 0.5) * 0.01;
			const len = span * (0.94 + rand() * 0.12);
			const slip = (rand() - 0.5) * 0.14;
			const skew = (rand() - 0.5) * 0.09;
			const a = alongX ? new THREE.Vector3(-len / 2 + slip, y, off - skew) : new THREE.Vector3(off - skew, y, -len / 2 + slip);
			const b = alongX ? new THREE.Vector3(len / 2 + slip, y + (rand() - 0.5) * 0.04, off + skew) : new THREE.Vector3(off + skew, y + (rand() - 0.5) * 0.04, len / 2 + slip);
			const radius = 0.095 + rand() * 0.025;
			const log = makeLog(rand, a.distanceTo(b), radius, char);
			placeBetween(log, a, b);
			set.add(log);
			// the flames attach to the top of the stack
			if (l >= layers - 3) fuel.push({ from: a.toArray(), to: b.toArray(), radius });
		}
	}
	// a few timbers leaning on it or fallen off it
	for (const [ax, az, bx, by, bz] of [
		[-1.75, 0.5, -0.86, 0.95, 0.3],
		[1.6, -0.75, 0.85, 0.75, -0.4],
		[0.3, 1.7, 0.1, 0.72, 0.84],
	]) {
		const a = new THREE.Vector3(ax, 0.06, az);
		const b = new THREE.Vector3(bx, by, bz);
		const log = makeLog(rand, a.distanceTo(b), 0.085, char);
		placeBetween(log, a, b);
		set.add(log);
	}
	set.add(makeCoals(130, 0.86, 1.8, 9));
	return { set, flameAt: new THREE.Vector3(), fuel, ash: 1 };
}

export function makeCrate() {
	const set = new THREE.Group();
	const half = 0.35;
	const tall = 0.68;
	const rand = rng(71);
	const board = (w, h, d, x, y, z, rz = 0) => {
		const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 4, 1, 1), h > w ? char : charBoard);
		const pos = b.geometry.attributes.position;
		for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + (rand() - 0.5) * 0.006);
		b.geometry.computeVertexNormals();
		b.position.set(x, y, z);
		b.rotation.z = rz;
		b.castShadow = true;
		b.receiveShadow = true;
		set.add(b);
		return b;
	};
	// slats on each side with gaps, so the fire inside shows through; one side is burnt through at a corner
	const slats = 5;
	const sh = tall / slats;
	for (let i = 0; i < slats; i++) {
		const y = sh * (i + 0.5);
		const g = sh * (0.76 + rand() * 0.1);
		board(half * 2, g, 0.026, 0, y, half);
		board(half * 2, g, 0.026, 0, y, -half);
		const side = (z) => {
			const b = board(half * 2, g, 0.026, half, y, 0);
			b.rotation.y = Math.PI / 2;
			b.position.x = z;
		};
		side(half);
		side(-half);
	}
	// corner posts and the top rails
	for (const [x, z] of [
		[-1, -1],
		[1, -1],
		[-1, 1],
		[1, 1],
	]) {
		board(0.06, tall, 0.06, (x * half) | 0 ? x * half : x * half, tall / 2, z * half);
		board(0.06, 0.04, 0.06, x * half, tall + 0.015, z * half);
	}
	// what's left of the lid, a few boards lying across
	board(half * 2 + 0.05, 0.022, 0.13, 0.02, tall + 0.004, -0.2, 0.03);
	board(half * 2 + 0.03, 0.022, 0.11, -0.03, tall + 0.002, 0.23, -0.05);
	// and a board fallen off, smouldering at its foot
	const fallen = board(0.62, 0.024, 0.11, 0.66, 0.05, 0.42, 0.1);
	fallen.rotation.y = 0.9;
	set.add(makeCoals(60, 0.46, 1.2, 83));
	// the flames attach to its top edge and what's left of the lid
	const rim = (ax, az, bx, bz) => ({ from: [ax * half, tall, az * half], to: [bx * half, tall, bz * half], radius: 0.03 });
	const fuel = [rim(-1, 1, 1, 1), rim(-1, -1, 1, -1), rim(-1, -1, -1, 1), rim(1, -1, 1, 1), { from: [-half, tall + 0.01, -0.2], to: [half, tall + 0.01, -0.2], radius: 0.03 }, { from: [-half, tall + 0.01, 0.23], to: [half, tall + 0.01, 0.23], radius: 0.03 }];
	return { set, flameAt: new THREE.Vector3(), fuel, ash: 0.8 };
}

// A front of flame on the ground, with burnt stubble round it. Its origin is the middle of the line.
export function makeLine() {
	const set = new THREE.Group();
	// dry grass, standing pale away from the fire and burnt down to stubble near it: fine blades, in clumps
	const grassMat = shaded(
		{ color: 0xffffff, side: THREE.DoubleSide },
		/* glsl */ `
    float nearLine = 1.0 - smoothstep(0.1, 1.5, abs(wf.z));
    diffuseColor.rgb = mix(vec3(0.15, 0.115, 0.06), vec3(0.008, 0.006, 0.005), nearLine);
    `,
		THREE.MeshLambertMaterial,
	);
	const r = rng(91);
	const n = 5200;
	const blade = new THREE.ConeGeometry(0.0055, 1, 3, 1, true).translate(0, 0.5, 0);
	const grass = new THREE.InstancedMesh(blade, grassMat, n);
	const m4 = new THREE.Matrix4();
	const clumps = Array.from({ length: 460 }, () => [(r() - 0.5) * 13, (r() + r() - 1) * 5.4]);
	for (let i = 0; i < n; i++) {
		const c = clumps[i % clumps.length];
		const x = c[0] + (r() - 0.5) * 0.28;
		const z = c[1] + (r() - 0.5) * 0.28;
		const away = Math.min(Math.abs(z) / 1.6, 1);
		const h = (0.025 + r() * 0.05) * (1 - away) + (0.1 + r() * 0.2) * away;
		const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 1.1, r() * 6, (r() - 0.5) * 1.1));
		m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, h, 1));
		grass.setMatrixAt(i, m4);
	}
	grass.castShadow = false;
	set.add(grass);
	// sticks and brush lying along the line, the fuel it's running through
	const rand = rng(93);
	for (let i = 0; i < 16; i++) {
		const x = (rand() - 0.5) * 5.4;
		const a = rand() * Math.PI;
		const len = 0.25 + rand() * 0.5;
		const dx = Math.cos(a) * len * 0.5;
		const dz = Math.sin(a) * len * 0.3;
		const z = (rand() - 0.5) * 0.3;
		const stick = makeLog(rand, len, 0.014 + rand() * 0.016, char);
		placeBetween(stick, new THREE.Vector3(x - dx, 0.02, z - dz), new THREE.Vector3(x + dx, 0.03 + rand() * 0.05, z + dz));
		set.add(stick);
	}
	return { set, flameAt: new THREE.Vector3(), ash: 0.9, foot: [3.6, 0.05] };
}

export function makeGround() {
	const mat = shaded(
		{ color: 0xffffff, roughness: 0.97 },
		/* glsl */ `
    float gr = length(max(abs(wf.xz) - uFoot, 0.0));
    float big = vfbm(vW * 2.3), small = vnoise(vW * 26.0);
    vec3 earth = mix(vec3(0.05, 0.036, 0.025), vec3(0.12, 0.085, 0.058), big) * (0.7 + 0.6 * small);
    float ash = (1.0 - smoothstep(0.42, 0.86 + 0.3 * big, gr)) * uAsh;
    vec3 ashC = mix(vec3(0.05, 0.045, 0.04), vec3(0.2, 0.19, 0.18), smoothstep(0.3, 0.7, vfbm(vW * 7.0)));
    diffuseColor.rgb = mix(earth, ashC, ash);
    glow = vec3(1.2, 0.2, 0.015) * smoothstep(0.56, 0.82, vfbm(vW * (uFoot.x > 0.0 ? 41.0 : 13.0))) * (1.0 - smoothstep(0.08, 0.46, gr)) * uFlicker * uAsh;
  `,
	);
	const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), mat);
	ground.rotation.x = -Math.PI / 2;
	ground.receiveShadow = true;
	return ground;
}

// The night behind it: nearly black, a little blue left at the horizon, so smoke has something to cross.
export function makeSky() {
	const mat = new THREE.ShaderMaterial({
		glslVersion: THREE.GLSL3,
		side: THREE.BackSide,
		depthWrite: false,
		vertexShader: /* glsl */ `out vec3 vD; void main() { vD = position; vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0); gl_Position = p.xyww; }`,
		fragmentShader: /* glsl */ `
      layout(location = 0) out vec4 outC;
      in vec3 vD;
      void main() {
        vec3 d = normalize(vD);
        float h = max(d.y, 0.0);
        vec3 c = vec3(0.0065, 0.0095, 0.021) * smoothstep(0.0, 0.16, h) * (1.0 - 0.7 * smoothstep(0.16, 0.7, h));
        // a few still stars
        vec3 g = d * 150.0, i = floor(g), f = g - i - 0.5;
        float s = fract(sin(dot(i, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        c += vec3(0.75, 0.82, 1.0) * step(0.9975, s) * fract(s * 913.7) * 0.5 * smoothstep(0.42, 0.16, length(f)) * smoothstep(0.03, 0.2, h);
        outC = vec4(c, 1.0);
      }`,
	});
	const sky = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat);
	sky.frustumCulled = false;
	sky.renderOrder = -1;
	return sky;
}
