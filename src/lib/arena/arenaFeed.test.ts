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

	it('asks for the featured game once at a time, however slow the answer', async () => {
		listed([weak]);
		await begin();
		// The server takes far longer than the interval between reads.
		let answer!: (value: object) => void;
		vi.mocked(fetch).mockReturnValue(new Promise((resolve) => (answer = resolve)) as never);
		const before = vi.mocked(fetch).mock.calls.length;
		await vi.advanceTimersByTimeAsync(FEATURED_POLL_MS * 4);
		expect(vi.mocked(fetch).mock.calls).toHaveLength(before + 1);

		answer({ status: 200, ok: true, json: async () => active({ version: 7 }) });
		await vi.advanceTimersByTimeAsync(0);
		expect(feed.featured?.game.version).toBe(7);
		// The slow answer has arrived: the next tick asks again.
		await vi.advanceTimersByTimeAsync(FEATURED_POLL_MS);
		expect(vi.mocked(fetch).mock.calls).toHaveLength(before + 2);
	});

	it('drops an answer that is older than the picture on screen', async () => {
		listed([weak]);
		states.weak = active({ version: 9, dfen: `${START} QQ` });
		await begin();
		await vi.advanceTimersByTimeAsync(FEATURED_POLL_MS);
		expect(feed.featured?.game.version).toBe(9);

		// A cache or a late hop serves an older state of the same game.
		states.weak = active({ version: 4, dfen: `${START} PP`, activeSeat: 'White' });
		await vi.advanceTimersByTimeAsync(FEATURED_POLL_MS);
		expect(feed.featured?.game).toMatchObject({ version: 9, dfen: `${START} QQ` });

		states.weak = active({ version: 10, dfen: `${START} RR` });
		await vi.advanceTimersByTimeAsync(FEATURED_POLL_MS);
		expect(feed.featured?.game).toMatchObject({ version: 10, dfen: `${START} RR` });
	});

	it('waits for both list requests before asking again, also when one of them fails', async () => {
		let answer!: (value: { games: LiveGame[]; total: number }) => void;
		api.listGames.mockReturnValue(new Promise((resolve) => (answer = resolve)));
		api.listSeeks.mockRejectedValue(new Error('seeks failed'));
		await begin();
		// The seeks have failed at once; the games are still on their way.
		await vi.advanceTimersByTimeAsync(LIST_POLL_MS * 3);
		expect(api.listGames).toHaveBeenCalledOnce();
		expect(feed.unavailable).toBe(false);

		answer({ games: [weak], total: 1 });
		await vi.advanceTimersByTimeAsync(0);
		// The read failed as a whole: nothing of it is shown.
		expect(feed.loaded).toBe(false);
		await vi.advanceTimersByTimeAsync(LIST_POLL_MS);
		expect(api.listGames).toHaveBeenCalledTimes(2);
	});

	it('dates the clocks of a game taken from the list by when the list was read', async () => {
		vi.setSystemTime(100_000);
		listed([weak, strong]);
		states.strong = active();
		await begin();
		expect(feed.featured?.readAt).toBe(100_000);

		// The featured game ends; the next one is taken from a list read earlier.
		states.strong = ended();
		states.weak = 'fail';
		await vi.advanceTimersByTimeAsync(FEATURED_POLL_MS);
		const listReadAt = 100_000 + LIST_POLL_MS;
		await vi.advanceTimersByTimeAsync(LIST_POLL_MS - FEATURED_POLL_MS + FINAL_POSITION_MS);
		expect(feed.featured?.game.gameId).toBe('weak');
		expect(feed.featured!.readAt).toBeGreaterThanOrEqual(listReadAt);
		// Not the moment of the handover: the list was read before it.
		expect(feed.featured!.readAt).toBeLessThan(Date.now());
		expect(feed.featured!.readAt % LIST_POLL_MS).toBe(0);
	});

	it('dates the games by their own answer when the seeks take longer', async () => {
		vi.setSystemTime(100_000);
		listed([weak]);
		states.weak = 'fail';
		let seeksAnswer!: (value: never[]) => void;
		api.listSeeks.mockReturnValue(new Promise((resolve) => (seeksAnswer = resolve)));
		await begin();
		// The games have answered; the seeks answer three seconds later.
		await vi.advanceTimersByTimeAsync(3000);
		expect(feed.loaded).toBe(false);
		seeksAnswer([]);
		await vi.advanceTimersByTimeAsync(0);
		expect(feed.featured?.game.gameId).toBe('weak');
		expect(feed.featured?.readAt).toBe(100_000);
	});

	it('takes every read of the featured game as a new starting point for its clocks', async () => {
		// play-api reports clocks as of the moment it answers, so a read with nothing else changed
		// still carries newer clocks.
		vi.setSystemTime(100_000);
		listed([weak]);
		states.weak = active({ version: 5, clocks: { white: 290_000, black: 300_000 } });
		await begin();
		await vi.advanceTimersByTimeAsync(FEATURED_POLL_MS);
		const first = feed.featured!.readAt;
		states.weak = active({ version: 5, clocks: { white: 288_000, black: 300_000 } });
		await vi.advanceTimersByTimeAsync(FEATURED_POLL_MS);
		expect(feed.featured!.game.clocks?.white).toBe(288_000);
		expect(feed.featured!.readAt).toBe(first + FEATURED_POLL_MS);
	});

	it('asks for the list once at a time as well', async () => {
		let answer!: (value: { games: LiveGame[]; total: number }) => void;
		states.weak = active();
		api.listGames.mockReturnValue(new Promise((resolve) => (answer = resolve)));
		await begin();
		await vi.advanceTimersByTimeAsync(LIST_POLL_MS * 3);
		expect(api.listGames).toHaveBeenCalledOnce();
		answer({ games: [weak], total: 1 });
		await vi.advanceTimersByTimeAsync(LIST_POLL_MS);
		expect(feed.featured?.game.gameId).toBe('weak');
		expect(api.listGames).toHaveBeenCalledTimes(2);
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
