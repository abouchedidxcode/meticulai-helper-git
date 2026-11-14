// Writes recipe.json, the destruction block's demo recipe (mode browser + block): `node make-recipe.mjs`.
// demo.ts reads its controls from that file.
//
// For people (blendi's standards, 2026-10-31): one way to choose (the structure, each with its picture), a few plain
// essentials (weld strength, cannonball size, speed), and Rebuild; clicking in the frame fires, so there's no Fire
// button. Everything else (ball speed, density, friction, gravity, solver iterations, keep firing, camera shake) is
// for agents, in this recipe with its range and default.
//
// Every structure option has its picture, thumbs/structures/<id>.webp: a still of it standing, captured from the built
// demo (make-thumbs.mjs) and kept in this repo. `--no-images` leaves them out.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const images = !process.argv.includes('--no-images');
// The sounds' credits, from what make-audio.mjs built: one entry per recording, with the takes it went into.
const spec = JSON.parse(fs.readFileSync(path.join(here, 'audio-build/layers.json'), 'utf8'));
const soundCredits = Object.entries(spec.sources).map(([id, s]) => {
	const takes = spec.layers.flatMap((l) => l.takes.flatMap((t, k) => (t.src === id ? [`audio/${l.name}_${k + 1}`] : [])));
	return { files: takes.join(', '), license: s.license, source: s.page, author: `${s.author} (${s.title}; cut and levelled by Patch)` };
});
export const structures = [
	['barn', 'Timber barn'],
	['tower', 'Water tower'],
	['wall', 'Garden wall'],
	['chimney', 'Brick chimney'],
];

const recipe = {
	mode: 'browser',
	block: {
		controls: [
			{
				id: 'structure',
				label: 'Structure',
				hint: 'What stands in the yard to knock down: a timber-framed barn, a steel water tower, a brick wall or a chimney.',
				type: 'choice',
				options: structures.map(([value, label]) => ({ value, label, ...(images ? { image: `thumbs/structures/${value}.webp` } : {}) })),
				default: 'barn',
				essential: true,
			},
			{ id: 'strength', label: 'Weld strength', hint: 'How strong the welds holding the pieces together are, against what each one carries standing. Rebuilds the structure.', type: 'number', min: 0.4, max: 4, step: 0.05, default: 1, unit: '×', essential: true },
			{ id: 'ball', label: 'Cannonball', hint: 'How big the iron cannonball is (its radius): 12 cm is 56 kg, and twice that is eight times as heavy and hits far harder.', type: 'number', min: 0.06, max: 0.35, step: 0.01, default: 0.12, unit: 'm', essential: true },
			{ id: 'speed', label: 'Speed', hint: 'How fast time runs: below 1 is slow motion.', type: 'number', min: 0.1, max: 1, step: 0.05, default: 1, unit: '×', essential: true },
			{ id: 'power', label: 'Ball speed', hint: 'How fast the cannonball flies when it is fired.', type: 'number', min: 20, max: 90, step: 1, default: 55, unit: 'm/s' },
			{ id: 'density', label: 'Density', hint: "Every material's density, scaled: heavier pieces load their welds more and hit harder when they fall. Rebuilds the structure.", type: 'number', min: 0.25, max: 4, step: 0.05, default: 1, unit: '×' },
			{ id: 'friction', label: 'Friction', hint: "Every material's friction, scaled: low and rubble slides apart, high and it piles up. Rebuilds the structure.", type: 'number', min: 0.2, max: 2, step: 0.05, default: 1, unit: '×' },
			{ id: 'gravity', label: 'Gravity', hint: 'How hard everything is pulled down once the structure stands. Welds are set for 9.81, so more brings a weak structure down on its own.', type: 'number', min: 1, max: 20, step: 0.1, default: 9.81, unit: 'm/s²' },
			{ id: 'iterations', label: 'Solver iterations', hint: 'Solver passes a step: fewer is cheaper and softer, more is stiffer.', type: 'number', min: 4, max: 20, step: 1, default: 12 },
			{ id: 'auto', label: 'Keep firing', hint: 'Fires at the structure every two seconds by itself, and rebuilds it once it is down, until turned off.', type: 'toggle', default: false },
			{ id: 'shake', label: 'Camera shake', hint: 'Whether the camera shakes when a ball is fired and things land.', type: 'toggle', default: true },
		],
		presets: [],
		// Clicking in the frame fires a cannonball, so Rebuild is the only trigger.
		triggers: [{ id: 'rebuild', label: 'Rebuild', hint: 'Puts the structure back up, whole, and clears away the rubble and cannonballs.' }],
	},
	credits: [
		{ files: 'assets/', license: 'MIT', source: 'https://github.com/sbobyn/three-avbd', author: 'Steven Bobyn (three-avbd, the physics: commit cd3ce90)' },
		{ files: 'assets/', license: 'MIT', source: 'https://github.com/savant117/avbd-demo3d', author: "Chris Giles (avbd-demo2d and avbd-demo3d, ported in three-avbd)" },
		{ files: 'assets/', license: 'MIT', source: 'https://github.com/sbobyn/three-voxel-destruction', author: 'Steven Bobyn (the sky and particles, from three-voxel-destruction by way of Brickfall)' },
		{ files: 'assets/', license: 'MIT', source: 'https://github.com/mrdoob/three.js', author: 'three.js authors' },
		{ files: 'textures/', license: 'CC0-1.0', source: 'https://polyhaven.com/textures', author: 'Poly Haven (rough_wood, fine_grained_wood, clay_roof_tiles_02, rock_surface, rough_concrete, rusty_metal_sheet, leafy_grass, gravel_floor, bark_brown_02)' },
		{ files: 'textures/leaf_cluster.webp', license: 'CC0-1.0', source: 'https://ambientcg.com/view?id=LeafSet004', author: 'ambientCG (LeafSet004, cut into a leaf-cluster card)' },
		{ files: 'textures/grass_tuft.webp', license: 'CC0-1.0', source: 'https://ambientcg.com/view?id=Foliage001', author: 'ambientCG (Foliage001 and Foliage006 grass blades, composed into a tuft card)' },
		{ files: 'hdri/', license: 'CC0-1.0', source: 'https://polyhaven.com/a/qwantani_late_afternoon_puresky', author: 'Poly Haven (Qwantani late afternoon, puresky, 1k)' },
		{ files: 'thumbs/', license: 'CC0-1.0', author: 'Patch (stills of this demo)' },
		...soundCredits,
	],
};
// (Written only when run, not when make-thumbs.mjs imports the structures from here)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	fs.writeFileSync(path.join(here, 'recipe.json'), `${JSON.stringify(recipe, null, '\t')}\n`);
	const c = recipe.block.controls;
	console.log(`recipe.json: ${c.length} controls (${c.filter((x) => x.essential).length} essential), ${recipe.block.presets.length} presets, ${recipe.block.triggers.length} triggers`);
}
