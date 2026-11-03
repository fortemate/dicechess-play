import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyRulesVersion } from './verify-rules-version.mjs';

const build = (version) => `val DiceChessRulesVersion     = "${version}"`;

test('allows patch differences within the same rules minor', () => {
	assert.match(verifyRulesVersion('0.15.1', '0.15.1', build('0.15.0')), /aligned/);
});

test('rejects a different minor or major', () => {
	for (const version of ['0.14.5', '0.16.0', '1.15.0']) {
		assert.throws(() => verifyRulesVersion('0.15.0', '0.15.0', build(version)), /mismatch/);
	}
});

test('requires an exact dependency pin and readable stable versions', () => {
	assert.throws(() => verifyRulesVersion('0.15.0', '^0.15.0', build('0.15.0')), /exactly pinned/);
	for (const source of ['', build('0.15.0-SNAPSHOT')]) {
		assert.throws(() => verifyRulesVersion('0.15.0', '0.15.0', source), /Could not read/);
	}
});
