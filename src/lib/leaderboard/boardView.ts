// How the leaderboard draws the rows the server ranked (#261). Pure and rune-free.
//
// The server decides the order and sends the number it ordered by; nothing here ranks,
// re-sorts or renumbers a row. This module only answers how a row is shown:
//
//   - the 95% range of every row as a bar on ONE scale shared by the rows on screen, so the
//     left ends of the bars step down the table the way the places do;
//   - which rows a search by name keeps (their places stay the server's);
//   - who counts as a newcomer;
//   - how the time of the last update is written.
//
// A row whose range the server does not report, and the documented legacy contract cannot
// supply, has no bar. It is left out of the scale rather than drawn from a guess.
import {
	confidenceInterval,
	orderingScore,
	type RatingEstimateInput,
} from '../ratings/ratingPresentation';
import type { LeaderRow } from './leaderboardApi';

/** The rows shown first, and how many "show more" adds. */
export const FIRST_PAGE = 25;
export const MORE_STEP = 25;

/** Fewer rated games than this and a row carries the "new" tag. A presentation choice of this
 * page, not a server rule: the board itself already leaves out ratings that have not settled. */
export const NEWCOMER_GAMES = 30;

export interface Range {
	low: number;
	high: number;
}

/** The scale every bar of one table is drawn on. */
export interface Scale {
	min: number;
	max: number;
}

/** Where a row's bar lies on the scale, in percent of its width. */
export interface Bar {
	/** Left edge of the range. */
	start: number;
	/** Width of the range. */
	width: number;
	/** Where the rating sits. */
	dot: number;
}

type Rated = RatingEstimateInput & { orderingValue?: number | null; orderingRule?: string | null };

/** The 95% range of a row: the server's bounds when it sends them. */
export function rangeOf(row: Rated): Range | null {
	return confidenceInterval(row);
}

/** The number the server ordered the row by ("Ranks at"). */
export function ranksAt(row: Rated): number | null {
	return orderingScore(row);
}

/** One scale for all the rows: from the lowest low end to the highest high end, widened to
 * round numbers so the three labels over the column read easily. Null when no row has a range. */
export function scaleOf(rows: readonly Rated[], step = 5): Scale | null {
	let min = Infinity;
	let max = -Infinity;
	for (const row of rows) {
		const range = rangeOf(row);
		if (!range) continue;
		min = Math.min(min, range.low, row.rating);
		max = Math.max(max, range.high, row.rating);
	}
	if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
	const low = Math.floor(min / step) * step;
	const high = Math.ceil(max / step) * step;
	// A single point still needs a width to be drawn on.
	return high > low ? { min: low, max: high } : { min: low - step, max: high + step };
}

/** The middle label of the scale. */
export function scaleMiddle(scale: Scale): number {
	return (scale.min + scale.max) / 2;
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));

/** A row's bar on the shared scale. Null when the row has no range. */
export function barOf(row: Rated, scale: Scale | null): Bar | null {
	const range = rangeOf(row);
	if (!range || !scale) return null;
	const span = scale.max - scale.min;
	const at = (value: number) => clamp(((value - scale.min) / span) * 100);
	const start = at(range.low);
	return { start, width: at(range.high) - start, dot: at(row.rating) };
}

/** What a search compares: a bot by its team and name, as the table writes it; a person by
 * the nickname. */
export function displayName(row: Pick<LeaderRow, 'kind' | 'team' | 'name'>): string {
	return row.kind !== 'player' && row.team ? `${row.team} ${row.name}` : row.name;
}

const normalise = (text: string) => text.trim().toLowerCase();

/** The rows whose name contains what was typed; case and outer spaces do not matter. The
 * order and the places are the server's. */
export function searchRows<T extends Pick<LeaderRow, 'kind' | 'team' | 'name'>>(
	rows: readonly T[],
	query: string,
): T[] {
	const wanted = normalise(query);
	if (!wanted) return [...rows];
	return rows.filter((row) => normalise(displayName(row)).includes(wanted));
}

/** Few rated games so far. */
export function isNewcomer(row: Pick<LeaderRow, 'games'>): boolean {
	return row.games < NEWCOMER_GAMES;
}

const updatedFormatter = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	timeZone: 'UTC',
});
const dayFormatter = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	timeZone: 'UTC',
});

function instant(value: string | null | undefined): Date | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isFinite(date.getTime()) ? date : null;
}

/** "27 Nov 2026, 07:15": when the board was last worked out, to the minute, in UTC so it names
 * the same moment for every reader. Null when the server does not say. */
export function updatedAt(value: string | null | undefined): string | null {
	const date = instant(value);
	return date ? updatedFormatter.format(date) : null;
}

/** "20 Nov 2026": the day a snapshot was saved, in UTC. */
export function savedDay(value: string | null | undefined): string | null {
	const date = instant(value);
	return date ? dayFormatter.format(date) : null;
}
