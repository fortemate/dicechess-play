/**
 * The setup of a game against a starter bot (the bots that run in the browser), shared by the
 * two pages that can start one: Play (`/play`, #257) and the practice page itself (`/practice`,
 * which also offers a rematch when a game ends).
 *
 * Both pages must start the same game from the same choices, so the list of time controls, the
 * way a stored choice is found again and the start itself live here once. The start writes the
 * choices to the preferences store, because that is where the game store reads the clock from,
 * and because the practice page reads them back to show what is being played.
 *
 * This list deliberately stays separate from `botTimeControlPresets` in `live/timeControls.ts`
 * (#20). A starter bot is driven through minutes of limit plus seconds of bonus; an arena bot is
 * a server game with the structured `TimeControl` of the wire. Merging them would force one to
 * bend to the other's format. The lists also differ in content: this one has "Unlimited" and
 * "5 + 3", the arena one has "1 + 1" and "3 + 3". Keep them in sync by hand when presets change.
 */
import { m } from '#lib/paraglide/messages.js';
import { RATING_CATEGORY_LABELS } from '#lib/live/ratingCategory.js';
import { timeControlLabel } from '#lib/live/timeControls.js';
import { preferencesStore } from '#lib/preferencesStore.svelte.js';
import { playWithBotStore } from '#lib/playWithBot/index.js';

export type PracticeColor = 'random' | 'white' | 'black';

/** The setup panel speaks of three colours, and so does the game store: the values are the same. */
export const PRACTICE_COLOR_VALUES = { random: 'random', white: 'white', black: 'black' } as const;

type TimeGroup = 'casual' | 'blitz' | 'rapid';

export interface PracticeTimePreset {
	group: TimeGroup;
	/** Minutes on the clock, or `null` for a game without one. */
	limit: number | null;
	/** Seconds added per turn. */
	bonus: number;
}

/** Unlimited first: a casual game against a bot should not surprise anyone with a flag fall. */
export const PRACTICE_TIME_PRESETS: readonly PracticeTimePreset[] = [
	{ group: 'casual', limit: null, bonus: 0 },
	{ group: 'blitz', limit: 3, bonus: 2 },
	{ group: 'blitz', limit: 5, bonus: 0 },
	{ group: 'blitz', limit: 5, bonus: 3 },
	{ group: 'rapid', limit: 10, bonus: 0 },
	{ group: 'rapid', limit: 10, bonus: 5 },
	{ group: 'rapid', limit: 15, bonus: 10 },
];

/** The words for a preset, from the one place every surface takes them: "Unlimited", "5 min",
 * "5 + 3". */
export function practiceTimeLabel(preset: Pick<PracticeTimePreset, 'limit' | 'bonus'>): string {
	if (preset.limit === null) return timeControlLabel(null);
	return timeControlLabel(
		preset.bonus > 0
			? { Fischer: { initialSeconds: preset.limit * 60, incrementSeconds: preset.bonus } }
			: { SuddenDeath: { initialSeconds: preset.limit * 60 } },
	);
}

const GROUPS: readonly TimeGroup[] = ['casual', 'blitz', 'rapid'];
const GROUP_LABELS: Record<TimeGroup, () => string> = {
	casual: m.game_practice_group_casual,
	blitz: () => RATING_CATEGORY_LABELS.blitz,
	rapid: () => RATING_CATEGORY_LABELS.rapid,
};

/** The rows of the setup panel: one per group, each choice keyed by its index in
 * `PRACTICE_TIME_PRESETS`. A function, so the labels are read when they are shown. */
export function practiceTimeGroups(): {
	label: string;
	options: { value: number; label: string }[];
}[] {
	return GROUPS.map((group) => ({
		label: GROUP_LABELS[group](),
		options: PRACTICE_TIME_PRESETS.map((preset, index) => ({ preset, index }))
			.filter(({ preset }) => preset.group === group)
			.map(({ preset, index }) => ({ value: index, label: practiceTimeLabel(preset) })),
	}));
}

/** The index of the stored time control, so a stored choice is always VISIBLE in the picker: a
 * clock must never tick that the player did not see coming. Falls back to "Unlimited". */
export function storedPracticeTimeIndex(): number {
	const index = PRACTICE_TIME_PRESETS.findIndex(
		(preset) =>
			preset.limit === preferencesStore.timeLimit &&
			preset.bonus === (preferencesStore.timeBonus ?? 0),
	);
	return Math.max(index, 0);
}

export interface PracticeSetup {
	/** The starter bot, as its algorithm id (`greedy`). */
	algorithm: string;
	color: PracticeColor;
	/** An index into `PRACTICE_TIME_PRESETS`. */
	timeIndex: number;
}

/** Start the game. Needs no network: the engine and the bot run in the browser. */
export function startPracticeGame(setup: PracticeSetup): void {
	const preset = PRACTICE_TIME_PRESETS[setup.timeIndex] ?? PRACTICE_TIME_PRESETS[0];
	preferencesStore.setTimeLimit(preset.limit);
	preferencesStore.setTimeBonus(preset.bonus);
	preferencesStore.setPlayerColorPreference(setup.color);
	// Rolling is not a decision in dice chess: the play site always rolls for the player, so the
	// turn card never needs a Roll button.
	preferencesStore.setAutoRollDice(true);
	playWithBotStore.startNewGame(setup.color, setup.algorithm);
}
