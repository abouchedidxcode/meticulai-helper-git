// The real page with its own loop and real keys: start, walk, pick up, throw, restart. Fails on any console error.
import { launch, serve } from './lib.mjs';

const url = process.argv[2];
const server = url ? null : await serve('dist');
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const offHost = [];
const target = url ?? server.url;
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));
page.on('request', (r) => new URL(r.url()).host !== new URL(target).host && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && offHost.push(r.url()));
const t0 = Date.now();
await page.goto(target);
await page.waitForFunction(() => window.__block?.ready, null, { timeout: 120000 });
console.log('ready in', ((Date.now() - t0) / 1000).toFixed(1), 's');
await page.mouse.click(640, 360);
await page.waitForTimeout(800);
const state = () => page.evaluate(() => ({ room: window.__demo.player.room, x: +window.__demo.player.position.x.toFixed(2), z: +window.__demo.player.position.z.toFixed(2), held: !!window.__demo.props.held, locked: !!document.pointerLockElement }));
console.log('start', JSON.stringify(await state()));
// look at the ball and pick it up, walk with it, throw it
await page.evaluate(() => {
	const d = window.__demo;
	const p = d.props.list[0];
	const t = p.body.translation();
	const e = d.camera.position;
	d.player.yaw = Math.atan2(-(t.x - e.x), -(t.z - e.z));
	d.player.pitch = Math.atan2(t.y - e.y, Math.hypot(t.x - e.x, t.z - e.z));
});
await page.waitForTimeout(200);
await page.keyboard.press('KeyE');
await page.waitForTimeout(500);
console.log('after E', JSON.stringify(await state()));
if (!(await state()).held) console.log('DIAG', JSON.stringify(await page.evaluate(() => {
	const d = window.__demo;
	const eye = d.player.eye(d.camera.position.clone());
	const aim = d.player.aim(d.camera.position.clone());
	const hit = d.world.physics.castRay({ origin: { x: eye.x, y: eye.y, z: eye.z }, dir: { x: aim.x, y: aim.y, z: aim.z } }, 2.6, true, undefined, undefined, d.player.collider);
	const t = d.props.list[0].body.translation();
	return { yaw: d.player.yaw, pitch: d.player.pitch, eye: eye.toArray(), aim: aim.toArray(), ball: [t.x, t.y, t.z], hit: hit ? { toi: hit.timeOfImpact, h: hit.collider.handle, ball: d.props.list[0].collider.handle } : null };
})));
await page.keyboard.down('KeyW');
await page.waitForTimeout(1200);
await page.keyboard.up('KeyW');
console.log('walked', JSON.stringify(await state()));
await page.mouse.click(640, 360);
await page.waitForTimeout(600);
console.log('thrown', JSON.stringify(await state()));
await page.keyboard.press('Space');
await page.waitForTimeout(700);
await page.keyboard.press('KeyR');
await page.waitForTimeout(300);
console.log('restart', JSON.stringify(await state()));
const fps = await page.evaluate(() => new Promise((res) => {
	let n = 0;
	const t = performance.now();
	const tick = () => (++n < 120 ? requestAnimationFrame(tick) : res((n * 1000) / (performance.now() - t)));
	requestAnimationFrame(tick);
}));
console.log('page loop', fps.toFixed(0), 'fps at 1280x720');
console.log(errors.length ? 'ERRORS\n' + [...new Set(errors)].join('\n') : 'no console errors', offHost.length ? `\noff-host requests: ${offHost.join(', ')}` : '\nno off-host requests');
await browser.close();
server?.stop();
