import { describe, expect, it } from 'vitest';
import type { LiveGame, PlayerKind, TimeControl } from '#lib/live/liveTypes.js';
import {
	NO_FILTERS,
	botsOnly,
	countByKind,
	filterGames,
	hasHuman,
	isFiltered,
	type GameFilters,
} from './liveGames';

// Order and filters of the full list of live games (#260).

const blitz: TimeControl = { Fischer: { initialSeconds: 300, incrementSeconds: 3 } };
const bullet: TimeControl = { Fischer: { initialSeconds: 60, incrementSeconds: 1 } };
const rapid: TimeControl = { Fischer: { initialSeconds: 600, incrementSeconds: 5 } };
type Seat = [name: string | null, kind: PlayerKind, rating?: number];
const game = (
	gameId: string,
	white: Seat,
	black: Seat,
	timeControl: TimeControl = blitz,
): LiveGame => {
	const face = ([name, kind, rating]: Seat) => ({
		name,
		kind,
		...(rating === undefined ? {} : { rating }),
	});
	return {
		gameId,
		players: { white: face(white), black: face(black) },
		timeControl,
		activeSeat: 'White',
		dicePending: false,
		clocks: null,
		version: 1,
	};
};
const GAMES = [
	game('bots-weak', ['grove elm', 'Bot', 1500], ['grove ash', 'Bot', 1500]),
	game('bots-strong', ['grove Cedar', 'Bot', 2324], ['grove larch', 'Bot', 2303], rapid),
	game('human-rated', ['PlayerOne', 'Human', 2177], ['grove cedar-2', 'Bot', 2247], bullet),
	game('guest', ['grove larch-2', 'Bot', 2240], [null, 'Human']),
	game('two-people', ['Alice', 'Human'], ['Bob', 'Human'], { Unlimited: {} }),
];
const ids = (games: readonly LiveGame[]) => games.map((g) => g.gameId);
const keep = (filters: Partial<GameFilters>) =>
	ids(filterGames(GAMES, { ...NO_FILTERS, ...filters }));

describe('who plays', () => {
	it('tells a game with a person from a game of two bots', () => {
		expect(GAMES.filter(hasHuman).map((g) => g.gameId)).toEqual([
			'human-rated',
			'guest',
			'two-people',
		]);
		expect(GAMES.filter(botsOnly).map((g) => g.gameId)).toEqual(['bots-weak', 'bots-strong']);
	});

	it('counts a guest without a name as a person', () => {
		expect(hasHuman(game('g', ['bot', 'Bot'], [null, 'Human']))).toBe(true);
	});

	it('claims neither for a game whose players the server does not name', () => {
		const unknown = { ...GAMES[0], players: null };
		expect(hasHuman(unknown)).toBe(false);
		expect(botsOnly(unknown)).toBe(false);
	});
});

describe('filterGames', () => {
	it('keeps every game without filters, top rated first', () => {
		expect(keep({})).toEqual(['bots-strong', 'human-rated', 'bots-weak', 'guest', 'two-people']);
	});

	it('does not reorder or change the list it was given', () => {
		const before = ids(GAMES);
		filterGames(GAMES, NO_FILTERS);
		expect(ids(GAMES)).toEqual(before);
	});

	it('keeps the games with a person, or the games of bots only', () => {
		expect(keep({ kind: 'human' })).toEqual(['human-rated', 'guest', 'two-people']);
		expect(keep({ kind: 'bots' })).toEqual(['bots-strong', 'bots-weak']);
	});

	it('keeps the games of one speed, and a game without a speed only under "any"', () => {
		expect(keep({ speed: 'blitz' })).toEqual(['bots-weak', 'guest']);
		expect(keep({ speed: 'bullet' })).toEqual(['human-rated']);
		expect(keep({ speed: 'rapid' })).toEqual(['bots-strong']);
		expect(keep({ speed: 'any' })).toContain('two-people');
	});

	it('finds a player by a part of the name, whatever the case and the spaces around it', () => {
		expect(keep({ query: 'cedar' })).toEqual(['bots-strong', 'human-rated']);
		expect(keep({ query: '  PLAYERone ' })).toEqual(['human-rated']);
		expect(keep({ query: 'grove larch' })).toEqual(['bots-strong', 'guest']);
		expect(keep({ query: 'nobody' })).toEqual([]);
	});

	it('does not find a guest without a name by anything typed', () => {
		expect(keep({ query: 'null' })).toEqual([]);
		expect(keep({ query: 'guest' })).toEqual([]);
	});

	it('combines the filters', () => {
		expect(keep({ kind: 'human', query: 'larch' })).toEqual(['guest']);
		expect(keep({ kind: 'bots', speed: 'rapid', query: 'cedar' })).toEqual(['bots-strong']);
		expect(keep({ kind: 'bots', speed: 'bullet' })).toEqual([]);
	});
});

describe('countByKind', () => {
	it('counts what each "who plays" filter keeps', () => {
		expect(countByKind(GAMES)).toEqual({ all: 5, human: 3, bots: 2 });
		expect(countByKind([])).toEqual({ all: 0, human: 0, bots: 0 });
	});

	it('leaves a game with unknown players out of both narrower counts', () => {
		expect(countByKind([{ ...GAMES[0], players: null }])).toEqual({ all: 1, human: 0, bots: 0 });
	});
});

describe('isFiltered', () => {
	it('is false for no filters and for a search of spaces only', () => {
		expect(isFiltered(NO_FILTERS)).toBe(false);
		expect(isFiltered({ ...NO_FILTERS, query: '   ' })).toBe(false);
	});

	it('is true for any one filter', () => {
		expect(isFiltered({ ...NO_FILTERS, kind: 'bots' })).toBe(true);
		expect(isFiltered({ ...NO_FILTERS, speed: 'blitz' })).toBe(true);
		expect(isFiltered({ ...NO_FILTERS, query: 'a' })).toBe(true);
	});
});
