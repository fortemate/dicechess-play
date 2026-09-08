import { stripDfen } from './dfenUtils';
import type { GameHistory } from './historyApi';
import type { GameResultWire, Players, Termination } from './liveTypes';

/**
 * The archive read of a game whose live room no longer exists (this repo's #109).
 *
 * play-api evicts an ended room together with its socket, so a client that arrives afterwards — a
 * spectator reloading a finished game, a rematch participant who joined after the first-join
 * deadline — never receives `GameEnded` and would otherwise sit on a board that looks playable
 * forever. `GET /games/{id}/history` still answers for that game, and this module turns its wire
 * into the same shape the live store applies when the game ends in front of it.
 *
 * Pure: no I/O, no store imports.
 */
export interface FinishedGame {
	readonly result: GameResultWire;
	/**
	 * The live wire's PascalCase member where the archive's snake_case value has one, and the raw
	 * archive string otherwise. The end screen switches on the known members and says something
	 * neutral for anything else, so a termination this build has never heard of still renders.
	 */
	readonly termination: string;
	/** The position the game ended on: the last turn's, or the initial one for a game with no turns. */
	readonly finalFen: string;
	readonly players: Players;
	readonly rated: boolean;
}

const TERMINATION_FROM_ARCHIVE: Readonly<Record<string, Termination>> = {
	king_captured: 'KingCaptured',
	resign: 'Resign',
	timeout: 'Timeout',
	aborted: 'Aborted',
	draw: 'Draw',
	draw_agreement: 'Draw',
	double_declined: 'DoubleDeclined',
};

/** White-POV result number (the archive's convention) → the live wire's tagged union. */
function resultFromArchive(result: number): GameResultWire {
	if (result > 0) return { Win: { side: 'White' } };
	if (result < 0) return { Win: { side: 'Black' } };
	return { Draw: {} };
}

export function terminationFromArchive(termination: string): string {
	return TERMINATION_FROM_ARCHIVE[termination] ?? termination;
}

export function finishedFromHistory(history: GameHistory): FinishedGame {
	const last = history.turns.at(-1);
	return {
		result: resultFromArchive(history.result),
		termination: terminationFromArchive(history.termination),
		// Both fields may carry the DFEN's 7th dice field; the board wants a plain FEN.
		finalFen: stripDfen(last?.fenAfter ?? history.initialDfen),
		players: history.players,
		rated: history.rated,
	};
}
