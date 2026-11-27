import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveGame } from '#lib/live/liveTypes.js';

// The feed of the Arena overview (#259), with the server faked at the network edge and the clock
// in the test's hands. The rule itself is tested in featured.test.ts; this file pins that the
// feed applies it to what the server says: the featured game does not change while it is being
// played, it ends only on the word of its own state, and a missed poll changes nothing.
const api = vi.hoisted(() => ({ listGames: vi.fn(), listSeeks: vi.fn() }));
vi.mock('#lib/live/lobbyApi.js', () => api);
vi.mock('#lib/live/liveApi.js', () => ({ apiBase: () => 'https://api.example' }));

import { FINAL_POSITION_MS } from './featured';
import { ArenaFeed, FEATURED_POLL_MS, LIST_POLL_MS } from './arenaFeed.svelte';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const game = (gameId: string, white?: number, black?: number): LiveGame => ({
	gameId,
	players: {
		white: { kind: 'Bot', name: `${gameId}-white`, ...(white ? { rating: white } : {}) },
		black: { kind: 'Bot', name: `${gameId}-black`, ...(black ? { rating: black } : {}) },
	},
	timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } },
	activeSeat: 'White',
	dicePending: false,
	clocks: { white: 300_000, black: 300_000 },
	version: 1,
	dfen: START,
});
const weak = game('weak', 1500, 1500);
const strong = game('strong', 2300, 2324);

/** What `GET /games/{id}` answers, per game id: a state, 404, or a network failure. */
let states: Record<string, object | 404 | 'fail'>;
const active = (extra: object = {}) => ({
	version: 5,
	dfen: `${START} NK`,
	activeSeat: 'Black',
	dicePending: false,
	status: { Active: {} },
	clocks: { white: 290_000, black: 300_000 },
	...extra,
});
const ended = () =>
	active({
		dfen: 'FINAL w - - 0 30',
		status: { Ended: { over: { result: { Win: { side: 'White' } }, termination: 'Resign' } } },
	});

