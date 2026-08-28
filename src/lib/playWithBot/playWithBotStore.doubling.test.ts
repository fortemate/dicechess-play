// Regression suite for the doubling-mode and game-end correctness fixes (issue #37):
// bot decisions must be asked from the BOT's perspective (the engine evaluates the dfen's
// active color), timeout results are white-POV, game-end delays and offer responders are
// session-guarded, and stake settlement must not depend on IndexedDB succeeding.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	PlayWithBotStore,
	setDiceChessInstance,
	resetDiceChessInstance,
} from './playWithBotStore.svelte';
import { preferencesStore } from '../preferencesStore.svelte';
import { saveLocalGame } from '../localGamesDB';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// Black king stands on e4 so the mock-legal move e2e4 captures it (victory detection reads
// the destination square of the board BEFORE the move is applied).
const KING_ON_E4_FEN = 'rnbq1bnr/pppppppp/8/8/4k3/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

vi.mock('../localGamesDB', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../localGamesDB')>();
	return { ...actual, saveLocalGame: vi.fn(async () => {}) };
});

const authMock = vi.hoisted(() => {
	const user = {
		id: 'guest',
		email: '',
		name: 'Tester',
		picture_url: null as string | null,
		role: 'USER',
		is_approved: true,
		balance: 0,
	};
	return {
		user,
		authenticated: false,
		adjustBalance: vi.fn((amount: number) => {
			user.balance = Math.max(0, user.balance + amount);
		}),
	};
});

vi.mock('../authStore.svelte', () => ({
	authStore: {
		get user() {
			return authMock.user;
		},
		get isAuthenticated() {
			return authMock.authenticated;
		},
		get externalId() {
			return 'guest:test';
		},
		adjustBalance: authMock.adjustBalance,
	},
}));

/** Same minimal engine stand-in as the main store suite, extended with the doubling hooks. */
function createMockDiceChess() {
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
	const shouldBotAcceptDraw = vi.fn((_dfen: string, _options?: unknown) => false);
	const shouldBotAcceptDouble = vi.fn(
		(_dfen: string, _stake?: number, _options?: unknown) => false,
	);
	const shouldBotOfferDouble = vi.fn((_dfen: string, _stake?: number, _options?: unknown) => false);
	const shouldBotOfferDraw = vi.fn((_dfen: string, _options?: unknown) => false);
	return {
		applyMove,
		getLegalUciMoves,
		getBestMove,
		endTurn,
		shouldBotAcceptDraw,
		shouldBotAcceptDouble,
		shouldBotOfferDouble,
		shouldBotOfferDraw,
	};
}

/** Reaches the store's private timeout handler; TS privacy is compile-time only. */
type TimeoutInvoker = { handleTimeout(color: 'w' | 'b'): void };

