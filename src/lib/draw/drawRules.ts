/**
 * The draw-offer lifecycle, as pure rules shared by both game surfaces (ADR 006 §4.6, this repo #74).
 *
 * One mental model, two surfaces: `/live` learns the state from play-api (the server stays the sole
 * authority there and this module only expresses what its answers mean), while `/practice` owns the
 * state locally and drives the whole lifecycle through these functions. The rules:
 *
 * - **Arming is silent and phase-free.** A player may arm a standing offer at any time, including
 *   during the opponent's turn. Nothing is delivered until the armer's own turn completes, so an
 *   offer can never interrupt the opponent mid-turn or block a running clock.
 * - **Delivery happens at the armer's turn completion** — after their micro-moves, and equally after
 *   a forced pass, which is why the flag is standing rather than a per-turn click: in a K-vs-K
 *   endgame most turns are forced passes and would otherwise carry no offer.
 * - **The responder answers at their pre-roll gate**, before the dice are revealed. Revealing the
 *   dice is itself a decline: the responder never loses time to a modal, which is what makes the
 *   DiceChess.com clock-abuse (offer during the opponent's turn, block the board) impossible here.
 * - **The right to offer is passing.** It starts with nobody; delivering an offer hands it to the
 *   opponent, and it returns to the offerer only after `reofferTurns` of their own completed turns.
 *   `reofferTurns <= 0` means it never returns — one offer per player per game, which is the
 *   server's default (`PLAY_DRAW_REOFFER_TURNS`, non-positive = never) because the rule is not yet
 *   settled by any federation.
 *
 * Generic over the seat token so each surface keeps its own vocabulary: `'White' | 'Black'` on
 * `/live`, `'player' | 'bot'` on `/practice`. No I/O, no store imports, no engine calls — the state
 * is a plain immutable value and every function returns a new one.
 */

/** `reofferTurns` sentinel: the right to offer never comes back on its own. */
export const DRAW_RIGHT_NEVER_RETURNS = 0;

export interface DrawRules {
	/**
	 * Own completed turns the last offerer must play before the right to offer returns to them.
	 * Non-positive = never returns, matching play-api's `PLAY_DRAW_REOFFER_TURNS` default.
	 */
	readonly reofferTurns: number;
}

/** The server's default, and therefore the default both surfaces show. */
export const DEFAULT_DRAW_RULES: DrawRules = { reofferTurns: DRAW_RIGHT_NEVER_RETURNS };

export interface DrawOfferState<S extends string> {
	/** Seats whose standing offer is armed but not yet delivered. Private to each seat in live play. */
	readonly armed: readonly S[];
	/** The delivered offer awaiting an answer, if any. */
	readonly pending: { readonly by: S } | null;
	/** Who delivered the most recent offer — the seat currently without the right to offer. */
	readonly lastOfferBy: S | null;
	/** Turns `lastOfferBy` has completed since delivering; meaningless when `lastOfferBy` is null. */
	readonly turnsSinceLastOffer: number;
}

export type DrawArmRefusalReason = 'offer_pending' | 'right_with_opponent';

export interface DrawArmRefusal {
	readonly reason: DrawArmRefusalReason;
	/** Own turns still to play before the right returns; null where it never returns on its own. */
	readonly availableAfterTurns: number | null;
}

export function initialDrawOfferState<S extends string>(): DrawOfferState<S> {
	return { armed: [], pending: null, lastOfferBy: null, turnsSinceLastOffer: 0 };
}

export function isArmed<S extends string>(state: DrawOfferState<S>, side: S): boolean {
	return state.armed.includes(side);
}

/** True while `side` is the one being asked — the responder facing the pre-roll gate. */
export function isResponder<S extends string>(state: DrawOfferState<S>, side: S): boolean {
	return state.pending !== null && state.pending.by !== side;
}

/**
 * Whether `side` may arm an offer right now. Phase-independent by design: the caller adds its own
 * "the game is still running" condition, and nothing else.
 */
