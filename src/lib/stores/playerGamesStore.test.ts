import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { myGamesStore, playerGamesStore } from './playerGamesStore.svelte';
import type { PlayerGame } from '$lib/games/gamesApi';

function game(gameId: string, finishedAt: string): PlayerGame {
	return {
		gameId,
		seat: 'White',
		opponent: { kind: 'Bot', name: 'acme alice' },
		result: 'win',
		rated: false,
		termination: 'resign',
		timeControl: 'Fischer(300,3)',
		finishedAt,
	};
}

const okJson = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, json: async () => body });

describe('playerGamesStore', () => {
	beforeEach(() => {
		// Reset both singletons between tests.
		for (const store of [playerGamesStore, myGamesStore]) {
			store.games = [];
			store.hasMore = false;
			store.loading = false;
			store.loaded = false;
			store.error = null;
		}
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it('loads games from play-api, flags loaded, and tracks hasMore', async () => {
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
		vi.stubGlobal('fetch', okJson({ games: [game('g-1', '2026-07-16T12:00:00Z')], hasMore: true }));

		await playerGamesStore.load();

		expect(playerGamesStore.games.map((g) => g.gameId)).toEqual(['g-1']);
		expect(playerGamesStore.hasMore).toBe(true);
		expect(playerGamesStore.loaded).toBe(true);
		expect(playerGamesStore.loading).toBe(false);
		expect(playerGamesStore.error).toBeNull();
	});

	it('is a no-op when live play is disabled — no fetch, nothing loaded, no error', async () => {
		vi.stubEnv('VITE_PLAY_API_URL', '');
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await playerGamesStore.load();

		expect(fetchMock).not.toHaveBeenCalled();
		expect(playerGamesStore.games).toEqual([]);
		expect(playerGamesStore.loaded).toBe(false);
		expect(playerGamesStore.error).toBeNull();
	});

	it('degrades to an honest error on fetch failure, without throwing', async () => {
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

		await expect(playerGamesStore.load()).resolves.toBeUndefined();

		expect(playerGamesStore.error).toBe("Your lobby games aren't available right now.");
		expect(playerGamesStore.loading).toBe(false);
		expect(playerGamesStore.games).toEqual([]);
	});

	it('ignores a concurrent load while one is in flight', async () => {
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
		let resolveFetch: (value: unknown) => void = () => {};
		const pending = new Promise((resolve) => (resolveFetch = resolve));
		const fetchMock = vi.fn().mockReturnValue(pending);
		vi.stubGlobal('fetch', fetchMock);

		// The first call flips `loading` synchronously before its first await; the second must
		// short-circuit on the guard rather than issue a second fetch.
		const first = playerGamesStore.load();
		const second = playerGamesStore.load();
		resolveFetch({
			ok: true,
			json: async () => ({ games: [game('g-1', '2026-07-16T12:00:00Z')], hasMore: false }),
		});
		await Promise.all([first, second]);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(playerGamesStore.games.map((g) => g.gameId)).toEqual(['g-1']);
		expect(playerGamesStore.loading).toBe(false);
	});

	it('forwards vs/result filters to fetchPlayerGames', async () => {
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
		const fetchMock = okJson({ games: [], hasMore: false });
		vi.stubGlobal('fetch', fetchMock);

		await playerGamesStore.load({ vs: 'acme/alice', result: 'win' });

		expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('?vs=acme%2Falice&result=win'));
	});

	it('reset clears loaded games back to the initial state', async () => {
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
		vi.stubGlobal('fetch', okJson({ games: [game('g-1', '2026-07-16T12:00:00Z')], hasMore: true }));
		await playerGamesStore.load();

		playerGamesStore.reset();

		expect(playerGamesStore.games).toEqual([]);
		expect(playerGamesStore.hasMore).toBe(false);
		expect(playerGamesStore.loaded).toBe(false);
		expect(playerGamesStore.loading).toBe(false);
		expect(playerGamesStore.error).toBeNull();
	});

	it("a stale request from before reset() can't clobber the newer filter's state, however it resolves", async () => {
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
		let resolveA: (value: unknown) => void = () => {};
		let resolveB: (value: unknown) => void = () => {};
		const fetchMock = vi
			.fn()
			.mockReturnValueOnce(new Promise((resolve) => (resolveA = resolve)))
			.mockReturnValueOnce(new Promise((resolve) => (resolveB = resolve)));
		vi.stubGlobal('fetch', fetchMock);

		const loadA = playerGamesStore.load(); // unfiltered request starts, still in flight
		playerGamesStore.reset(); // the visitor picks a filter mid-flight
		const loadB = playerGamesStore.load({ vs: 'acme/alice' });

		// B (the filtered request) resolves first, as it normally would...
		resolveB({
			ok: true,
			json: async () => ({ games: [game('filtered', '2026-07-16T12:00:00Z')], hasMore: false }),
		});
		await loadB;
		expect(playerGamesStore.games.map((g) => g.gameId)).toEqual(['filtered']);

		// ...then A's abandoned unfiltered request finally resolves. It must be discarded.
		resolveA({
			ok: true,
			json: async () => ({ games: [game('unfiltered', '2026-07-16T12:00:00Z')], hasMore: false }),
		});
		await loadA;

		expect(playerGamesStore.games.map((g) => g.gameId)).toEqual(['filtered']);
		expect(playerGamesStore.loaded).toBe(true);
		expect(playerGamesStore.loading).toBe(false);
	});

	it('myGamesStore loads the account union from /me/games, credentialed (#229)', async () => {
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
		const fetchMock = okJson({ games: [game('g-1', '2026-08-09T12:00:00Z')], hasMore: false });
		vi.stubGlobal('fetch', fetchMock);

		await myGamesStore.load({ vs: 'acme/alice', result: 'win' });

		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:8080/me/games?vs=acme%2Falice&result=win',
			{ credentials: 'include' },
		);
		expect(myGamesStore.games.map((g) => g.gameId)).toEqual(['g-1']);
		// The guest singleton stays untouched — the identities must never bleed into each other.
		expect(playerGamesStore.games).toEqual([]);
		expect(playerGamesStore.loaded).toBe(false);
	});

	it("myGamesStore's loadMore cursors /me/games with the oldest fetched finishedAt", async () => {
		vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ games: [game('g-1', '2026-08-09T12:00:00Z')], hasMore: true }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ games: [game('g-0', '2026-08-08T12:00:00Z')], hasMore: false }),
			});
		vi.stubGlobal('fetch', fetchMock);

		await myGamesStore.load();
		await myGamesStore.loadMore();

		expect(fetchMock).toHaveBeenLastCalledWith(
			'http://localhost:8080/me/games?before=2026-08-09T12%3A00%3A00Z',
			{ credentials: 'include' },
		);
		expect(myGamesStore.games.map((g) => g.gameId)).toEqual(['g-1', 'g-0']);
		expect(myGamesStore.hasMore).toBe(false);
	});

	describe('loadMore', () => {
		it('appends the next page and updates hasMore', async () => {
			vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
			vi.stubGlobal(
				'fetch',
				okJson({ games: [game('g-1', '2026-07-16T12:00:00Z')], hasMore: true }),
			);
			await playerGamesStore.load();

			vi.stubGlobal(
				'fetch',
				okJson({ games: [game('g-2', '2026-07-15T12:00:00Z')], hasMore: false }),
			);
			await playerGamesStore.loadMore();

			expect(playerGamesStore.games.map((g) => g.gameId)).toEqual(['g-1', 'g-2']);
			expect(playerGamesStore.hasMore).toBe(false);
			expect(playerGamesStore.loading).toBe(false);
		});

		it("passes the oldest fetched game's own finishedAt as before, reusing the original filters", async () => {
			vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
			vi.stubGlobal(
				'fetch',
				okJson({
					games: [game('newer', '2026-07-16T12:00:00Z'), game('older', '2026-07-14T09:30:00Z')],
					hasMore: true,
				}),
			);
			await playerGamesStore.load({ result: 'win' });

			const fetchMock = okJson({ games: [], hasMore: false });
			vi.stubGlobal('fetch', fetchMock);
			await playerGamesStore.loadMore();

			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining('result=win&before=2026-07-14T09%3A30%3A00Z'),
			);
		});

		it('a failed loadMore keeps the fetched games, flags an error, and leaves hasMore for a retry', async () => {
			vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
			vi.stubGlobal(
				'fetch',
				okJson({ games: [game('g-1', '2026-07-16T12:00:00Z')], hasMore: true }),
			);
			await playerGamesStore.load();

			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
			await playerGamesStore.loadMore();

			expect(playerGamesStore.games.map((g) => g.gameId)).toEqual(['g-1']);
			expect(playerGamesStore.hasMore).toBe(true);
			expect(playerGamesStore.loading).toBe(false);
			expect(playerGamesStore.error).not.toBeNull();
		});

		it('is a no-op when hasMore is false', async () => {
			vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
			vi.stubGlobal(
				'fetch',
				okJson({ games: [game('g-1', '2026-07-16T12:00:00Z')], hasMore: false }),
			);
			await playerGamesStore.load();

			const fetchMock = vi.fn();
			vi.stubGlobal('fetch', fetchMock);
			await playerGamesStore.loadMore();

			expect(fetchMock).not.toHaveBeenCalled();
			expect(playerGamesStore.games.map((g) => g.gameId)).toEqual(['g-1']);
		});

		it('is a no-op before anything has loaded — there is no oldest game to cursor from', async () => {
			vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
			const fetchMock = vi.fn();
			vi.stubGlobal('fetch', fetchMock);

			await playerGamesStore.loadMore();

			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("a stale loadMore response from before reset() can't clobber the newer state", async () => {
			vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080');
			vi.stubGlobal(
				'fetch',
				okJson({ games: [game('g-1', '2026-07-16T12:00:00Z')], hasMore: true }),
			);
			await playerGamesStore.load();

			let resolveMore: (value: unknown) => void = () => {};
			vi.stubGlobal(
				'fetch',
				vi.fn().mockReturnValue(new Promise((resolve) => (resolveMore = resolve))),
			);
			const more = playerGamesStore.loadMore(); // still in flight when identity/filters change

			playerGamesStore.reset();
			vi.stubGlobal(
				'fetch',
				okJson({ games: [game('fresh', '2026-07-20T12:00:00Z')], hasMore: false }),
			);
			await playerGamesStore.load();
			expect(playerGamesStore.games.map((g) => g.gameId)).toEqual(['fresh']);

			// The abandoned loadMore() finally resolves — must not append onto the new state.
			resolveMore({
				ok: true,
				json: async () => ({ games: [game('stale', '2026-07-10T12:00:00Z')], hasMore: true }),
			});
			await more;

			expect(playerGamesStore.games.map((g) => g.gameId)).toEqual(['fresh']);
			expect(playerGamesStore.hasMore).toBe(false);
		});
	});
});
