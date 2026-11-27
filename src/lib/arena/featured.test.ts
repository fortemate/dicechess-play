import { describe, expect, it } from 'vitest';
import type { LiveGame, PublicPlayer } from '#lib/live/liveTypes.js';
import {
	FINAL_POSITION_MS,
	featuredStep,
	pickFeatured,
	rankGames,
	ratingSum,
	type FeaturedState,
} from './featured';

// The featured game of Arena (#259): highest sum of both seats' ratings, a seat without a
// rating counts lowest, and the game stays until it ends.

const seat = (rating?: number): PublicPlayer => ({
	kind: 'Bot',
	name: 'bot',
	...(rating === undefined ? {} : { rating }),
});
const game = (gameId: string, white?: number, black?: number, version = 1): LiveGame => ({
	gameId,
	players: { white: seat(white), black: seat(black) },
	timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } },
	activeSeat: 'White',
	dicePending: false,
	clocks: null,
	version,
});
const ids = (games: readonly LiveGame[]) => games.map((g) => g.gameId);

describe('ratingSum', () => {
	it('adds both seats', () => {
		expect(ratingSum(game('a', 2300, 2324))).toBe(4624);
	});

	it('counts a seat without a rating lowest, and a game without players as nothing', () => {
		expect(ratingSum(game('a', 2300))).toBe(2300);
		expect(ratingSum(game('a'))).toBe(0);
		expect(ratingSum({ ...game('a'), players: null })).toBe(0);
	});
});

describe('rankGames', () => {
	it('puts the highest sum first', () => {
		const games = [game('low', 1500, 1500), game('high', 2300, 2324), game('mid', 2000, 1900)];
		expect(ids(rankGames(games))).toEqual(['high', 'mid', 'low']);
	});

	it('puts a game with an unrated seat below any game of two rated seats that sums higher', () => {
		const games = [game('one-strong', 3000), game('two', 1600, 1500), game('none')];
		expect(ids(rankGames(games))).toEqual(['two', 'one-strong', 'none']);
	});

	it('breaks equal sums by rated seats, then by activity, then by id', () => {
		// The same sum from one seat alone ranks below the same sum from two.
		expect(ids(rankGames([game('alone', 3000), game('pair', 1500, 1500)]))).toEqual([
			'pair',
			'alone',
		]);
		// Equal in every rating: the game further along comes first.
		expect(ids(rankGames([game('early', 1500, 1500, 3), game('late', 1500, 1500, 40)]))).toEqual([
			'late',
			'early',
		]);
		// Equal in everything: the id decides, so every poll gives the same answer.
		expect(ids(rankGames([game('b', 1500, 1500), game('a', 1500, 1500)]))).toEqual(['a', 'b']);
		expect(ids(rankGames([game('b'), game('a')]))).toEqual(['a', 'b']);
	});

	it('does not reorder the list it was given', () => {
		const games = [game('low', 1500, 1500), game('high', 2300, 2324)];
		rankGames(games);
		expect(ids(games)).toEqual(['low', 'high']);
	});
});

describe('pickFeatured', () => {
	it('picks by the rule, and nothing from an empty list', () => {
		expect(pickFeatured([game('low', 1500, 1500), game('high', 2300, 2324)])?.gameId).toBe('high');
		expect(pickFeatured([])).toBeUndefined();
	});

	it('can leave one game out', () => {
		const games = [game('low', 1500, 1500), game('high', 2300, 2324)];
		expect(pickFeatured(games, 'high')?.gameId).toBe('low');
		expect(pickFeatured([game('only')], 'only')).toBeUndefined();
	});
});

describe('featuredStep', () => {
	const weak = game('weak', 1500, 1500);
	const strong = game('strong', 2300, 2324);
	const live = (gameId: string): FeaturedState => ({ phase: 'live', gameId });

	it('starts with the game the rule picks', () => {
		expect(featuredStep(null, [weak, strong], 'playing', 0)).toEqual(live('strong'));
		expect(featuredStep(null, [], 'playing', 0)).toBeNull();
	});

	it('does not change while the game is still being played, whatever starts meanwhile', () => {
		const current = live('weak');
		// A far stronger game has started. The featured game stays.
		expect(featuredStep(current, [weak, strong], 'playing', 1000)).toBe(current);
	});

	it('stays even when the featured game is not in the list it was given', () => {
		// The listing is capped: a game can drop off the page while it is still being played.
		const current = live('weak');
		expect(featuredStep(current, [strong], 'playing', 1000)).toBe(current);
		expect(featuredStep(current, [], 'playing', 1000)).toBe(current);
	});

	it('shows the final position for a while when the game ends', () => {
		expect(featuredStep(live('weak'), [strong], 'over', 1000)).toEqual({
			phase: 'final',
			gameId: 'weak',
			until: 1000 + FINAL_POSITION_MS,
		});
	});

	it('keeps the final position until its time is up, then hands over to the next game', () => {
		const final: FeaturedState = { phase: 'final', gameId: 'weak', until: 5000 };
		expect(featuredStep(final, [strong], 'over', 4999)).toBe(final);
		expect(featuredStep(final, [strong], 'over', 5000)).toEqual(live('strong'));
	});

	it('never features the game that has just ended again', () => {
		const final: FeaturedState = { phase: 'final', gameId: 'strong', until: 5000 };
		// The listing can still carry it for a moment.
		expect(featuredStep(final, [strong, weak], 'over', 5000)).toEqual(live('weak'));
	});

	it('keeps the final position on screen when no other game is being played', () => {
		const final: FeaturedState = { phase: 'final', gameId: 'weak', until: 5000 };
		expect(featuredStep(final, [], 'over', 9000)).toBe(final);
		expect(featuredStep(final, [weak], 'over', 9000)).toBe(final);
	});

	it('moves on at once when the server no longer knows the game', () => {
		expect(featuredStep(live('weak'), [weak, strong], 'gone', 1000)).toEqual(live('strong'));
		expect(featuredStep(live('weak'), [weak], 'gone', 1000)).toBeNull();
	});
});
