import type { PlayerOpponent } from '$lib/games/gamesApi';
import { emptyCounts, type OutcomeCounts } from './playerRecord';

// Aggregation + display helpers for /me's "Online" section (#149) — the play-api-backed
// counterpart to playerRecord.ts's on-device-only aggregation. Kept as its own module rather than
// folded into playerRecord.ts: that file's whole API (buildPlayerRecord, BotOutcomeCounts) is
// scoped to LocalGameRecord and stays that way; this one operates on PlayerOpponent instead.

/** Total W-D-L across every lobby opponent — the "Online" section's overall summary card. */
export function aggregateOpponents(opponents: PlayerOpponent[]): OutcomeCounts {
	return opponents.reduce<OutcomeCounts>(
		(acc, o) => ({
			wins: acc.wins + o.wins,
			draws: acc.draws + o.draws,
			losses: acc.losses + o.losses,
		}),
		emptyCounts(),
	);
}

/** Display label for one opponent row: a bot's team-qualified name, or the collapsed anonymous
 * bucket's fixed label (plural — it stands for every human/guest opponent combined).
 */
export function opponentLabel(opponent: PlayerOpponent): string {
	return opponent.opponent.name ?? 'Anonymous players';
}

/** The `?vs=` value for this opponent's filtered-history link (dicechess-play#151):
 * `<team>/<botName>` for a bot, `human` for the collapsed bucket. Returns the raw value only —
 * building the actual `/games?vs=…` URL needs `resolve()` called directly at the template use
 * site (svelte's `no-navigation-without-resolve` lint can't see through a function call to
 * verify that), so callers combine this with `resolve('/games')` themselves; see `/me`'s usage.
 * Matches `vsParamValue` (`$lib/games/gamesFilters`) for the same opponent — kept as its own
 * function since it takes a `PlayerOpponent` directly rather than an already-parsed `VsFilter`.
 */
export function opponentVsQuery(opponent: PlayerOpponent): string {
	return opponent.team && opponent.botName ? `${opponent.team}/${opponent.botName}` : 'human';
}

/** The opponents-summary row matching a `?vs=` value, if any — an exact W-D-L total for `/games`'s
 * head-to-head header (#151), even once the games list itself is paginated (#150) and can no
 * longer be summed directly. `undefined` when the opponents summary hasn't loaded yet, or for a
 * bookmarked `vs=` this guest has no matching row for.
 */
export function findOpponentByVs(
	opponents: PlayerOpponent[],
	vs: string,
): PlayerOpponent | undefined {
	return opponents.find((opponent) => opponentVsQuery(opponent) === vs);
}
