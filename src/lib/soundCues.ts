// What a step of the game sounds like — Dice Chess TV's cues (dicechess-tv `src/core/cues.ts`),
// so the site and the television sound alike (#167).
//
// Pure: it names cues and knows nothing about files, playback or the sound setting. Which file a
// cue plays is `soundFiles.ts`; whether it is heard is `sound.ts`. Every cue has something to see
// on screen as well: the dice spin, the piece moves, the no-legal-moves notice, the result.
import { getPieceFromFen } from '../utils/fenUtils';

export type Cue =
	| 'dice_roll'
	| 'piece_move'
	| 'piece_capture'
	| 'castle'
	| 'promotion'
	| 'no_move'
	| 'game_win'
	| 'game_loss'
	| 'game_draw';

const fileOf = (square: string): number => square.charCodeAt(0) - 'a'.charCodeAt(0);

/** The cue for one move, given the position before it and the move in UCI (`e7e8q` promotes). */
export function moveCue(fenBefore: string, uci: string): Cue {
	// A promotion that also captures is still, above all, a promotion.
	if (uci.length === 5) return 'promotion';
	const from = uci.slice(0, 2);
	const to = uci.slice(2, 4);
	const piece = getPieceFromFen(fenBefore, from)?.toLowerCase();
	// A king only ever moves two files when it castles.
	if (piece === 'k' && Math.abs(fileOf(from) - fileOf(to)) === 2) return 'castle';
	// The engine never offers a move onto a friendly piece, so anything on the target is an enemy.
	if (getPieceFromFen(fenBefore, to)) return 'piece_capture';
	// En passant: a pawn changing file onto an empty square takes the pawn beside it.
	if (piece === 'p' && fileOf(from) !== fileOf(to)) return 'piece_capture';
	return 'piece_move';
}

/** UCI for a move as history entries record it: a promotion is a piece letter in either case, or
 * `NONE`/empty when there is none. */
export function historyUci(move: { from: string; to: string; promotion: string }): string {
	const promotion = move.promotion && move.promotion !== 'NONE' ? move.promotion.toLowerCase() : '';
	return move.from + move.to + promotion;
}

/**
 * The cue for a finished game, from the viewer's side. `null` is a decisive game someone watched
 * without playing it: it ends on the winning jingle, as the TV's hotseat does — whoever won, the
 * person listening was not the one who lost.
 */
export function resultCue(outcome: 'won' | 'lost' | 'draw' | null): Cue {
	if (outcome === 'draw') return 'game_draw';
	return outcome === 'lost' ? 'game_loss' : 'game_win';
}
