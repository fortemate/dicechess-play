import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	PlayWithBotStore,
	setDiceChessInstance,
	resetDiceChessInstance,
} from './playWithBotStore.svelte';
import { preferencesStore } from '../preferencesStore.svelte';

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
	// Defaults to "no" so tests unrelated to draw offers are unaffected; override per-test.
	const shouldBotAcceptDraw = vi.fn((_dfen: string, _options?: unknown) => false);
	return { applyMove, getLegalUciMoves, getBestMove, endTurn, shouldBotAcceptDraw };
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

		// Draw/double offers must NOT block navigation: offerDraw/offerDouble already read the
		// live board directly, and the player may want to check the live position before deciding.
		store.activeDrawOffer = 'player';
		store.setMoveIndex(0);
		expect(store.isViewingHistory).toBe(true);
		store.setMoveIndex(store.maxMoveIndex);
		store.activeDrawOffer = null;

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

describe('PlayWithBotStore draw offers', () => {
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

	it("offers canUserOfferDraw only on the player's own turn, mid-game, with no offer already in flight", async () => {
		expect(store.canUserOfferDraw).toBe(false); // idle, before any game starts

		await startAndRollPlayerTurn();
		expect(store.gameStatus).toBe('playing');
		expect(store.canUserOfferDraw).toBe(true);

		store.activeDrawOffer = 'bot';
		expect(store.canUserOfferDraw).toBe(false);
		store.activeDrawOffer = null;
	});

	it('offerDraw() puts the offer in flight immediately, disabling a second offer', async () => {
		await startAndRollPlayerTurn();

		const offered = store.offerDraw();
		expect(store.activeDrawOffer).toBe('player');
		expect(store.playerCanOfferDraw).toBe(false);
		expect(store.canUserOfferDraw).toBe(false);

		await vi.advanceTimersByTimeAsync(1200);
		await offered;
	});

	it('ends the game as a draw when the bot accepts the offer', async () => {
		mock.shouldBotAcceptDraw.mockReturnValue(true);
		await startAndRollPlayerTurn();

		const offered = store.offerDraw();
		await vi.advanceTimersByTimeAsync(1200);
		await offered;

		expect(store.activeDrawOffer).toBeNull();
		expect(store.gameStatus).toBe('draw');
		expect(store.gameEndReason).toBe('agreement');
	});

	it("keeps the game going, and the player's offer spent, when the bot declines", async () => {
		mock.shouldBotAcceptDraw.mockReturnValue(false);
		await startAndRollPlayerTurn();

		const offered = store.offerDraw();
		await vi.advanceTimersByTimeAsync(1200);
		await offered;

		expect(store.activeDrawOffer).toBeNull();
		expect(store.gameStatus).toBe('playing');
		// One offer per game: declining doesn't refund the player's chance to ask again.
		expect(store.playerCanOfferDraw).toBe(false);
		expect(store.canUserOfferDraw).toBe(false);
	});

	it('acceptBotDraw() ends the game as a draw when the bot is the one offering', async () => {
		await startAndRollPlayerTurn();
		store.activeDrawOffer = 'bot';

		store.acceptBotDraw();

		expect(store.activeDrawOffer).toBeNull();
		expect(store.gameStatus).toBe('draw');
		expect(store.gameEndReason).toBe('agreement');
	});

	it("declineBotDraw() resumes the game and restores the player's own offer chance", async () => {
		await startAndRollPlayerTurn();
		store.activeDrawOffer = 'bot';
		store.playerCanOfferDraw = false; // simulate the player having already used their own offer
		const botTurnSpy = vi.spyOn(store, 'botTurn').mockResolvedValue();

		store.declineBotDraw();

		expect(store.activeDrawOffer).toBeNull();
		expect(store.gameStatus).toBe('playing');
		expect(store.playerCanOfferDraw).toBe(true);
		expect(botTurnSpy).toHaveBeenCalled();
	});

	it('ignores acceptBotDraw()/declineBotDraw() when there is no bot offer pending', async () => {
		await startAndRollPlayerTurn();
		expect(store.activeDrawOffer).toBeNull();

		store.acceptBotDraw();
		expect(store.gameStatus).toBe('playing');

		store.declineBotDraw();
		expect(store.gameStatus).toBe('playing');
	});
});

describe('PlayWithBotStore king capture on the last rank (issue #177)', () => {
	let store: PlayWithBotStore;
	let mock: ReturnType<typeof createMockDiceChess>;

	// White pawn on c7, black king on d8 — the position from the reported game. The capture lands
	// on the last rank but is NOT a promotion: the game ends there, so the engine emits a plain
	// capture. Analytics replays a game by exact UCI equality, so a stray `q` gets the whole game
	// rejected at ingest and quarantined for good.
	const KING_ON_LAST_RANK_FEN = 'Qn1k3r/1pPB1pp1/3p1n2/4p1Np/4P3/BRN5/P1PP1PPP/4K2R w - - 0 1';

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

	it('records the winning capture without a promotion suffix', async () => {
		store.customDfen = `${KING_ON_LAST_RANK_FEN} PBK`;
		store.startNewGame('white', 'greedy');
		const rolled = store.rollDice();
		await vi.advanceTimersByTimeAsync(600); // roll-animation spin
		await rolled;

		store.handleBoardMove('c7', 'd8');

		expect(store.pendingPromotion).toBeNull(); // no picker: this is a capture, not a promotion
		expect(store.gameEndReason).toBe('mate');
		expect(mock.applyMove.mock.calls.at(-1)?.[3]).toBeUndefined();
		expect(store.turnHistory.at(-1)?.moves?.map((m) => m.uci)).toEqual(['c7d8']);
	});
});
