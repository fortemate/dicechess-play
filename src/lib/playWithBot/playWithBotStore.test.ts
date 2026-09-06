import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	PlayWithBotStore,
	setDiceChessInstance,
	resetDiceChessInstance,
} from './playWithBotStore.svelte';
import { preferencesStore } from '../preferencesStore.svelte';
import { initialDrawOfferState } from '../draw/drawRules';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * A minimal, deterministic stand-in for the real engine. Legality/move-application don't need to
 * reflect real chess rules here — these tests exercise the store's live/viewed-state bookkeeping,
 * not the engine. `getLegalUciMoves` reports moves available as long as at least one die remains
 * unused (decoded from the dfen's trailing dice-letters field), so a turn's legality tracks however
 * many of the 3 seeded dice have been consumed, without depending on random dice faces.
 */
function createMockDiceChess() {
	// Bumps the halfmove-clock field on every call so successive positions are distinguishable —
	// the board/pieces part is left untouched (so a fixed piece is always findable at a fixed
	// square), but callers checking "did the FEN actually change and restore" have something real
	// to compare against, instead of every call coincidentally returning the identical string.
	const applyMove = vi.fn((dfen: string, _from?: string, _to?: string, _promo?: string) => {
		const parts = dfen.trim().split(/\s+/).slice(0, 6);
		parts[4] = String((Number(parts[4]) || 0) + 1);
		return parts.join(' ');
	});
	const getLegalUciMoves = vi.fn((dfen: string) => {
		const diceSuffix = dfen.trim().split(/\s+/)[6] ?? '';
		return diceSuffix.length >= 1 ? ['e2e4'] : [];
	});
	const getBestMove = vi.fn((_dfen: string, _options?: unknown) => ({
		moves: [{ from: 'e7', to: 'e5', promotion: null }],
	}));
	const endTurn = vi.fn((fen: string) => {
		const parts = fen.trim().split(/\s+/);
		parts[1] = parts[1] === 'w' ? 'b' : 'w';
		return parts.join(' ');
	});
	// Both default to "no" so tests unrelated to draw offers are unaffected; override per-test.
	const shouldBotAcceptDraw = vi.fn((_dfen: string, _options?: unknown) => false);
	const shouldBotOfferDraw = vi.fn((_dfen: string, _options?: unknown) => false);
	return {
		applyMove,
		getLegalUciMoves,
		getBestMove,
		endTurn,
		shouldBotAcceptDraw,
		shouldBotOfferDraw,
	};
}

describe('PlayWithBotStore history scrubbing (issue #55)', () => {
	let store: PlayWithBotStore;
	let mock: ReturnType<typeof createMockDiceChess>;

	beforeEach(() => {
		vi.useFakeTimers();
		mock = createMockDiceChess();
		setDiceChessInstance(mock);
		store = new PlayWithBotStore();
	});

	afterEach(() => {
		store.endSession();
		resetDiceChessInstance();
		vi.useRealTimers();
		preferencesStore.timeLimit = null;
		preferencesStore.timeBonus = 0;
	});

	/** Starts a game with all 3 of the player's first-roll dice seeded as pawns (via customDfen),
	 * so `handleBoardMove('e2', 'e4')` always finds a matching, unused die — no randomness. */
	async function startAndRollPlayerTurn() {
		store.customDfen = `${START_FEN} PPP`;
		store.startNewGame('white', 'greedy');
		const rolled = store.rollDice();
		await vi.advanceTimersByTimeAsync(600); // roll-animation spin
		await rolled;
	}

	it('blocks legal moves and board moves while scrubbed to a past position', async () => {
		await startAndRollPlayerTurn();
		expect(store.gameStatus).toBe('playing');

		store.handleBoardMove('e2', 'e4'); // 1 of 3 dice used; 2 remain, turn continues
		expect(store.maxMoveIndex).toBe(1);
		expect(store.gameStatus).toBe('playing');
		expect(store.legalMovesDests.size).toBeGreaterThan(0); // sanity: live, still movable

		store.setMoveIndex(0);
		expect(store.isViewingHistory).toBe(true);
		expect(store.legalMovesDests.size).toBe(0);

		const historyKeysBefore = Object.keys(store.historyMap).length;
		store.handleBoardMove('e2', 'e4');
		expect(store.maxMoveIndex).toBe(1); // unchanged — the move was rejected, not appended
		expect(Object.keys(store.historyMap)).toHaveLength(historyKeysBefore);
	});

	it('shows the historical position while scrubbed and the true live position on return', async () => {
		await startAndRollPlayerTurn();
		const fenBeforeMove = store.currentBoardFen;
		store.handleBoardMove('e2', 'e4');
		const liveFenAfterMove = store.currentBoardFen;
		const liveDiceBeforeScrub = store.currentDice.map((d) => ({ ...d }));
		expect(liveFenAfterMove).not.toBe(fenBeforeMove); // sanity: the move actually changed the live fen

		store.setMoveIndex(0);
		expect(store.currentBoardFen).toBe(fenBeforeMove); // scrubbed view shows the pre-move position
		expect(store.currentBoardFen).toBe(store.historyMap['0'].fen);
		expect(store.activeColor).toBe(store.historyMap['0'].active_color);
		expect(store.currentDice).toEqual(store.historyMap['0'].dices);

		store.setMoveIndex(store.maxMoveIndex);
		expect(store.isViewingHistory).toBe(false);
		expect(store.currentBoardFen).toBe(liveFenAfterMove); // live position, unaffected by the excursion
		expect(store.currentDice).toEqual(liveDiceBeforeScrub);

		// The live game must still be fully playable after the excursion into history.
		store.handleBoardMove('e2', 'e4');
		expect(store.maxMoveIndex).toBe(2);
	});

	it("keeps the bot's move application reading the live position even when scrubbed mid-turn", async () => {
		await startAndRollPlayerTurn();
		// Exhaust all 3 dice so the turn passes to the bot.
		store.handleBoardMove('e2', 'e4');
		store.handleBoardMove('e2', 'e4');
		store.handleBoardMove('e2', 'e4');
		expect(store.gameStatus).toBe('bot_thinking');

		await vi.advanceTimersByTimeAsync(800); // completeMoveLogic's handoff delay -> botTurn() starts
		await vi.advanceTimersByTimeAsync(600); // bot's own roll-animation spin

		// By now botTurn() has already rolled and selected its move (selectBestMove is called
		// synchronously right after the roll settles, with no `await` in between — there's no real
		// window for a scrub to land before this call, so it's a plain sanity check, not a race test).
		const dfenUsedForSelection = mock.getBestMove.mock.calls.at(-1)?.[0] as string;
		expect(dfenUsedForSelection).toContain(' b ');

		// botTurn() is now suspended inside its per-move `await sleep(1000)`, about to apply its move —
		// this IS a real yield point, and the one issue #55 was actually about. Scrub away from live
		// right before that resolves.
		store.setMoveIndex(0);
		expect(store.isViewingHistory).toBe(true);
		expect(store.currentBoardFen).toBe(store.historyMap['0'].fen);

		await vi.advanceTimersByTimeAsync(1000); // lets the bot's move-application logic run

		// The move must have been validated/applied against the true live (post-toggle, black-to-move)
		// position — not the position the display was scrubbed to (the white-to-move initial roll).
		const dfenUsedForApplication = mock.applyMove.mock.calls.at(-1)?.[0] as string;
		expect(dfenUsedForApplication).toContain(' b ');
		expect(store.historyMap['0'].fen).toContain(' w '); // proves the scrubbed view really did differ

		// Still scrubbed — the freshly-appended bot move must not have disturbed the display.
		expect(store.currentBoardFen).toBe(store.historyMap['0'].fen);

		store.setMoveIndex(store.maxMoveIndex);
		expect(store.isViewingHistory).toBe(false);
		expect(store.activeColor).toBe('w'); // turn handed back to the player, now viewed live
	});

	it('blocks scrubbing only for an in-progress promotion, not draw or double offers', async () => {
		await startAndRollPlayerTurn();
		store.handleBoardMove('e2', 'e4');
		expect(store.maxMoveIndex).toBe(1);

		store.pendingPromotion = {
			orig: 'e2',
			dest: 'e4',
			color: 'w',
			availablePieces: ['q'],
			dieIndex: 0,
		};
		store.setMoveIndex(0);
		expect(store.isViewingHistory).toBe(false);
		store.pendingPromotion = null;

		// Draw/double offers must NOT block navigation: the offer flows read the live board directly,
		// and the player may want to check the live position before deciding.
		store.drawState = {
			armed: [],
			pending: { by: 'player' },
			lastOfferBy: 'player',
			turnsSinceLastOffer: 0,
		};
		store.setMoveIndex(0);
		expect(store.isViewingHistory).toBe(true);
		store.setMoveIndex(store.maxMoveIndex);
		store.drawState = initialDrawOfferState();

		store.activeDoubleOffer = 'bot';
		store.setMoveIndex(0);
		expect(store.isViewingHistory).toBe(true);
		store.setMoveIndex(store.maxMoveIndex);
		store.activeDoubleOffer = null;
	});

	it("keeps the wall-clock timer decrementing the live side's time regardless of what's displayed", async () => {
		preferencesStore.timeLimit = 5;
		preferencesStore.timeBonus = 0;

		await startAndRollPlayerTurn();
		store.handleBoardMove('e2', 'e4');
		store.handleBoardMove('e2', 'e4');
		store.handleBoardMove('e2', 'e4');
		expect(store.gameStatus).toBe('bot_thinking');

		await vi.advanceTimersByTimeAsync(800); // liveActiveColor flips to the bot's ('b')

		// Scrub to the initial roll, which displays 'w' as the active color.
		store.setMoveIndex(0);
		expect(store.activeColor).toBe('w');

		const whiteBefore = store.whiteTimeLeft;
		const blackBefore = store.blackTimeLeft;
		await vi.advanceTimersByTimeAsync(300);

		expect(store.blackTimeLeft).toBeLessThan(blackBefore); // the true (live) side's clock ticks down
		expect(store.whiteTimeLeft).toBe(whiteBefore); // the scrubbed-display side's clock does not
	});

	it('correctly derives initial active color from custom starting FEN and schedules bot/player start accordingly', async () => {
		// Custom FEN with Black to move
		const blackStartFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';
		store.customDfen = blackStartFen;

		// 1. Player is White, Bot is Black (so Black/Bot to move first)
		store.startNewGame('white', 'greedy');
		expect(store.activeColor).toBe('b');
		expect(store.gameStatus).toBe('bot_thinking');

		store.endSession();

		// 2. Player is Black, Bot is White (so Black/Player to move first)
		store.startNewGame('black', 'greedy');
		expect(store.activeColor).toBe('b');
		expect(store.gameStatus).toBe('rolling');
	});

	it('passes correct activeColor argument to buildDfen calls during player and bot turns', async () => {
		// Start a game where it's black's turn to move first
		const blackStartFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';
		store.customDfen = `${blackStartFen} ppp`;
		store.startNewGame('black', 'greedy'); // Player is black, starts with roll

		// Player rolls dice
		const rolled = store.rollDice();
		await vi.advanceTimersByTimeAsync(600);
		await rolled;

		// Check that the legal moves calculation received lowercase dice pool 'ppp'
		const lastLegalMovesCall = mock.getLegalUciMoves.mock.calls.at(-1)?.[0] as string;
		expect(lastLegalMovesCall).toContain(' b ');
		const parts = lastLegalMovesCall.trim().split(/\s+/);
		const diceSuffix = parts[6] ?? '';
		expect(diceSuffix).toBe('ppp');
	});
});

describe('PlayWithBotStore lastMove (issue #75)', () => {
	let store: PlayWithBotStore;
	let mock: ReturnType<typeof createMockDiceChess>;

	beforeEach(() => {
		vi.useFakeTimers();
		mock = createMockDiceChess();
		setDiceChessInstance(mock);
		store = new PlayWithBotStore();
	});

	afterEach(() => {
		store.endSession();
		resetDiceChessInstance();
		vi.useRealTimers();
	});

	async function startAndRollPlayerTurn() {
		store.customDfen = `${START_FEN} PPP`;
		store.startNewGame('white', 'greedy');
		const rolled = store.rollDice();
		await vi.advanceTimersByTimeAsync(600);
		await rolled;
	}

	it('is undefined before any move (a fresh roll)', async () => {
		await startAndRollPlayerTurn();
		expect(store.lastMove).toBeUndefined();
	});

	it('highlights the move just played, live', async () => {
		await startAndRollPlayerTurn();
		store.handleBoardMove('e2', 'e4');
		expect(store.lastMove).toEqual(['e2', 'e4']);
	});

	it('follows history navigation: no highlight on the roll, the move on its own entry', async () => {
		await startAndRollPlayerTurn();
		store.handleBoardMove('e2', 'e4'); // historyMap['1'], maxMoveIndex 1

		store.setMoveIndex(0); // the roll entry — no move yet
		expect(store.lastMove).toBeUndefined();

		store.setMoveIndex(1); // the move entry
		expect(store.lastMove).toEqual(['e2', 'e4']);
	});
});

describe('PlayWithBotStore draw offers (shared lifecycle, #74)', () => {
	let store: PlayWithBotStore;
	let mock: ReturnType<typeof createMockDiceChess>;

	beforeEach(() => {
		vi.useFakeTimers();
		mock = createMockDiceChess();
		setDiceChessInstance(mock);
		store = new PlayWithBotStore();
		preferencesStore.drawOfferPolicy = 'ask';
		preferencesStore.autoRollDice = false;
	});

	afterEach(() => {
		store.endSession();
		resetDiceChessInstance();
		vi.useRealTimers();
		preferencesStore.drawOfferPolicy = 'ask';
		preferencesStore.autoRollDice = false;
	});

	async function startAndRollPlayerTurn() {
		store.customDfen = `${START_FEN} PPP`;
		store.startNewGame('white', 'greedy');
		const rolled = store.rollDice();
		await vi.advanceTimersByTimeAsync(600);
		await rolled;
	}

	/** Spends all three dice, which is what completes the player's turn. */
	function playOutPlayerTurn() {
		store.handleBoardMove('e2', 'e4');
		store.handleBoardMove('e2', 'e4');
		store.handleBoardMove('e2', 'e4');
	}

	it('arms in any phase and delivers nothing until the turn completes', async () => {
		expect(store.canArmDrawOffer).toBe(false); // idle, before any game starts

		await startAndRollPlayerTurn();
		expect(store.canArmDrawOffer).toBe(true);
		expect(store.drawOfferControlState).toBe('idle');

		store.toggleArmDrawOffer();
		expect(store.isDrawOfferArmed).toBe(true);
		expect(store.drawOfferControlState).toBe('armed');
		expect(store.activeDrawOffer).toBeNull(); // silent: the bot knows nothing yet

		store.toggleArmDrawOffer(); // withdrawing is always allowed
		expect(store.isDrawOfferArmed).toBe(false);

		store.toggleArmDrawOffer();
		playOutPlayerTurn();

		expect(store.activeDrawOffer).toBe('player');
		expect(store.isDrawOfferArmed).toBe(false); // consumed by delivery
		expect(store.drawOfferControlState).toBe('pending');
	});

	it('delivers an armed offer on a forced pass — the case the standing flag exists for', async () => {
		await startAndRollPlayerTurn();
		playOutPlayerTurn();

		// From here nobody has a legal move, which is what a K-vs-K endgame looks like: both sides
		// roll and forfeit, and most turns would carry no offer at all under a per-turn click.
		mock.getLegalUciMoves.mockReturnValue([]);
		await vi.advanceTimersByTimeAsync(5000); // the bot's own forfeited turn, back to the player
		expect(store.gameStatus).toBe('rolling');

		store.toggleArmDrawOffer();
		const rolled = store.rollDice();
		await vi.advanceTimersByTimeAsync(600);
		await rolled;

		expect(store.gameStatus).toBe('bot_thinking'); // turn forfeited: nothing was played
		expect(store.activeDrawOffer).toBe('player'); // …and the offer still went out with the pass
	});

	it('has the bot answer at its own pre-roll gate, on the position already flipped to its side', async () => {
		mock.shouldBotAcceptDraw.mockReturnValue(true);
		await startAndRollPlayerTurn();
		store.toggleArmDrawOffer();
		playOutPlayerTurn();

		await vi.advanceTimersByTimeAsync(800); // handoff dwell, then botTurn() reaches its gate
		expect(mock.shouldBotAcceptDraw).not.toHaveBeenCalled(); // not before the bot has thought
		await vi.advanceTimersByTimeAsync(1200);

		expect(mock.shouldBotAcceptDraw).toHaveBeenCalledTimes(1);
		const [dfen] = mock.shouldBotAcceptDraw.mock.calls[0];
		expect(dfen.split(/\s+/)[1]).toBe('b'); // the bot's own perspective
		expect(dfen.split(/\s+/)).toHaveLength(6); // no dice: none are rolled at a pre-roll gate
		expect(mock.getBestMove).not.toHaveBeenCalled(); // answered before it ever rolled

		expect(store.gameStatus).toBe('draw');
		expect(store.gameEndReason).toBe('agreement');
	});

	it('keeps the game going on a decline, with the right to offer now the bot’s', async () => {
		mock.shouldBotAcceptDraw.mockReturnValue(false);
		await startAndRollPlayerTurn();
		store.toggleArmDrawOffer();
		playOutPlayerTurn();
		await vi.advanceTimersByTimeAsync(2000);

		expect(store.activeDrawOffer).toBeNull();
		expect(store.gameStatus).not.toBe('draw');
		// The right passed on delivery and, by default, never comes back: one offer per player.
		expect(store.canArmDrawOffer).toBe(false);
		expect(store.drawOfferControlState).toBe('forbidden');
		expect(store.drawTurnsUntilAvailable).toBeNull();
	});

	it('rides the bot’s offer out on its completed turn and suspends the player’s auto-roll', async () => {
		preferencesStore.autoRollDice = true;
		mock.shouldBotOfferDraw.mockReturnValue(true);
		await startAndRollPlayerTurn();
		playOutPlayerTurn();

		await vi.advanceTimersByTimeAsync(800); // botTurn() starts and arms its offer
		expect(store.drawState.armed).toEqual(['bot']);
		expect(store.activeDrawOffer).toBeNull(); // armed, but nothing delivered mid-turn
		await vi.advanceTimersByTimeAsync(5000); // the bot's roll and moves, then its turn completes

		expect(store.activeDrawOffer).toBe('bot');
		expect(store.isPreRollResponder).toBe(true);
		expect(store.isPreRollGateActive).toBe(true);
		expect(store.drawOfferControlState).toBe('hidden'); // the gate owns the decision

		await vi.advanceTimersByTimeAsync(2000); // auto-roll must stay suspended while it is pending
		expect(store.currentDice).toHaveLength(0);
		expect(store.gameStatus).toBe('rolling');
	});

	it('rolls the dice when the player declines at the gate, and ends the game when they accept', async () => {
		mock.shouldBotOfferDraw.mockReturnValue(true);
		await startAndRollPlayerTurn();
		playOutPlayerTurn();
		await vi.advanceTimersByTimeAsync(5800);
		expect(store.isPreRollResponder).toBe(true);

		store.respondDraw(false);
		await vi.advanceTimersByTimeAsync(600); // the roll the decline stands for
		expect(store.activeDrawOffer).toBeNull();
		expect(store.currentDice.length).toBeGreaterThan(0);
		expect(store.gameStatus).toBe('playing');

		// The bot has spent its own right, so a second offer is the player's to make — after which
		// accepting one is only possible for the side being asked.
		store.drawState = {
			armed: [],
			pending: { by: 'bot' },
			lastOfferBy: 'bot',
			turnsSinceLastOffer: 0,
		};
		store.dice.currentDice = [];
		store.gameStatus = 'rolling';
		expect(store.isPreRollResponder).toBe(true);

		store.respondDraw(true);
		expect(store.gameStatus).toBe('draw');
		expect(store.gameEndReason).toBe('agreement');
	});

	it('answers for a player who has asked never to be interrupted by an offer', async () => {
		preferencesStore.drawOfferPolicy = 'autoDecline';
		mock.shouldBotOfferDraw.mockReturnValue(true);
		await startAndRollPlayerTurn();
		playOutPlayerTurn();
		await vi.advanceTimersByTimeAsync(5800);

		expect(store.activeDrawOffer).toBeNull(); // declined on arrival
		expect(store.isPreRollGateActive).toBe(false);
		expect(store.gameStatus).toBe('rolling');
		// The bot still spent its right on the offer, exactly as if a human had declined by hand.
		expect(store.drawState.lastOfferBy).toBe('bot');
	});

	it('ignores an answer from a player who is not the one being asked', async () => {
		await startAndRollPlayerTurn();
		expect(store.activeDrawOffer).toBeNull();

		store.respondDraw(true);
		expect(store.gameStatus).toBe('playing');

		store.toggleArmDrawOffer();
		playOutPlayerTurn();
		expect(store.activeDrawOffer).toBe('player');

		store.respondDraw(true); // the offerer cannot accept their own offer
		expect(store.activeDrawOffer).toBe('player');
		expect(store.gameStatus).not.toBe('draw');
	});
});
