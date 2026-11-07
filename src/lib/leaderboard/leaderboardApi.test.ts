import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	fetchLeaderboard,
	fetchBotProfile,
	fetchPlayerProfile,
	fetchRatingSnapshots,
	fetchRatingSnapshot,
	type Leaderboard,
	type PlayerProfile,
	type TrainingCategoryRating,
	type RatingSnapshot,
	type RatingSnapshotSummary,
} from './leaderboardApi';

describe('leaderboardApi', () => {
	beforeEach(() => vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080'));
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	const okJson = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, json: async () => body });

	const summary: RatingSnapshotSummary = {
		category: 'rapid',
		epoch: 2,
		anchorSetVersion: 'anchors-v2',
		cutoff: '2026-11-01T00:00:00.123Z',
		computedAt: '2026-11-01T00:01:00Z',
		isCurrent: false,
		entryCount: 0,
	};

	it('lists snapshots for each requested category without sharing responses', async () => {
		const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
			ok: true,
			json: async () => [{ ...summary, category: new URL(url).searchParams.get('category') }],
		}));
		vi.stubGlobal('fetch', fetchMock);
		for (const category of ['bullet', 'blitz', 'rapid'] as const) {
			expect(await fetchRatingSnapshots(category)).toEqual([{ ...summary, category }]);
			expect(fetchMock).toHaveBeenLastCalledWith(
				`http://localhost:8080/leaderboard/snapshots?category=${category}`,
				{ signal: undefined },
			);
		}
	});

	it('fetches an immutable identity with the instant escaped as one path segment', async () => {
		const snapshot: RatingSnapshot = {
			category: summary.category,
			epoch: summary.epoch,
			anchorSetVersion: summary.anchorSetVersion,
			cutoff: summary.cutoff,
			computedAt: summary.computedAt,
			isCurrent: summary.isCurrent,
			leaders: [],
		};
		const fetchMock = okJson(snapshot);
		vi.stubGlobal('fetch', fetchMock);
		expect(await fetchRatingSnapshot('rapid', 2, summary.cutoff)).toEqual(snapshot);
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:8080/leaderboard/snapshots/rapid/2/2026-11-01T00%3A00%3A00.123Z',
			{ signal: undefined },
		);
	});

	it('forwards cancellation to both snapshot requests and preserves abort errors', async () => {
		const controller = new AbortController();
		const aborted = new DOMException('Cancelled', 'AbortError');
		const fetchMock = vi.fn().mockRejectedValue(aborted);
		vi.stubGlobal('fetch', fetchMock);
		controller.abort();
		await expect(fetchRatingSnapshots('bullet', controller.signal)).rejects.toBe(aborted);
		await expect(fetchRatingSnapshot('rapid', 2, summary.cutoff, controller.signal)).rejects.toBe(
			aborted,
		);
		expect(fetchMock.mock.calls.every((call) => call[1].signal === controller.signal)).toBe(true);
	});

	it.each([404, 503])('preserves snapshot HTTP status %i for the caller', async (status) => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));
		await expect(fetchRatingSnapshots('blitz')).rejects.toThrow(
			`fetchRatingSnapshots failed: ${status}`,
		);
		await expect(fetchRatingSnapshot('blitz', 2, summary.cutoff)).rejects.toThrow(
			`fetchRatingSnapshot failed: ${status}`,
		);
	});

	it('passes version metadata and nullable legacy metadata through without synthesis', async () => {
		const board: Leaderboard = {
			category: 'rapid',
			epoch: 2,
			anchorSetVersion: 'anchors-v2',
			cutoff: summary.cutoff,
			computedAt: summary.computedAt,
			leaders: [
				{
					rank: 1,
					kind: 'bot',
					team: 'sample',
					name: 'bot',
					rating: 1600,
					rd: 80,
					onLadder: true,
					games: 10,
					wins: 6,
					draws: 0,
					losses: 4,
					domain: 'competitive',
					algorithm: 'glicko2',
					epoch: 2,
					orderingValue: 1440,
					orderingRule: 'conservative-rating',
					ciLow: 1443.2,
					ciHigh: 1756.8,
				},
			],
		};
		vi.stubGlobal('fetch', okJson(board));
		expect(await fetchLeaderboard('all', 'rapid')).toEqual(board);
		const legacy: Leaderboard = { category: 'bullet', leaders: [], epoch: null, cutoff: null };
		vi.stubGlobal('fetch', okJson(legacy));
		expect(await fetchLeaderboard('all', 'bullet')).toEqual(legacy);
	});

	it('keeps training estimates separate and accepts profiles from older servers', async () => {
		const old: PlayerProfile = {
			nickname: 'Player',
			rating: 1500,
			rd: 350,
			provisional: true,
			games: 0,
			wins: 0,
			draws: 0,
			losses: 0,
			ratings: [],
			totalGames: 1,
			opponents: [],
			recent: [],
		};
		vi.stubGlobal('fetch', okJson(old));
		expect((await fetchPlayerProfile('Player')).training).toBeUndefined();
		const training: TrainingCategoryRating = {
			category: 'bullet',
			rating: 1610.25,
			rd: 90,
			provisional: false,
			ciLow: 1433.85,
			ciHigh: 1786.65,
			intervalCalculation: 'rating ± 1.96 · rd (95% confidence interval)',
			domain: 'training',
			algorithm: 'glicko2',
			algorithmVersion: 'v1',
			epoch: 1,
			cutoff: null,
			computedAt: null,
			games: 1,
			wins: 1,
			draws: 0,
			losses: 0,
		};
		const current: PlayerProfile = { ...old, training: [training] };
		vi.stubGlobal('fetch', okJson(current));
		expect(await fetchPlayerProfile('Player')).toEqual(current);
		expect(current.ratings).toEqual([]);
	});

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
