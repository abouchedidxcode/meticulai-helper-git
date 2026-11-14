// Writes recipe.json, the block demo's recipe (mode browser + block): `node make-recipe.mjs`. demo.js reads its controls
// from that file, and the README's controls section comes from the same list.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const TYPES = [
	['candle', 'Candle', 'Small flames'],
	['torch', 'Torch', 'Small flames'],
	['gas', 'Gas jet', 'Small flames'],
	['campfire', 'Campfire', 'Fires you tend'],
	['brazier', 'Brazier', 'Fires you tend'],
	['fireplace', 'Fireplace', 'Fires you tend'],
	['bonfire', 'Bonfire', 'Big fires'],
	['crate', 'Burning crate', 'Big fires'],
	['line', 'Fire line', 'Big fires'],
];
const images = !process.argv.includes('--no-images') && fs.existsSync(path.join(here, 'thumbs/types/campfire.webp'));

const recipe = {
	mode: 'browser',
	block: {
		controls: [
			{
				id: 'type',
				label: 'Fire',
				hint: 'Which fire. Each is shaped by what is burning, from a candle wick to a tall stack of logs.',
				type: 'choice',
				options: TYPES.map(([value, label, group]) => ({ value, label, group, ...(images ? { image: `thumbs/types/${value}.webp` } : {}) })),
				default: 'campfire',
				essential: true,
			},
			{ id: 'size', label: 'Size', hint: 'How big the whole fire is, against what this type starts at.', type: 'number', min: 0.4, max: 2, step: 0.05, default: 1, unit: '×', essential: true },
			{ id: 'intensity', label: 'Intensity', hint: 'How hard it burns: low red embers of a flame at one end, a roaring yellow one at the other. Height, colour, sparks and light move together.', type: 'number', min: 0.3, max: 1.6, step: 0.05, default: 1, essential: true },
			{ id: 'wind', label: 'Wind', hint: 'Bends the flames, smoke and sparks over and stirs them harder, in gusts.', type: 'number', min: 0, max: 1, step: 0.02, default: 0, essential: true },
			{ id: 'direction', label: 'Wind direction', hint: 'Where the wind blows to, in degrees round the fire.', type: 'number', min: 0, max: 360, step: 5, default: 335, unit: '°' },
			{ id: 'smoke', label: 'Smoke', hint: 'How thick the smoke is. 0 turns it off and saves its share of the cost.', type: 'number', min: 0, max: 3, step: 0.05, default: 1 },
			{ id: 'embers', label: 'Sparks', hint: 'How many sparks rise from the fire, against what the type starts with.', type: 'number', min: 0, max: 1.6, step: 0.05, default: 1, unit: '×' },
			{ id: 'light', label: 'Light', hint: 'How strongly the fire lights what is around it.', type: 'number', min: 0, max: 2.5, step: 0.05, default: 1, unit: '×' },
			{ id: 'speed', label: 'Speed', hint: 'How fast the flames move.', type: 'number', min: 0.25, max: 2, step: 0.05, default: 1, unit: '×' },
			{
				id: 'resolution',
				label: 'Fire resolution',
				hint: "The fire's pixels against the screen's. Half suits a game, third is for weak graphics cards, and full is finest up close at about 3 times the cost.",
				type: 'choice',
				options: [
					{ value: 'half', label: 'Half' },
					{ value: 'third', label: 'Third' },
					{ value: 'full', label: 'Full' },
				],
				default: 'half',
			},
			{ id: 'dressing', label: 'Show the dressing', hint: 'The logs, stones, torch and wall. They are not part of the effect.', type: 'toggle', default: true },
			{ id: 'bloom', label: 'Bloom', hint: 'The glow round the hottest parts.', type: 'number', min: 0, max: 1, step: 0.02, default: 0.3 },
			{ id: 'exposure', label: 'Exposure', hint: 'How bright the whole picture is.', type: 'number', min: 0.3, max: 1.5, step: 0.01, default: 0.72 },
			{ id: 'turn', label: 'Turn the view', hint: 'Slowly turns the view around the fire until turned off.', type: 'toggle', default: false },
		],
		presets: [],
		triggers: [
			{ id: 'stoke', label: 'Stoke', hint: 'The fire flares up for a couple of seconds and throws up a burst of sparks. Clicking the fire does the same.' },
			{ id: 'reset', label: 'Reset', hint: 'Everything back to the start: the campfire, every control at its default, and the view.' },
		],
	},
	credits: [
		{ files: 'assets/', license: 'MIT', source: 'https://github.com/mrdoob/three.js', author: 'three.js authors' },
		{ files: 'thumbs/', license: 'MIT', author: 'Patch (stills of this demo)' },
	],
};
fs.writeFileSync(path.join(here, 'recipe.json'), `${JSON.stringify(recipe, null, '\t')}\n`);
const c = recipe.block.controls;

const cell = (s) => String(s).replace(/\|/g, '\\|');
const range = (x) => (x.type === 'number' ? `${x.min} to ${x.max}${x.unit ?? ''}, default ${x.default}` : x.type === 'choice' ? `${x.options.map((o) => `\`${o.value}\``).join(', ')}; default \`${x.default}\`` : `default ${x.default}`);
const table = (rows) => ['| id | Control | Type | Range | What it does |', '|---|---|---|---|---|', ...rows.map((x) => `| \`${x.id}\` | ${x.label} | ${x.type} | ${cell(range(x))} | ${cell(x.hint)} |`)].join('\n');
const section = [
	'**For people** (the block page shows these):',
	'',
	table(c.filter((x) => x.essential)),
	'',
	`Triggers: ${recipe.block.triggers.map((x) => `\`${x.id}\` (${x.label}): ${x.hint}`).join(' ')}`,
	'',
	'**For agents** (steer them over the channel):',
	'',
	table(c.filter((x) => !x.essential)),
].join('\n');
const readme = path.join(here, 'README.md');
if (fs.existsSync(readme)) fs.writeFileSync(readme, fs.readFileSync(readme, 'utf8').replace(/<!-- controls -->[\s\S]*<!-- \/controls -->/, () => `<!-- controls -->\n${section}\n<!-- /controls -->`));
console.log(`recipe.json: ${c.length} controls (${c.filter((x) => x.essential).length} essential), ${recipe.block.triggers.length} triggers`);
