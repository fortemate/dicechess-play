/**
 * What the turn card and the move list say about dice (#254): the name of the piece a die
 * shows, the state a die is in, and the one-line hint under "whose turn it is".
 *
 * Rune-free and DOM-free: pure functions over the `DieState` list both game stores already
 * expose, so the components stay markup and the wording can be tested without rendering.
 *
 * A die is in one of three states. The stores decide them; nothing here knows the rules:
 *   - `used`: a move was made with it this turn;
 *   - `playable`: not used and the store allows it (`allowed`), so it carries the highlight;
 *   - `idle`: not used and not allowed, i.e. rolled, but no move can be made with it.
 */
import { m } from '#lib/paraglide/messages.js';
import { getLocale } from '#lib/paraglide/runtime.js';
import type { DieState } from '#lib/playWithBot/playWithBotDice.svelte.js';

export type DieStatus = 'used' | 'playable' | 'idle';

export function dieStatus(die: DieState): DieStatus {
	if (die.used) return 'used';
	return die.allowed ? 'playable' : 'idle';
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

/** The label under a die: the piece, and why it cannot be played when it cannot. */
export function dieLabel(die: DieState): string {
	const piece = pieceName(die.value);
	const status = dieStatus(die);
	if (status === 'used') return m.game_die_used({ piece });
	if (status === 'idle') return m.game_die_no_move({ piece });
	return piece;
}

/**
 * The line under the title of the turn card. `mine` says whether the dice belong to the
 * visitor: their own dice get advice (what is left to play), anyone else's are only named.
 * Empty when there are no dice to talk about.
 */
export function diceHint(dice: readonly DieState[], mine: boolean): string {
	if (dice.length === 0) return '';
	if (!mine) return m.game_turn_hint_opponent({ pieces: pieceList(dice.map((die) => die.value)) });

	const playable = dice.filter((die) => dieStatus(die) === 'playable').map((die) => die.value);
	const pieces = pieceList(playable);
	if (playable.length === 0) return m.game_turn_hint_none();
	if (playable.length === 1) return m.game_turn_hint_left_one({ pieces });
	if (playable.length === 2) return m.game_turn_hint_left_two({ pieces });
	return m.game_turn_hint_left_three({ pieces });
}
