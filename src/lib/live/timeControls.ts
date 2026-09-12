import { m } from '$lib/paraglide/messages.js';
import type { TimeControl } from './liveTypes';
import {
	estimatedSeconds,
	ratingCategoryOf,
	RATING_CATEGORY_LABELS,
	RATING_CATEGORY_ORDER,
	type RatingCategory,
} from './ratingCategory';

export interface TimeControlPreset {
	/** Stable machine identity — never shown in UI, never translated. Safe to persist and compare
	 * across code changes as long as the underlying time control is the same. */
	id: string;
	label: string;
	// `null` omits the field on create, which now yields the server's default (Fischer 600+10), NOT
	// Unlimited — see liveTypes.ts. No preset is null today; the type keeps the option open.
	value: TimeControl | null;
}

/** Helper to construct a time control preset with dynamic localized label. */
function makePreset<T extends TimeControl | null>(id: string, value: T) {
	return {
		id,
		get label() {
			return timeControlLabel(value);
		},
		value,
	};
}

/** The time-control choices offered when creating a game or a seek. The first preset is the
 * default (both pickers start at index 0). */
export const timeControlPresets: readonly TimeControlPreset[] = [
	makePreset('fischer-300-3', { Fischer: { initialSeconds: 300, incrementSeconds: 3 } }),
	makePreset('fischer-180-2', { Fischer: { initialSeconds: 180, incrementSeconds: 2 } }),
	makePreset('sd-300', { SuddenDeath: { initialSeconds: 300 } }),
	makePreset('fischer-300-5', { Fischer: { initialSeconds: 300, incrementSeconds: 5 } }),
	makePreset('sd-600', { SuddenDeath: { initialSeconds: 600 } }),
	makePreset('fischer-600-5', { Fischer: { initialSeconds: 600, incrementSeconds: 5 } }),
	makePreset('fischer-600-10', { Fischer: { initialSeconds: 600, incrementSeconds: 10 } }),
	makePreset('fischer-900-10', { Fischer: { initialSeconds: 900, incrementSeconds: 10 } }),
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
		get label() {
			return RATING_CATEGORY_LABELS[category];
		},
		presets: entries
			.filter((e) => e.category === category)
			.sort((a, b) => compareDisplay(a.preset, b.preset))
			.map(({ index, preset }) => ({ index, preset })),
	})).filter((g) => g.presets.length > 0);
})();

export interface BotTimeControlPreset {
	/** Stable machine identity — never shown in UI, never translated. Safe to persist and compare
	 * across code changes as long as the underlying time control is the same. */
	id: string;
	label: string;
	value: TimeControl; // never null: a catalog game is never unlimited (ADR-0014)
}

/** The 6 presets offered when starting a game against a catalog bot (ADR-0014) — a curated subset,
 * not a 1:1 mirror of `timeControlPresets` (no unlimited; fewer, rounder options). */
export const botTimeControlPresets: readonly BotTimeControlPreset[] = [
	makePreset('fischer-60-1', { Fischer: { initialSeconds: 60, incrementSeconds: 1 } }),
	makePreset('fischer-180-3', { Fischer: { initialSeconds: 180, incrementSeconds: 3 } }),
	makePreset('sd-300', { SuddenDeath: { initialSeconds: 300 } }),
	makePreset('fischer-300-5', { Fischer: { initialSeconds: 300, incrementSeconds: 5 } }),
	makePreset('sd-600', { SuddenDeath: { initialSeconds: 600 } }),
	makePreset('fischer-600-10', { Fischer: { initialSeconds: 600, incrementSeconds: 10 } }),
];

/** Finds the default bot time control preset index by stable ID ('fischer-300-5').
 * Throws if the default preset is missing. */
export function findDefaultBotTimeControlIndex(
	presets: readonly BotTimeControlPreset[] = botTimeControlPresets,
): number {
	const index = presets.findIndex((p) => p.id === 'fischer-300-5');
	if (index === -1)
		throw new Error('botTimeControlPresets: no "fischer-300-5" preset — the default is broken');
	return index;
}

/** Index of the default preset (5 + 5) — looked up by id, so a reorder or label rename can't
 * silently point the default at the wrong entry (fails fast at module load instead). */
export const defaultBotTimeControlIndex: number = findDefaultBotTimeControlIndex();

/** A short human label for any time control (e.g. to show a seek's control in the lobby list). Tolerates a
 * missing control (treated as Unlimited) so a malformed response can never throw. */
export function timeControlLabel(tc: TimeControl | null | undefined): string {
	if (!tc) return m.common_time_control_unlimited();
	if ('SuddenDeath' in tc)
		return m.common_time_control_min({ minutes: Math.round(tc.SuddenDeath.initialSeconds / 60) });
	if ('Fischer' in tc)
		return m.common_time_control_fischer({
			initial: Math.round(tc.Fischer.initialSeconds / 60),
			increment: tc.Fischer.incrementSeconds,
		});
	if ('PerMove' in tc)
		return m.common_time_control_per_move({ seconds: tc.PerMove.secondsPerMove });
	return m.common_time_control_unlimited();
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
	if (fischer)
		return m.common_time_control_fischer({
			initial: Math.round(Number(fischer[1]) / 60),
			increment: fischer[2],
		});
	const suddenDeath = /^SuddenDeath\((\d+)\)$/.exec(raw);
	if (suddenDeath)
		return m.common_time_control_min({ minutes: Math.round(Number(suddenDeath[1]) / 60) });
	const perMove = /^PerMove\((\d+)\)$/.exec(raw);
	if (perMove) return m.common_time_control_per_move({ seconds: perMove[1] });
	return m.common_time_control_unlimited();
}
