import { describe, expect, it } from 'vitest';
import {
	publicPlayer,
	seatDisplayName,
	seatDisplaySub,
	seatRating,
	seekOffer,
} from './playerLabel';
import type { Players, Seek } from './liveTypes';

const botVsHuman: Players = {
	white: { kind: 'Bot', name: 'house greedy' },
	black: { kind: 'Human', name: null },
};

describe('publicPlayer', () => {
	it('resolves each seat, and null when the server sent no players (older server)', () => {
		expect(publicPlayer(botVsHuman, 'White')?.name).toBe('house greedy');
		expect(publicPlayer(botVsHuman, 'Black')?.kind).toBe('Human');
		expect(publicPlayer(null, 'White')).toBeNull();
		expect(publicPlayer(undefined, 'Black')).toBeNull();
	});
});

describe('seatDisplayName', () => {
	it('shows a named participant (a bot) by name, for players and spectators alike', () => {
		expect(seatDisplayName(botVsHuman, 'White', 'Black', false)).toBe('house greedy');
		expect(seatDisplayName(botVsHuman, 'White', 'White', true)).toBe('house greedy');
	});

	it('keeps anonymous humans as You/Opponent from the player point of view', () => {
		expect(seatDisplayName(botVsHuman, 'Black', 'Black', false)).toBe('You');
		expect(seatDisplayName(null, 'White', 'Black', false)).toBe('Opponent');
	});

	it('falls back to the bare seat for spectators of anonymous humans', () => {
		expect(seatDisplayName(botVsHuman, 'Black', 'White', true)).toBe('Black');
		expect(seatDisplayName(null, 'White', 'White', true)).toBe('White');
	});
});

describe('seatDisplaySub', () => {
	it('labels bots as bot, players as guest, spectated humans as live', () => {
		expect(seatDisplaySub(botVsHuman, 'White', false)).toBe('bot · white');
		expect(seatDisplaySub(botVsHuman, 'Black', false)).toBe('guest · black');
		expect(seatDisplaySub(botVsHuman, 'Black', true)).toBe('live · black');
	});
});

describe('seatRating', () => {
	const rated: Players = {
		white: { kind: 'Human', name: 'QuietRook', rating: 1756 },
		black: { kind: 'Bot', name: 'house greedy' },
	};

	it('surfaces a settled rating when the server sent one', () => {
		expect(seatRating(rated, 'White')).toBe(1756);
	});

	it('is undefined when the server did not say — never 0, never a guess', () => {
		expect(seatRating(rated, 'Black')).toBeUndefined();
		expect(seatRating(null, 'White')).toBeUndefined();
	});
});

describe('seekOffer', () => {
	it('shows a bot seek by name with the bot badge', () => {
		const seek: Seek = {
			id: 's1',
			timeControl: { Unlimited: {} },
			kind: 'Bot',
			name: 'house greedy',
		};
		expect(seekOffer(seek)).toEqual({ name: 'house greedy', bot: true });
	});

	it('keeps human (and pre-identity) seeks anonymous', () => {
		expect(
			seekOffer({ id: 's2', timeControl: { Unlimited: {} }, kind: 'Human', name: null }),
		).toEqual({
			name: 'Anonymous player',
			bot: false,
		});
		expect(seekOffer({ id: 's3', timeControl: { Unlimited: {} } })).toEqual({
			name: 'Anonymous player',
			bot: false,
		});
	});
});

describe('a registered player is not a guest (#194 step 4)', () => {
	const named = (name: string | null): Players => ({
		white: { kind: 'Human', name },
		black: { kind: 'Bot', name: 'acme alice' },
	});

	it('shows a named human seat by nickname rather than "You"/"Opponent"', () => {
		expect(seatDisplayName(named('QuietRook'), 'White', 'Black', false)).toBe('QuietRook');
	});

	it('still says "You"/"Opponent" for an anonymous human seat', () => {
		expect(seatDisplayName(named(null), 'White', 'Black', false)).toBe('Opponent');
		expect(seatDisplayName(named(null), 'White', 'White', false)).toBe('You');
	});

	it('subtitles a named human as a player, not a guest', () => {
		expect(seatDisplaySub(named('QuietRook'), 'White', false)).toBe('player · white');
	});

	it('keeps calling an anonymous human a guest', () => {
		expect(seatDisplaySub(named(null), 'White', false)).toBe('guest · white');
	});

	it('keeps a bot a bot regardless', () => {
		expect(seatDisplaySub(named('QuietRook'), 'Black', false)).toBe('bot · black');
	});
});
