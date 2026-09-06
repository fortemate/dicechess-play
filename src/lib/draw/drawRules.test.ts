import { describe, expect, it } from 'vitest';
import {
	answerDrawOffer,
	armDrawOffer,
	completeTurn,
	DEFAULT_DRAW_RULES,
	disarmDrawOffer,
	DRAW_RIGHT_NEVER_RETURNS,
	initialDrawOfferState,
	isArmed,
	isResponder,
	mayOffer,
	turnsUntilRightReturns,
	type DrawOfferState,
	type DrawRules,
} from './drawRules';

type Seat = 'White' | 'Black';

const fresh = () => initialDrawOfferState<Seat>();

/** Arms `side` and plays their turn out, which is what delivers the offer. */
function offer(
	state: DrawOfferState<Seat>,
	side: Seat,
	rules: DrawRules = DEFAULT_DRAW_RULES,
): DrawOfferState<Seat> {
	const armed = armDrawOffer(state, side, rules);
	expect(armed.refusal).toBeNull();
	const completed = completeTurn(armed.state, side, rules);
	expect(completed.delivered).toBe(true);
	return completed.state;
}

describe('drawRules', () => {
	it('starts with the right to offer held by nobody in particular', () => {
		const state = fresh();
		expect(mayOffer(state, 'White')).toBe(true);
		expect(mayOffer(state, 'Black')).toBe(true);
		expect(state.pending).toBeNull();
		expect(turnsUntilRightReturns(state, 'White')).toBeNull();
	});

	it('keeps an armed offer silent until the armer’s own turn completes', () => {
		const { state } = armDrawOffer(fresh(), 'White');
		expect(isArmed(state, 'White')).toBe(true);
		expect(state.pending).toBeNull();

		// The opponent playing a turn delivers nothing: only the armer's own turn does.
		const opponentTurn = completeTurn(state, 'Black');
		expect(opponentTurn.delivered).toBe(false);
		expect(opponentTurn.state.pending).toBeNull();

		const ownTurn = completeTurn(opponentTurn.state, 'White');
		expect(ownTurn.delivered).toBe(true);
		expect(ownTurn.state.pending).toEqual({ by: 'White' });
		expect(isArmed(ownTurn.state, 'White')).toBe(false);
	});

	it('treats a forced pass as a completed turn — there is no other kind of completion here', () => {
		// The module never learns whether anything was played; that is the whole point of the standing
		// flag, and why a K-vs-K endgame full of forced passes still carries offers.
		const { state } = armDrawOffer(fresh(), 'Black');
		expect(completeTurn(state, 'Black').delivered).toBe(true);
	});

	it('is idempotent when arming twice and lets a player withdraw silently', () => {
		const once = armDrawOffer(fresh(), 'White').state;
		const twice = armDrawOffer(once, 'White').state;
		expect(twice.armed).toEqual(['White']);

		const withdrawn = disarmDrawOffer(twice, 'White');
		expect(isArmed(withdrawn, 'White')).toBe(false);
		expect(completeTurn(withdrawn, 'White').delivered).toBe(false);
	});

	it('refuses a second offer while one is still pending, on either side of it', () => {
		const pending = offer(fresh(), 'White');
		expect(mayOffer(pending, 'White')).toBe(false);
		expect(mayOffer(pending, 'Black')).toBe(false);
		expect(armDrawOffer(pending, 'Black').refusal).toEqual({
			reason: 'offer_pending',
			availableAfterTurns: null,
		});
	});

	it('names the responder, and only the responder', () => {
		const pending = offer(fresh(), 'White');
		expect(isResponder(pending, 'Black')).toBe(true);
		expect(isResponder(pending, 'White')).toBe(false);
		expect(isResponder(fresh(), 'Black')).toBe(false);
	});

	it('passes the right to the opponent on delivery and, by default, never gives it back', () => {
		expect(DEFAULT_DRAW_RULES.reofferTurns).toBe(DRAW_RIGHT_NEVER_RETURNS);
		let state = answerDrawOffer(offer(fresh(), 'White'), false).state;

		expect(mayOffer(state, 'White')).toBe(false);
		expect(mayOffer(state, 'Black')).toBe(true);
		expect(armDrawOffer(state, 'White').refusal).toEqual({
			reason: 'right_with_opponent',
			availableAfterTurns: null, // the caller says "your opponent offers next", not a number
		});

		// However many turns White plays, the right stays where it went.
		for (let i = 0; i < 10; i += 1) state = completeTurn(state, 'White').state;
		expect(mayOffer(state, 'White')).toBe(false);
	});

	it('returns the right after N of the offerer’s own turns where a deployment allows it', () => {
		const rules: DrawRules = { reofferTurns: 2 };
		let state = answerDrawOffer(offer(fresh(), 'White', rules), false).state;
		expect(mayOffer(state, 'White', rules)).toBe(false);
		expect(turnsUntilRightReturns(state, 'White', rules)).toBe(2);

		// The opponent's turns do not count towards it: they are not the offerer's own.
		state = completeTurn(state, 'Black', rules).state;
		expect(turnsUntilRightReturns(state, 'White', rules)).toBe(2);

		state = completeTurn(state, 'White', rules).state;
		expect(mayOffer(state, 'White', rules)).toBe(false);
		expect(turnsUntilRightReturns(state, 'White', rules)).toBe(1);

		state = completeTurn(state, 'White', rules).state;
		expect(mayOffer(state, 'White', rules)).toBe(true);
		expect(turnsUntilRightReturns(state, 'White', rules)).toBe(0);
		expect(armDrawOffer(state, 'White', rules).refusal).toBeNull();
	});

	it('hands the right back to the opponent as soon as they offer in their turn', () => {
		// The passing right in its normal shape: White offers, Black answers and then offers, and the
		// restriction moves with the last offer rather than accumulating.
		const afterWhite = answerDrawOffer(offer(fresh(), 'White'), false).state;
		const afterBlack = answerDrawOffer(offer(afterWhite, 'Black'), false).state;

		expect(afterBlack.lastOfferBy).toBe('Black');
		expect(mayOffer(afterBlack, 'White')).toBe(true);
		expect(mayOffer(afterBlack, 'Black')).toBe(false);
	});

	it('clears the offer on either answer, and moves nothing else', () => {
		const pending = offer(fresh(), 'White');

		const declined = answerDrawOffer(pending, false);
		expect(declined.agreed).toBe(false);
		expect(declined.state.pending).toBeNull();
		expect(declined.state.lastOfferBy).toBe('White'); // an answer never hands the right back

		const accepted = answerDrawOffer(pending, true);
		expect(accepted.agreed).toBe(true);
		expect(accepted.state.pending).toBeNull();

		// Answering nothing is a no-op rather than an error: a late click, a reconnect, a double tap.
		const nothing = answerDrawOffer(fresh(), true);
		expect(nothing.agreed).toBe(false);
	});

	it('keeps an armed flag that could not be delivered, and delivers it on the next turn', () => {
		// White arms, Black's offer lands first: White answers it, and White's own offer is still armed
		// when White's turn finally completes.
		const whiteArmed = armDrawOffer(fresh(), 'White').state;
		const blackOffered = completeTurn(armDrawOffer(whiteArmed, 'Black').state, 'Black').state;
		expect(blackOffered.pending).toEqual({ by: 'Black' });
		expect(isArmed(blackOffered, 'White')).toBe(true);

		const blocked = completeTurn(blackOffered, 'White');
		expect(blocked.delivered).toBe(false); // nothing goes out while an offer is unanswered
		expect(isArmed(blocked.state, 'White')).toBe(true);

		const answered = answerDrawOffer(blocked.state, false).state;
		const delivered = completeTurn(answered, 'White');
		expect(delivered.delivered).toBe(true);
		expect(delivered.state.pending).toEqual({ by: 'White' });
	});

	it('never mutates the state it is given', () => {
		const state = fresh();
		const armed = armDrawOffer(state, 'White').state;
		completeTurn(armed, 'White');
		expect(state).toEqual({ armed: [], pending: null, lastOfferBy: null, turnsSinceLastOffer: 0 });
		expect(armed.pending).toBeNull();
	});
});
