import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ContinuationError, getContinuation } from './continuationApi';
import type { PublicContinuation } from './rematchTypes';

// The frozen public projections from play-api's `contracts/rematch-v1.json` — the same fixtures
// `RematchWireSuite` checks the production encoders against. A spectator only ever sees these:
// no consent identity, no closure reason, and above all no join data.
const PUBLIC_MATCHED: PublicContinuation = {
	sourceGameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
	serverNow: '2026-09-07T12:00:20Z',
	phase: 'matched',
	nextGameId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
};

const PUBLIC_WAITING: PublicContinuation = {
	sourceGameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
	serverNow: '2026-09-07T12:00:20Z',
	phase: 'waiting',
	deadlineAt: '2026-09-07T12:00:29Z',
};

describe('continuationApi', () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.unstubAllEnvs();
	});

	it('reads the public continuation without any credential', async () => {
		let capturedUrl = '';
		let capturedInit: RequestInit | undefined;
		globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			capturedUrl = String(url);
			capturedInit = init;
			return new Response(JSON.stringify(PUBLIC_MATCHED), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		});

		const res = await getContinuation('game-123');

		expect(capturedUrl).toBe('http://localhost:8080/games/game-123/continuation');
		expect(capturedInit?.method).toBe('GET');
		// The whole point of the spectator half of the contract: an account cookie belonging to a
		// player of the watched game must not be able to turn this into a participant's read.
		expect(capturedInit?.credentials).toBe('omit');
		expect(capturedInit?.headers).toBeUndefined();
		expect(capturedInit?.signal).toBeDefined();
		expect(res).toEqual(PUBLIC_MATCHED);
	});

	it('encodes the game id into the path', async () => {
		let capturedUrl = '';
		globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
			capturedUrl = String(url);
			return new Response(JSON.stringify(PUBLIC_WAITING), { status: 200 });
		});

		await getContinuation('a b/c');

		expect(capturedUrl).toBe('http://localhost:8080/games/a%20b%2Fc/continuation');
	});

	it('marks an unknown game permanent and a server failure transient', async () => {
		globalThis.fetch = vi.fn(async () => new Response('', { status: 404 }));
		await expect(getContinuation('missing')).rejects.toThrow(ContinuationError);
		await getContinuation('missing').catch((e) => {
			const err = e as ContinuationError;
			expect(err.status).toBe(404);
			expect(err.isPermanent).toBe(true);
		});

		globalThis.fetch = vi.fn(async () => new Response('', { status: 503 }));
		await getContinuation('flaky').catch((e) => {
			const err = e as ContinuationError;
			expect(err.status).toBe(503);
			expect(err.isPermanent).toBe(false);
		});
	});
});
