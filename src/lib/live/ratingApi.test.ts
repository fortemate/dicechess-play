import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchGameRatingChange, type GameRatingChange } from './ratingApi';

describe('ratingApi', () => {
	beforeEach(() => vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080'));
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	const applied: GameRatingChange = {
		gameId: 'game-1',
		applied: true,
		// The exact numbers from the production report (#235), where this pair was rendered as a
		// LOSS after a win because the two sides came from different games.
		white: { before: 1775.6714474976957, after: 1797.2144251082318 },
		black: { before: 1601.5, after: 1580.25 },
	};

	it('GETs the encoded gameId and returns both seats, unrounded', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue({ ok: true, status: 200, json: async () => applied });
		vi.stubGlobal('fetch', fetchMock);
		expect(await fetchGameRatingChange('game 1/../etc')).toEqual(applied);
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:8080/games/game%201%2F..%2Fetc/rating',
		);
	});

	it('carries a pending answer through as-is — the caller polls on `applied`', async () => {
		const pending: GameRatingChange = {
			gameId: 'game-1',
			applied: false,
			white: null,
			black: null,
		};
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => pending }),
		);
		expect(await fetchGameRatingChange('game-1')).toEqual(pending);
	});

	it('resolves null on 404 — a permanent absence a poller must stop on, not a "not yet"', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
		expect(await fetchGameRatingChange('missing')).toBeNull();
	});

	it('throws on any other failure, so a transient blip stays retryable', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
		await expect(fetchGameRatingChange('game-1')).rejects.toThrow(
			'fetchGameRatingChange failed: 503',
		);
	});
});
