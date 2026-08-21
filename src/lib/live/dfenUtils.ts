import { DICE_MAP } from '../../utils/fenUtils';

// A DFEN is a FEN with an optional 7th field of dice as piece letters (uppercase = White,
// lowercase = Black), e.g. "rnbqk1nr/ppppppbp/8/8/8/4P3/PPPP1PPP/RNB1KBNR w KQkq - 0 2 BRK".
// The server is authoritative; the client parses a DFEN only to render the board (the 6 FEN
// fields) and the dice pool.

/** The standard 6-field FEN, with any trailing dice field stripped. */
export function stripDfen(dfen: string): string {
	return dfen.trim().split(/\s+/).slice(0, 6).join(' ');
}

export interface SplitDfen {
	/** The 6-field FEN (board + side + castling + ep + halfmove + fullmove). */
	fen6: string;
	/** The dice as piece-letter characters with case preserved, e.g. ['B','R','K'] or ['r','q','k']. */
	dice: string[];
}

/** Split a DFEN into its FEN part and its dice letters. */
export function splitDfen(dfen: string): SplitDfen {
	const parts = dfen.trim().split(/\s+/);
	const fen6 = parts.slice(0, 6).join(' ');
	const diceField = parts.length >= 7 ? parts[6] : '';
	const dice = diceField.split('').filter((c) => c in DICE_MAP);
	return { fen6, dice };
}
