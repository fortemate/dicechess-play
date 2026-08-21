import { describe, it, expect, beforeEach, vi } from 'vitest';
import { botStatsStore } from './botStatsStore.svelte';

describe('BotStatsStore', () => {
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
		// Reset the store manually since it's a singleton
		botStatsStore.stats = {};
	});

	it('should initialize with empty stats', () => {
		expect(botStatsStore.getStats('greedy')).toEqual({ wins: 0, losses: 0, draws: 0 });
	});

	it('should record and persist results', () => {
		botStatsStore.recordResult('greedy', 'win');
		expect(botStatsStore.getStats('greedy').wins).toBe(1);

		botStatsStore.recordResult('greedy', 'loss');
		expect(botStatsStore.getStats('greedy').losses).toBe(1);

		botStatsStore.recordResult('greedy', 'draw');
		expect(botStatsStore.getStats('greedy').draws).toBe(1);

		const stored = JSON.parse(localStorage.getItem('botStats') || '{}');
		expect(stored.greedy).toEqual({ wins: 1, losses: 1, draws: 1 });
	});

	it('should partition stats by algorithm', () => {
		botStatsStore.recordResult('greedy', 'win');
		botStatsStore.recordResult('random', 'loss');

		expect(botStatsStore.getStats('greedy').wins).toBe(1);
		expect(botStatsStore.getStats('greedy').losses).toBe(0);
		expect(botStatsStore.getStats('random').wins).toBe(0);
		expect(botStatsStore.getStats('random').losses).toBe(1);
	});
});