describe('doubling mode and game-end correctness (issue #37)', () => {
	let store: PlayWithBotStore;
	let mock: ReturnType<typeof createMockDiceChess>;
	const savedGames = () => vi.mocked(saveLocalGame).mock.calls.map(([record]) => record);

	beforeEach(() => {
		vi.useFakeTimers();
		vi.mocked(saveLocalGame).mockClear();
		vi.mocked(saveLocalGame).mockImplementation(async () => {});
		authMock.adjustBalance.mockClear();
		authMock.authenticated = true;
		authMock.user.balance = 100;
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

	/** Puts the store into a staked x2 game on the player's pre-roll turn. */
	function startStakedGame(colorPref: 'white' | 'black' = 'white') {
		store.startNewGame(colorPref, 'greedy');
		store.mode = 'x2';
		store.bet = 10;
		store.baseBet = 10;
	}

	async function startAndRollPlayerTurn(fen = START_FEN) {
		store.customDfen = `${fen} PPP`;
		store.startNewGame('white', 'greedy');
		const rolled = store.rollDice();
		await vi.advanceTimersByTimeAsync(600);
		await rolled;
	}

	describe('bot decision perspective', () => {
		it('asks shouldBotAcceptDouble with the BOT as the active color', async () => {
			startStakedGame('white');
			mock.shouldBotAcceptDouble.mockReturnValue(true);

			const offered = store.offerDouble();
			await vi.advanceTimersByTimeAsync(1200);
			await offered;

			expect(mock.shouldBotAcceptDouble).toHaveBeenCalledTimes(1);
			const [dfen, stake] = mock.shouldBotAcceptDouble.mock.calls[0];
			expect(dfen.split(/\s+/)[1]).toBe('b'); // bot plays black — its perspective
			expect(dfen.split(/\s+/)).toHaveLength(6); // no dice field on the decision dfen
			expect(stake).toBe(20);
			// Accept mechanics: stake doubles, player pays the increment, cube passes to the bot.
			expect(store.bet).toBe(20);
			expect(store.cubeOwner).toBe('b');
			expect(authMock.adjustBalance).toHaveBeenCalledWith(-10);
		});

		it('a declined double resigns the bot at the CURRENT stake and pays the player', async () => {
			startStakedGame('white');
			mock.shouldBotAcceptDouble.mockReturnValue(false);

			const offered = store.offerDouble();
			await vi.advanceTimersByTimeAsync(1200);
			await offered;

			expect(store.gameStatus).toBe('victory');
			expect(store.gameEndReason).toBe('resign');
			expect(store.bet).toBe(10); // decline settles at the pre-double stake
			expect(authMock.adjustBalance).toHaveBeenCalledWith(20); // 2 * bet payout
			expect(savedGames()).toHaveLength(1);
			expect(savedGames()[0].result).toBe(1);
		});

		it('withdraws the offer instead of resigning the bot when the engine call fails', async () => {
			startStakedGame('white');
			mock.shouldBotAcceptDouble.mockImplementation(() => {
				throw new Error('engine hiccup');
			});

			const offered = store.offerDouble();
			await vi.advanceTimersByTimeAsync(1200);
			await offered;

			expect(store.gameStatus).toBe('rolling'); // game goes on, nobody resigned
			expect(store.bet).toBe(10);
			expect(store.activeDoubleOffer).toBeNull();
			expect(savedGames()).toHaveLength(0);
		});

		it('asks shouldBotAcceptDraw with the BOT as the active color and no dice', async () => {
			await startAndRollPlayerTurn();
			expect(store.gameStatus).toBe('playing');

			const offered = store.offerDraw();
			await vi.advanceTimersByTimeAsync(1200);
			await offered;

			expect(mock.shouldBotAcceptDraw).toHaveBeenCalledTimes(1);
			const [dfen] = mock.shouldBotAcceptDraw.mock.calls[0];
			expect(dfen.split(/\s+/)[1]).toBe('b');
			expect(dfen.split(/\s+/)).toHaveLength(6);
		});
	});

	describe('timeout results are white-POV', () => {
		it('records a bot win when the player (Black) runs out of time', async () => {
			store.startNewGame('black', 'greedy');
			(store as unknown as TimeoutInvoker).handleTimeout('b');
			await vi.advanceTimersByTimeAsync(0);

			expect(store.gameStatus).toBe('defeat');
			expect(savedGames()).toHaveLength(1);
			expect(savedGames()[0].result).toBe(1); // White (the bot) won
		});

		it('records a player win when the bot (White) runs out of time', async () => {
			store.startNewGame('black', 'greedy');
			(store as unknown as TimeoutInvoker).handleTimeout('w');
			await vi.advanceTimersByTimeAsync(0);

			expect(store.gameStatus).toBe('victory');
			expect(savedGames()).toHaveLength(1);
			expect(savedGames()[0].result).toBe(-1); // Black (the player) won
		});
	});

	describe('game-end and offer-response guards', () => {
		it('resigning inside the victory dwell settles the game exactly once', async () => {
			await startAndRollPlayerTurn(KING_ON_E4_FEN);
			store.handleBoardMove('e2', 'e4'); // captures the king → victory scheduled in 800ms
			store.resignGame(); // races the dwell

			await vi.advanceTimersByTimeAsync(1000);

			expect(store.gameStatus).toBe('defeat'); // the resign won; the dwell callback aborted
			expect(savedGames()).toHaveLength(1);
			expect(savedGames()[0].end_reason).toBe('resign');
		});

		it('a stale bot double offer cannot mutate a settled game', () => {
			startStakedGame('white');
			store.gameStatus = 'bot_thinking';
			store.activeDoubleOffer = 'bot';

			store.resignGame();
			expect(store.activeDoubleOffer).toBeNull();

			authMock.adjustBalance.mockClear();
			store.acceptBotDouble();
			expect(store.bet).toBe(10);
			expect(store.cubeOwner).toBeNull();
			expect(authMock.adjustBalance).not.toHaveBeenCalled();
		});

		it('accepting a bot double without funds for the increment declines instead', () => {
			startStakedGame('white');
			store.gameStatus = 'bot_thinking';
			store.activeDoubleOffer = 'bot';
			authMock.user.balance = 5; // below the increment (bet = 10)

			store.acceptBotDouble();

			expect(store.bet).toBe(10); // never doubled
			expect(store.gameStatus).toBe('defeat'); // decline = resign at the current stake
			expect(store.doubleDeclined).toBe(true);
		});
	});

	describe('session hygiene', () => {
		it('restarting mid roll-animation does not leave isAnimatingRoll stuck', async () => {
			store.customDfen = `${START_FEN} PPP`;
			store.startNewGame('white', 'greedy');
			void store.rollDice();
			await vi.advanceTimersByTimeAsync(100); // still animating

			store.startNewGame('white', 'greedy');
			await vi.advanceTimersByTimeAsync(600); // the abandoned animation promise resolves

			expect(store.isAnimatingRoll).toBe(false);
			expect(store.canUserRoll).toBe(true);
		});

		it('settles the stake even when the IndexedDB write fails', async () => {
			startStakedGame('white');
			vi.mocked(saveLocalGame).mockRejectedValueOnce(new Error('db down'));

			(store as unknown as TimeoutInvoker).handleTimeout('b'); // the bot (Black) times out → player wins
			await vi.advanceTimersByTimeAsync(0);

			expect(store.gameStatus).toBe('victory');
			expect(authMock.adjustBalance).toHaveBeenCalledWith(20); // 2 * bet, despite the failed save
		});
	});
});
