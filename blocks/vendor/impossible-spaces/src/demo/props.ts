// Things to push, carry and throw. Each keeps its own down and its own size, which portals change,
// and is drawn on both sides of an opening while it straddles it.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three/webgpu';
import { cameraWorldMatrix, float, luminance, mix, normalView, normalWorld, pmremTexture, positionLocal, positionViewDirection, smoothstep, texture, userData, uv, vec3, vec4 } from 'three/tsl';
import type { PortalFrame } from '../lib/index.ts';
import type { Player } from './player.ts';
import type { DynamicDef, World } from './world.ts';

interface Prop {
	kind: 'ball' | 'box';
	size: number;
	body: RAPIER.RigidBody;
	collider: RAPIER.Collider;
	mesh: THREE.Mesh;
	twin: THREE.Mesh;
	shadow: THREE.Mesh;
	room: string;
	scale: number;
	down: THREE.Vector3;
	last: THREE.Vector3;
	home: DynamicDef;
}

const G = 9.81;
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _c = new THREE.Color();
const Z = new THREE.Vector3(0, 0, 1);

export class Props {
	readonly list: Prop[] = [];
	held: Prop | null = null;

	constructor(private readonly world: World) {
		const ball = new THREE.SphereGeometry(1, 48, 32);
		const cube = new THREE.BoxGeometry(2, 2, 2);
		// lit by the baked light of the floor under them (`probe`, per thing), a little more from above than below
		const lit = (colour: unknown, rough: number) => {
			const m = new THREE.MeshBasicNodeMaterial();
			const albedo = vec3(colour as never);
			const probe = vec3(userData('probe', 'vec3') as never);
			const up = vec3(userData('up', 'vec3') as never);
			const n = normalWorld.normalize();
			const wrap = n.dot(up).mul(0.5).add(0.5);
			const diffuse = albedo.mul(probe).mul(mix(float(0.42), float(1.12), wrap.pow(1.3)));
			const view = positionViewDirection;
			const fresnel = float(0.04).add(float(0.96).mul(normalView.dot(view).clamp(0, 1).oneMinus().pow(5)));
			const mirror = cameraWorldMatrix.mul(vec4(view.negate().reflect(normalView), 0)).xyz.normalize();
			const shine = pmremTexture(world.environment, mirror, float(rough)).rgb.mul(fresnel).mul(luminance(probe).mul(0.5).clamp(0, 1.4));
			m.colorNode = diffuse.add(shine);
			return m;
		};
		// two tones, so a roll shows
		const red = lit(mix(vec3(0.56, 0.045, 0.035), vec3(0.8, 0.77, 0.7), smoothstep(float(-0.015), float(0.015), positionLocal.y.sub(positionLocal.x.mul(0.35)))), 0.4);
		const oak = lit(texture(world.maps.oak.color, uv().mul(0.35)).rgb, 0.6);
		red.name = 'ball';
		oak.name = 'box';
		const blob = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, name: 'shadow' });
		const d = uv().sub(0.5).length().mul(2);
		blob.colorNode = vec3(0, 0, 0);
		blob.opacityNode = smoothstep(float(1), float(0.15), d).mul(0.55);
		blob.polygonOffset = true;
		blob.polygonOffsetFactor = -2;
		blob.polygonOffsetUnits = -2;
		const plane = new THREE.PlaneGeometry(1, 1);
		for (const def of world.level.dynamics) {
			const size = def.kind === 'ball' ? (def.r ?? 0.18) : 0.16;
			const body = world.physics.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...def.pos).setLinearDamping(0.05).setAngularDamping(0.25).setCcdEnabled(true));
			const shape = def.kind === 'ball' ? RAPIER.ColliderDesc.ball(size) : RAPIER.ColliderDesc.cuboid(size, size, size);
			const collider = world.physics.createCollider(shape.setDensity(def.kind === 'ball' ? 120 : 420).setRestitution(def.kind === 'ball' ? 0.55 : 0.15).setFriction(0.7), body);
			const mesh = new THREE.Mesh(def.kind === 'ball' ? ball : cube, def.kind === 'ball' ? red : oak);
			const twin = new THREE.Mesh(mesh.geometry, mesh.material);
			mesh.userData.probe = new THREE.Vector3(1, 1, 1);
			mesh.userData.up = new THREE.Vector3(0, 1, 0);
			twin.userData = mesh.userData;
			twin.matrixAutoUpdate = false;
			twin.visible = false;
			const shadow = new THREE.Mesh(plane, blob);
			shadow.renderOrder = 2;
			this.world.portals.room(def.room).add(mesh, shadow);
			this.world.portals.scene.add(twin);
			this.list.push({ kind: def.kind, size, body, collider, mesh, twin, shadow, room: def.room, scale: 1, down: new THREE.Vector3(0, -1, 0), last: new THREE.Vector3(...def.pos), home: def });
		}
	}

	reset(): void {
		this.held = null;
		for (const p of this.list) {
			if (p.scale !== 1) this.resize(p, 1);
			p.down.set(0, -1, 0);
			p.body.setTranslation({ x: p.home.pos[0], y: p.home.pos[1], z: p.home.pos[2] }, true);
			p.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
			p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
			p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
			p.last.set(...p.home.pos);
			this.move(p, p.home.room);
		}
	}

	/** Before the physics step: each thing's own gravity, and the pull on what's carried. */
	before(player: Player): void {
		for (const p of this.list) {
			p.body.resetForces(false);
			if (p === this.held) continue;
			const f = G * p.scale * p.body.mass();
			p.body.addForce({ x: p.down.x * f, y: p.down.y * f, z: p.down.z * f }, true);
		}
		const h = this.held;
		if (!h) return;
		// where it should hang: a little ahead of the eye, on whichever side of an opening that is
		const eye = player.eye(new THREE.Vector3());
		const aim = player.aim(new THREE.Vector3());
		const target = eye.clone().addScaledVector(aim, 0.85 * player.scale + h.size * h.scale);
		const through = this.between(player.room, h.room, eye, target);
		if (through) target.applyMatrix4(through.through);
		else if (h.room !== player.room) {
			this.held = null;
			player.ignore = null;
			return;
		}
		const t = h.body.translation();
		const v = _p.set(target.x - t.x, target.y - t.y, target.z - t.z).multiplyScalar(18);
		const max = 14 * h.scale;
		if (v.length() > max) v.setLength(max);
		h.body.setLinvel(v, true);
		const w = h.body.angvel();
		h.body.setAngvel({ x: w.x * 0.8, y: w.y * 0.8, z: w.z * 0.8 }, true);
	}

	/** After the physics step: what went through an opening, and where everything is drawn. */
	after(): void {
		const portals = this.world.portals;
		for (const p of this.list) {
			const t = p.body.translation();
			_p.set(t.x, t.y, t.z);
			const through = portals.crossing(p.room, p.last, _p);
			if (through) this.pass(p, through);
			const at = p.body.translation();
			p.last.set(at.x, at.y, at.z);
			const r = p.body.rotation();
			p.mesh.position.copy(p.last);
			p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
			p.mesh.scale.setScalar(p.size * p.scale);
			p.mesh.updateMatrixWorld();
			// its other half, the far side of an opening it's partly through
			p.twin.visible = false;
			const reach = p.size * p.scale * (p.kind === 'box' ? 1.75 : 1.05);
			for (const f of portals.in(p.room)) {
				if (!f.link) continue;
				const { distance, inside } = f.facing(p.last, reach);
				if (!inside || Math.abs(distance) > reach) continue;
				p.twin.visible = true;
				p.twin.matrix.multiplyMatrices(f.through, p.mesh.matrixWorld);
				p.twin.matrixWorldNeedsUpdate = true;
				const group = portals.room(f.link.room);
				if (p.twin.parent !== group) group.add(p.twin);
				break;
			}
			this.shade(p);
		}
	}

	private shade(p: Prop): void {
		const r = p.size * p.scale;
		// the light where it is, eased so a shadow's edge doesn't snap
		if (this.world.lightAt(p.room, p.last, p.down, _c)) (p.mesh.userData.probe as THREE.Vector3).lerp(_p.set(_c.r, _c.g, _c.b), 0.2);
		(p.mesh.userData.up as THREE.Vector3).copy(p.down).negate();
		const hit = this.world.physics.castRayAndGetNormal(new RAPIER.Ray(p.last, p.down), r * 6, true, undefined, undefined, p.collider, undefined, (c) => c.parent()?.isFixed() ?? true);
		if (!hit) {
			p.shadow.visible = false;
			return;
		}
		const gap = Math.max(0, hit.timeOfImpact - r * (p.kind === 'box' ? 1 : 1));
		p.shadow.visible = true;
		_n.set(hit.normal.x, hit.normal.y, hit.normal.z);
		p.shadow.position.copy(p.last).addScaledVector(p.down, hit.timeOfImpact).addScaledVector(_n, 0.004 * p.scale);
		p.shadow.quaternion.copy(_q.setFromUnitVectors(Z, _n));
		p.shadow.visible = gap < r * 4;
		p.shadow.scale.setScalar(r * (2.5 + (gap / r) * 0.9));
		p.shadow.updateMatrixWorld();
	}

	private pass(p: Prop, through: PortalFrame): void {
		const t = p.body.translation();
		_p.set(t.x, t.y, t.z).applyMatrix4(through.through);
		p.body.setTranslation(_p, true);
		const r = p.body.rotation();
		_q.set(r.x, r.y, r.z, r.w).premultiply(through.turn);
		p.body.setRotation(_q, true);
		const v = p.body.linvel();
		p.body.setLinvel(_p.set(v.x, v.y, v.z).applyQuaternion(through.turn).multiplyScalar(through.scale), true);
		const w = p.body.angvel();
		p.body.setAngvel(_p.set(w.x, w.y, w.z).applyQuaternion(through.turn), true);
		p.down.applyQuaternion(through.turn).normalize();
		if (Math.abs(through.scale - 1) > 1e-6) this.resize(p, p.scale * through.scale);
		this.move(p, through.link!.room);
	}

	private resize(p: Prop, scale: number): void {
		p.scale = Math.abs(scale - 1) < 1e-4 ? 1 : scale;
		const s = p.size * p.scale;
		p.collider.setShape(p.kind === 'ball' ? new RAPIER.Ball(s) : new RAPIER.Cuboid(s, s, s));
	}

	private move(p: Prop, room: string): void {
		p.room = room;
		this.world.portals.room(room).add(p.mesh, p.shadow);
	}

	/** The opening from `a` to `b` that the segment goes in through, if the rooms differ or the segment crosses one. */
	private between(a: string, b: string, from: THREE.Vector3, to: THREE.Vector3): PortalFrame | null {
		const crossed = this.world.portals.crossing(a, from, to);
		if (a === b) return null;
		if (crossed && crossed.link!.room === b) return crossed;
		// just across an opening, with the hand not yet through: the nearest one that leads there
		let best: PortalFrame | null = null;
		let bestD = Infinity;
		for (const f of this.world.portals.in(a)) {
			if (!f.link || f.link.room !== b) continue;
			const d = Math.abs(f.plane.distanceToPoint(to));
			if (d < bestD) {
				bestD = d;
				best = f;
			}
		}
		return best;
	}

	/** Puts the first ball in the player's hand, at the player's size and with the player's down. */
	bring(player: Player): void {
		const p = this.list.find((x) => x.kind === 'ball');
		if (!p) return;
		const at = player.eye(new THREE.Vector3()).addScaledVector(player.aim(new THREE.Vector3()), 0.85 * player.scale + p.size * player.scale);
		if (p.scale !== player.scale) this.resize(p, player.scale);
		p.down.copy(player.up).negate();
		p.body.setTranslation(at, true);
		p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
		p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
		p.last.copy(at);
		this.move(p, player.room);
		this.held = p;
		player.ignore = p.collider;
	}

	/** Picks up what the player looks at (through an opening too), or lets go. */
	grab(player: Player): void {
		if (this.held) {
			this.held = null;
			player.ignore = null;
			return;
		}
		const physics = this.world.physics;
		const eye = player.eye(new THREE.Vector3());
		const aim = player.aim(new THREE.Vector3());
		const reach = 2.6 * player.scale;
		const cast = (from: THREE.Vector3, dir: THREE.Vector3, len: number): Prop | null => {
			const hit = physics.castRay(new RAPIER.Ray(from, dir), len, true, undefined, undefined, player.collider);
			if (!hit) return null;
			return this.list.find((p) => p.collider.handle === hit.collider.handle) ?? null;
		};
		let found = cast(eye, aim, reach);
		if (!found) {
			const end = eye.clone().addScaledVector(aim, reach);
			const through = this.world.portals.crossing(player.room, eye, end);
			if (through) {
				const d = through.plane.distanceToPoint(eye) / Math.max(1e-6, -aim.dot(through.normal));
				const from = eye.clone().addScaledVector(aim, d).applyMatrix4(through.through);
				found = cast(from, aim.clone().applyQuaternion(through.turn), (reach - d) * through.scale);
			}
		}
		if (!found) return;
		this.held = found;
		player.ignore = found.collider;
	}

	/** Throws what's carried the way the player looks. */
	toss(player: Player): boolean {
		const h = this.held;
		if (!h) return false;
		this.held = null;
		player.ignore = null;
		const eye = player.eye(new THREE.Vector3());
		const aim = player.aim(new THREE.Vector3());
		const through = this.between(player.room, h.room, eye, eye.clone().addScaledVector(aim, 1.2 * player.scale));
		const v = aim.multiplyScalar(9 * player.scale).add(player.velocity);
		if (through) v.applyQuaternion(through.turn).multiplyScalar(through.scale);
		h.body.setLinvel(v, true);
		return true;
	}
}
