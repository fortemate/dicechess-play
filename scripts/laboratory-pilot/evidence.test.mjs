/** Keep the published preflight evidence byte-stable and aligned with the reviewed image pins. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SERVER_REVISION, IMAGES } from './configuration.mjs';

test('retained pilot evidence has valid checksums and matches the pinned compatible set', async () => {
	const directory = new URL('../../ops/laboratory-pilot/evidence/', import.meta.url);
	const bytes = await readFile(new URL('results.json', directory));
	const sums = await readFile(new URL('SHA256SUMS', directory), 'utf8');
	assert.equal(sums, `${createHash('sha256').update(bytes).digest('hex')}  results.json\n`);
	const report = JSON.parse(bytes);
	assert.equal(report.status, 'PASS');
	assert.equal(report.cleanup, 'PASS');
	assert.equal(report.publicDeployment, false);
	assert.equal(report.serverRevision, SERVER_REVISION);
	assert.deepEqual(report.images, IMAGES);
	assert.equal(report.rulesVersion, '0.18.2');
	assert.equal(report.scenarios.length, 27);
	assert.ok(report.scenarios.every((scenario) => scenario.status === 'PASS'));
	assert.match(report.clientArtifactSha256, /^[a-f0-9]{64}$/);
});
