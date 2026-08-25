/**
 * Presentation model for the bot-strength table. Bradley-Terry is the authoritative input and
 * therefore the LEFT side of this join: a missing/provisional/frozen Glicko leaderboard row may
 * remove secondary context, but must never erase a strength observation.
 */
import type { LeaderRow } from '../leaderboard/leaderboardApi';
import type { StrengthRank } from '../strength/strengthApi';

export interface BotIdentity {
	team: string;
	name: string;
}

export interface BotStrengthRow extends StrengthRank {
	rank: number;
	identity: BotIdentity | null;
	ladder: LeaderRow | null;
}

/** Parses the report's documented `team/name` display identity. Keeping `null` as a possible
 * result lets an unexpected future wire value remain visible as raw text instead of dropping it.
 */
export function parseBotIdentity(player: string): BotIdentity | null {
	const slash = player.indexOf('/');
	if (slash <= 0 || slash === player.length - 1 || player.indexOf('/', slash + 1) !== -1)
		return null;
	return { team: player.slice(0, slash), name: player.slice(slash + 1) };
}

/** Adds Glicko/W-D-L context without changing the report order or cardinality. Extra leaderboard
 * rows are irrelevant: they have no schedule-adjusted Bradley-Terry estimate in this report yet.
 */
export function buildBotStrengthRows(
	ranking: readonly StrengthRank[],
	leaders: readonly LeaderRow[],
): BotStrengthRow[] {
	const ladderByPlayer = new Map<string, LeaderRow>(
		leaders
			.filter((leader) => leader.kind !== 'player' && leader.team !== null)
			.map((leader) => [`${leader.team}/${leader.name}`, leader] as const),
	);

	return ranking.map((strength, index) => ({
		...strength,
		rank: index + 1,
		identity: parseBotIdentity(strength.player),
		ladder: ladderByPlayer.get(strength.player) ?? null,
	}));
}

/** Relative Elo uses an explicit sign because zero is the current pool mean, not a rating-scale
 * origin. Rounded display is consistent with the site's Glicko presentation.
 */
export function formatRelativeElo(value: number): string {
	const rounded = Math.round(value);
	return rounded > 0 ? `+${rounded}` : `${rounded}`;
}
