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

export interface BotStats {
	wins: number;
	losses: number;
	draws: number;
}

class BotStatsStore {
	stats = $state<Record<string, BotStats>>({});

	constructor() {
		const stored = getStoredValue('botStats');
		if (stored) {
			try {
				this.stats = JSON.parse(stored);
			} catch {
				this.stats = {};
			}
		}
	}

	recordResult(algorithm: string, result: 'win' | 'loss' | 'draw') {
		if (!this.stats[algorithm]) {
			this.stats[algorithm] = { wins: 0, losses: 0, draws: 0 };
		}

		if (result === 'win') {
			this.stats[algorithm].wins += 1;
		} else if (result === 'loss') {
			this.stats[algorithm].losses += 1;
		} else {
			this.stats[algorithm].draws += 1;
		}

		setStoredValue('botStats', JSON.stringify(this.stats));
	}

	getStats(algorithm: string): BotStats {
		return this.stats[algorithm] || { wins: 0, losses: 0, draws: 0 };
	}
}

export const botStatsStore = new BotStatsStore();
