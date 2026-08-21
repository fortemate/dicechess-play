import type { Key } from '@lichess-org/chessground/types';

// The minimal surface Board.svelte consumes. Both the local vs-bot store (playWithBotStore) and
// the live human-vs-human store (liveGameStore) satisfy it structurally, so Board is shared.
export interface BoardStore {
	/** 6-field FEN of the current position (dice stripped). */
	currentBoardFen: string;
	/** Side to move. */
	activeColor: 'w' | 'b';
	/** The colour this client plays (board orientation; spectators get a default). */
	playerColor: 'w' | 'b';
	/** Coarse status; the board only enables moves when this is 'playing'. */
	gameStatus: string;
	/** Legal destinations for the current dice, keyed by origin square. */
	legalMovesDests: Map<Key, Key[]>;
	/** True while the user is browsing a past position instead of the live/current one. */
	isViewingHistory: boolean;
	/** [from, to] of the move to highlight; undefined for a roll/pass or before any move exists. */
	lastMove?: Key[];
	/** Called by chessground after the user drops a piece. */
	handleBoardMove(orig: string, dest: string): void;
}
