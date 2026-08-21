import { describe, it, expect } from 'vitest';
import {
	parseVsParam,
	vsParamValue,
	serverVsParam,
	parseGamesFilters,
	liveGamesVisible,
	filterLocalGames,
	aggregatePlayerGames,
	localOpponentOptions,
	opponentOptions,
	computeHeadToHead,
	type GamesFilters,
} from './gamesFilters';
import type { LocalGameRecord } from '$lib/localGamesDB';
import type { PlayerGame, PlayerOpponent } from './gamesApi';

function localGame(overrides: Partial<LocalGameRecord> = {}): LocalGameRecord {
	return {
		id: 'l-1',
		bot_id: 'bot:greedy',
		player_color: 'WHITE',
		result: 1,
		start_time: '2026-07-15T00:00:00Z',
		sync_status: 'synced',
		moves_history: [],
		...overrides,
	};
}

function liveGame(overrides: Partial<PlayerGame> = {}): PlayerGame {
	return {
		gameId: 'v-1',
		seat: 'White',
		opponent: { kind: 'Bot', name: 'acme alice' },
		result: 'win',
		rated: false,
		termination: 'resign',
		timeControl: 'Fischer(300,3)',
		finishedAt: '2026-07-16T00:00:00Z',
		...overrides,
	};
}

function bot(
	team: string,
	botName: string,
	overrides: Partial<PlayerOpponent> = {},
): PlayerOpponent {
	return {
		opponent: { kind: 'Bot', name: `${team} ${botName}` },
		team,
		botName,
		games: 0,
		wins: 0,
		draws: 0,
		losses: 0,
		lastPlayedAt: '2026-07-16T12:00:00Z',
		...overrides,
	};
}

const human: PlayerOpponent = {
	opponent: { kind: 'Human', name: null },
	team: null,
	botName: null,
	games: 5,
	wins: 2,
	draws: 1,
	losses: 2,
	lastPlayedAt: '2026-07-16T12:00:00Z',
};

const noFilters: GamesFilters = { vs: null, result: null, source: null };

describe('parseVsParam', () => {
	it("parses 'human'", () => {
		expect(parseVsParam('human')).toEqual({ kind: 'human' });
	});

	it("parses 'local:<algorithm>'", () => {
		expect(parseVsParam('local:greedy')).toEqual({ kind: 'local', algorithm: 'greedy' });
	});

	it("rejects 'local:' with an empty algorithm", () => {
		expect(parseVsParam('local:')).toBeNull();
	});

	it("a real team literally named 'local' still parses as a bot filter, not the local namespace", () => {
		// The whole reason the marker is `local:`, not `local/`: play-api team names are
		// self-service and open (only `anon`/`house` are reserved), so `team=local` is legal.
		// A <team>/<botName> pair always contains a slash; `local:<algorithm>` never does.
		expect(parseVsParam('local/greedy')).toEqual({ kind: 'bot', team: 'local', botName: 'greedy' });
	});

	it("parses '<team>/<name>' as a bot filter", () => {
		expect(parseVsParam('acme/alice')).toEqual({ kind: 'bot', team: 'acme', botName: 'alice' });
	});

	it('rejects an empty team', () => {
		expect(parseVsParam('/alice')).toBeNull();
	});

	it('rejects an empty bot name', () => {
		expect(parseVsParam('acme/')).toBeNull();
	});

	it('rejects a value with no slash', () => {
		expect(parseVsParam('noslash')).toBeNull();
	});
});

describe('vsParamValue', () => {
	it('round-trips every VsFilter kind through parseVsParam', () => {
		const values = [
			{ kind: 'human' as const },
			{ kind: 'bot' as const, team: 'acme', botName: 'alice' },
			{ kind: 'local' as const, algorithm: 'greedy' },
		];
		for (const vs of values) {
			expect(parseVsParam(vsParamValue(vs))).toEqual(vs);
		}
	});
});

describe('serverVsParam', () => {
	it('is undefined for no filter', () => {
		expect(serverVsParam(null)).toBeUndefined();
	});

	it("is undefined for a 'local' filter — the server has no such namespace", () => {
		expect(serverVsParam({ kind: 'local', algorithm: 'greedy' })).toBeUndefined();
	});

	it('passes a human filter through unchanged', () => {
		expect(serverVsParam({ kind: 'human' })).toBe('human');
	});

	it('passes a bot filter through as team/name', () => {
		expect(serverVsParam({ kind: 'bot', team: 'acme', botName: 'alice' })).toBe('acme/alice');
	});
});

