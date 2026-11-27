import { beforeEach, describe, expect, it, vi } from 'vitest';

const startNewGame = vi.hoisted(() => vi.fn());
vi.mock('#lib/playWithBot/index.js', () => ({ playWithBotStore: { startNewGame } }));

import { preferencesStore } from '#lib/preferencesStore.svelte.js';
import {
	PRACTICE_TIME_PRESETS,
	practiceTimeGroups,
	practiceTimeLabel,
	startPracticeGame,
	storedPracticeTimeIndex,
} from './practiceSetup';

// The setup of a starter bot game is shared by Play and the practice page (#257). Both must
// start the same game from the same choices, and neither may start a clock the player did not
// see: the stored time control has to be found again in the list.

describe('practice setup', () => {
	beforeEach(() => {
		startNewGame.mockReset();
		preferencesStore.setTimeLimit(null);
		preferencesStore.setTimeBonus(0);
		preferencesStore.setPlayerColorPreference('random');
	});

	it('offers "Unlimited" first, on its own row, then blitz and rapid', () => {
		const groups = practiceTimeGroups();
		expect(groups.map((group) => group.label)).toEqual(['Casual', 'Blitz', 'Rapid']);
		expect(groups[0].options).toEqual([{ value: 0, label: 'Unlimited' }]);
		expect(groups.flatMap((group) => group.options)).toHaveLength(PRACTICE_TIME_PRESETS.length);
	});

	it('keys every choice by its index in the list of presets', () => {
		for (const option of practiceTimeGroups().flatMap((group) => group.options)) {
			expect(option.label).toBe(practiceTimeLabel(PRACTICE_TIME_PRESETS[option.value]));
		}
	});

	it('finds the stored time control again, and falls back to "Unlimited"', () => {
		preferencesStore.setTimeLimit(5);
		preferencesStore.setTimeBonus(3);
		expect(PRACTICE_TIME_PRESETS[storedPracticeTimeIndex()]).toMatchObject({ limit: 5, bonus: 3 });
		preferencesStore.setTimeLimit(42);
		expect(storedPracticeTimeIndex()).toBe(0);
	});

	it('starts the game that was chosen and remembers the choices', () => {
		const timeIndex = PRACTICE_TIME_PRESETS.findIndex((p) => p.limit === 10 && p.bonus === 5);
		startPracticeGame({ algorithm: 'aggressive-book', color: 'black', timeIndex });
		expect(startNewGame).toHaveBeenCalledWith('black', 'aggressive-book');
		expect(preferencesStore.timeLimit).toBe(10);
		expect(preferencesStore.timeBonus).toBe(5);
		expect(preferencesStore.playerColorPreference).toBe('black');
		// The play site always rolls for the player.
		expect(preferencesStore.autoRollDice).toBe(true);
		// The practice page reads the clock back from the same place.
		expect(storedPracticeTimeIndex()).toBe(timeIndex);
	});

	it('sets the clock before the game starts, because the store reads it at the start', () => {
		startNewGame.mockImplementation(() => {
			expect(preferencesStore.timeLimit).toBe(3);
		});
		const timeIndex = PRACTICE_TIME_PRESETS.findIndex((p) => p.limit === 3);
		startPracticeGame({ algorithm: 'greedy', color: 'white', timeIndex });
		expect(startNewGame).toHaveBeenCalledOnce();
	});
});
