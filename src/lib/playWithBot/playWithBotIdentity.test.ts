import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The human seat's external id must stay fixed for the whole game. `authStore.externalId` is
// reactive and CAN change mid-game: the boot `refresh()` resolves asynchronously, so a game begun
// while the session is still `loading` starts as `guest:<uuid>` and would flip to `user:<uuid>` once
// the account arrives. Since every per-turn snapshot writes its own `leftTime` map, re-reading the
// store per snapshot would persist ONE game whose turns are keyed by two different people.
//
// A mutable mock is the point here: the test flips identity between turns, which the real store
// cannot be made to do on demand.
const authMock = vi.hoisted(() => ({
	authStore: { externalId: '', user: null, adjustBalance: () => {} },
}));
vi.mock('../authStore.svelte', () => authMock);

import {
	PlayWithBotStore,
	setDiceChessInstance,
	resetDiceChessInstance,
} from './playWithBotStore.svelte';
import { preferencesStore } from '../preferencesStore.svelte';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const GUEST = 'guest:0192f000-0000-7000-8000-000000000001';
const ACCOUNT = 'user:0192f000-0000-7000-8000-0000000000aa';

/** Same deterministic stand-in the sibling suite uses — legality tracks unused dice, no randomness. */
function createMockDiceChess() {
	return {
		applyMove: vi.fn((dfen: string) => {
			const parts = dfen.trim().split(/\s+/).slice(0, 6);
			parts[4] = String((Number(parts[4]) || 0) + 1);
			return parts.join(' ');
		}),
		getLegalUciMoves: vi.fn((dfen: string) => {
			const diceSuffix = dfen.trim().split(/\s+/)[6] ?? '';
			return diceSuffix.length >= 1 ? ['e2e4'] : [];
		}),
		getBestMove: vi.fn(() => ({ moves: [{ from: 'e7', to: 'e5', promotion: null }] })),
		endTurn: vi.fn((fen: string) => {
			const parts = fen.trim().split(/\s+/);
			parts[1] = parts[1] === 'w' ? 'b' : 'w';
			return parts.join(' ');
		}),
		shouldBotAcceptDraw: vi.fn(() => false),
	};
}

/** Every human id appearing as a `leftTime` key across all persisted turn snapshots. */
function humanIdsInHistory(store: PlayWithBotStore): string[] {
	const ids = new Set<string>();
	for (const state of Object.values(store.historyMap)) {
		for (const key of Object.keys(state.leftTime ?? {})) {
			if (!key.startsWith('bot:')) ids.add(key);
		}
	}
	return [...ids];
}

describe('PlayWithBotStore human identity in timed game records', () => {
	let store: PlayWithBotStore;

	beforeEach(() => {
		vi.useFakeTimers();
		setDiceChessInstance(createMockDiceChess());
		authMock.authStore.externalId = GUEST;
		// The identity only reaches a record through `leftTime`, which is written for timed games only.
		preferencesStore.timeLimit = 5;
		preferencesStore.timeBonus = 0;
		store = new PlayWithBotStore();
	});

	afterEach(() => {
		store.endSession();
		resetDiceChessInstance();
		vi.useRealTimers();
		preferencesStore.timeLimit = null;
		preferencesStore.timeBonus = 0;
	});

	/**
	 * Starts a timed game and plays one move. The move matters: `leftTime` is written by the
	 * move-recording path, not by the roll, so a game that has only rolled has no timer map to key
	 * yet (the initial position at index 0 carries none either).
	 */
	async function startAndPlayOneMove() {
		store.customDfen = `${START_FEN} PPP`;
		store.startNewGame('white', 'greedy');
		const rolled = store.rollDice();
		await vi.advanceTimersByTimeAsync(600);
		await rolled;
		store.handleBoardMove('e2', 'e4'); // 1 of 3 dice — the turn continues, the snapshot is written
	}

	it('keys the timer map by the guest identity for an anonymous game', async () => {
		await startAndPlayOneMove();
		expect(humanIdsInHistory(store)).toEqual([GUEST]);
	});

	it('never writes the old user:guest form the stubbed store used to produce', async () => {
		await startAndPlayOneMove();
		expect(humanIdsInHistory(store)).not.toContain('user:guest');
	});

	it('keeps one identity when the session resolves to an account mid-game', async () => {
		await startAndPlayOneMove();
		expect(humanIdsInHistory(store)).toEqual([GUEST]);

		// The boot refresh lands: the visitor turns out to be signed in, mid-game.
		authMock.authStore.externalId = ACCOUNT;
		store.handleBoardMove('e2', 'e4');

		// One game, one person — later turns must not be attributed to the account while the earlier
		// ones stay with the guest.
		expect(humanIdsInHistory(store)).toEqual([GUEST]);
	});

	it('picks up the account for the NEXT game, not retroactively for the current one', async () => {
		await startAndPlayOneMove();
		authMock.authStore.externalId = ACCOUNT;

		// A fresh game re-snapshots the identity, which is the whole point of fixing it at start.
		await startAndPlayOneMove();
		expect(humanIdsInHistory(store)).toEqual([ACCOUNT]);
	});
});
