/**
 * What the turn card and the move list say about dice (#254): the name of the piece a die
 * shows, the state a die is in, and the one-line hint under "whose turn it is".
 *
 * Rune-free and DOM-free: pure functions over the `DieState` list both game stores already
 * expose, so the components stay markup and the wording can be tested without rendering.
 *
 * A die is in one of three states. The stores decide them; nothing here knows the rules:
 *   - `used`: a move was made with it this turn;
 *   - `available`: not used yet, and not ruled out by the store. It carries the highlight;
 *   - `idle`: not used, but the store has ruled it out (`allowed` is false).
 *
 * `available` does NOT mean that a move exists for the die on the board. Both stores set
 * `allowed` to true for every die they roll and never lower it, so today `available` is simply
 * "not used yet", and no die is ever `idle`. Whether a rook can move at all is in the stores'
 * legal-move data, which this module does not read. The words below therefore only count and
 * name the dice that are left; they never promise a move or an order of play.
 */
import { m } from '#lib/paraglide/messages.js';
import { getLocale } from '#lib/paraglide/runtime.js';
import type { DieState } from '#lib/playWithBot/playWithBotDice.svelte.js';

export type DieStatus = 'used' | 'available' | 'idle';

export function dieStatus(die: DieState): DieStatus {
	if (die.used) return 'used';
	return die.allowed ? 'available' : 'idle';
}

const NAMES: Record<string, () => string> = {
	p: m.game_piece_pawn,
	n: m.game_piece_knight,
	b: m.game_piece_bishop,
	r: m.game_piece_rook,
	q: m.game_piece_queen,
	k: m.game_piece_king,
};

const LOWER_NAMES: Record<string, () => string> = {
	p: m.game_piece_pawn_lower,
	n: m.game_piece_knight_lower,
	b: m.game_piece_bishop_lower,
	r: m.game_piece_rook_lower,
	q: m.game_piece_queen_lower,
	k: m.game_piece_king_lower,
};

/** "Knight" for `N` or `n`. An unknown letter is returned as it is, never thrown on. */
export function pieceName(char: string): string {
	return NAMES[char.toLowerCase()]?.() ?? char;
}

/** "knight", for use inside a sentence. */
export function pieceNameInSentence(char: string): string {
	return LOWER_NAMES[char.toLowerCase()]?.() ?? char;
}

/** "queen, king, and knight": piece names joined the way the current language joins a list. */
export function pieceList(chars: readonly string[]): string {
	return new Intl.ListFormat(getLocale(), { style: 'long', type: 'conjunction' }).format(
		chars.map(pieceNameInSentence),
	);
}

/** The label under a die: the piece, and what rules it out when something does. */
export function dieLabel(die: DieState): string {
	const piece = pieceName(die.value);
	const status = dieStatus(die);
	if (status === 'used') return m.game_die_used({ piece });
	if (status === 'idle') return m.game_die_no_move({ piece });
	return piece;
}

/**
 * The line under the title of the turn card. `mine` says whether the dice belong to the
 * visitor: their own dice are counted down as they are used, anyone else's are only named.
 * Empty when there are no dice to talk about.
 */
export function diceHint(dice: readonly DieState[], mine: boolean): string {
	if (dice.length === 0) return '';
	if (!mine) return m.game_turn_hint_opponent({ pieces: pieceList(dice.map((die) => die.value)) });

	const left = dice.filter((die) => dieStatus(die) === 'available').map((die) => die.value);
	const pieces = pieceList(left);
	if (left.length === 0) return m.game_turn_hint_none();
	if (left.length === 1) return m.game_turn_hint_left_one({ pieces });
	if (left.length === 2) return m.game_turn_hint_left_two({ pieces });
	return m.game_turn_hint_left_three({ pieces });
}
