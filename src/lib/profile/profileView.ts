// What a public profile shows, worked out from what the server sent (#262). Pure and rune-free.
//
// One template serves a bot and a person: play-api shapes both profiles alike on purpose, so
// the page asks this module the same questions about either.
//
//   - a tile per speed, in the fixed order of the speeds. A speed never played has a tile that
//     says so; it is never given a number;
//   - two records, against bots and against people, from the per-opponent rows. They count
//     every recorded game, rated or not, exactly as those rows do;
//   - the opponents met most, most games first;
//   - whether the bot is in a game right now, from the public list of live games.
//
// Nothing here ranks anybody or computes a rating: the rating, its deviation and the place on
// the board are the server's, and a place the server did not send is not shown.
import type { PlayerOpponent } from '../games/gamesApi';
import type { CategoryRating, TrainingCategoryRating } from '../leaderboard/leaderboardApi';
import type { LiveGame } from '../live/liveTypes';
import { RATING_CATEGORY_ORDER, type RatingCategory } from '../live/ratingCategory';
import { confidenceInterval } from '../ratings/ratingPresentation';
import { winRate, type OutcomeCounts } from '../stats/playerRecord';

/** Who a profile is of. A bot is known by its team and name, a person by the nickname. */
export type Subject =
	{ kind: 'bot'; team: string; name: string } | { kind: 'player'; nickname: string };

/** Rows shown before anything is expanded. */
export const FIRST_OPPONENTS = 8;
export const FIRST_GAMES = 8;

export interface RatingTile {
	category: RatingCategory;
	/** Null when the speed was never played: the tile says so and shows no number. */
	rated: {
		rating: number;
		range: { low: number; high: number } | null;
		games: number;
		provisional: boolean;
		/** The place on that speed's board, when the server reports one. */
		rank: number | null;
	} | null;
}

type AnyRating = (CategoryRating | TrainingCategoryRating) & { rank?: number | null };

/** One tile per speed, bullet to rapid, whatever the order or the gaps on the wire. */
export function ratingTiles(ratings: readonly AnyRating[] | null | undefined): RatingTile[] {
	return RATING_CATEGORY_ORDER.map((category) => {
		const found = (ratings ?? []).find((rating) => rating.category === category);
		if (!found) return { category, rated: null };
		const rank = found.rank;
		return {
			category,
			rated: {
				rating: found.rating,
				range: confidenceInterval(found),
				games: found.games,
				provisional: found.provisional,
				rank: typeof rank === 'number' && Number.isInteger(rank) && rank > 0 ? rank : null,
			},
		};
	});
}

export interface Tally extends OutcomeCounts {
	games: number;
}

const EMPTY: Tally = { games: 0, wins: 0, draws: 0, losses: 0 };

const add = (sum: Tally, row: Tally): Tally => ({
	games: sum.games + row.games,
	wins: sum.wins + row.wins,
	draws: sum.draws + row.draws,
	losses: sum.losses + row.losses,
});

const isBotRow = (row: PlayerOpponent) => row.team !== null && row.botName !== null;

/** The two records of a profile. A side never played is null, so the tile can say "no games". */
export function records(opponents: readonly PlayerOpponent[] | null | undefined): {
	bots: Tally | null;
	people: Tally | null;
} {
	const rows = opponents ?? [];
	const bots = rows.filter(isBotRow).reduce(add, EMPTY);
	// Every human opponent is one collapsed row on the wire; summed in case there is more.
	const people = rows.filter((row) => !isBotRow(row)).reduce(add, EMPTY);
	return { bots: bots.games > 0 ? bots : null, people: people.games > 0 ? people : null };
}

export interface OpponentRow extends Tally {
	team: string;
	botName: string;
}

/** The bots met, most games first; equal counts keep the order the server sent. */
export function botOpponents(
	opponents: readonly PlayerOpponent[] | null | undefined,
): OpponentRow[] {
	return (opponents ?? [])
		.filter((row): row is PlayerOpponent & { team: string; botName: string } => isBotRow(row))
		.map(({ team, botName, games, wins, draws, losses }) => ({
			team,
			botName,
			games,
			wins,
			draws,
			losses,
		}))
		.sort((a, b) => b.games - a.games);
}

/** The win share over decided games, as a whole percent. */
export function winPercent(counts: OutcomeCounts): number {
	return Math.round(winRate(counts) * 100);
}

/** How a record is drawn as a bar: the share of each outcome in percent of all its games. */
export function outcomeBar(tally: Tally): { won: number; drawn: number; lost: number } {
	const total = tally.wins + tally.draws + tally.losses;
	if (total === 0) return { won: 0, drawn: 0, lost: 0 };
	const share = (count: number) => (count / total) * 100;
	return { won: share(tally.wins), drawn: share(tally.draws), lost: share(tally.losses) };
}

/** The game a bot is playing now, if the public list of live games shows one. A seat carries a
 * bot as "<team> <name>". With several, the one further along is taken. */
export function liveGameOf(
	games: readonly LiveGame[],
	subject: { team: string; name: string },
): string | null {
	const wanted = `${subject.team} ${subject.name}`;
	const playing = games
		.filter((game) =>
			[game.players?.white, game.players?.black].some(
				(seat) => seat?.kind === 'Bot' && seat.name === wanted,
			),
		)
		.sort((a, b) => b.version - a.version);
	return playing[0]?.gameId ?? null;
}

/** Rated games across every speed, and what is left of all the recorded ones. The two counts
 * are separate server reads, so they may disagree for a moment: then no split is offered. */
export function gameCounts(
	ratings: readonly CategoryRating[] | null | undefined,
	totalGames: number | null | undefined,
): { rated: number; other: number; total: number; consistent: boolean } {
	const rated = (ratings ?? []).reduce((sum, rating) => sum + rating.games, 0);
	const total = totalGames ?? 0;
	return { rated, other: Math.max(0, total - rated), total, consistent: total >= rated };
}

const sameYear = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'short',
	hour: '2-digit',
	minute: '2-digit',
});
const otherYear = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
});

/** When a game ended, in the reader's own time: "27 Nov, 09:16". The year is written only
 * when it is not the current one. Empty when the server sent no usable time. */
export function playedAt(value: string | null | undefined, now: Date = new Date()): string {
	if (!value) return '';
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return '';
	return (date.getFullYear() === now.getFullYear() ? sameYear : otherYear).format(date);
}