export function mayOffer<S extends string>(
	state: DrawOfferState<S>,
	side: S,
	rules: DrawRules = DEFAULT_DRAW_RULES,
): boolean {
	if (state.pending !== null) return false;
	return state.lastOfferBy !== side || rightHasReturned(state, rules);
}

/**
 * Own turns `side` must still complete before it may offer again: `null` when the right is not
 * withheld from it at all, and equally when this deployment never returns it (the caller says
 * "your opponent offers next" rather than naming a number).
 */
export function turnsUntilRightReturns<S extends string>(
	state: DrawOfferState<S>,
	side: S,
	rules: DrawRules = DEFAULT_DRAW_RULES,
): number | null {
	if (state.lastOfferBy !== side) return null;
	if (rules.reofferTurns <= 0) return null;
	return Math.max(0, rules.reofferTurns - state.turnsSinceLastOffer);
}

/**
 * Arm `side`'s standing offer, or refuse with the reason. Arming twice is idempotent, and a refusal
 * leaves the state untouched so the caller can show why the control is disabled.
 */
export function armDrawOffer<S extends string>(
	state: DrawOfferState<S>,
	side: S,
	rules: DrawRules = DEFAULT_DRAW_RULES,
): { state: DrawOfferState<S>; refusal: DrawArmRefusal | null } {
	if (!mayOffer(state, side, rules)) {
		const reason: DrawArmRefusalReason =
			state.pending !== null ? 'offer_pending' : 'right_with_opponent';
		return {
			state,
			refusal: { reason, availableAfterTurns: turnsUntilRightReturns(state, side, rules) },
		};
	}
	if (isArmed(state, side)) return { state, refusal: null };
	return { state: { ...state, armed: [...state.armed, side] }, refusal: null };
}

/** Withdraw `side`'s standing offer. Always allowed: an undelivered offer is nobody else's business. */
export function disarmDrawOffer<S extends string>(
	state: DrawOfferState<S>,
	side: S,
): DrawOfferState<S> {
	if (!isArmed(state, side)) return state;
	return { ...state, armed: state.armed.filter((s) => s !== side) };
}

/**
 * `side` has just completed a turn — micro-moves played, or a forced pass, which counts the same.
 * Delivers their armed offer if they still hold the right, and otherwise only advances the counter
 * that brings a withheld right back.
 *
 * An armed flag survives a turn it could not be delivered on (only possible while the opponent's own
 * offer is pending): it is consumed by delivery, never by the mere passing of a turn.
 */
export function completeTurn<S extends string>(
	state: DrawOfferState<S>,
	side: S,
	rules: DrawRules = DEFAULT_DRAW_RULES,
): { state: DrawOfferState<S>; delivered: boolean } {
	if (isArmed(state, side) && mayOffer(state, side, rules)) {
		return {
			state: {
				armed: state.armed.filter((s) => s !== side),
				pending: { by: side },
				lastOfferBy: side,
				turnsSinceLastOffer: 0,
			},
			delivered: true,
		};
	}
	if (state.lastOfferBy !== side) return { state, delivered: false };
	return {
		state: { ...state, turnsSinceLastOffer: state.turnsSinceLastOffer + 1 },
		delivered: false,
	};
}

/**
 * Answer the pending offer. Declining — by button, by Escape, or by revealing the dice — clears it
 * and nothing else: the right stays with the opponent, because it passed at delivery and an answer
 * does not hand it back.
 */
export function answerDrawOffer<S extends string>(
	state: DrawOfferState<S>,
	accept: boolean,
): { state: DrawOfferState<S>; agreed: boolean } {
	if (state.pending === null) return { state, agreed: false };
	return { state: { ...state, pending: null }, agreed: accept };
}

function rightHasReturned<S extends string>(state: DrawOfferState<S>, rules: DrawRules): boolean {
	return rules.reofferTurns > 0 && state.turnsSinceLastOffer >= rules.reofferTurns;
}