describe('parseGamesFilters', () => {
	it('parses all three params from a URL', () => {
		const url = new URL('http://localhost/games?vs=human&result=win&source=lobby');
		expect(parseGamesFilters(url)).toEqual({
			vs: { kind: 'human' },
			result: 'win',
			source: 'lobby',
		});
	});

	it('is all-null with no query params', () => {
		expect(parseGamesFilters(new URL('http://localhost/games'))).toEqual(noFilters);
	});

	it('leniently drops an invalid result/source rather than erroring', () => {
		const url = new URL('http://localhost/games?result=whoops&source=whoops');
		expect(parseGamesFilters(url)).toEqual(noFilters);
	});

	it('parses a local vs value', () => {
		const url = new URL('http://localhost/games?vs=local%3Agreedy');
		expect(parseGamesFilters(url).vs).toEqual({ kind: 'local', algorithm: 'greedy' });
	});
});

describe('liveGamesVisible', () => {
	it('is true with no filters', () => {
		expect(liveGamesVisible(noFilters)).toBe(true);
	});

	it('is false when source is device', () => {
		expect(liveGamesVisible({ ...noFilters, source: 'device' })).toBe(false);
	});

	it('is false for a local vs filter', () => {
		expect(liveGamesVisible({ ...noFilters, vs: { kind: 'local', algorithm: 'greedy' } })).toBe(
			false,
		);
	});

	it('is true for a bot vs filter', () => {
		expect(
			liveGamesVisible({ ...noFilters, vs: { kind: 'bot', team: 'acme', botName: 'alice' } }),
		).toBe(true);
	});
});

describe('filterLocalGames', () => {
	it('returns everything with no filters', () => {
		const games = [localGame({ id: 'a' }), localGame({ id: 'b' })];
		expect(filterLocalGames(games, noFilters)).toEqual(games);
	});

	it('returns nothing when source is lobby', () => {
		expect(filterLocalGames([localGame()], { ...noFilters, source: 'lobby' })).toEqual([]);
	});

	it('returns nothing for a non-local vs filter', () => {
		const vs = { kind: 'bot' as const, team: 'acme', botName: 'alice' };
		expect(filterLocalGames([localGame()], { ...noFilters, vs })).toEqual([]);
	});

	it('keeps only games against the matching local algorithm', () => {
		const games = [
			localGame({ id: 'a', bot_id: 'bot:greedy' }),
			localGame({ id: 'b', bot_id: 'bot:random' }),
		];
		const vs = { kind: 'local' as const, algorithm: 'greedy' };
		expect(filterLocalGames(games, { ...noFilters, vs }).map((g) => g.id)).toEqual(['a']);
	});

	it('keeps only games matching the result filter (POV outcome)', () => {
		const games = [
			localGame({ id: 'won', player_color: 'WHITE', result: 1 }),
			localGame({ id: 'lost', player_color: 'WHITE', result: -1 }),
			localGame({ id: 'drawn', player_color: 'WHITE', result: 0 }),
		];
		expect(filterLocalGames(games, { ...noFilters, result: 'win' }).map((g) => g.id)).toEqual([
			'won',
		]);
	});

	it('composes a local vs filter with a result filter', () => {
		const games = [
			localGame({ id: 'a', bot_id: 'bot:greedy', player_color: 'WHITE', result: 1 }),
			localGame({ id: 'b', bot_id: 'bot:greedy', player_color: 'WHITE', result: -1 }),
			localGame({ id: 'c', bot_id: 'bot:random', player_color: 'WHITE', result: 1 }),
		];
		const filters: GamesFilters = {
			vs: { kind: 'local', algorithm: 'greedy' },
			result: 'win',
			source: null,
		};
		expect(filterLocalGames(games, filters).map((g) => g.id)).toEqual(['a']);
	});
});

describe('aggregatePlayerGames', () => {
	it('counts wins, draws, and losses', () => {
		const games = [
			liveGame({ result: 'win' }),
			liveGame({ result: 'win' }),
			liveGame({ result: 'draw' }),
			liveGame({ result: 'loss' }),
		];
		expect(aggregatePlayerGames(games)).toEqual({ wins: 2, draws: 1, losses: 1 });
	});

	it('ignores unknown-result games', () => {
		expect(aggregatePlayerGames([liveGame({ result: 'unknown' })])).toEqual({
			wins: 0,
			draws: 0,
			losses: 0,
		});
	});

	it('is all-zero for an empty list', () => {
		expect(aggregatePlayerGames([])).toEqual({ wins: 0, draws: 0, losses: 0 });
	});
});

