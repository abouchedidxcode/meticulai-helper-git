// Shared bits for the Playwright scripts: a muted Chromium with WebGPU, and a local server for dist/.
//
// These scripts never take the real mouse: the demo locks the pointer on a click, and in a headless browser on
// Windows that can still clip the real cursor. Every page gets a pretend lock instead (below).
// PATCH_CHROME names another browser to use; without it Playwright's own Chromium runs.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

export const CHROME = process.env.PATCH_CHROME || undefined;
export const CHROME_ARGS = ['--mute-audio', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'];
const here = dirname(fileURLToPath(import.meta.url));

/** Runs in every page before its own scripts: the page believes it has the pointer, and the real one is never taken. */
function pretendPointerLock() {
	let locked = null;
	const fire = () => document.dispatchEvent(new Event('pointerlockchange'));
	Element.prototype.requestPointerLock = function () {
		locked = this;
		queueMicrotask(fire);
		return Promise.resolve();
	};
	Document.prototype.exitPointerLock = function () {
		locked = null;
		queueMicrotask(fire);
	};
	Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get: () => locked });
}

/** A browser whose every page has the pretend pointer lock. */
export async function launch() {
	const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
	const newContext = browser.newContext.bind(browser);
	browser.newContext = async (...args) => {
		const context = await newContext(...args);
		await context.addInitScript(pretendPointerLock);
		return context;
	};
	return browser;
}

export function freePort() {
	return new Promise((res) => {
		const s = createServer();
		s.listen(0, '127.0.0.1', () => {
			const p = s.address().port;
			s.close(() => res(p));
		});
	});
}

/** Serves `folder` on a free port; resolves to { url, stop }. */
export async function serve(folder) {
	const port = await freePort();
	const child = spawn(process.execPath, [join(here, 'serve.mjs'), folder, String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
	await new Promise((res, rej) => {
		child.stdout.on('data', (d) => String(d).includes('http://') && res());
		child.on('exit', (c) => rej(new Error(`server exited ${c}`)));
	});
	return { url: `http://127.0.0.1:${port}/`, stop: () => child.kill() };
}

/** Opens the demo and waits until it says it's ready (window.__block.ready). */
export async function open(url, { width = 1280, height = 720 } = {}) {
	const browser = await launch();
	const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
	const errors = [];
	page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`${m.type()}: ${m.text()}`));
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
	page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));
	await page.goto(url);
	await page.waitForFunction(() => window.__block?.ready, null, { timeout: 120000 }).catch(() => errors.push('never ready'));
	return { browser, page, errors };
}
