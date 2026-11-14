// The block's demo page. This file is the light part: it answers Patch's block page at once (through Patch's
// helper, lib/patch-block.js, from patch.gg/patch-block.js), then loads the demo itself behind the loading bar.
// The controls are in recipe.json.
import { patchBlock } from 'patch-block';
import { block as recipeBlock } from '../../recipe.json';
import type { App, Values } from './app.ts';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const cover = document.getElementById('cover')!;
const trouble = document.getElementById('trouble')!;
const params = new URLSearchParams(location.search);

function sorry(why: string): void {
	trouble.querySelector('small')!.textContent = why;
	trouble.classList.add('on');
}

async function main(): Promise<void> {
	let app: App | null = null;
	const block = patchBlock({
		...recipeBlock,
		onSet(id: string, value: number | boolean | string) {
			values[id] = value;
			app?.set(id, value);
		},
		onTrigger(id: string) {
			app?.trigger(id);
		},
		onVisible(on: boolean) {
			if (app) app.visible = on;
		},
	});
	const values = { ...block.values } as Values;
	// when each step of the warm-up was reached (ms from the page's start), for scripts/cold.mjs and page-visit.mjs
	const times: Record<string, number> = {};
	const boot: string[] = [];
	const say = (share: number, words: string) => {
		if (boot.at(-1)?.split(' @')[0] !== words) boot.push(`${words} @${(performance.now() / 1000).toFixed(2)}`);
		block.progress(share, words);
	};
	say(0.02, 'Loading');
	try {
		if (!('gpu' in navigator)) sorry('No WebGPU in this browser.');
		else {
			const code = await import('./app.ts');
			app = await code.App.create(canvas, values, say);
			// (the page's own checks step the demo by hand, with ?test)
			if (!params.has('test')) app.run();
		}
	} catch (e) {
		console.warn(e);
		sorry(e instanceof Error ? e.message : String(e));
	}
	cover.remove();
	if (params.has('nohud')) document.body.classList.add('hud-off');
	block.ready();
	times.ready = Math.round(performance.now());
	const w = window as unknown as { __block: unknown; __demo: unknown };
	w.__block = { app, values, block, times, boot, ready: true };
	// what the checks in scripts/ drive
	w.__demo = app && { ...app, renderer: app.renderer, scene: app.scene, camera: app.camera, world: app.world, player: app.player, props: app.props, frame: (dt: number, input?: App['input']) => app!.frame(dt, input), restart: () => app!.restart(), set: (id: string, v: number | boolean | string) => app!.set(id, v), ready: true };
}

void main();
