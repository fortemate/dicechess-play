import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveGameStore } from './liveGameStore.svelte';
import * as historyApi from './historyApi';
import type { GameHistory } from './historyApi';

/*
 * The evicted-room fallback (#109): play-api removes an ended room together with its socket, so a
 * client that arrives afterwards — a spectator reloading a finished game, a rematch seat that joined
 * after the first-join deadline — never receives `GameEnded`. Without this path it would retry the
 * socket for half a minute and then sit on a board that looks playable, for a game that is decided.
 */
vi.mock('../sound', () => ({
	playDiceSound: vi.fn(),
	playDrawOfferSound: vi.fn(),
	preloadSounds: vi.fn(),
}));
vi.mock('../toastStore.svelte', () => ({
	toastStore: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));
vi.mock('../ingest/guestIdentity', () => ({ getGuestUuid: () => 'fixed-guest-uuid' }));

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

/** A socket that never opens: every instance fails the way a connection to a gone room does. */
class DeadWebSocket {
	static readonly OPEN = 1;
	static opened: DeadWebSocket[] = [];
	onopen: (() => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	readyState = 0;
	constructor(public url: string) {
		DeadWebSocket.opened.push(this);
		// Fail on the next microtask, as a real failing handshake does — never synchronously inside
		// the constructor, where LiveClient has not yet attached its handlers.
		queueMicrotask(() => this.onerror?.());
	}
	send() {}
	close() {}
}

function history(overrides: Partial<GameHistory> = {}): GameHistory {
	return {
		gameId: 'game-1',
		players: {
			white: { kind: 'Human', name: 'ada', rating: null },
			black: { kind: 'Human', name: 'linus', rating: null },
		},
		rated: true,
		timeControl: { Fischer: { initialSeconds: 120, incrementSeconds: 0 } },
		result: -1,
		termination: 'timeout',
		finishedAt: '2026-09-08T19:51:54Z',
		initialDfen: START,
		turns: [
			{ turnNumber: 1, activeColor: 'White', dice: [1, 2, 3], moves: ['e2e4'], fenAfter: AFTER },
		],
		fairness: { commit: 'c0ffee', seed: null, clientSeeds: null },
		...overrides,
	} as GameHistory;
}

describe('LiveGameStore evicted-room fallback', () => {
	let store: LiveGameStore;

	beforeEach(() => {
		vi.useFakeTimers();
		DeadWebSocket.opened = [];
		vi.stubGlobal('WebSocket', DeadWebSocket);
		store = new LiveGameStore();
	});

	afterEach(() => {
		store.dispose();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	/** Lets the first connection attempt fail, which is what triggers the archive read. */
	async function firstAttemptFails() {
		await vi.advanceTimersByTimeAsync(0);
	}

	it('does not ask the archive while the first attempt is still in flight', async () => {
		const fetchHistory = vi.spyOn(historyApi, 'fetchGameHistory').mockResolvedValue(null);
		store.connect('game-1', null, null, true);

		expect(fetchHistory).not.toHaveBeenCalled();
		expect(store.gameStatus).toBe('connecting');
	});

	it('presents the finished game when the room is gone because the game is over', async () => {
		const fetchHistory = vi
			.spyOn(historyApi, 'fetchGameHistory')
			.mockResolvedValue(history({ result: -1, termination: 'timeout' }));

		store.connect('game-1', 'seat-token', 'white');
		await firstAttemptFails();

		expect(fetchHistory).toHaveBeenCalledWith('game-1');
		expect(store.gameStatus).toBe('over');
		expect(store.finishedFromArchive).toBe(true);
		expect(store.winner).toBe('Black');
		expect(store.outcome).toBe('lost'); // this seat is White
		expect(store.termination).toBe('Timeout');
		expect(store.currentBoardFen).toBe(AFTER); // the final position, not the opening one
		expect(store.players?.white.name).toBe('ada');
		expect(store.rated).toBe(true);
		// The end-of-game surfaces gate on this — the rematch panel would sit on "Checking rematch
		// availability…" for ever without it.
		expect(store.authoritativeOver).toEqual({
			result: { Win: { side: 'Black' } },
			termination: 'Timeout',
		});
	});

	it('stops retrying once the archive has answered', async () => {
		vi.spyOn(historyApi, 'fetchGameHistory').mockResolvedValue(history());
		store.connect('game-1', null, null, true);
		await firstAttemptFails();
		const socketsAtEnd = DeadWebSocket.opened.length;

		// Well past LiveClient's whole backoff schedule: a game known to be over must not be retried.
		await vi.advanceTimersByTimeAsync(60_000);
		expect(DeadWebSocket.opened.length).toBe(socketsAtEnd);
	});

	it('tells a spectator who won without claiming an outcome for them', async () => {
		vi.spyOn(historyApi, 'fetchGameHistory').mockResolvedValue(history({ result: 1 }));
		store.connect('game-1', null, null, true);
		await firstAttemptFails();

		expect(store.winner).toBe('White');
		expect(store.outcome).toBeNull(); // a spectator has no side to win or lose
		expect(store.gameStatus).toBe('over');
	});

	it('keeps reconnecting when the archive has no row: the game may simply still be live', async () => {
		vi.spyOn(historyApi, 'fetchGameHistory').mockResolvedValue(null);
		store.connect('game-1', 'seat-token', 'white');
		await firstAttemptFails();

		expect(store.gameStatus).toBe('connecting');
		const before = DeadWebSocket.opened.length;
		await vi.advanceTimersByTimeAsync(5_000);
		expect(DeadWebSocket.opened.length).toBeGreaterThan(before);
	});

	it('says nothing when the archive read itself fails', async () => {
		vi.spyOn(historyApi, 'fetchGameHistory').mockRejectedValue(new Error('network'));
		store.connect('game-1', 'seat-token', 'white');
		await firstAttemptFails();

		expect(store.gameStatus).toBe('connecting');
		expect(store.finishedFromArchive).toBe(false);
	});

	it('asks again on a later drop, so a game that ends while we retry is still picked up', async () => {
		const fetchHistory = vi
			.spyOn(historyApi, 'fetchGameHistory')
			.mockResolvedValueOnce(null)
			.mockResolvedValue(history());

		store.connect('game-1', 'seat-token', 'black');
		await firstAttemptFails();
		expect(store.gameStatus).toBe('connecting');

		await vi.advanceTimersByTimeAsync(1_000); // the next backoff attempt fails too
		expect(fetchHistory.mock.calls.length).toBeGreaterThan(1);
		expect(store.gameStatus).toBe('over');
		expect(store.outcome).toBe('won'); // Black seat, archive says Black won
	});
});
