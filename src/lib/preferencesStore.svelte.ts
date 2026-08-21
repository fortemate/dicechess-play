// Helper to safely access localStorage
function getStoredValue(key: string): string | null {
	try {
		return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
	} catch {
		return null;
	}
}

function setStoredValue(key: string, value: string): void {
	try {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(key, value);
		}
	} catch {
		// localStorage might be unavailable in some contexts
	}
}

// Class-based store for reactive preferences
class PreferencesStore {
	preferredMode: 'view' | 'train' | 'bookmarks' | 'positions' = $state('view');
	gamesPerPage: number = $state(25);
	archiveOnFinish: boolean = $state(true);
	botAlgorithm: string = $state('greedy');
	// Matches /practice's own long-standing default (never persisted before #212, so this is what
	// every existing visitor is already seeing).
	playerColorPreference: 'white' | 'black' | 'random' = $state('random');
	autoRollDice: boolean = $state(false);
	timeLimit: number | null = $state(null);
	timeBonus: number | null = $state(0);
	botLobbyBet: number = $state(0);
	botLobbyMode: 'classic' | 'x2' = $state('classic');
	soundEnabled: boolean = $state(true);
	// The rated-bot challenge panel's own setup (#212) — distinct keys from /practice's above because
	// the two surfaces offer different time-control presets and /practice has no rated concept.
	botChallengeRated: boolean = $state(false);
	botChallengeTimeControl: string = $state('5 + 5');
	botChallengeColor: 'random' | 'White' | 'Black' = $state('random');

	constructor() {
		// Load from localStorage on initialization
		const storedMode = getStoredValue('preferredMode') as
			'view' | 'train' | 'bookmarks' | 'positions' | null;
		if (
			storedMode === 'view' ||
			storedMode === 'train' ||
			storedMode === 'bookmarks' ||
			storedMode === 'positions'
		) {
			this.preferredMode = storedMode;
		}

		const storedGamesPerPage = getStoredValue('gamesPerPage');
		if (storedGamesPerPage) {
			const parsed = parseInt(storedGamesPerPage, 10);
			if (!isNaN(parsed) && parsed > 0) {
				this.gamesPerPage = parsed;
			}
		}

		const storedArchiveOnFinish = getStoredValue('archiveOnFinish');
		if (storedArchiveOnFinish !== null) {
			this.archiveOnFinish = storedArchiveOnFinish === 'true';
		}

		const storedAutoRollDice = getStoredValue('autoRollDice');
		if (storedAutoRollDice !== null) {
			this.autoRollDice = storedAutoRollDice === 'true';
		}

		const storedBotAlgorithm = getStoredValue('botAlgorithm');
		if (storedBotAlgorithm) {
			this.botAlgorithm = storedBotAlgorithm;
		}

		const storedPlayerColorPref = getStoredValue('playerColorPreference');
		if (
			storedPlayerColorPref === 'white' ||
			storedPlayerColorPref === 'black' ||
			storedPlayerColorPref === 'random'
		) {
			this.playerColorPreference = storedPlayerColorPref;
		}

		const storedTimeLimit = getStoredValue('timeLimit');
		if (storedTimeLimit !== null) {
			const parsed = parseInt(storedTimeLimit, 10);
			this.timeLimit = storedTimeLimit === 'null' || isNaN(parsed) ? null : parsed;
		}

		const storedTimeBonus = getStoredValue('timeBonus');
		if (storedTimeBonus !== null) {
			const parsed = parseInt(storedTimeBonus, 10);
			this.timeBonus = isNaN(parsed) ? 0 : parsed;
		}

		const storedBotLobbyBet = getStoredValue('botLobbyBet');
		if (storedBotLobbyBet !== null) {
			const parsed = parseInt(storedBotLobbyBet, 10);
			this.botLobbyBet = isNaN(parsed) ? 0 : parsed;
		}

		const storedBotLobbyMode = getStoredValue('botLobbyMode');
		if (storedBotLobbyMode === 'classic' || storedBotLobbyMode === 'x2') {
			this.botLobbyMode = storedBotLobbyMode;
		}
		// classic guard
		if (this.botLobbyBet === 0) {
			this.botLobbyMode = 'classic';
		}

		const storedSoundEnabled = getStoredValue('soundEnabled');
		if (storedSoundEnabled !== null) {
			this.soundEnabled = storedSoundEnabled === 'true';
		}

		const storedBotChallengeRated = getStoredValue('botChallengeRated');
		if (storedBotChallengeRated !== null) {
			this.botChallengeRated = storedBotChallengeRated === 'true';
		}

		const storedBotChallengeTimeControl = getStoredValue('botChallengeTimeControl');
		if (storedBotChallengeTimeControl) {
			this.botChallengeTimeControl = storedBotChallengeTimeControl;
		}

		const storedBotChallengeColor = getStoredValue('botChallengeColor');
		if (
			storedBotChallengeColor === 'random' ||
			storedBotChallengeColor === 'White' ||
			storedBotChallengeColor === 'Black'
		) {
			this.botChallengeColor = storedBotChallengeColor;
		}
	}

	setMode(mode: 'view' | 'train' | 'bookmarks' | 'positions') {
		this.preferredMode = mode;
		setStoredValue('preferredMode', mode);
	}

	setGamesPerPage(count: number) {
		this.gamesPerPage = count;
		setStoredValue('gamesPerPage', String(count));
	}

	setArchiveOnFinish(value: boolean) {
		this.archiveOnFinish = value;
		setStoredValue('archiveOnFinish', String(value));
	}

	setAutoRollDice(value: boolean) {
		this.autoRollDice = value;
		setStoredValue('autoRollDice', String(value));
	}

	setBotAlgorithm(algorithm: string) {
		this.botAlgorithm = algorithm;
		setStoredValue('botAlgorithm', algorithm);
	}

	setPlayerColorPreference(color: 'white' | 'black' | 'random') {
		this.playerColorPreference = color;
		setStoredValue('playerColorPreference', color);
	}

	setTimeLimit(limit: number | null) {
		this.timeLimit = limit;
		setStoredValue('timeLimit', limit === null ? 'null' : String(limit));
	}

	setTimeBonus(bonus: number | null) {
		this.timeBonus = bonus;
		setStoredValue('timeBonus', bonus === null ? '0' : String(bonus));
	}

	setBotLobbyBet(bet: number) {
		this.botLobbyBet = bet;
		setStoredValue('botLobbyBet', String(bet));
		if (bet === 0) {
			this.setBotLobbyMode('classic');
		}
	}

	setSoundEnabled(value: boolean) {
		this.soundEnabled = value;
		setStoredValue('soundEnabled', String(value));
	}

	setBotLobbyMode(mode: 'classic' | 'x2') {
		if (this.botLobbyBet === 0 && mode === 'x2') {
			this.botLobbyMode = 'classic';
			setStoredValue('botLobbyMode', 'classic');
			return;
		}
		this.botLobbyMode = mode;
		setStoredValue('botLobbyMode', mode);
	}

	setBotChallengeRated(value: boolean) {
		this.botChallengeRated = value;
		setStoredValue('botChallengeRated', String(value));
	}

	setBotChallengeTimeControl(label: string) {
		this.botChallengeTimeControl = label;
		setStoredValue('botChallengeTimeControl', label);
	}

	setBotChallengeColor(color: 'random' | 'White' | 'Black') {
		this.botChallengeColor = color;
		setStoredValue('botChallengeColor', color);
	}
}

export const preferencesStore = new PreferencesStore();
