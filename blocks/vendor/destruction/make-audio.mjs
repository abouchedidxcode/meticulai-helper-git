// Builds the demo's sound layers from CC0 and CC-BY recordings, the way Timberfall's are built: each take cut, trimmed
// to its onset, made mono, faded, brought to its layer's loudness and limited. audio-build/layers.json says what goes
// where (source, licence, author, cut, any EQ); this writes public/audio/<layer>_<k>.ogg|m4a, src/audio/layers.ts, and
// the credits list in audio-build/credits.txt (copied into CREDITS.txt by hand). Needs ffmpeg. `node make-audio.mjs [layer...]`
//
// The originals aren't kept here: each is fetched from its source once, into .audio-cache/ (not in git).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(fs.readFileSync(path.join(here, 'audio-build/layers.json'), 'utf8'));
const CACHE = path.join(here, '.audio-cache');
const OUT = path.join(here, 'public/audio');
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

const ffmpeg = (args) => {
	const r = spawnSync('ffmpeg', ['-v', 'error', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
	if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${r.stderr}`);
	return r;
};

/** The loudest `win` seconds' RMS, in dB (a one-shot's loudness, as its layer's target is given). */
function loudest(file, win) {
	const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
	const d = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4));
	const n = Math.max(1, Math.min(d.length, Math.round(win * 44100)));
	let sum = 0;
	let best = 0;
	let peak = 0;
	for (let i = 0; i < d.length; i++) {
		sum += d[i] * d[i];
		if (i >= n) sum -= d[i - n] * d[i - n];
		best = Math.max(best, sum);
		peak = Math.max(peak, Math.abs(d[i]));
	}
	return { db: 10 * Math.log10(Math.max(best / n, 1e-12)), peak: 20 * Math.log10(Math.max(peak, 1e-6)) };
}

async function fetchOnce(url) {
	const file = path.join(CACHE, `${createHash('sha256').update(url).digest('hex').slice(0, 24)}${path.extname(new URL(url).pathname) || '.bin'}`);
	if (!fs.existsSync(file)) {
		let r = await fetch(url, { headers: { 'user-agent': 'patch-block/1.0 (https://patch.gg)' } });
		for (let wait = 15; r.status === 429 && wait < 200; wait *= 2) {
			await new Promise((done) => setTimeout(done, wait * 1000));
			r = await fetch(url, { headers: { 'user-agent': 'patch-block/1.0 (https://patch.gg)' } });
		}
		if (!r.ok) throw new Error(`${url}: ${r.status}`);
		fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
	}
	return file;
}

const tmp = path.join(CACHE, 'work');
fs.mkdirSync(tmp, { recursive: true });
const report = [];
// Each take's trim (dB): what limiting took off its loudest moment, given back when it plays (so takes of a layer play at
// one loudness, however sharp they are)
const trims = fs.existsSync(path.join(here, 'audio-build/trims.json')) ? JSON.parse(fs.readFileSync(path.join(here, 'audio-build/trims.json'), 'utf8')) : {};
for (const layer of spec.layers) {
	if (only.length && !only.includes(layer.name)) continue;
	let k = 0;
	for (const take of layer.takes) {
		k++;
		const src = await fetchOnce(spec.sources[take.src].file);
		const cut = path.join(tmp, `${layer.name}_${k}_cut.wav`);
		const fade = take.fade ?? layer.fade ?? 0.2;
		const filters = ['aresample=44100', 'pan=mono|c0=0.5*c0+0.5*c1', ...(take.af ?? layer.af ?? [])];
		if (take.onset !== false) filters.push('silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.004');
		filters.push('afade=t=in:d=0.002', `afade=t=out:st=${Math.max(0.03, take.t - fade)}:d=${fade}:curve=qsin`);
		ffmpeg(['-y', '-ss', String(take.ss), '-t', String(take.t + 0.3), '-i', src, '-af', filters.join(','), '-t', String(take.t), '-c:a', 'pcm_f32le', cut]);
		const m = loudest(cut, layer.window ?? 0.1);
		const gain = Math.min(layer.target - m.db, 30);
		const base = path.join(OUT, `${layer.name}_${k}`);
		const done = path.join(tmp, `${layer.name}_${k}.wav`);
		ffmpeg(['-y', '-i', cut, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.82:attack=1:release=60:level=disabled`, '-c:a', 'pcm_f32le', done]);
		ffmpeg(['-y', '-i', done, '-c:a', 'libvorbis', '-q:a', '4', `${base}.ogg`]);
		ffmpeg(['-y', '-i', done, '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', `${base}.m4a`]);
		const after = loudest(`${base}.ogg`, layer.window ?? 0.1);
		trims[`${layer.name}_${k}`] = +Math.min(14, Math.max(0, layer.target - after.db)).toFixed(1);
		report.push(`${`${layer.name}_${k}`.padEnd(18)} gain ${gain.toFixed(1).padStart(6)}  loudest ${after.db.toFixed(1).padStart(6)}  peak ${after.peak.toFixed(1).padStart(5)}  ${take.src}`);
	}
}
console.log(report.join('\n'));

const layers = Object.fromEntries(spec.layers.map((l) => [l.name, l.takes.length]));
const trim = Object.fromEntries(Object.entries(trims).filter(([, db]) => db >= 0.3));
fs.writeFileSync(path.join(here, 'audio-build/trims.json'), `${JSON.stringify(trims, null, 1)}
`);
fs.writeFileSync(
	path.join(here, 'src/audio/layers.ts'),
	`// Written by make-audio.mjs from audio-build/layers.json.\n\n/** Which recorded layers there are, and how many takes of each (audio/<name>_<k>.ogg|m4a). */\nexport const LAYERS: Record<string, number> = ${JSON.stringify(layers, null, 2)};\n\n/** Per-take trims (dB). */\nexport const TRIM: Record<string, number> = ${JSON.stringify(trim, null, 2)};\n`,
);

// Credits: everyone whose recording is used, and what for
const used = new Map();
for (const l of spec.layers) for (const t of l.takes) used.set(t.src, [...(used.get(t.src) ?? []), l.name]);
const lines = [...used].map(([id, names]) => {
	const s = spec.sources[id];
	return `  ${s.title} by ${s.author}, ${s.license}: ${s.page}\n    used in: ${[...new Set(names)].join(', ')}`;
});
fs.writeFileSync(path.join(here, 'audio-build/credits.txt'), `${lines.join('\n')}\n`);
