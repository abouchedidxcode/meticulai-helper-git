// The README's two ways of using it, on a plain scene, so they can't quietly stop working. ?mode=drawover for the second.
import * as THREE from 'three';
import { FireLayer } from '../src/fire/index.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas });
renderer.setSize(innerWidth, innerHeight, false);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2, 8);
camera.lookAt(0, 1, 0);
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x555555 })));
const crate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x8a6a4a }));
crate.position.set(-1.3, 0.3, 1);
scene.add(crate);

const layer = new FireLayer(renderer);
const camp = layer.add({ type: 'campfire', position: [-1.5, 0, 0] });
const torch = layer.add({ type: 'torch', position: [1.7, 1.6, 0], shadow: false });
scene.add(camp, torch);

// a flame shaped to an object of your own: a box it burns on, and a barrel it comes out of
const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x1a1512 }));
box.position.set(-3.6, 0.5, -0.5);
const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 20), new THREE.MeshStandardMaterial({ color: 0x20262a }));
barrel.position.set(3.4, 0.45, -0.5);
scene.add(box, barrel);
const onBox = layer.add({ type: 'campfire', size: 1.2, position: [-3.6, 0, -0.5], around: { width: 1, depth: 1, height: 1 }, lights: false });
const outOfBarrel = layer.add({ type: 'campfire', size: 0.5, position: [3.4, 0.76, -0.5], outOf: { radius: 0.29, below: 0.14 }, lights: false });
const blue = layer.add({ type: 'torch', size: 0.2, position: [-0.2, 0, 2], look: { blue: 1, calm: 0.5 }, lights: false });
const logs = layer.add({ type: 'campfire', size: 0.5, position: [0.8, 0, 1.6], around: { width: 0.8, depth: 0.02, radius: 0.05, height: 0.25, climb: 0.2, flare: 1.7 }, fuel: [{ from: [-0.6, 0.1, 0.17], to: [0.6, 0.1, 0.17], radius: 0.07 }], lights: false });
const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.2, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x120e0c }));
log.position.set(0.8, 0.1, 1.77);
scene.add(onBox, outOfBarrel, blue, logs, log);

const clock = new THREE.Clock();
const mode = new URLSearchParams(location.search).get('mode');
const w = innerWidth;
const h = innerHeight;
const sceneTarget = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType) });
const out = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
const quad = new THREE.Mesh(
	new THREE.PlaneGeometry(2, 2),
	new THREE.ShaderMaterial({
		uniforms: { t: { value: out.texture } },
		vertexShader: 'varying vec2 u; void main(){u=uv;gl_Position=vec4(position.xy,0.,1.);}',
		fragmentShader: 'uniform sampler2D t; varying vec2 u; void main(){vec3 c=texture2D(t,u).rgb*0.7;gl_FragColor=vec4(pow(c/(1.0+c),vec3(1./2.2)),1.);}',
	}),
);
quad.frustumCulled = false;
const quadScene = new THREE.Scene();
quadScene.add(quad);
const quadCam = new THREE.Camera();
let frames = 0;
renderer.setAnimationLoop(() => {
	layer.update(clock.getDelta());
	if (mode === 'drawover') {
		renderer.setRenderTarget(sceneTarget);
		renderer.render(scene, camera);
		layer.drawOver(sceneTarget.texture, sceneTarget.depthTexture, camera, out);
		renderer.setRenderTarget(null);
		renderer.render(quadScene, quadCam);
	} else layer.render(scene, camera);
	window.__frames = ++frames;
});
