import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveGame } from '#lib/live/liveTypes.js';

// The feed of the Arena live list (#260): one read of the listing at a time, and nothing else.
const api = vi.hoisted(() => ({ listGames: vi.fn(), listSeeks: vi.fn(), seekStatus: vi.fn() }));
vi.mock('#lib/live/lobbyApi.js', () => api);

import { LIVE_LIST_POLL_MS, LiveGamesFeed } from './liveGamesFeed.svelte';

const game = (gameId: string): LiveGame => ({
	gameId,
	players: null,
	timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } },
	activeSeat: 'White',
	dicePending: false,
	clocks: null,
	version: 1,
});

describe('LiveGamesFeed', () => {
	let feed: LiveGamesFeed;
	let stop: () => void;
	const begin = async () => {
		stop = feed.start();
		await vi.advanceTimersByTimeAsync(0);
	};
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('fetch', vi.fn());
		api.listGames.mockReset().mockResolvedValue({ games: [game('a'), game('b')], total: 70 });
		feed = new LiveGamesFeed();
	});
	afterEach(() => {
		stop?.();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('reads the listing and keeps the total apart from the page it received', async () => {
		await begin();
		expect(feed.loaded).toBe(true);
		expect(feed.games.map((g) => g.gameId)).toEqual(['a', 'b']);
		expect(feed.total).toBe(70);
	});

	it('asks for the listing only: no request per game, however many are listed', async () => {
		api.listGames.mockResolvedValue({
			games: Array.from({ length: 50 }, (_, i) => game(`g${i}`)),
			total: 100,
		});
		await begin();
		await vi.advanceTimersByTimeAsync(LIVE_LIST_POLL_MS * 3);
		expect(api.listGames).toHaveBeenCalledTimes(4);
		expect(vi.mocked(fetch)).not.toHaveBeenCalled();
		expect(api.listSeeks).not.toHaveBeenCalled();
		expect(api.seekStatus).not.toHaveBeenCalled();
	});

	it('follows the listing', async () => {
		await begin();
		api.listGames.mockResolvedValue({ games: [game('c')], total: 1 });
		await vi.advanceTimersByTimeAsync(LIVE_LIST_POLL_MS);
		expect(feed.games.map((g) => g.gameId)).toEqual(['c']);
		expect(feed.total).toBe(1);
	});

	it('asks once at a time, however slow the answer', async () => {
		let answer!: (value: { games: LiveGame[]; total: number }) => void;
		api.listGames.mockReturnValue(new Promise((resolve) => (answer = resolve)));
		await begin();
		await vi.advanceTimersByTimeAsync(LIVE_LIST_POLL_MS * 3);
		expect(api.listGames).toHaveBeenCalledOnce();
		answer({ games: [game('a')], total: 1 });
		await vi.advanceTimersByTimeAsync(LIVE_LIST_POLL_MS);
		expect(api.listGames).toHaveBeenCalledTimes(2);
	});

	it('keeps the last list through one missed read, and says so after a run of them', async () => {
		await begin();
		api.listGames.mockRejectedValue(new Error('blip'));
		await vi.advanceTimersByTimeAsync(LIVE_LIST_POLL_MS);
		expect(feed.unavailable).toBe(false);
		expect(feed.games).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(LIVE_LIST_POLL_MS);
		expect(feed.unavailable).toBe(true);
		expect(feed.games).toHaveLength(2);
		api.listGames.mockResolvedValue({ games: [], total: 0 });
		await vi.advanceTimersByTimeAsync(LIVE_LIST_POLL_MS);
		expect(feed.unavailable).toBe(false);
		expect(feed.games).toEqual([]);
	});

	it('stops asking once it is stopped', async () => {
		await begin();
		stop();
		await vi.advanceTimersByTimeAsync(LIVE_LIST_POLL_MS * 3);
		expect(api.listGames).toHaveBeenCalledOnce();
	});
});
