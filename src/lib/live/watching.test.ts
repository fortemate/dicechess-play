import { describe, expect, it } from 'vitest';
import type { LiveGame } from './liveTypes';
import { challengeQuery, gameKind, otherGames, pairing, progress, rolledLine } from './watching';

const game = (id: string, white: number | null, black: number | null, version = 1): LiveGame =>
	({
		gameId: id,
		version,
		players: {
			white: { kind: 'Bot', name: `grove ${id}-w`, ...(white === null ? {} : { rating: white }) },
			black: { kind: 'Bot', name: `grove ${id}-b`, ...(black === null ? {} : { rating: black }) },
		},
		timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } },
		activeSeat: 'White',
		dicePending: false,
		clocks: null,
		dfen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 14 NP',
	}) as LiveGame;

describe('the other live games', () => {
	const games = [game('a', 1500, 1500), game('b', 2300, 2300), game('c', 2000, null)];

	it('leaves out the game on screen and puts the most notable first', () => {
		expect(otherGames(games, 'b').map((g) => g.gameId)).toEqual(['a', 'c']);
		expect(otherGames(games, 'a').map((g) => g.gameId)).toEqual(['b', 'c']);
	});

	it('keeps every game when the one on screen is not listed', () => {
		expect(otherGames(games, 'elsewhere')).toHaveLength(3);
		expect(otherGames(games, undefined)).toHaveLength(3);
		expect(otherGames([], 'a')).toEqual([]);
	});

	it('names the two sides, a nameless seat by its colour', () => {
		expect(pairing(game('a', 1, 1))).toBe('grove a-w vs grove a-b');
		const guest = {
			players: { white: { kind: 'Human', name: null }, black: { kind: 'Bot', name: 'grove x' } },
		} as LiveGame;
		expect(pairing(guest)).toBe('White vs grove x');
		expect(pairing({ players: null })).toBe('White vs Black');
	});

	it('says what a game is and how far it has got', () => {
		expect(progress(game('a', 1, 1))).toBe('Blitz 5 + 3 · move 14');
	});
});

describe('what a spectator is told', () => {
	it('names who rolled the dice, and says nothing without dice', () => {
		expect(rolledLine('grove cedar-4', [{ value: 'Q' }, { value: 'K' }, { value: 'N' }])).toBe(
			'grove cedar-4 rolled queen, king, and knight.',
		);
		expect(rolledLine('White', [])).toBe('');
	});

	it('builds the link that preselects a bot on Play from its public name', () => {
		expect(challengeQuery('grove cedar-4')).toBe('?bot=grove%20cedar-4');
	});

	it('says how the game counts in one word, and nothing when the server does not say', () => {
		expect(gameKind('competitive', true)).toBe('Rated');
		expect(gameKind(null, true)).toBe('Rated');
		expect(gameKind('casual', false)).toBe('Casual');
		expect(gameKind('training', false)).toBe('Training');
		// Not rated, with no recorded domain: casual and training cannot be told apart.
		expect(gameKind(null, false)).toBeNull();
		expect(gameKind(undefined, undefined)).toBeNull();
	});
});
