import { describe, expect, it } from 'vitest';
import type { PlayerOpponent } from '../games/gamesApi';
import type { CategoryRating } from '../leaderboard/leaderboardApi';
import type { LiveGame } from '../live/liveTypes';
import {
	botOpponents,
	gameCounts,
	liveGameOf,
	outcomeBar,
	playedAt,
	ratingTiles,
	records,
	winPercent,
} from './profileView';

const rating = (category: CategoryRating['category'], extra: Partial<CategoryRating> = {}) => ({
	category,
	rating: 2000,
	rd: 50,
	provisional: false,
	games: 10,
	wins: 6,
	draws: 1,
	losses: 3,
	...extra,
});

const opponent = (
	team: string | null,
	botName: string | null,
	games: number,
	wins: number,
	draws = 0,
): PlayerOpponent => ({
	opponent: { kind: team ? 'Bot' : 'Human', name: team ? `${team} ${botName}` : null },
	team,
	botName,
	games,
	wins,
	draws,
	losses: games - wins - draws,
	lastPlayedAt: '2026-11-27T09:00:00Z',
});

describe('a rating tile per speed', () => {
	it('keeps the fixed order of the speeds and leaves an unplayed one without a number', () => {
		const tiles = ratingTiles([rating('rapid', { rating: 1058 }), rating('blitz')]);
		expect(tiles.map((tile) => tile.category)).toEqual(['bullet', 'blitz', 'rapid']);
		expect(tiles[0].rated).toBeNull();
		expect(tiles[2].rated?.rating).toBe(1058);
	});

	it('carries the range, the games and the provisional flag of that speed only', () => {
		const [, blitz] = ratingTiles([rating('blitz', { provisional: true, games: 4 })]);
		expect(blitz.rated?.range?.low).toBeCloseTo(1902);
		expect(blitz.rated?.range?.high).toBeCloseTo(2098);
		expect(blitz.rated).toMatchObject({ games: 4, provisional: true });
	});

	it('shows the place only when the server reports a usable one', () => {
		const place = (rank: unknown) =>
			ratingTiles([{ ...rating('blitz'), rank } as CategoryRating])[1].rated?.rank;
		expect(place(14)).toBe(14);
		expect(place(undefined)).toBeNull();
		expect(place(null)).toBeNull();
		expect(place(0)).toBeNull();
		expect(place(1.5)).toBeNull();
	});

	it('has three empty tiles when the server sends no ratings', () => {
		expect(ratingTiles(undefined).every((tile) => tile.rated === null)).toBe(true);
	});
});

describe('the two records', () => {
	const rows = [
		opponent('grove', 'cedar-1', 10, 7, 1),
		opponent('grove', 'larch-1', 5, 1),
		opponent(null, null, 4, 3),
	];

	it('sums the bots and keeps the people apart', () => {
		expect(records(rows)).toEqual({
			bots: { games: 15, wins: 8, draws: 1, losses: 6 },
			people: { games: 4, wins: 3, draws: 0, losses: 1 },
		});
	});

	it('says nothing was played instead of a zero record', () => {
		expect(records([opponent('grove', 'cedar-1', 2, 1)]).people).toBeNull();
		expect(records([])).toEqual({ bots: null, people: null });
		expect(records(undefined)).toEqual({ bots: null, people: null });
	});
});

describe('the opponents met most', () => {
	it('lists bots only, most games first, equal counts in the order sent', () => {
		const rows = [
			opponent('grove', 'elm-1', 3, 1),
			opponent(null, null, 99, 50),
			opponent('grove', 'cedar-1', 10, 7),
			opponent('grove', 'ash-1', 3, 2),
		];
		expect(botOpponents(rows).map((row) => row.botName)).toEqual(['cedar-1', 'elm-1', 'ash-1']);
	});

	it('gives the win share over decided games and the shares of a bar', () => {
		const row = { games: 10, wins: 6, draws: 2, losses: 2 };
		expect(winPercent(row)).toBe(75);
		expect(outcomeBar(row)).toEqual({ won: 60, drawn: 20, lost: 20 });
		expect(outcomeBar({ games: 0, wins: 0, draws: 0, losses: 0 })).toEqual({
			won: 0,
			drawn: 0,
			lost: 0,
		});
	});
});

describe('whether a bot plays now', () => {
	const game = (id: string, version: number, white: string, kind: 'Bot' | 'Human' = 'Bot') =>
		({
			gameId: id,
			version,
			players: { white: { kind, name: white }, black: { kind: 'Bot', name: 'grove other' } },
		}) as unknown as LiveGame;
	const cedar = { team: 'grove', name: 'cedar-1' };

	it('finds the game where a seat is that bot, by its team and name', () => {
		expect(liveGameOf([game('a', 1, 'grove larch-1'), game('b', 2, 'grove cedar-1')], cedar)).toBe(
			'b',
		);
	});

	it('takes the game further along when there are several', () => {
		expect(liveGameOf([game('a', 5, 'grove cedar-1'), game('b', 9, 'grove cedar-1')], cedar)).toBe(
			'b',
		);
	});

	it('is not fooled by a person with the same name, a longer name or unknown players', () => {
		const unknown = { gameId: 'c', version: 1, players: null } as unknown as LiveGame;
		expect(
			liveGameOf(
				[game('a', 1, 'grove cedar-1', 'Human'), game('b', 1, 'grove cedar-10'), unknown],
				cedar,
			),
		).toBeNull();
	});
});

describe('the counts of a person', () => {
	it('adds the rated games of every speed and leaves the rest as other games', () => {
		expect(gameCounts([rating('blitz', { games: 3 }), rating('rapid', { games: 2 })], 9)).toEqual({
			rated: 5,
			other: 4,
			total: 9,
			consistent: true,
		});
	});

	it('offers no split when two separate reads disagree', () => {
		expect(gameCounts([rating('blitz', { games: 3 })], 2)).toMatchObject({
			other: 0,
			consistent: false,
		});
	});
});

describe('when a game ended', () => {
	const now = new Date(2026, 10, 28, 12, 0);

	it('writes the day and the time, and the year only when it is another one', () => {
		expect(playedAt(new Date(2026, 10, 27, 9, 16).toISOString(), now)).toBe('27 Nov, 09:16');
		expect(playedAt(new Date(2025, 11, 31, 23, 5).toISOString(), now)).toBe('31 Dec 2025, 23:05');
	});

	it('writes nothing for a time the server did not send or that is not a time', () => {
		expect(playedAt(null, now)).toBe('');
		expect(playedAt('soon', now)).toBe('');
	});
});
