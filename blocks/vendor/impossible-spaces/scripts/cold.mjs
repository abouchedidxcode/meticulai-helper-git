// A first visit: a new browser profile each run, so the network and shader caches are empty, with the page's CPU and
// the network slowed to a normal laptop's (4x CPU, 30 Mbit/s, 40 ms). Prints how long `ready` took, what was
// downloaded, and what the first moments after ready are like: idle, then every room straight away, as someone
// impatient would. (After tools/cold.mjs in patch/geometry-painter.)
//
//   node scripts/cold.mjs <url> [runs, default 1] [--cpu=4] [--mbit=30]
//
// Muted, headless Chromium with WebGPU, with a pretend pointer lock. Other work on the graphics card slows compiling
// a lot, so run it alone.
import { launch } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const hit = args.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3) : fallback;
};
const [url, runs = '1'] = args.filter((a) => !a.startsWith('--'));
const cpu = Number(flag('cpu', '4'));
const mbit = Number(flag('mbit', '30'));

for (let run = 1; run <= Number(runs); run++) {
	const browser = await launch();
	const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
	await page.addInitScript(() => {
		const frames = { last: 0, slow: [], long: [] };
		window.__frames = frames;
		const tick = (now) => {
			if (frames.last && now - frames.last > 50) frames.slow.push(Math.round(now - frames.last) + '@' + (now / 1000).toFixed(2));
			frames.last = now;
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
		try {
			new PerformanceObserver((l) => {
				for (const e of l.getEntries()) frames.long.push(Math.round(e.duration) + '@' + (e.startTime / 1000).toFixed(2));
			}).observe({ entryTypes: ['longtask'] });
		} catch {}
	});
	const cdp = await context.newCDPSession(page);
	await cdp.send('Network.enable');
	let bytes = 0;
	cdp.on('Network.loadingFinished', (e) => (bytes += e.encodedDataLength));
	await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: (mbit * 1e6) / 8, uploadThroughput: 10e6 / 8 });
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
	const started = Date.now();
	await page.goto(url);
	await page.waitForFunction(() => window.__block?.ready, null, { timeout: 180000, polling: 50 });
	const ready = (Date.now() - started) / 1000;
	const loading = await page.evaluate(() => ({ slow: window.__frames.slow.splice(0), long: window.__frames.long.splice(0), boot: window.__block.boot }));
	await page.waitForTimeout(3000);
	const idle = await page.evaluate(() => window.__frames.slow.splice(0));
	const steps = {};
	for (const room of ['hut', 'corridor', 'stairs', 'wall', 'table', 'tunnel']) {
		await page.evaluate((r) => window.__block.app.set('room', r), room);
		await page.waitForTimeout(700);
		steps[room] = await page.evaluate(() => window.__frames.slow.splice(0));
	}
	await page.evaluate(() => window.__block.app.trigger('ball'));
	await page.waitForTimeout(700);
	steps.ball = await page.evaluate(() => window.__frames.slow.splice(0));
	const worst = (list) => Math.max(0, ...list.map((s) => Number(s.split('@')[0])));
	console.log(`run ${run}: ready in ${ready.toFixed(1)} s at ${cpu}x CPU, ${mbit} Mbit/s; downloaded ${(bytes / 1048576).toFixed(1)} MB`);
	console.log(`  warm-up: ${loading.boot.join(', ')}`);
	console.log(`  while loading: longest task ${worst(loading.long)} ms, longest gap between frames ${worst(loading.slow)} ms (${loading.slow.length} over 50 ms)`);
	console.log(`  3 s after ready: frames over 50 ms: ${idle.join(' ') || 'none'}`);
	console.log(`  then each room and the ball: ${Object.entries(steps).map(([k, v]) => `${k} ${v.join(' ') || 'none'}`).join('; ')}`);
	if (errors.length) console.log('  ERRORS', [...new Set(errors)].join(' | '));
	await browser.close();
}
