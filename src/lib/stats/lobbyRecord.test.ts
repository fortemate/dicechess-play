import { describe, it, expect } from 'vitest';
import {
	aggregateOpponents,
	opponentLabel,
	opponentVsQuery,
	findOpponentByVs,
} from './lobbyRecord';
import type { PlayerOpponent } from '$lib/games/gamesApi';

function bot(team: string, botName: string, games: Partial<PlayerOpponent> = {}): PlayerOpponent {
	return {
		opponent: { kind: 'Bot', name: `${team} ${botName}` },
		team,
		botName,
		games: 0,
		wins: 0,
		draws: 0,
		losses: 0,
		lastPlayedAt: '2026-07-16T12:00:00Z',
		...games,
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

describe('aggregateOpponents', () => {
	it('sums W-D-L across every opponent', () => {
		const opponents = [
			bot('acme', 'alice', { wins: 3, draws: 1, losses: 2 }),
			bot('acme', 'bob', { wins: 1, draws: 0, losses: 4 }),
			human,
		];
		expect(aggregateOpponents(opponents)).toEqual({ wins: 6, draws: 2, losses: 8 });
	});

	it('is all-zero for an empty list', () => {
		expect(aggregateOpponents([])).toEqual({ wins: 0, draws: 0, losses: 0 });
	});
});

describe('opponentLabel', () => {
	it("uses the bot's team-qualified display name", () => {
		expect(opponentLabel(bot('acme', 'alice'))).toBe('acme alice');
	});

	it('labels the collapsed human bucket', () => {
		expect(opponentLabel(human)).toBe('Anonymous players');
	});
});

describe('opponentVsQuery', () => {
	it('is <team>/<botName> for a bot', () => {
		expect(opponentVsQuery(bot('acme', 'alice'))).toBe('acme/alice');
	});

	it("is 'human' for the collapsed bucket", () => {
		expect(opponentVsQuery(human)).toBe('human');
	});
});

describe('findOpponentByVs', () => {
	const opponents = [bot('acme', 'alice'), bot('acme', 'bob'), human];

	it('finds the matching bot row', () => {
		expect(findOpponentByVs(opponents, 'acme/alice')).toEqual(bot('acme', 'alice'));
	});

	it("finds the collapsed human row for 'human'", () => {
		expect(findOpponentByVs(opponents, 'human')).toEqual(human);
	});

	it('is undefined for a vs value with no matching row', () => {
		expect(findOpponentByVs(opponents, 'other-team/carol')).toBeUndefined();
	});

	it('is undefined for an empty opponents list', () => {
		expect(findOpponentByVs([], 'human')).toBeUndefined();
	});
});
