// Serves a folder as the game host does: static files, nothing else.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 5373);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.exr': 'application/octet-stream', '.wasm': 'application/wasm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
createServer(async (req, res) => {
	try {
		let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
		if (path.endsWith('/')) path += 'index.html';
		const file = normalize(join(root, path));
		if (!file.startsWith(root)) throw new Error('outside');
		const body = await readFile(file);
		res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
		res.end(body);
	} catch {
		res.writeHead(404, { 'Content-Type': 'text/plain' });
		res.end('Not found');
	}
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/`));
