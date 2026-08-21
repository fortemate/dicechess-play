import { describe, it, expect, beforeEach, vi } from 'vitest';
import { preferencesStore } from './preferencesStore.svelte';

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
	it('should persist the bot-challenge setup', () => {
		expect(preferencesStore.botChallengeRated).toBe(false);
		expect(preferencesStore.botChallengeTimeControl).toBe('5 + 5');
		expect(preferencesStore.botChallengeColor).toBe('random');

		preferencesStore.setBotChallengeRated(true);
		expect(preferencesStore.botChallengeRated).toBe(true);
		expect(localStorage.getItem('botChallengeRated')).toBe('true');

		preferencesStore.setBotChallengeTimeControl('3 + 3');
		expect(preferencesStore.botChallengeTimeControl).toBe('3 + 3');
		expect(localStorage.getItem('botChallengeTimeControl')).toBe('3 + 3');

		preferencesStore.setBotChallengeColor('White');
		expect(preferencesStore.botChallengeColor).toBe('White');
		expect(localStorage.getItem('botChallengeColor')).toBe('White');
	});
});
