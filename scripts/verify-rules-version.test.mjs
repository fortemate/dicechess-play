import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchServerBuild, verifyRulesVersion } from './verify-rules-version.mjs';

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

test('retries 429, 5xx and network/body errors with bounded backoff', async () => {
	for (const failure of [429, 503, new Error('Network unavailable'), 'body']) {
		let calls = 0;
		const delays = [];
		const result = await fetchServerBuild(
			async (_url, init) => {
				assert.ok(init.signal instanceof AbortSignal);
				if (++calls === 3) return new Response(build('0.15.0'));
				if (failure instanceof Error) throw failure;
				if (failure === 'body')
					return {
						ok: true,
						text: async () => {
							throw new Error('Body interrupted');
						},
					};
				return new Response('', { status: failure });
			},
			async (ms) => {
				delays.push(ms);
			},
		);
		assert.equal(result, build('0.15.0'));
		assert.equal(calls, 3);
		assert.deepEqual(delays, [1000, 2000]);
	}
});

test('fails after bounded retries and does not retry permanent HTTP errors', async () => {
	for (const failure of [429, 503, 404, new Error('Offline')]) {
		let calls = 0;
		await assert.rejects(
			fetchServerBuild(
				async () => {
					calls++;
					if (failure instanceof Error) throw failure;
					return new Response('', { status: failure });
				},
				async () => {},
			),
			failure instanceof Error ? /Offline/ : new RegExp(`HTTP ${failure}`),
		);
		assert.equal(calls, failure === 404 ? 1 : 3);
	}
});

test('a successful fetch with mismatched rules still fails version verification', async () => {
	let calls = 0;
	const source = await fetchServerBuild(async () => {
		calls++;
		return new Response(build('0.16.0'));
	});
	assert.throws(() => verifyRulesVersion('0.15.0', '0.15.0', source), /mismatch/);
	assert.equal(calls, 1);
});
