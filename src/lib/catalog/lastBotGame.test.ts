import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { recallBotGame, rematchSetup, rememberBotGame, type BotGameSetup } from './lastBotGame';

const SETUP: BotGameSetup = {
	gameId: 'game-1',
	team: 'acme',
	name: 'alice',
	timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } },
	preferredColor: 'White',
	rated: true,
};

function fakeStorage() {
	const map = new Map<string, string>();
	return {
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
		removeItem: (k: string) => void map.delete(k),
		clear: () => map.clear(),
		key: () => null,
		length: 0,
	} as unknown as Storage;
}

beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('rememberBotGame / recallBotGame', () => {
	it('round-trips the setup for the game it belongs to', () => {
		rememberBotGame(SETUP);

		expect(recallBotGame('game-1')).toEqual(SETUP);
	});

	it('says nothing about a different game — a record is not a guess about the next one', () => {
		rememberBotGame(SETUP);

		expect(recallBotGame('game-2')).toBeNull();
	});

	it('returns null when nothing was ever recorded', () => {
		expect(recallBotGame('game-1')).toBeNull();
	});

	it('keeps only the latest game, so records cannot accumulate', () => {
		rememberBotGame(SETUP);
		rememberBotGame({ ...SETUP, gameId: 'game-2', team: 'other' });

		expect(recallBotGame('game-1')).toBeNull();
		expect(recallBotGame('game-2')?.team).toBe('other');
	});

	it('discards a corrupt record instead of throwing', () => {
		localStorage.setItem('dicechess-play-last-bot-game', '{not json');

		expect(recallBotGame('game-1')).toBeNull();
	});

	it('discards a record missing fields the rematch request needs', () => {
		localStorage.setItem(
			'dicechess-play-last-bot-game',
			JSON.stringify({ gameId: 'game-1', team: 'acme' }),
		);

		expect(recallBotGame('game-1')).toBeNull();
	});

	// A stored timeControl becomes the clock of the NEXT game, so anything the server would not
	// recognise has to be rejected here rather than sent to playBot as-is.
	it.each([
		['an array', []],
		['an empty object', {}],
		['an unknown case', { Bogus: {} }],
		['two cases at once', { Unlimited: {}, Fischer: { initialSeconds: 300, incrementSeconds: 3 } }],
		['a case missing its payload field', { Fischer: { initialSeconds: 300 } }],
		['a case with a non-numeric payload', { PerMove: { secondsPerMove: 'thirty' } }],
	])('discards a record whose timeControl is %s', (_label, timeControl) => {
		localStorage.setItem('dicechess-play-last-bot-game', JSON.stringify({ ...SETUP, timeControl }));

		expect(recallBotGame('game-1')).toBeNull();
	});

	it.each([
		['Unlimited', { Unlimited: {} }],
		['SuddenDeath', { SuddenDeath: { initialSeconds: 300 } }],
		['Fischer', { Fischer: { initialSeconds: 300, incrementSeconds: 3 } }],
		['PerMove', { PerMove: { secondsPerMove: 30 } }],
	])('keeps a record whose timeControl is a valid %s', (_label, timeControl) => {
		localStorage.setItem('dicechess-play-last-bot-game', JSON.stringify({ ...SETUP, timeControl }));

		expect(recallBotGame('game-1')?.timeControl).toEqual(timeControl);
	});

	it('survives storage being unavailable, on both sides', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => {
				throw new Error('denied');
			},
		} as unknown as Storage);

		expect(() => rememberBotGame(SETUP)).not.toThrow();
		expect(recallBotGame('game-1')).toBeNull();
	});
});

describe('rematchSetup', () => {
	it('swaps an explicitly chosen colour — you had the first move, now they do', () => {
		expect(rematchSetup({ ...SETUP, preferredColor: 'White' }).preferredColor).toBe('Black');
		expect(rematchSetup({ ...SETUP, preferredColor: 'Black' }).preferredColor).toBe('White');
	});

	it('leaves random alone — declining to pick is itself a choice', () => {
		expect(rematchSetup({ ...SETUP, preferredColor: 'random' }).preferredColor).toBe('random');
	});

	it('carries every other setting through untouched', () => {
		const next = rematchSetup(SETUP);

		expect(next.team).toBe(SETUP.team);
		expect(next.name).toBe(SETUP.name);
		expect(next.timeControl).toEqual(SETUP.timeControl);
		expect(next.rated).toBe(SETUP.rated);
	});
});
