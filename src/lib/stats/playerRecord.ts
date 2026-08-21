import type { LocalGameRecord } from '../localGamesDB';
import { playerOutcome } from '../gameOutcome';
import { botAlgorithm, botLabel } from '../bots';

export interface OutcomeCounts {
	wins: number;
	losses: number;
	draws: number;
}

export interface BotOutcomeCounts extends OutcomeCounts {
	algorithm: string;
	label: string;
}

export interface PlayerRecord {
	overall: OutcomeCounts;
	perBot: BotOutcomeCounts[];
}

export function emptyCounts(): OutcomeCounts {
	return { wins: 0, losses: 0, draws: 0 };
}

export function totalGames(counts: OutcomeCounts): number {
	return counts.wins + counts.losses + counts.draws;
}

/** Games with a winner, i.e. excluding draws — the denominator for win rate. */
export function decidedGames(counts: OutcomeCounts): number {
	return counts.wins + counts.losses;
}

/** Win share over decided games, in [0, 1]; 0 when nothing is decided yet. */
export function winRate(counts: OutcomeCounts): number {
	const decided = decidedGames(counts);
	return decided === 0 ? 0 : counts.wins / decided;
}

/** Win / draw / loss shares over all games, in [0, 1]; all 0 when there are none. */
export function outcomeShares(counts: OutcomeCounts): { win: number; draw: number; loss: number } {
	const total = totalGames(counts);
	if (total === 0) return { win: 0, draw: 0, loss: 0 };
	return { win: counts.wins / total, draw: counts.draws / total, loss: counts.losses / total };
}

const OUTCOME_KEY = { win: 'wins', loss: 'losses', draw: 'draws' } as const;

/**
 * Aggregates the guest's win/loss/draw record from their locally-stored games,
 * overall and per bot. Outcomes are read from the player's own perspective via
 * {@link playerOutcome}; the per-bot list is ordered most-played first.
 */
export function buildPlayerRecord(games: LocalGameRecord[]): PlayerRecord {
	const overall = emptyCounts();
	const byBot = new Map<string, OutcomeCounts>();

	for (const game of games) {
		const key = OUTCOME_KEY[playerOutcome(game.result, game.player_color)];
		overall[key] += 1;

		const algorithm = botAlgorithm(game.bot_id);
		let counts = byBot.get(algorithm);
		if (!counts) {
			counts = emptyCounts();
			byBot.set(algorithm, counts);
		}
		counts[key] += 1;
	}

	const perBot: BotOutcomeCounts[] = [...byBot.entries()]
		.map(([algorithm, counts]) => ({ algorithm, label: botLabel(algorithm), ...counts }))
		// Most-played first; break ties alphabetically for a stable order.
		.sort((a, b) => totalGames(b) - totalGames(a) || a.label.localeCompare(b.label));

	return { overall, perBot };
}