describe('ArenaFeed', () => {
	let feed: ArenaFeed;
	let stop: () => void;
	const listed = (games: LiveGame[], total = games.length) =>
		api.listGames.mockResolvedValue({ games, total });
	const begin = async () => {
		stop = feed.start();
		await vi.advanceTimersByTimeAsync(0);
	};

	beforeEach(() => {
		vi.useFakeTimers();
		states = {};
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				const answer = states[url.split('/games/')[1]] ?? 404;
				if (answer === 'fail') throw new Error('network');
				if (answer === 404) return { status: 404, ok: false };
				return { status: 200, ok: true, json: async () => answer };
			}),
		);
		api.listGames.mockReset();
		api.listSeeks.mockReset().mockResolvedValue([]);
		feed = new ArenaFeed();
	});
	afterEach(() => {
		stop?.();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('features the game with the highest sum of ratings and lists the others by the same rule', async () => {
		const mid = game('mid', 2000, 1900);
		listed([weak, mid, strong], 40);
		await begin();
		expect(feed.featured?.game.gameId).toBe('strong');
		expect(feed.featured?.phase).toBe('live');
		expect(feed.others.map((g) => g.gameId)).toEqual(['mid', 'weak']);
		expect(feed.total).toBe(40);
		expect(feed.loaded).toBe(true);
	});

	it('does not change the featured game while it is still being played', async () => {
		listed([weak]);
		states.weak = active();
		await begin();
		expect(feed.featured?.game.gameId).toBe('weak');

		// A far stronger game starts, and stays for many polls.
		listed([strong, weak]);
		await vi.advanceTimersByTimeAsync(LIST_POLL_MS * 6);
		expect(feed.featured?.game.gameId).toBe('weak');
		expect(feed.featured?.phase).toBe('live');
		expect(feed.others.map((g) => g.gameId)).toEqual(['strong']);
	});

	it('keeps the featured game when it drops off the capped listing but is still being played', async () => {
		listed([weak]);
		states.weak = active();
		await begin();
		listed([strong]);
		await vi.advanceTimersByTimeAsync(LIST_POLL_MS * 3);
		expect(feed.featured?.game.gameId).toBe('weak');
		expect(feed.featured?.phase).toBe('live');
	});

	it('follows the featured game by its own state, which is fresher than the list', async () => {
		listed([weak]);
		states.weak = active();
		await begin();
		await vi.advanceTimersByTimeAsync(FEATURED_POLL_MS);
		expect(feed.featured?.game).toMatchObject({
			activeSeat: 'Black',
			dfen: `${START} NK`,
			clocks: { white: 290_000, black: 300_000 },
			version: 5,
		});
		// What only the listing knows is kept.
		expect(feed.featured?.game.timeControl).toEqual(weak.timeControl);
		expect(feed.featured?.game.players?.white.name).toBe('weak-white');
	});

	it('shows the final position when the game ends, then hands over to the next game', async () => {
		listed([weak, strong]);
		states.strong = active();
		await begin();
		expect(feed.featured?.game.gameId).toBe('strong');

		states.strong = ended();
		states.weak = active();
		listed([weak]);
		await vi.advanceTimersByTimeAsync(FEATURED_POLL_MS);
		expect(feed.featured).toMatchObject({
			phase: 'final',
			game: { gameId: 'strong', dfen: 'FINAL w - - 0 30' },
			over: { result: { Win: { side: 'White' } } },
		});

		// Still there just before its time is up.
		await vi.advanceTimersByTimeAsync(FINAL_POSITION_MS - FEATURED_POLL_MS);
		expect(feed.featured?.game.gameId).toBe('strong');
		await vi.advanceTimersByTimeAsync(FEATURED_POLL_MS * 2);
		expect(feed.featured).toMatchObject({ phase: 'live', game: { gameId: 'weak' }, over: null });
	});

	it('moves on at once when the server no longer knows the featured game', async () => {
		listed([weak, strong]);
		states.strong = 404;
		await begin();
		await vi.advanceTimersByTimeAsync(FEATURED_POLL_MS);
		expect(feed.featured?.game.gameId).toBe('weak');
	});

	it('changes nothing on a missed read of the featured game', async () => {
		listed([weak, strong]);
		states.strong = 'fail';
		await begin();
		await vi.advanceTimersByTimeAsync(FEATURED_POLL_MS * 5);
		expect(feed.featured).toMatchObject({ phase: 'live', game: { gameId: 'strong' } });
	});

	it('keeps the last picture through one missed list, and says so after a run of them', async () => {
		listed([weak]);
		states.weak = active();
		await begin();
		api.listGames.mockRejectedValue(new Error('blip'));
		await vi.advanceTimersByTimeAsync(LIST_POLL_MS);
		expect(feed.unavailable).toBe(false);
		expect(feed.featured?.game.gameId).toBe('weak');
		await vi.advanceTimersByTimeAsync(LIST_POLL_MS);
		expect(feed.unavailable).toBe(true);
		listed([weak]);
		await vi.advanceTimersByTimeAsync(LIST_POLL_MS);
		expect(feed.unavailable).toBe(false);
	});

	it('has no featured game when nothing is being played, and takes the first that starts', async () => {
		listed([]);
		await begin();
		expect(feed.loaded).toBe(true);
		expect(feed.featured).toBeNull();
		listed([weak]);
		await vi.advanceTimersByTimeAsync(LIST_POLL_MS);
		expect(feed.featured?.game.gameId).toBe('weak');
	});

	it('reads again at once when asked to', async () => {
		listed([weak]);
		states.weak = active();
		await begin();
		api.listSeeks.mockResolvedValue([{ id: 's1', timeControl: weak.timeControl }]);
		feed.refresh();
		await vi.advanceTimersByTimeAsync(0);
		expect(feed.seeks).toHaveLength(1);
	});

	it('stops asking once it is stopped', async () => {
		listed([weak]);
		states.weak = active();
		await begin();
		stop();
		const lists = api.listGames.mock.calls.length;
		const reads = vi.mocked(fetch).mock.calls.length;
		await vi.advanceTimersByTimeAsync(LIST_POLL_MS * 3);
		expect(api.listGames.mock.calls).toHaveLength(lists);
		expect(vi.mocked(fetch).mock.calls).toHaveLength(reads);
	});
});
