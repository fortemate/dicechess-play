import type { Doubling, Over, Seat } from './liveTypes';

/**
 * The credits line of a staked game's end screen (ADR 006 §5.4, this repo's #75).
 *
 * Every number here is the server's: `doubling.currentStake` is the accepted stake, or the pre-offer
 * stake when the game ended on a declined double (the server never changes the stake merely because
 * it was offered). This function therefore never multiplies by a cube value, never adds a proposed
 * amount, and never guesses — it only signs the server's figure from the viewer's seat.
 *
 * Returns `null` for a classic game (no `doubling` on the state).
 */
export function settlementLine(
	doubling: Doubling | null | undefined,
	over: Over,
	mySeat: Seat | null,
): string | null {
	if (!doubling) return null;
	if (over.termination === 'Aborted') return 'Reservations released';
	if ('Draw' in over.result) return 'No credits change hands';
	const winner = over.result.Win.side;
	const stake = formatCredits(doubling.currentStake);
	if (mySeat === null) return `${stake} to ${winner}`;
	// U+2212 MINUS SIGN, not a hyphen: it reads as an amount, and matches the ADR's wording.
	return winner === mySeat ? `+${stake}` : `−${stake}`;
}

/** PLAY_CREDIT is a closed-loop game credit; the UI says "credits", never a currency code. */
function formatCredits(amount: number): string {
	return `${amount} ${amount === 1 ? 'credit' : 'credits'}`;
}
