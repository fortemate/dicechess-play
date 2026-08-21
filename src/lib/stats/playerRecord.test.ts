import { describe, it, expect } from 'vitest';
import {
	buildPlayerRecord,
	winRate,
	decidedGames,
	outcomeShares,
	totalGames,
	emptyCounts,
} from './playerRecord';
import type { LocalGameRecord } from '$lib/localGamesDB';
import type { PlayerColor } from '$lib/localGamesDB';

function game(bot_id: string, player_color: PlayerColor, result: number): LocalGameRecord {
	return {
		id: `${bot_id}-${player_color}-${result}-${Math.random()}`,
		bot_id,
		player_color,
		result,
		start_time: '2026-06-26T00:00:00Z',
		sync_status: 'synced',
		moves_history: [],
	};
}

describe('buildPlayerRecord', () => {
	it('counts outcomes from the player perspective, overall and per bot', () => {
		const games: LocalGameRecord[] = [
			game('bot:greedy', 'WHITE', 1), // white win, played white → win
			game('bot:greedy', 'BLACK', 1), // white win, played black → loss
			game('bot:greedy', 'WHITE', 0), // draw
			game('bot:random', 'BLACK', -1), // black win, played black → win
		];

		const { overall, perBot } = buildPlayerRecord(games);

		expect(overall).toEqual({ wins: 2, losses: 1, draws: 1 });
		expect(perBot.find((b) => b.algorithm === 'greedy')).toMatchObject({
			label: 'Greedy',
			wins: 1,
			losses: 1,
			draws: 1,
		});
		expect(perBot.find((b) => b.algorithm === 'random')).toMatchObject({
			label: 'Random',
			wins: 1,
			losses: 0,
			draws: 0,
		});
	});

	it('orders the per-bot breakdown most-played first', () => {
		const games = [
			game('bot:random', 'WHITE', 1),
			game('bot:greedy', 'WHITE', 1),
			game('bot:greedy', 'WHITE', 0),
			game('bot:greedy', 'BLACK', 1),
		];
		expect(buildPlayerRecord(games).perBot.map((b) => b.algorithm)).toEqual(['greedy', 'random']);
	});

	it('breaks ties on game count alphabetically by label', () => {
		const games = [game('bot:random', 'WHITE', 1), game('bot:aggressive', 'WHITE', 1)];
		expect(buildPlayerRecord(games).perBot.map((b) => b.label)).toEqual(['Aggressive', 'Random']);
	});

	it('returns an empty record for no games', () => {
		expect(buildPlayerRecord([])).toEqual({ overall: emptyCounts(), perBot: [] });
	});
});

describe('record helpers', () => {
	it('computes win rate over decided games only', () => {
		expect(winRate({ wins: 3, losses: 1, draws: 10 })).toBeCloseTo(0.75);
		expect(decidedGames({ wins: 3, losses: 1, draws: 10 })).toBe(4);
	});

	it('returns 0 win rate when nothing is decided', () => {
		expect(winRate({ wins: 0, losses: 0, draws: 5 })).toBe(0);
	});

	it('computes outcome shares over all games', () => {
		const shares = outcomeShares({ wins: 1, losses: 1, draws: 2 });
		expect(shares).toEqual({ win: 0.25, loss: 0.25, draw: 0.5 });
		expect(totalGames({ wins: 1, losses: 1, draws: 2 })).toBe(4);
	});

	it('returns zero shares with no games', () => {
		expect(outcomeShares(emptyCounts())).toEqual({ win: 0, draw: 0, loss: 0 });
	});
});
