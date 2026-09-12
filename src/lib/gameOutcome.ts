import { m } from '$lib/paraglide/messages.js';
import type { GameEndReason, PlayerColor } from './localGamesDB';

export type GameOutcome = 'win' | 'loss' | 'draw';
export type GameResult = GameOutcome | 'unknown';

export const RESULT_LABEL: Record<GameResult, string> = {
	get win() {
		return m.game_result_won();
	},
	get loss() {
		return m.game_result_lost();
	},
	get draw() {
		return m.game_result_draw();
	},
	get unknown() {
		return m.game_result_unknown();
	},
};

export const RESULT_CLASS: Record<GameResult, string> = {
	win: 'bg-primary/15 text-primary border-primary/30',
	loss: 'bg-danger/15 text-danger border-danger/30',
	draw: 'bg-surface text-content-muted border-border',
	unknown: 'bg-surface text-content-muted border-border',
};

/**
 * Computes the game outcome from the guest player's perspective.
 *
 * Records store `result` as white-POV (1 = White won, -1 = Black won, 0 = draw),
 * so the player's own win/loss depends on which side they played.
 *
 * @param result - White-POV result: positive = White won, negative = Black won, 0 = draw.
 * @param playerColor - The side the guest played.
 */
export function playerOutcome(result: number, playerColor: PlayerColor): GameOutcome {
	if (result === 0) return 'draw';
	const whiteWon = result > 0;
	const playerIsWhite = playerColor === 'WHITE';
	return whiteWon === playerIsWhite ? 'win' : 'loss';
}

/** Display label for a game outcome or server result. */
export function outcomeLabel(outcome: GameResult | null | undefined): string {
	if (!outcome) return '';
	return RESULT_LABEL[outcome] ?? m.game_result_unknown();
}

/** Short human label for how a game ended; empty for legacy records with no reason. */
export function endReasonLabel(reason: GameEndReason | null | undefined): string {
	switch (reason) {
		case 'mate':
			return m.game_end_reason_mate();
		case 'timeout':
			return m.game_end_reason_timeout();
		case 'resign':
			return m.game_end_reason_resign();
		case 'agreement':
			return m.game_end_reason_agreement();
		case 'double_declined':
			return m.game_end_reason_double_declined();
		default:
			return '';
	}
}

/**
 * Wire values for play-api's snake_case `termination` enum.
 * Exhaustively mirrors `Termination` / `PlaysiteIngest.terminationOf` in dicechess-play-api,
 * plus the stake-doubling contract's `double_declined`.
 */
export const TERMINATION_LABELS: Record<string, string> = {
	get king_captured() {
		return m.game_termination_king_captured();
	},
	get timeout() {
		return m.game_termination_timeout();
	},
	get resign() {
		return m.game_termination_resign();
	},
	get draw_agreement() {
		return m.game_termination_draw_agreement();
	},
	get aborted() {
		return m.game_termination_aborted();
	},
	get double_declined() {
		return m.game_termination_double_declined();
	},
};

/**
 * Fallback label for unmapped/future termination enum values.
 * Dynamically resolves from the i18n catalog (#8, #138).
 */
export const UNKNOWN_TERMINATION_LABEL = () => m.game_termination_unknown();

/**
 * Display label for a server game's termination wire value.
 *
 * Previously, components used a regex `replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())`
 * defending it as "a generic humaniser rather than an exhaustive label table, so a future
 * termination value the server adds renders sensibly here without this file needing a matching update".
 *
 * That stance was overturned for i18n (#23): runtime regexes and case transforms produce strings
 * with no static catalog key, cannot be translated, and silently assume English casing rules and
 * word order. Known termination values are now explicitly mapped via TERMINATION_LABELS, and any
 * unmapped value degrades gracefully to the static label `Game ended` instead of leaking raw wire
 * enums or regex-derived text.
 */
export function terminationLabel(termination: string | null | undefined): string {
	if (!termination) return '';
	return Object.hasOwn(TERMINATION_LABELS, termination)
		? TERMINATION_LABELS[termination]
		: m.game_termination_unknown();
}
