import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchGameHistory, type GameHistory } from './historyApi';

describe('historyApi', () => {
	beforeEach(() => vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080'));
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	const fixture: GameHistory = {
		gameId: 'game-1',
		players: { white: { kind: 'Bot', name: 'house greedy' }, black: { kind: 'Human', name: null } },
		rated: true,
		timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } },
		result: 1,
		termination: 'king_captured',
		finishedAt: '2026-07-31T06:23:32.847668Z',
		initialDfen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
		turns: [
			{
				turnNumber: 1,
				activeColor: 'White',
				dice: [1, 1, 4],
				moves: ['e2e4'],
				fenAfter: 'fen-after',
			},
		],
		fairness: {
			commit: 'c0ffee',
			seed: 'deadbeef',
			clientSeeds: { white: 'w-seed', black: 'b-seed' },
		},
	};

	it('GETs the encoded gameId and returns the parsed history', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue({ ok: true, status: 200, json: async () => fixture });
		vi.stubGlobal('fetch', fetchMock);
		expect(await fetchGameHistory('game 1/../etc')).toEqual(fixture);
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:8080/games/game%201%2F..%2Fetc/history',
		);
	});

	it('resolves null on 404 — the caller renders an explicit "history unavailable" state', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
		vi.stubGlobal('fetch', fetchMock);
		expect(await fetchGameHistory('missing')).toBeNull();
	});

	it('throws on any other failure — distinct from the 404 "unavailable" state', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
		vi.stubGlobal('fetch', fetchMock);
		await expect(fetchGameHistory('game-1')).rejects.toThrow('fetchGameHistory failed: 500');
	});
});
