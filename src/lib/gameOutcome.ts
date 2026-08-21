import type { GameEndReason, PlayerColor } from './localGamesDB';

export type GameOutcome = 'win' | 'loss' | 'draw';

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

export function outcomeLabel(outcome: GameOutcome): string {
	switch (outcome) {
		case 'win':
			return 'Won';
		case 'loss':
			return 'Lost';
		case 'draw':
			return 'Draw';
	}
}

/** Short human label for how a game ended; empty for legacy records with no reason. */
export function endReasonLabel(reason: GameEndReason | null | undefined): string {
	switch (reason) {
		case 'mate':
			return 'King captured';
		case 'timeout':
			return 'On time';
		case 'resign':
			return 'Resigned';
		case 'agreement':
			return 'Draw agreed';
		default:
			return '';
	}
}
