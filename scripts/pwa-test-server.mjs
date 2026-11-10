// Serve two actual static builds, switching only after the test publishes build B.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

let revision = 'a';
let volatile = 0;
const types = {
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.html': 'text/html',
	'.svg': 'image/svg+xml',
	'.wasm': 'application/wasm',
};
createServer(async (req, res) => {
	const pathname = new URL(req.url, 'http://localhost').pathname;
	if (pathname === '/__pwa_test__/publish' && req.method === 'POST') {
		revision = 'b';
		res.writeHead(204).end();
		return;
	}
	if (pathname === '/__pwa_test__/volatile') {
		res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
		res.end(JSON.stringify({ value: ++volatile }));
		return;
	}
	const root = resolve('.pwa-test', revision);
	let file;
	try {
		file = resolve(root, '.' + decodeURIComponent(pathname));
	} catch {
		res.writeHead(400).end();
		return;
	}
	if (file !== root && !file.startsWith(root + sep)) {
		res.writeHead(403).end();
		return;
	}
	let bytes;
	try {
		bytes = await readFile(file);
	} catch {
		file = resolve(root, 'index.html');
		bytes = await readFile(file);
	}
	res.writeHead(200, {
		'Content-Type': types[extname(file)] ?? 'application/octet-stream',
		'Cache-Control': 'no-store',
	});
	res.end(bytes);
}).listen(4176, '127.0.0.1');
