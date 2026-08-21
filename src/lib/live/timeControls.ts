import type { TimeControl } from './liveTypes';
import {
	estimatedSeconds,
	ratingCategoryOf,
	RATING_CATEGORY_LABELS,
	RATING_CATEGORY_ORDER,
	type RatingCategory,
} from './ratingCategory';

export interface TimeControlPreset {
	label: string;
	// `null` omits the field on create, which now yields the server's default (Fischer 600+10), NOT
	// Unlimited — see liveTypes.ts. No preset is null today; the type keeps the option open.
	value: TimeControl | null;
}

/** The time-control choices offered when creating a game or a seek. The first preset is the
 * default (both pickers start at index 0). */
export const timeControlPresets: readonly TimeControlPreset[] = [
	{ label: '5 + 3', value: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } } },
	{ label: '3 + 2', value: { Fischer: { initialSeconds: 180, incrementSeconds: 2 } } },
	{ label: '5 min', value: { SuddenDeath: { initialSeconds: 300 } } },
	{ label: '5 + 5', value: { Fischer: { initialSeconds: 300, incrementSeconds: 5 } } },
	{ label: '10 min', value: { SuddenDeath: { initialSeconds: 600 } } },
	{ label: '10 + 5', value: { Fischer: { initialSeconds: 600, incrementSeconds: 5 } } },
	{ label: '10 + 10', value: { Fischer: { initialSeconds: 600, incrementSeconds: 10 } } },
	{ label: '15 + 10', value: { Fischer: { initialSeconds: 900, incrementSeconds: 10 } } },
];

export interface TimeControlGroup {
	category: RatingCategory;
	label: string;
	presets: { index: number; preset: TimeControlPreset }[];
}

/** Within a group, increment controls lead (a dice-chess turn is a roll plus up to three moves, so
 * increment matters more than in chess), each kind in ascending estimated duration. */
function compareDisplay(a: TimeControlPreset, b: TimeControlPreset): number {
	const kind = (p: TimeControlPreset) => (p.value && 'Fischer' in p.value ? 0 : 1);
	return kind(a) - kind(b) || (estimatedSeconds(a.value) ?? 0) - (estimatedSeconds(b.value) ?? 0);
}

/** Presets arranged for display, DERIVED from the rating-category rule rather than hand-maintained
 * (#258): the groups are exactly the scales the games count on, so the picker's headings and the
 * leaderboard's categories can never drift apart. A group only renders when a preset falls in it —
 * today's lobby presets produce Blitz and Rapid, and the derivation reproducing the previous
 * hand-written grouping is pinned by a test. An uncategorised preset (none today) would fail fast
 * at module load rather than silently vanish from the picker. */
export const timeControlGroups: readonly TimeControlGroup[] = (() => {
	const entries = timeControlPresets.map((preset, index) => ({
		index,
		preset,
		category: ratingCategoryOf(preset.value),
	}));
	for (const e of entries)
		if (e.category === null)
			throw new Error(`timeControlGroups: preset "${e.preset.label}" has no rating category`);
	return RATING_CATEGORY_ORDER.map((category) => ({
		category,
		label: RATING_CATEGORY_LABELS[category],
		presets: entries
			.filter((e) => e.category === category)
			.sort((a, b) => compareDisplay(a.preset, b.preset))
			.map(({ index, preset }) => ({ index, preset })),
	})).filter((g) => g.presets.length > 0);
})();

export interface BotTimeControlPreset {
	label: string;
	value: TimeControl; // never null: a catalog game is never unlimited (ADR-0014)
}

/** The 6 presets offered when starting a game against a catalog bot (ADR-0014) — a curated subset,
 * not a 1:1 mirror of `timeControlPresets` (no unlimited; fewer, rounder options). */
export const botTimeControlPresets: readonly BotTimeControlPreset[] = [
	{ label: '1 + 1', value: { Fischer: { initialSeconds: 60, incrementSeconds: 1 } } },
	{ label: '3 + 3', value: { Fischer: { initialSeconds: 180, incrementSeconds: 3 } } },
	{ label: '5 min', value: { SuddenDeath: { initialSeconds: 300 } } },
	{ label: '5 + 5', value: { Fischer: { initialSeconds: 300, incrementSeconds: 5 } } },
	{ label: '10 min', value: { SuddenDeath: { initialSeconds: 600 } } },
	{ label: '10 + 10', value: { Fischer: { initialSeconds: 600, incrementSeconds: 10 } } },
];

/** Index of the default preset (5 + 5) — looked up by label, so a reorder can't silently point the
 * default at the wrong entry (fails fast at module load instead). */
export const defaultBotTimeControlIndex: number = (() => {
	const index = botTimeControlPresets.findIndex((p) => p.label === '5 + 5');
	if (index === -1)
		throw new Error('botTimeControlPresets: no "5 + 5" preset — the default is broken');
	return index;
})();

/** A short human label for any time control (e.g. to show a seek's control in the lobby list). Tolerates a
 * missing control (treated as Unlimited) so a malformed response can never throw. */
export function timeControlLabel(tc: TimeControl | null | undefined): string {
	if (!tc) return 'Unlimited';
	if ('SuddenDeath' in tc) return `${Math.round(tc.SuddenDeath.initialSeconds / 60)} min`;
	if ('Fischer' in tc)
		return `${Math.round(tc.Fischer.initialSeconds / 60)} + ${tc.Fischer.incrementSeconds}`;
	if ('PerMove' in tc) return `${tc.PerMove.secondsPerMove}s / move`;
	return 'Unlimited';
}

/** The SAME short label as `timeControlLabel`, but parsed from play-api's `GET /players/{id}/games`
 * wire, which carries the time control as the server's own `TimeControl` ADT `toString()` (e.g.
 * `Fischer(300,3)`, `SuddenDeath(300)`, `PerMove(30)`, `Unlimited`) rather than the structured JSON
 * the live WebSocket wire uses. A distinct parser rather than reshaping that response to fit
 * `timeControlLabel` — the two wires are separate contracts and neither should bend to match the
 * other. Falls back to 'Unlimited' for anything unrecognised, same tolerance as `timeControlLabel`.
 */
export function parseGameResultsTimeControl(raw: string): string {
	const fischer = /^Fischer\((\d+),(\d+)\)$/.exec(raw);
	if (fischer) return `${Math.round(Number(fischer[1]) / 60)} + ${fischer[2]}`;
	const suddenDeath = /^SuddenDeath\((\d+)\)$/.exec(raw);
	if (suddenDeath) return `${Math.round(Number(suddenDeath[1]) / 60)} min`;
	const perMove = /^PerMove\((\d+)\)$/.exec(raw);
	if (perMove) return `${perMove[1]}s / move`;
	return 'Unlimited';
}
