/**
 * The list of all live games on Arena (#260): which games a visitor's filters keep, in what
 * order, and how many of them are on screen.
 *
 * The order is the rule that picks the featured game (`featured.ts`): top rated first. The
 * filters are who plays (anyone, a game with a human in it, bots only), the speed the game
 * counts as, and a search by the name of either player.
 *
 * All of it is applied here, to the page of games the client receives. play-api caps that page
 * and orders it by activity, so with more games running than the cap the list is a list of the
 * most active ones, and the page says so. Once play-api can order, page and filter the listing
 * itself (play-api#332) these functions become the fallback, not the source.
 *
 * Pure and rune-free: the page owns the reading and the state of the controls.
 */
import type { LiveGame, PublicPlayer } from '#lib/live/liveTypes.js';
import { ratingCategoryOf, type RatingCategory } from '#lib/live/ratingCategory.js';
import { rankGames } from './featured';

/** Who plays: anyone, at least one person, or two bots. */
export type GameKind = 'all' | 'human' | 'bots';
export const GAME_KINDS: readonly GameKind[] = ['all', 'human', 'bots'];

/** The speed a game counts as, or any. */
export type SpeedFilter = 'any' | RatingCategory;

export interface GameFilters {
	kind: GameKind;
	speed: SpeedFilter;
	/** What the visitor typed into the search field. */
	query: string;
}

export const NO_FILTERS: GameFilters = { kind: 'all', speed: 'any', query: '' };

/** How many games the list starts with, and how many "show more" adds. */
export const FIRST_PAGE = 25;
export const MORE_STEP = 25;

const seats = (game: LiveGame): PublicPlayer[] =>
	game.players ? [game.players.white, game.players.black] : [];

/** A person sits in the game. A game whose players the server does not name is not counted:
 * the mark must mean a person is there, never "we do not know". */
export function hasHuman(game: LiveGame): boolean {
	return seats(game).some((seat) => seat.kind === 'Human');
}

/** Both seats are bots. */
export function botsOnly(game: LiveGame): boolean {
	const players = seats(game);
	return players.length === 2 && players.every((seat) => seat.kind === 'Bot');
}

const matchesKind = (game: LiveGame, kind: GameKind): boolean =>
	kind === 'all' || (kind === 'human' ? hasHuman(game) : botsOnly(game));

/** The search compares what was typed with the names of both players, ignoring case and the
 * spaces around what was typed. An empty search keeps every game. A guest has no name, so no
 * search finds one: the "with a human" filter is the way to them. */
function matchesQuery(game: LiveGame, query: string): boolean {
	const wanted = query.trim().toLocaleLowerCase();
	if (!wanted) return true;
	return seats(game).some((seat) => seat.name?.toLocaleLowerCase().includes(wanted) ?? false);
}

/** The games the filters keep, top rated first. */
export function filterGames(games: readonly LiveGame[], filters: GameFilters): LiveGame[] {
	return rankGames(
		games.filter(
			(game) =>
				matchesKind(game, filters.kind) &&
				(filters.speed === 'any' || ratingCategoryOf(game.timeControl) === filters.speed) &&
				matchesQuery(game, filters.query),
		),
	);
}

/** How many of the received games each "who plays" filter keeps, for the numbers on the chips.
 * The speed and the search are left out on purpose: the chips say what is there to choose
 * from, and do not jump while the visitor types. */
export function countByKind(games: readonly LiveGame[]): Record<GameKind, number> {
	return {
		all: games.length,
		human: games.filter(hasHuman).length,
		bots: games.filter(botsOnly).length,
	};
}

/** Whether any filter is narrowing the list. */
export function isFiltered(filters: GameFilters): boolean {
	return filters.kind !== 'all' || filters.speed !== 'any' || filters.query.trim() !== '';
}
