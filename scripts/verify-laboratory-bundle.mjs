/** Check the built laboratory's entry, isolated module graph, appearance bootstrap and public assets. */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist-laboratory');
const readOutput = (name) => readFile(path.join(output, name), 'utf8');

const html = await readOutput('index.html');
const manifest = JSON.parse(await readOutput('laboratory-build.json'));
assert.match(html, /id="laboratory-appearance-bootstrap"/, 'theme bootstrap is missing');
const bootstrapPosition = html.indexOf('id="laboratory-appearance-bootstrap"');
const stylesheetPosition = html.indexOf('rel="stylesheet"');
assert.ok(
	stylesheetPosition < 0 || bootstrapPosition < stylesheetPosition,
	'theme must apply before styles paint',
);
assert.match(html, /<script[^>]+type="module"/, 'laboratory entry script is missing');
assert.equal(manifest.surface, 'laboratory');
assert.deepEqual(manifest.variant, { id: 'choice-2x2d6', revision: 1 });
assert.equal(manifest.protocolVersion, 1);
assert.ok(Array.isArray(manifest.modules) && manifest.modules.length > 0, 'source graph is empty');
assert.ok(
	manifest.modules.includes('src/laboratory/main.ts'),
	'laboratory entry is absent from graph',
);

const allowedExact = new Set([
	'src/lib/live/liveClient.ts',
	'src/lib/live/boardGrid.ts',
	'src/lib/utils/getPieceImage.ts',
]);
for (const modulePath of manifest.modules) {
	assert.equal(typeof modulePath, 'string');
	assert.ok(
		!path.isAbsolute(modulePath) && !/^[A-Za-z]:/.test(modulePath),
		'manifest leaks an absolute path',
	);
	assert.ok(
		modulePath.startsWith('src/laboratory/') ||
			modulePath.startsWith('src/lib/laboratory/') ||
			modulePath.startsWith('src/lib/paraglide/') ||
			allowedExact.has(modulePath),
		`disallowed module in laboratory bundle: ${modulePath}`,
	);
	assert.ok(
		!/(?:service-worker|workbox|src\/routes\/|src\/hooks\.|GameShell|src\/lib\/(?:ingest|stores)\/)/i.test(
			modulePath,
		),
	);
}

const assets = await readdir(output, { recursive: true });
const javascript = assets.filter((name) => name.endsWith('.js'));
assert.ok(javascript.length > 0, 'no JavaScript assets found');
for (const name of javascript) {
	assert.ok(!/service-worker|workbox/i.test(name), `service-worker asset present: ${name}`);
}

assert.equal(await readOutput('robots.txt'), 'User-agent: *\nDisallow: /\n');
assert.equal(await readOutput('_redirects'), '/* /index.html 200\n');
const headers = await readOutput('_headers');
assert.match(headers, /Referrer-Policy: no-referrer/);
assert.match(headers, /X-Robots-Tag: noindex, nofollow/);
assert.match(headers, /X-Content-Type-Options: nosniff/);
await readOutput('favicon.svg');
for (const piece of ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP']) {
	await readOutput(`pieces/cburnett/${piece}.svg`);
}

console.log(`Laboratory bundle verified (${manifest.modules.length} source modules).`);
