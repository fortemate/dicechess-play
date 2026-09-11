import { describe, it, expect, beforeEach, vi } from 'vitest';
import { migrateBotTimeControlId, preferencesStore } from './preferencesStore.svelte';

describe('PreferencesStore', () => {
	const localStorageMock = (() => {
		let store: Record<string, string> = {};
		return {
			getItem: vi.fn((key: string) => store[key] || null),
			setItem: vi.fn((key: string, value: string) => {
				store[key] = value.toString();
			}),
			clear: vi.fn(() => {
				store = {};
			}),
			removeItem: vi.fn((key: string) => {
				delete store[key];
			}),
		};
	})();

	beforeEach(() => {
		vi.stubGlobal('localStorage', localStorageMock);
		localStorage.clear();
		vi.clearAllMocks();
	});

	it('should initialize with default values', () => {
		expect(preferencesStore.preferredMode).toBe('view');
		expect(preferencesStore.gamesPerPage).toBe(25);
		expect(preferencesStore.archiveOnFinish).toBe(true);
	});

	it('should persist preferredMode', () => {
		preferencesStore.setMode('train');
		expect(preferencesStore.preferredMode).toBe('train');
		expect(localStorage.getItem('preferredMode')).toBe('train');
	});

	it('should persist gamesPerPage', () => {
		preferencesStore.setGamesPerPage(50);
		expect(preferencesStore.gamesPerPage).toBe(50);
		expect(localStorage.getItem('gamesPerPage')).toBe('50');
	});

	it('should persist archiveOnFinish', () => {
		preferencesStore.setArchiveOnFinish(false);
		expect(preferencesStore.archiveOnFinish).toBe(false);
		expect(localStorage.getItem('archiveOnFinish')).toBe('false');

		preferencesStore.setArchiveOnFinish(true);
		expect(preferencesStore.archiveOnFinish).toBe(true);
		expect(localStorage.getItem('archiveOnFinish')).toBe('true');
	});

	it('should persist and guard botLobbyBet and botLobbyMode', () => {
		// Default values
		expect(preferencesStore.botLobbyBet).toBe(0);
		expect(preferencesStore.botLobbyMode).toBe('classic');

		// Setting bet to a non-zero value should allow setting x2 mode
		preferencesStore.setBotLobbyBet(3);
		expect(preferencesStore.botLobbyBet).toBe(3);
		expect(localStorage.getItem('botLobbyBet')).toBe('3');

		preferencesStore.setBotLobbyMode('x2');
		expect(preferencesStore.botLobbyMode).toBe('x2');
		expect(localStorage.getItem('botLobbyMode')).toBe('x2');

		// Switching bet back to 0 (FREE) should force mode back to classic
		preferencesStore.setBotLobbyBet(0);
		expect(preferencesStore.botLobbyBet).toBe(0);
		expect(preferencesStore.botLobbyMode).toBe('classic');
		expect(localStorage.getItem('botLobbyMode')).toBe('classic');

		// Trying to set mode to x2 when bet is 0 should be guarded and forced to classic
		preferencesStore.setBotLobbyMode('x2');
		expect(preferencesStore.botLobbyMode).toBe('classic');
	});

	it('should persist soundEnabled', () => {
		expect(preferencesStore.soundEnabled).toBe(true);

		preferencesStore.setSoundEnabled(false);
		expect(preferencesStore.soundEnabled).toBe(false);
		expect(localStorage.getItem('soundEnabled')).toBe('false');

		preferencesStore.setSoundEnabled(true);
		expect(preferencesStore.soundEnabled).toBe(true);
		expect(localStorage.getItem('soundEnabled')).toBe('true');
	});

	// #212: the rated-bot challenge panel's own setup, kept separate from /play's timeLimit/
	// timeBonus/playerColorPreference above since the two surfaces offer different presets.
	// #20: botChallengeTimeControl now stores a stable preset id, not a display label.
	it('should persist the bot-challenge setup', () => {
		expect(preferencesStore.botChallengeRated).toBe(false);
		expect(preferencesStore.botChallengeTimeControl).toBe('fischer-300-5');
		expect(preferencesStore.botChallengeColor).toBe('random');

		preferencesStore.setBotChallengeRated(true);
		expect(preferencesStore.botChallengeRated).toBe(true);
		expect(localStorage.getItem('botChallengeRated')).toBe('true');

		preferencesStore.setBotChallengeTimeControl('fischer-180-3');
		expect(preferencesStore.botChallengeTimeControl).toBe('fischer-180-3');
		expect(localStorage.getItem('botChallengeTimeControl')).toBe('fischer-180-3');

		preferencesStore.setBotChallengeColor('White');
		expect(preferencesStore.botChallengeColor).toBe('White');
		expect(localStorage.getItem('botChallengeColor')).toBe('White');
	});

	// DoD (issue #20): a stored localStorage value from before this change (a display label like
	// '3 + 3') must still resolve to the same preset — covered by migrateBotTimeControlId.
	it('migrates an old label value to the corresponding preset id', () => {
		preferencesStore.setBotChallengeTimeControl('3 + 3');
		expect(preferencesStore.botChallengeTimeControl).toBe('fischer-180-3');
		expect(localStorage.getItem('botChallengeTimeControl')).toBe('fischer-180-3');
	});

	// DoD (issue #20): an unrecognised stored value must fall back to the default, never throw.
	it('falls back to the default preset id when an unrecognised value is set', () => {
		expect(() => preferencesStore.setBotChallengeTimeControl('unknown-id')).not.toThrow();
		expect(preferencesStore.botChallengeTimeControl).toBe('fischer-300-5');
		expect(localStorage.getItem('botChallengeTimeControl')).toBe('fischer-300-5');
	});
});

describe('migrateBotTimeControlId', () => {
	it('preserves an existing preset id unchanged', () => {
		expect(migrateBotTimeControlId('fischer-180-3')).toBe('fischer-180-3');
		expect(migrateBotTimeControlId('fischer-300-5')).toBe('fischer-300-5');
		expect(migrateBotTimeControlId('sd-300')).toBe('sd-300');
	});

	it('translates legacy display labels to their corresponding stable ids', () => {
		expect(migrateBotTimeControlId('1 + 1')).toBe('fischer-60-1');
		expect(migrateBotTimeControlId('3 + 3')).toBe('fischer-180-3');
		expect(migrateBotTimeControlId('5 min')).toBe('sd-300');
		expect(migrateBotTimeControlId('5 + 5')).toBe('fischer-300-5');
		expect(migrateBotTimeControlId('10 min')).toBe('sd-600');
		expect(migrateBotTimeControlId('10 + 10')).toBe('fischer-600-10');
	});

	it('falls back to the default preset id (fischer-300-5) for unrecognised values without throwing', () => {
		expect(migrateBotTimeControlId('unknown-id')).toBe('fischer-300-5');
		expect(migrateBotTimeControlId('5 + 99')).toBe('fischer-300-5');
		expect(migrateBotTimeControlId('garbage')).toBe('fischer-300-5');
		expect(migrateBotTimeControlId('')).toBe('fischer-300-5');
	});
});
