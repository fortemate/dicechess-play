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

import { botTimeControlPresets, defaultBotTimeControlIndex } from '$lib/live/timeControls';

/** Translate a stored botChallengeTimeControl value to a stable preset id.
 * Before issue #20 the label string (e.g. '5 + 5') was persisted directly. Now we persist the
 * preset id (e.g. 'fischer-300-5'). This migration runs once on the stored value: if it looks like
 * an id already (no spaces) we use it as-is; otherwise we look it up by label among the current
 * presets and translate it. An unrecognised value falls back to the default id — never throws. */
function migrateBotTimeControlId(stored: string): string {
	// If it doesn't contain a space it is already an id-shaped value — accept it directly.
	// Unknown ids will simply fail to match any preset and resolve to the default at lookup time.
	if (!stored.includes(' ')) return stored;
	// Old label format — try to find the matching preset by its display label.
	const match = botTimeControlPresets.find((p) => p.label === stored);
	if (match) return match.id;
	// Unrecognised label: fall back to the default preset id without throwing.
	return botTimeControlPresets[defaultBotTimeControlIndex].id;
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
	// What to do when an opponent offers a draw (ADR 006 §4.5). `ask` opens the pre-roll gate and lets
	// the clock run while you decide; `autoDecline` answers immediately so a player who never wants to
	// be asked pays nothing for someone else's offer. The offerer cannot tell the two apart.
	drawOfferPolicy: 'ask' | 'autoDecline' = $state('ask');
	// The rated-bot challenge panel's own setup (#212) — distinct keys from /practice's above because
	// the two surfaces offer different time-control presets and /practice has no rated concept.
	// Stores the preset's stable `id` (e.g. 'fischer-300-5'), not its display label (#20).
	botChallengeRated: boolean = $state(false);
	botChallengeTimeControl: string = $state(botTimeControlPresets[defaultBotTimeControlIndex].id);
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
			const parsed = Number.parseInt(storedGamesPerPage, 10);
			if (!Number.isNaN(parsed) && parsed > 0) {
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
			const parsed = Number.parseInt(storedTimeLimit, 10);
			this.timeLimit = storedTimeLimit === 'null' || Number.isNaN(parsed) ? null : parsed;
		}

		const storedTimeBonus = getStoredValue('timeBonus');
		if (storedTimeBonus !== null) {
			const parsed = Number.parseInt(storedTimeBonus, 10);
			this.timeBonus = Number.isNaN(parsed) ? 0 : parsed;
		}

		const storedBotLobbyBet = getStoredValue('botLobbyBet');
		if (storedBotLobbyBet !== null) {
			const parsed = Number.parseInt(storedBotLobbyBet, 10);
			this.botLobbyBet = Number.isNaN(parsed) ? 0 : parsed;
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

		const storedDrawOfferPolicy = getStoredValue('drawOfferPolicy');
		if (storedDrawOfferPolicy === 'ask' || storedDrawOfferPolicy === 'autoDecline') {
			this.drawOfferPolicy = storedDrawOfferPolicy;
		}

		const storedBotChallengeRated = getStoredValue('botChallengeRated');
		if (storedBotChallengeRated !== null) {
			this.botChallengeRated = storedBotChallengeRated === 'true';
		}

		const storedBotChallengeTimeControl = getStoredValue('botChallengeTimeControl');
		if (storedBotChallengeTimeControl) {
			// Migrate old label values (e.g. '5 + 5') to stable ids (e.g. 'fischer-300-5') (#20).
			this.botChallengeTimeControl = migrateBotTimeControlId(storedBotChallengeTimeControl);
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

	setDrawOfferPolicy(policy: 'ask' | 'autoDecline') {
		this.drawOfferPolicy = policy;
		setStoredValue('drawOfferPolicy', policy);
	}

	setBotChallengeRated(value: boolean) {
		this.botChallengeRated = value;
		setStoredValue('botChallengeRated', String(value));
	}

	setBotChallengeTimeControl(id: string) {
		this.botChallengeTimeControl = id;
		setStoredValue('botChallengeTimeControl', id);
	}

	setBotChallengeColor(color: 'random' | 'White' | 'Black') {
		this.botChallengeColor = color;
		setStoredValue('botChallengeColor', color);
	}
}

export const preferencesStore = new PreferencesStore();