describe('localOpponentOptions', () => {
	it('dedups by algorithm, keeping one option each', () => {
		const games = [
			localGame({ bot_id: 'bot:greedy' }),
			localGame({ bot_id: 'bot:greedy' }),
			localGame({ bot_id: 'bot:random' }),
		];
		expect(localOpponentOptions(games)).toEqual([
			{ vs: { kind: 'local', algorithm: 'greedy' }, label: 'Greedy' },
			{ vs: { kind: 'local', algorithm: 'random' }, label: 'Random' },
		]);
	});

	it('is empty with no local games', () => {
		expect(localOpponentOptions([])).toEqual([]);
	});
});

describe('opponentOptions', () => {
	it('combines local algorithms actually played with every lobby opponent', () => {
		const local = [localGame({ bot_id: 'bot:greedy' })];
		const lobby = [bot('acme', 'alice'), human];

		const options = opponentOptions(local, lobby);

		expect(options).toEqual([
			{ vs: { kind: 'local', algorithm: 'greedy' }, label: 'Greedy' },
			{ vs: { kind: 'bot', team: 'acme', botName: 'alice' }, label: 'acme alice' },
			{ vs: { kind: 'human' }, label: 'Anonymous players' },
		]);
	});
});

describe('computeHeadToHead', () => {
	it('is null when no vs filter is active', () => {
		expect(computeHeadToHead(null, [], [], [], true)).toBeNull();
	});

	it('local: the true overall record against the bot, unaffected by a result filter narrowing filterLocalGames elsewhere', () => {
		// The exact bug both reviewers found on this PR: the summary must not become "record while
		// winning" just because the visitor also filtered the list below by result.
		const games = [
			localGame({ id: 'a', bot_id: 'bot:greedy', player_color: 'WHITE', result: 1 }),
			localGame({ id: 'b', bot_id: 'bot:greedy', player_color: 'WHITE', result: -1 }),
			localGame({ id: 'c', bot_id: 'bot:greedy', player_color: 'WHITE', result: 0 }),
			localGame({ id: 'd', bot_id: 'bot:random', player_color: 'WHITE', result: 1 }),
		];
		const vs = { kind: 'local' as const, algorithm: 'greedy' };

		const result = computeHeadToHead(vs, games, [], [], true);

		expect(result).toEqual({
			label: 'Greedy',
			isBot: true,
			counts: { wins: 1, draws: 1, losses: 1 },
		});
	});

	it('bot: prefers the exact opponents-summary total over the fetched (possibly page-capped) list', () => {
		const vs = { kind: 'bot' as const, team: 'acme', botName: 'alice' };
		const opponents = [bot('acme', 'alice', { wins: 12, draws: 3, losses: 5 })];
		const liveGames = [liveGame({ result: 'win' })]; // a lone fetched page — must NOT be summed

		const result = computeHeadToHead(vs, [], opponents, liveGames, true);

		expect(result).toEqual({
			label: 'acme alice',
			isBot: true,
			counts: { wins: 12, draws: 3, losses: 5 },
		});
	});

	it('human: labels the collapsed bucket and is never a bot', () => {
		const result = computeHeadToHead({ kind: 'human' }, [], [human], [], true);
		expect(result).toEqual({
			label: 'Anonymous players',
			isBot: false,
			counts: { wins: human.wins, draws: human.draws, losses: human.losses },
		});
	});

	it('falls back to summing the fetched live list when the opponent has no matching summary row yet', () => {
		const vs = { kind: 'bot' as const, team: 'acme', botName: 'alice' };
		const liveGames = [liveGame({ result: 'win' }), liveGame({ result: 'loss' })];

		const result = computeHeadToHead(vs, [], [], liveGames, true);

		expect(result).toEqual({
			label: 'acme alice',
			isBot: true,
			counts: { wins: 1, draws: 0, losses: 1 },
		});
	});

	it('the fallback never sums live games while they are hidden (liveVisible: false)', () => {
		const vs = { kind: 'bot' as const, team: 'acme', botName: 'alice' };
		const liveGames = [liveGame({ result: 'win' })];

		const result = computeHeadToHead(vs, [], [], liveGames, false);

		expect(result?.counts).toEqual({ wins: 0, draws: 0, losses: 0 });
	});
});
