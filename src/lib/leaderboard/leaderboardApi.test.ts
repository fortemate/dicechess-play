import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchLeaderboard, fetchBotProfile, fetchPlayerProfile } from './leaderboardApi';

describe('leaderboardApi', () => {
	beforeEach(() => vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080'));
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	const okJson = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, json: async () => body });

	it('fetchLeaderboard GETs the board for the requested scope and speed', async () => {
		const board = {
			category: 'blitz',
			leaders: [
				{
					rank: 1,
					kind: 'bot',
					team: 'acme',
					name: 'alice',
					rating: 1720.5,
					rd: 85.2,
					onLadder: true,
					games: 42,
					wins: 30,
					draws: 2,
					losses: 10,
				},
			],
		};
		const fetchMock = okJson(board);
		vi.stubGlobal('fetch', fetchMock);
		expect(await fetchLeaderboard('all', 'blitz')).toEqual(board);
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:8080/leaderboard?kind=all&category=blitz',
		);
	});

	/** NEITHER param is ever omitted: play-api defaults `kind` to `bots` — an omitted scope is
	 * exactly how people stayed invisible on this page (#206) — and `category` to blitz, the same
	 * trap one abstraction over. Every value of both has to reach the wire, lowercase (the server
	 * matches `category` case-sensitively).
	 */
	it('fetchLeaderboard states every population and every speed by name', async () => {
		for (const scope of ['all', 'bots', 'players'] as const) {
			for (const category of ['bullet', 'blitz', 'rapid'] as const) {
				const fetchMock = okJson({ category, leaders: [] });
				vi.stubGlobal('fetch', fetchMock);
				await fetchLeaderboard(scope, category);
				expect(fetchMock).toHaveBeenCalledWith(
					`http://localhost:8080/leaderboard?kind=${scope}&category=${category}`,
				);
			}
		}
	});

	/** A player row is a different shape, not just a different flag: no team, and the nickname in
	 * `name`. Pinned so a future "tidy-up" cannot make `team` non-nullable again.
	 */
	it('fetchLeaderboard passes a player row through with a null team', async () => {
		const board = {
			leaders: [
				{
					rank: 13,
					kind: 'player',
					team: null,
					name: 'RollingDice',
					rating: 1658.1,
					rd: 104.5,
					onLadder: false,
					games: 13,
					wins: 5,
					draws: 0,
					losses: 8,
				},
			],
		};
		vi.stubGlobal('fetch', okJson(board));
		const got = await fetchLeaderboard('players', 'blitz');
		expect(got.leaders[0].team).toBeNull();
		expect(got.leaders[0].kind).toBe('player');
	});

	it('fetchBotProfile GETs the profile with URL-encoded identity segments', async () => {
		const profile = { team: 'acme', name: 'alice', recent: [] };
		const fetchMock = okJson(profile);
		vi.stubGlobal('fetch', fetchMock);
		expect(await fetchBotProfile('acme', 'alice')).toEqual(profile);
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/bots/acme/alice');
	});

	/** Keyed on the nickname because that is a person's only public handle — `user:<uuid>` never
	 * reaches the public wire. Encoded, since a nickname is user-chosen text in a path segment.
	 */
	it('fetchPlayerProfile GETs the profile by nickname, URL-encoded', async () => {
		const profile = { nickname: 'RollingDice', rating: 1658.1, totalGames: 17, recent: [] };
		const fetchMock = okJson(profile);
		vi.stubGlobal('fetch', fetchMock);
		expect(await fetchPlayerProfile('RollingDice')).toEqual(profile);
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/players/by-nickname/RollingDice');
	});

	it('fetchPlayerProfile escapes a nickname that needs it', async () => {
		const fetchMock = okJson({ nickname: 'a b', recent: [] });
		vi.stubGlobal('fetch', fetchMock);
		await fetchPlayerProfile('a b');
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/players/by-nickname/a%20b');
	});

	/** A deactivated account answers 404 exactly like a missing one (play-api #237), so the caller
	 * cannot tell them apart — and must not try to.
	 */
	it('fetchPlayerProfile throws with the status for an unknown or deleted nickname', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
		await expect(fetchPlayerProfile('ghost')).rejects.toThrow('fetchPlayerProfile failed: 404');
	});

	it('both throw with the status on a non-OK response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
		await expect(fetchLeaderboard('all', 'blitz')).rejects.toThrow('fetchLeaderboard failed: 404');
		await expect(fetchBotProfile('ghost', 'nobody')).rejects.toThrow('fetchBotProfile failed: 404');
	});
});
