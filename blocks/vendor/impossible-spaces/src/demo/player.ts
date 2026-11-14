// First person on Rapier's character controller. The body keeps its own up and its own size, and both
// change when a portal says so: walk through a door lying on its side and that wall is the floor.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three/webgpu';
import type { PortalFrame, PortalSystem } from '../lib/index.ts';

const HEIGHT = 1.75;
const EYE = 1.62;
const RADIUS = 0.28;
const NEAR = 0.03;

export interface Input {
	forward: number;
	strafe: number;
	run: boolean;
	jump: boolean;
}

const _up = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

export class Player {
	/** Feet. */
	readonly position = new THREE.Vector3();
	/** The body's orientation: its +Y is up for it. */
	readonly frame = new THREE.Quaternion();
	readonly velocity = new THREE.Vector3();
	yaw = 0;
	pitch = 0;
	scale = 1;
	room = '';
	grounded = false;
	/** Walking speed at full size, m/s (running is two thirds faster). */
	speed = 3.3;
	onPass: (through: PortalFrame) => void = () => {};
	readonly body: RAPIER.RigidBody;
	readonly collider: RAPIER.Collider;
	private controller!: RAPIER.KinematicCharacterController;
	/** A collider the controller ignores (what's being carried). */
	ignore: RAPIER.Collider | null = null;

	constructor(
		private readonly physics: RAPIER.World,
		private readonly portals: PortalSystem,
		readonly camera: THREE.PerspectiveCamera,
	) {
		this.body = physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
		this.collider = physics.createCollider(RAPIER.ColliderDesc.capsule(HEIGHT / 2 - RADIUS, RADIUS), this.body);
		this.resize();
	}

	get up(): THREE.Vector3 {
		return _up.copy(Y).applyQuaternion(this.frame);
	}

	eye(out: THREE.Vector3): THREE.Vector3 {
		return out.copy(this.position).addScaledVector(this.up, EYE * this.scale);
	}

	place(room: string, feet: THREE.Vector3Like, yaw: number, pitch = 0, frame?: THREE.Quaternion, scale = 1): void {
		this.room = room;
		this.position.copy(feet);
		if (frame) this.frame.copy(frame);
		else this.frame.identity();
		this.velocity.set(0, 0, 0);
		this.yaw = yaw;
		this.pitch = pitch;
		this.grounded = false;
		this.scale = scale;
		this.resize();
		this.sync();
	}

	look(dx: number, dy: number): void {
		this.yaw -= dx;
		this.pitch = THREE.MathUtils.clamp(this.pitch - dy, -1.5, 1.5);
	}

	update(dt: number, input: Input): void {
		const s = this.scale;
		const up = this.up.clone();
		_q.setFromAxisAngle(Y, this.yaw).premultiply(this.frame);
		const forward = _a.set(0, 0, -1).applyQuaternion(_q);
		const right = _b.set(1, 0, 0).applyQuaternion(_q);
		const wish = new THREE.Vector3().addScaledVector(forward, input.forward).addScaledVector(right, input.strafe);
		if (wish.lengthSq() > 1) wish.normalize();
		wish.multiplyScalar(this.speed * (input.run ? 1.64 : 1) * s);
		let rise = this.velocity.dot(up);
		const planar = this.velocity.clone().addScaledVector(up, -rise);
		planar.lerp(wish, 1 - Math.exp(-(this.grounded ? 14 : 3) * dt));
		// on the ground nothing pushes down: the controller's snap keeps the feet on slopes and steps
		if (this.grounded) rise = input.jump ? 4.6 * s : 0;
		else rise -= 13 * s * dt;
		this.velocity.copy(planar).addScaledVector(up, rise);
		const want = this.velocity.clone().multiplyScalar(dt);
		this.controller.computeColliderMovement(this.collider, want, undefined, undefined, (c) => c !== this.ignore && !c.isSensor());
		const moved = this.controller.computedMovement();
		this.grounded = this.controller.computedGrounded();
		const from = this.eye(new THREE.Vector3());
		this.position.x += moved.x;
		this.position.y += moved.y;
		this.position.z += moved.z;
		if (dt > 0) {
			// a wall stops a run and a ceiling a jump; otherwise the speed is the one asked for
			const got = new THREE.Vector3(moved.x, moved.y, moved.z);
			const gotRise = got.dot(up);
			got.addScaledVector(up, -gotRise);
			if (got.length() < 0.5 * planar.length() * dt) planar.copy(got).divideScalar(dt);
			if (this.grounded || (rise > 0 && gotRise < 0.5 * rise * dt)) rise = Math.min(rise, 0);
			if (this.grounded) rise = 0;
			this.velocity.copy(planar).addScaledVector(up, rise);
		}
		const to = this.eye(new THREE.Vector3());
		const through = this.portals.crossing(this.room, from, to);
		if (through) this.pass(through);
		this.sync();
	}

	/** Goes through an opening: place, up, size and speed all follow. */
	pass(through: PortalFrame): void {
		this.position.applyMatrix4(through.through);
		this.frame.premultiply(through.turn).normalize();
		this.velocity.applyQuaternion(through.turn).multiplyScalar(through.scale);
		this.room = through.link!.room;
		if (Math.abs(through.scale - 1) > 1e-6) {
			this.scale *= through.scale;
			if (Math.abs(this.scale - 1) < 1e-4) this.scale = 1;
			this.resize();
		} else this.controller.setUp(this.up);
		this.onPass(through);
	}

	private resize(): void {
		const s = this.scale;
		if (this.controller) this.physics.removeCharacterController(this.controller);
		this.collider.setShape(new RAPIER.Capsule((HEIGHT / 2 - RADIUS) * s, RADIUS * s));
		const c = this.physics.createCharacterController(0.02 * s);
		c.setUp(this.up);
		c.enableAutostep(0.3 * s, 0.15 * s, false);
		c.enableSnapToGround(0.3 * s);
		c.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(50));
		c.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(40));
		c.setApplyImpulsesToDynamicBodies(true);
		c.setCharacterMass(70 * s * s * s);
		this.controller = c;
		this.camera.near = NEAR * s;
		this.camera.far = 600;
		this.camera.updateProjectionMatrix();
	}

	/** Writes the body and the camera from the state. */
	sync(): void {
		const centre = _a.copy(this.position).addScaledVector(this.up, (HEIGHT / 2) * this.scale);
		this.body.setTranslation(centre, true);
		this.body.setRotation(this.frame, true);
		this.eye(this.camera.position);
		this.camera.quaternion.copy(this.frame).multiply(_q.setFromAxisAngle(Y, this.yaw)).multiply(_q.setFromAxisAngle(X, this.pitch));
		this.camera.updateMatrixWorld();
	}

	/** The way the camera looks. */
	aim(out: THREE.Vector3): THREE.Vector3 {
		const q = new THREE.Quaternion().copy(this.frame).multiply(_q.setFromAxisAngle(Y, this.yaw)).multiply(_q.setFromAxisAngle(X, this.pitch));
		return out.set(0, 0, -1).applyQuaternion(q);
	}
}
