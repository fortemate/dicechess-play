// Post-build smoke test for the BUNDLED engine (issue #185).
//
// Every move on both surfaces goes through `DiceChess.applyMove`; a falsy return is read as
// "illegal move" and the piece snaps back. The engine is a Scala.js artifact, so a bundler or
// minifier that miscompiles it takes the whole site down while every other gate stays green:
// vitest never bundles (it imports the package straight from node_modules) and `vite build`
// itself exits 0 on a miscompile. rolldown 1.1.5 did exactly this — `applyMove` returned
// undefined for every move in the minified output and production shipped unplayable.
//
// So this check runs against `dist/` after the build, not against the source, and asserts the
// one property the site cannot live without: the bundled engine can apply a legal move.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHUNK_DIR = 'dist/_app/immutable/chunks';
const START_DFEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 PNB';
const EXPECTED_E2E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e3 0 1';

function fail(message) {
	console.error(`✗ bundled engine check failed: ${message}`);
	process.exit(1);
}

let chunks;
try {
	chunks = readdirSync(CHUNK_DIR).filter((f) => f.endsWith('.js'));
} catch {
	fail(`no ${CHUNK_DIR} — run \`npm run build\` first`);
}

// The chunk name is content-hashed, so find it by content rather than by name.
const candidates = chunks.filter((f) =>
	readFileSync(join(CHUNK_DIR, f), 'utf8').includes('getLegalUciMoves'),
);
if (candidates.length === 0) fail('no chunk contains the engine — did the bundle layout change?');

// A chunk re-exports the engine under a minified alias, so probe every export for the API shape.
let engine = null;
for (const file of candidates) {
	const module = await import(pathToFileURL(join(process.cwd(), CHUNK_DIR, file)).href);
	for (const value of Object.values(module)) {
		if (typeof value?.applyMove === 'function' && typeof value?.getLegalUciMoves === 'function') {
			engine = value;
			break;
		}
	}
	if (engine) break;
}
if (!engine) fail('the engine API is not reachable from any chunk export');

const legal = engine.getLegalUciMoves(START_DFEN) ?? [];
if (!legal.includes('e2e4')) {
	fail(`getLegalUciMoves lost e2e4 from the start position — got ${JSON.stringify(legal)}`);
}

const applied = engine.applyMove(START_DFEN, 'e2', 'e4', undefined);
if (!applied) fail('applyMove returned undefined for e2e4 — the bundler miscompiled the engine');
if (applied !== EXPECTED_E2E4) fail(`applyMove returned an unexpected position: ${applied}`);

console.log('✓ bundled engine applies a legal move');
