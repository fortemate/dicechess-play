import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveGameStore } from './liveGameStore.svelte';
import type { ClientCommand, PublicGameState, ServerEvent } from './liveTypes';
import { getPieceFromFen } from '../../utils/fenUtils';
import { playDiceSound, playDrawOfferSound } from '../sound';
import { toastStore } from '../toastStore.svelte';
import { preferencesStore } from '../preferencesStore.svelte';

// The store triggers real audio through the shared sound service; stub it so tests can
// assert WHEN a roll sounds (aligned with its presented spin) without touching Audio.
vi.mock('../sound', () => ({
	playDiceSound: vi.fn(),
	playDrawOfferSound: vi.fn(),
	preloadSounds: vi.fn(),
}));

// Stub the toast surface so tests can assert WHEN a rejection/connection-drop notice fires,
// without pulling in the real store's DOM-free but stateful toast queue.
// Fixed so a URL assertion can name it: the real one mints and persists a uuid in localStorage.
vi.mock('../ingest/guestIdentity', () => ({
	getGuestUuid: () => 'fixed-guest-uuid',
}));

vi.mock('../toastStore.svelte', () => ({
	toastStore: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

// Minimal WebSocket stand-in: the store opens one via LiveClient; we drive events through it.
class MockWebSocket {
	static readonly OPEN = 1;
	static last: MockWebSocket | null = null;
	onopen: (() => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	readyState = MockWebSocket.OPEN;
	/** Every raw frame the store sent, so tests can assert the exact ClientCommand on the wire. */
	sent: string[] = [];
	constructor(public url: string) {
		MockWebSocket.last = this;
	}
	send(data: string) {
		this.sent.push(data);
	}
	close() {
		this.onclose?.();
	}
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const START_FEN_BLACK = START_FEN.replace(' w ', ' b '); // side-to-move must agree with activeSeat
// After Black plays Nb8-c6 and Ng8-f6 from the start position.
const AFTER_BLACK_KNIGHTS = 'r1bqkb1r/pppppppp/2n2n2/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 2 2';
// After White plays Nb1-c3 and Ng1-f3 from the start position.
const AFTER_WHITE_KNIGHTS = 'rnbqkbnr/pppppppp/8/8/8/2N2N2/PPPPPPPP/R1BQKB1R b KQkq - 2 2';

function snapshot(overrides: Partial<PublicGameState> = {}): ServerEvent {
	return {
		Snapshot: {
			v: 0,
			state: {
				version: 0,
				dfen: `${START_FEN} N`,
				activeSeat: 'White',
				dicePending: true,
				status: { Active: {} },
				clocks: null,
				...overrides,
			},
		},
	};
}

describe('LiveGameStore pacing', () => {
	let live: LiveGameStore;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
		MockWebSocket.last = null;
		live = new LiveGameStore();
		live.connect('g', 'tok', 'white');
		MockWebSocket.last!.onopen?.();
	});

	afterEach(() => {
		live.dispose();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	const deliver = (ev: ServerEvent) =>
		MockWebSocket.last!.onmessage?.({ data: JSON.stringify(ev) });

	it("paces the opponent's dice roll with a 600ms spin, blocking interaction meanwhile", async () => {
		deliver(snapshot());
		deliver({
			DiceRolled: {
				v: 1,
				seat: 'Black',
				dice: [2],
				dfen: `${START_FEN.replace(' w ', ' b ')} n`,
				clocks: null,
			},
		});

		expect(live.isAnimatingRoll).toBe(true);
		// The position/dice are already correct underneath the spin (only the CSS animation is
		// pending) — legalMovesDests/handleBoardMove stay blocked regardless, via the independent
		// activeColor !== playerColor check, since it's the opponent's turn either way.
		expect(live.isViewingHistory).toBe(false);
		expect(live.activeColor).toBe('b');

		await vi.advanceTimersByTimeAsync(600);

		expect(live.isAnimatingRoll).toBe(false);
		expect(live.isViewingHistory).toBe(false);
	});

	it("reveals the opponent's multi-move turn one micro-move at a time, pausing on the old position first", async () => {
		deliver(snapshot({ dfen: `${START_FEN_BLACK} nn`, activeSeat: 'Black' }));
		deliver({
			TurnPlayed: { v: 1, seat: 'Black', moves: ['b8c6', 'g8f6'], fenAfter: AFTER_BLACK_KNIGHTS },
		});

		// Nothing revealed yet — still showing the pre-turn position, no move to highlight either.
		expect(getPieceFromFen(live.currentBoardFen, 'b8')).toBe('n');
		expect(live.isViewingHistory).toBe(true);
		expect(live.lastMove).toBeUndefined();

		await vi.advanceTimersByTimeAsync(1000);
		expect(getPieceFromFen(live.currentBoardFen, 'b8')).toBeNull();
		expect(getPieceFromFen(live.currentBoardFen, 'c6')).toBe('n');
		expect(getPieceFromFen(live.currentBoardFen, 'g8')).toBe('n'); // second move not revealed yet
		expect(live.isViewingHistory).toBe(true);
		expect(live.lastMove).toEqual(['b8', 'c6']); // matches the just-revealed micro-move

		await vi.advanceTimersByTimeAsync(1000);
		expect(getPieceFromFen(live.currentBoardFen, 'g8')).toBeNull();
		expect(getPieceFromFen(live.currentBoardFen, 'f6')).toBe('n');
		expect(live.isViewingHistory).toBe(false);
		// Fully caught up: falls through to the live historyMap[maxMoveIndex] entry.
		expect(live.lastMove).toEqual(['g8', 'f6']);
	});

	it('shows the historical move while manually browsing, undefined on the roll entry', async () => {
		deliver(snapshot({ dfen: `${START_FEN_BLACK} nn`, activeSeat: 'Black' }));
		deliver({
			TurnPlayed: { v: 1, seat: 'Black', moves: ['b8c6', 'g8f6'], fenAfter: AFTER_BLACK_KNIGHTS },
		});
		await vi.advanceTimersByTimeAsync(2000); // let the whole turn reveal

		live.setMoveIndex(0); // the seeding roll entry — no move played yet
		expect(live.lastMove).toBeUndefined();

		live.setMoveIndex(1); // b8-c6
		expect(live.lastMove).toEqual(['b8', 'c6']);

		live.setMoveIndex(2); // g8-f6
		expect(live.lastMove).toEqual(['g8', 'f6']);

		live.setMoveIndex(live.maxMoveIndex); // back to live
		expect(live.lastMove).toEqual(['g8', 'f6']);
	});

	it('has no move to highlight on a pass entry', async () => {
		deliver(snapshot({ dfen: `${START_FEN_BLACK} n`, activeSeat: 'Black' }));
		deliver({ TurnPlayed: { v: 1, seat: 'Black', moves: [], fenAfter: START_FEN_BLACK } });

		expect(live.passNoticeSeat).toBe('Black');
		expect(live.lastMove).toBeUndefined();

		await vi.advanceTimersByTimeAsync(1500);
		expect(live.lastMove).toBeUndefined();
	});

	it("paces the player's own dice roll: spin + sound, no moves until it lands", async () => {
		deliver(snapshot()); // index 0: White's first roll, seeded by initHistory (never paced)
		deliver({
			DiceRolled: { v: 1, seat: 'White', dice: [2], dfen: `${START_FEN} N`, clocks: null },
		}); // index 1: White's second roll, through recordRoll -> schedulePresentation

		// The spin presents immediately (values already visible underneath), with its sound…
		expect(live.isAnimatingRoll).toBe(true);
		expect(vi.mocked(playDiceSound)).toHaveBeenCalledTimes(1);
		// …and the board is NOT playable until the spin lands.
		expect(live.legalMovesDests.size).toBe(0);

		await vi.advanceTimersByTimeAsync(600);

		expect(live.isAnimatingRoll).toBe(false);
		expect(live.legalMovesDests.size).toBeGreaterThan(0); // knight die: b1/g1 can move
		expect(live.isViewingHistory).toBe(false);
		expect(live.currentMoveIndex).toBe(1);
	});

	it('aligns the own-roll spin and sound with presentation during catch-up, not event arrival', async () => {
		deliver(snapshot({ dfen: `${START_FEN_BLACK} nn`, activeSeat: 'Black' }));
		deliver({
			TurnPlayed: { v: 1, seat: 'Black', moves: ['b8c6', 'g8f6'], fenAfter: AFTER_BLACK_KNIGHTS },
		});
		deliver({
			DiceRolled: {
				v: 2,
				seat: 'White',
				dice: [2],
				dfen: `${AFTER_BLACK_KNIGHTS} N`,
				clocks: null,
			},
		});

		// The opponent's two knight moves are still revealing — the own roll must wait its turn.
		expect(vi.mocked(playDiceSound)).not.toHaveBeenCalled();
		expect(live.isAnimatingRoll).toBe(false);

		await vi.advanceTimersByTimeAsync(1000); // first knight move lands
		expect(vi.mocked(playDiceSound)).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1000); // second knight move lands -> roll presents
		expect(vi.mocked(playDiceSound)).toHaveBeenCalledTimes(1);
		expect(live.isAnimatingRoll).toBe(true);
		expect(live.legalMovesDests.size).toBe(0);

		await vi.advanceTimersByTimeAsync(600);
		expect(live.isAnimatingRoll).toBe(false);
		expect(live.legalMovesDests.size).toBeGreaterThan(0);
	});

	it("does not pace the player's own confirmed multi-move turn", () => {
		deliver(snapshot({ dfen: `${START_FEN} NN` }));
		deliver({
			TurnPlayed: { v: 1, seat: 'White', moves: ['b1c3', 'g1f3'], fenAfter: AFTER_WHITE_KNIGHTS },
		});

		expect(live.isViewingHistory).toBe(false);
		expect(live.currentMoveIndex).toBe(2);
		expect(getPieceFromFen(live.currentBoardFen, 'c3')).toBe('N');
		expect(getPieceFromFen(live.currentBoardFen, 'f3')).toBe('N');
	});

	it("dwells on the player's own pass with the notice up, dice still shown", async () => {
		deliver(snapshot());
		deliver({ TurnPlayed: { v: 1, seat: 'White', moves: [], fenAfter: START_FEN } });

		// The pass dwells: notice up, catch-up not finished, the passed roll's dice visible.
		expect(live.passNoticeSeat).toBe('White');
		expect(live.isViewingHistory).toBe(true);
		expect(live.currentDice.length).toBeGreaterThan(0);

		await vi.advanceTimersByTimeAsync(1500);

		expect(live.passNoticeSeat).toBeNull();
		expect(live.isViewingHistory).toBe(false);
		expect(live.currentMoveIndex).toBe(1);
	});

	it("dwells on the opponent's pass with the notice up", async () => {
		deliver(snapshot({ dfen: `${START_FEN_BLACK} n`, activeSeat: 'Black' }));
		deliver({ TurnPlayed: { v: 1, seat: 'Black', moves: [], fenAfter: START_FEN_BLACK } });

		expect(live.passNoticeSeat).toBe('Black');

		await vi.advanceTimersByTimeAsync(1500);

		expect(live.passNoticeSeat).toBeNull();
		expect(live.isViewingHistory).toBe(false);
	});

	it('paces both sides for a spectator, including a pass', async () => {
		live.dispose();
		live = new LiveGameStore();
		live.connect('g', 'tok', null); // spectator: no seat is "already seen live"
		MockWebSocket.last!.onopen?.();

		deliver(snapshot());
		deliver({ TurnPlayed: { v: 1, seat: 'White', moves: [], fenAfter: START_FEN } });

		expect(live.isViewingHistory).toBe(true);
		expect(live.passNoticeSeat).toBe('White');
		await vi.advanceTimersByTimeAsync(1500);
		expect(live.isViewingHistory).toBe(false);
		expect(live.passNoticeSeat).toBeNull();
	});

	it('lets a mid-flight roll reveal finish, then announces after the suspense beat', async () => {
		deliver(snapshot());
		deliver({
			DiceRolled: {
				v: 1,
				seat: 'Black',
				dice: [2],
				dfen: `${START_FEN.replace(' w ', ' b ')} n`,
				clocks: null,
			},
		});
		expect(live.isAnimatingRoll).toBe(true);

		deliver({
			GameEnded: { v: 2, over: { result: { Win: { side: 'White' } }, termination: 'Resign' } },
		});
		// The spin is not cut off and the result is not announced yet.
		expect(live.isAnimatingRoll).toBe(true);
		expect(live.gameStatus).not.toBe('over');

		await vi.advanceTimersByTimeAsync(600); // spin lands
		expect(live.isAnimatingRoll).toBe(false);
		expect(live.gameStatus).not.toBe('over'); // suspense beat still running

		await vi.advanceTimersByTimeAsync(800);
		expect(live.gameStatus).toBe('over');
		expect(live.outcome).toBe('won');
	});

	it('lets a pass dwell finish before announcing the result', async () => {
		deliver(snapshot());
		deliver({ TurnPlayed: { v: 1, seat: 'White', moves: [], fenAfter: START_FEN } });
		expect(live.passNoticeSeat).toBe('White');

		deliver({
			GameEnded: { v: 2, over: { result: { Win: { side: 'Black' } }, termination: 'Timeout' } },
		});
		expect(live.passNoticeSeat).toBe('White'); // dwell not cut off
		expect(live.gameStatus).not.toBe('over');

		await vi.advanceTimersByTimeAsync(1500); // dwell completes
		expect(live.passNoticeSeat).toBeNull();
		expect(live.gameStatus).not.toBe('over');

		await vi.advanceTimersByTimeAsync(800); // suspense
		expect(live.gameStatus).toBe('over');
		expect(live.outcome).toBe('lost');
	});

	it('lets the winning move land on the board before the result', async () => {
		deliver(snapshot({ dfen: `${START_FEN_BLACK} nn`, activeSeat: 'Black' }));
		deliver({
			TurnPlayed: { v: 1, seat: 'Black', moves: ['b8c6', 'g8f6'], fenAfter: AFTER_BLACK_KNIGHTS },
		});
		deliver({
			GameEnded: {
				v: 2,
				over: { result: { Win: { side: 'Black' } }, termination: 'KingCaptured' },
			},
		});

		await vi.advanceTimersByTimeAsync(1000); // first move reveals
		expect(live.gameStatus).not.toBe('over');
		await vi.advanceTimersByTimeAsync(1000); // final move lands
		expect(getPieceFromFen(live.currentBoardFen, 'f6')).toBe('n');
		expect(live.gameStatus).not.toBe('over');

		await vi.advanceTimersByTimeAsync(800); // suspense
		expect(live.gameStatus).toBe('over');
		expect(live.outcome).toBe('lost');
	});

	it('holds a suspense beat before announcing when already caught up', async () => {
		deliver(snapshot());
		deliver({
			GameEnded: { v: 1, over: { result: { Win: { side: 'White' } }, termination: 'Resign' } },
		});
		expect(live.gameStatus).not.toBe('over');

		await vi.advanceTimersByTimeAsync(800);
		expect(live.gameStatus).toBe('over');
		expect(live.termination).toBe('Resign');
	});

	it('announces immediately when joining an already-finished game', () => {
		deliver({
			Snapshot: {
				v: 5,
				state: {
					version: 5,
					dfen: `${START_FEN} N`,
					activeSeat: 'White',
					dicePending: false,
					status: {
						Ended: { over: { result: { Win: { side: 'White' } }, termination: 'Resign' } },
					},
					clocks: null,
				},
			},
		});

		expect(live.gameStatus).toBe('over'); // no timers involved
		expect(live.outcome).toBe('won');
	});

	it('a dispose during the suspense beat cancels the announcement', async () => {
		deliver(snapshot());
		deliver({
			GameEnded: { v: 1, over: { result: { Win: { side: 'White' } }, termination: 'Resign' } },
		});

		live.dispose(); // user leaves before the beat elapses

		await vi.advanceTimersByTimeAsync(5000);
		expect(live.gameStatus).not.toBe('over');
	});

	it('dispose() halts an in-flight presentation — no sounds after leaving the page', async () => {
		deliver(snapshot({ dfen: `${START_FEN_BLACK} nn`, activeSeat: 'Black' }));
		deliver({
			TurnPlayed: { v: 1, seat: 'Black', moves: ['b8c6', 'g8f6'], fenAfter: AFTER_BLACK_KNIGHTS },
		});
		deliver({
			DiceRolled: {
				v: 2,
				seat: 'White',
				dice: [2],
				dfen: `${AFTER_BLACK_KNIGHTS} N`,
				clocks: null,
			},
		}); // roll queued behind the opponent reveal — would spin+sound when reached

		live.dispose(); // user navigates away mid-reveal

		await vi.advanceTimersByTimeAsync(10_000);
		expect(vi.mocked(playDiceSound)).not.toHaveBeenCalled(); // the queued roll never presents
		expect(live.isAnimatingRoll).toBe(false);
	});

	it('cleanly invalidates an in-flight catch-up when the store reconnects to a different game', async () => {
		deliver(snapshot({ dfen: `${START_FEN_BLACK} nn`, activeSeat: 'Black' }));
		deliver({
			TurnPlayed: { v: 1, seat: 'Black', moves: ['b8c6', 'g8f6'], fenAfter: AFTER_BLACK_KNIGHTS },
		});
		expect(live.isViewingHistory).toBe(true); // mid catch-up, first move not yet revealed

		// Reconnect to a different game before the pump finishes.
		live.connect('g2', 'tok2', 'white');
		MockWebSocket.last!.onopen?.();

		expect(live.isViewingHistory).toBe(false);
		expect(Object.keys(live.historyMap)).toEqual([]);

		// The orphaned loop's timer still fires — must be harmless (no throw, no stray mutation).
		await vi.advanceTimersByTimeAsync(1000);
		expect(live.isViewingHistory).toBe(false);
	});

	it('pauses clocks while a roll or opponent moves are being presented', async () => {
		deliver(snapshot());
		deliver({
			DiceRolled: {
				v: 1,
				seat: 'Black',
				dice: [2],
				dfen: `${START_FEN.replace(' w ', ' b ')} n`,
				clocks: { white: 60_000, black: 60_000 },
			},
		});
		expect(live.isAnimatingRoll).toBe(true);
		expect(live.tickingClockSeat).toBeNull(); // clock paused during roll spin animation

		await vi.advanceTimersByTimeAsync(300); // mid-animation
		expect(live.isAnimatingRoll).toBe(true);
		expect(live.blackClockMs).toBe(60_000); // clock pinned/frozen during spin

		await vi.advanceTimersByTimeAsync(300); // spin completes (600ms total)
		expect(live.isAnimatingRoll).toBe(false);
		expect(live.tickingClockSeat).toBe('Black'); // clock starts ticking after presentation completes

		await vi.advanceTimersByTimeAsync(1000);
		expect(live.blackClockMs).toBeLessThanOrEqual(59_000);
	});

	it('keeps human player clock paused during opponent multi-move turn reveal and roll spin', async () => {
		deliver(snapshot({ dfen: `${START_FEN_BLACK} nn`, activeSeat: 'Black' }));
		deliver({
			TurnPlayed: { v: 1, seat: 'Black', moves: ['b8c6', 'g8f6'], fenAfter: AFTER_BLACK_KNIGHTS },
		});
		deliver({
			DiceRolled: {
				v: 2,
				seat: 'White',
				dice: [2],
				dfen: `${AFTER_BLACK_KNIGHTS} N`,
				clocks: { white: 60_000, black: 60_000 },
			},
		});

		// 2 moves + 1 roll = ~2600ms of presentation animation
		expect(live.isViewingHistory).toBe(true);
		expect(live.tickingClockSeat).toBeNull();
		expect(live.whiteClockMs).toBe(60_000);

		// First knight move reveals (1000ms)
		await vi.advanceTimersByTimeAsync(1000);
		expect(live.tickingClockSeat).toBeNull();
		expect(live.whiteClockMs).toBe(60_000);

		// Second knight move reveals (1000ms)
		await vi.advanceTimersByTimeAsync(1000);
		expect(live.isAnimatingRoll).toBe(true);
		expect(live.tickingClockSeat).toBeNull();
		expect(live.whiteClockMs).toBe(60_000);

		// Roll spin completes (600ms)
		await vi.advanceTimersByTimeAsync(600);
		expect(live.isAnimatingRoll).toBe(false);
		expect(live.isViewingHistory).toBe(false);
		expect(live.tickingClockSeat).toBe('White');

		// Now White's clock ticks down
		await vi.advanceTimersByTimeAsync(1000);
		expect(live.whiteClockMs).toBeLessThanOrEqual(59_000);
	});

	it('keeps isManuallyBrowsing false during ordinary catch-up, true only after a deliberate scrub', async () => {
		deliver(snapshot({ dfen: `${START_FEN_BLACK} nn`, activeSeat: 'Black' }));
		deliver({
			TurnPlayed: { v: 1, seat: 'Black', moves: ['b8c6', 'g8f6'], fenAfter: AFTER_BLACK_KNIGHTS },
		});

		expect(live.isViewingHistory).toBe(true);
		expect(live.isManuallyBrowsing).toBe(false);

		live.setMoveIndex(0);
		expect(live.isViewingHistory).toBe(true);
		expect(live.isManuallyBrowsing).toBe(true);
	});

	it('starts a fresh pump for a new event delivered synchronously right after a zero-delay one completes', () => {
		deliver(snapshot()); // index 0 via initHistory
		// White's own second roll: alreadySeenLive, so its pump resolves with zero awaits — this used
		// to leave pumpingEpoch cleared only on a later microtask (via a caller-side .finally()), which
		// could race a same-tick delivery below. Both delivers happen with no await between them.
		deliver({
			DiceRolled: { v: 1, seat: 'White', dice: [2], dfen: `${START_FEN} N`, clocks: null },
		});
		// Immediately, same tick: the opponent's roll arrives and needs a real pump.
		deliver({
			DiceRolled: {
				v: 2,
				seat: 'Black',
				dice: [2],
				dfen: `${START_FEN.replace(' w ', ' b ')} n`,
				clocks: null,
			},
		});

		// The second pump must have actually started, not been silently dropped by a stale pumpingEpoch.
		expect(live.isAnimatingRoll).toBe(true);
	});
});

describe('LiveGameStore snapshot history replay (#132)', () => {
	let live: LiveGameStore;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
		MockWebSocket.last = null;
		live = new LiveGameStore();
	});

	afterEach(() => {
		live.dispose();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	const deliver = (ev: ServerEvent) =>
		MockWebSocket.last!.onmessage?.({ data: JSON.stringify(ev) });

	it('reconstructs a turn played before the client joined, presented already caught up (no animation)', () => {
		live.connect('g', 'tok', null); // spectator joining mid-game
		MockWebSocket.last!.onopen?.();

		deliver({
			Snapshot: {
				v: 2,
				state: {
					version: 2,
					dfen: `${AFTER_WHITE_KNIGHTS} n`,
					activeSeat: 'Black',
					dicePending: true,
					status: { Active: {} },
					clocks: null,
				},
				history: [
					{ seat: 'White', dice: [3, 6], moves: ['b1c3', 'g1f3'], fenAfter: AFTER_WHITE_KNIGHTS },
				],
			},
		});

		// No backlog to animate: a join presents fully caught up immediately.
		expect(live.isViewingHistory).toBe(false);
		expect(live.currentMoveIndex).toBe(3); // White's roll + 2 moves, then Black's current roll
		expect(getPieceFromFen(live.currentBoardFen, 'c3')).toBe('N');
		expect(getPieceFromFen(live.currentBoardFen, 'f3')).toBe('N');
		// The replayed roll's raw dice values [3, 6] must decode to White's piece letters (B, K),
		// not the bare numbers — the dice panel renders `value` as a piece image.
		expect(live.historyMap['0']?.dices.map((d) => d.value)).toEqual(['B', 'K']);

		// The replayed turn is fully scrubbable, back to the opening position.
		live.setMoveIndex(0);
		expect(live.currentBoardFen).toBe(START_FEN);
		live.setMoveIndex(1);
		expect(getPieceFromFen(live.currentBoardFen, 'c3')).toBe('N');
		expect(getPieceFromFen(live.currentBoardFen, 'f3')).toBeNull();
		live.setMoveIndex(2);
		expect(getPieceFromFen(live.currentBoardFen, 'f3')).toBe('N');
	});

	it('reconstructs a forced pass played before the client joined', () => {
		live.connect('g', 'tok', null);
		MockWebSocket.last!.onopen?.();

		deliver({
			Snapshot: {
				v: 2,
				state: {
					version: 2,
					dfen: `${START_FEN_BLACK} n`,
					activeSeat: 'Black',
					dicePending: true,
					status: { Active: {} },
					clocks: null,
				},
				history: [{ seat: 'White', dice: [1], moves: [], fenAfter: START_FEN }],
			},
		});

		expect(live.isViewingHistory).toBe(false);
		expect(live.historyMap['1']?.gameMoveHistoryMove).toEqual({ from: '', to: '', promotion: '' });
	});

	it('joining right at the start of a game (no history) behaves exactly as before', () => {
		live.connect('g', 'tok', 'white');
		MockWebSocket.last!.onopen?.();

		deliver(snapshot());

		expect(live.isViewingHistory).toBe(false);
		expect(live.currentMoveIndex).toBe(0);
		expect(live.currentBoardFen).toBe(START_FEN);
	});

	it('a reconnect resync (a second Snapshot on the same store) does not duplicate history', () => {
		live.connect('g', 'tok', null);
		MockWebSocket.last!.onopen?.();

		const resync: ServerEvent = {
			Snapshot: {
				v: 2,
				state: {
					version: 2,
					dfen: `${AFTER_WHITE_KNIGHTS} n`,
					activeSeat: 'Black',
					dicePending: true,
					status: { Active: {} },
					clocks: null,
				},
				history: [
					{ seat: 'White', dice: [3, 6], moves: ['b1c3', 'g1f3'], fenAfter: AFTER_WHITE_KNIGHTS },
				],
			},
		};

		deliver(resync);
		expect(live.currentMoveIndex).toBe(3);

		// LiveClient reattaches a dropped connection transparently (no reset() in between) and the
		// server always resends the full history on the resync Snapshot — replaying it must rebuild
		// historyMap, not append onto what's already there.
		deliver(resync);
		expect(live.currentMoveIndex).toBe(3);
		expect(getPieceFromFen(live.currentBoardFen, 'c3')).toBe('N');
		expect(getPieceFromFen(live.currentBoardFen, 'f3')).toBe('N');
	});

	it('joining an already-finished game still reconstructs its move history', () => {
		live.connect('g', 'tok', null);
		MockWebSocket.last!.onopen?.();

		deliver({
			Snapshot: {
				v: 3,
				state: {
					version: 3,
					dfen: AFTER_WHITE_KNIGHTS,
					activeSeat: 'Black',
					dicePending: false,
					status: {
						Ended: { over: { result: { Win: { side: 'White' } }, termination: 'Resign' } },
					},
					clocks: null,
				},
				history: [
					{ seat: 'White', dice: [3, 6], moves: ['b1c3', 'g1f3'], fenAfter: AFTER_WHITE_KNIGHTS },
				],
			},
		});

		expect(live.gameStatus).toBe('over');
		expect(live.currentMoveIndex).toBe(2);
		live.setMoveIndex(0);
		expect(live.currentBoardFen).toBe(START_FEN);
	});
});

describe('LiveGameStore connection feedback (issue #76)', () => {
	let live: LiveGameStore;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
		MockWebSocket.last = null;
		live = new LiveGameStore();
		live.connect('g', 'tok', 'white');
		MockWebSocket.last!.onopen?.();
	});

	afterEach(() => {
		live.dispose();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	const deliver = (ev: ServerEvent) =>
		MockWebSocket.last!.onmessage?.({ data: JSON.stringify(ev) });

	it('updates lastMove immediately when applying an optimistic board move', async () => {
		deliver(snapshot());
		deliver({
			DiceRolled: { v: 1, seat: 'White', dice: [2], dfen: `${START_FEN} N`, clocks: null },
		});
		await vi.advanceTimersByTimeAsync(600); // let spin land

		expect(live.lastMove).toBeUndefined();

		live.handleBoardMove('b1', 'c3');

		// pendingMoves should drive lastMove immediately, before the server confirms
		expect(live.lastMove).toEqual(['b1', 'c3']);

		// And when the server confirms, it stays correct
		deliver({
			TurnPlayed: {
				v: 2,
				seat: 'White',
				moves: ['b1c3'],
				fenAfter: 'rnbqkbnr/pppppppp/8/8/8/2N5/PPPPPPPP/R1BQKBNR b KQkq - 1 1',
			},
		});
		expect(live.lastMove).toEqual(['b1', 'c3']);
	});

	// Issue #177, from a real game: the white pawn on c7 can capture the black king on d8. The
	// destination is the last rank, but a king capture ends the game, so the engine emits a plain
	// capture and no promotion variants exist — `c7d8q` is absent from the server's legal-turn
	// index and would cost the whole turn. `applyMove` ignores a stray suffix, so only the wire
	// payload can catch this.
	const KING_ON_LAST_RANK_FEN = 'Qn1k3r/1pPB1pp1/3p1n2/4p1Np/4P3/BRN5/P1PP1PPP/4K2R w - - 0 1';

	const rollKingCapturePosition = async (diceField: string, dice: number[]) => {
		const dfen = `${KING_ON_LAST_RANK_FEN} ${diceField}`;
		deliver(snapshot({ dfen }));
		deliver({ DiceRolled: { v: 1, seat: 'White', dice, dfen, clocks: null } });
		await vi.advanceTimersByTimeAsync(600); // let the own-roll spin land
	};

	const submittedTurns = (): string[][] =>
		MockWebSocket.last!.sent.flatMap((raw) => {
			const command = JSON.parse(raw) as ClientCommand;
			return 'SubmitTurn' in command ? [command.SubmitTurn.moves] : [];
		});

	it('submits a pawn capturing the king on the last rank without a promotion suffix', async () => {
		await rollKingCapturePosition('PBK', [1, 3, 6]);

		live.handleBoardMove('c7', 'd8');

		expect(live.pendingPromotion).toBeNull(); // no picker: this is a capture, not a promotion
		// Submitted straight away despite the two unused dice — the captured king ends the game.
		expect(submittedTurns()).toEqual([['c7d8']]);
	});

	it('still opens the promotion picker for a pawn reaching the last rank without a king there', async () => {
		await rollKingCapturePosition('P', [1]);

		live.handleBoardMove('c7', 'c8'); // empty square on the last rank — a real promotion

		expect(live.pendingPromotion?.availablePieces).toEqual(['q', 'r', 'b', 'n']);
		expect(submittedTurns()).toEqual([]); // nothing goes out until a piece is picked

		live.completePromotion('r');

		expect(submittedTurns()).toEqual([['c7c8r']]);
	});

	it('refuses other moves while a promotion waits for its piece, then takes them once chosen', async () => {
		await rollKingCapturePosition('PB', [1, 3]);

		live.handleBoardMove('c7', 'c8');
		expect(live.pendingPromotion).not.toBeNull();

		// The bishop's die is free, but the turn cannot continue around the unfinished pawn move: it
		// would go out one move short and be rejected (the showcase table lost a game this way while
		// it had no promotion chooser).
		live.handleBoardMove('d7', 'e8');
		expect(live.currentDice.filter((d) => d.used)).toHaveLength(1); // only the pawn's die
		expect(submittedTurns()).toEqual([]);

		live.completePromotion('q');
		live.handleBoardMove('d7', 'e8');
		expect(submittedTurns()).toEqual([['c7c8q', 'd7e8']]);
	});

	it('updates hasClocks correctly when initialized with clocks from a snapshot', () => {
		expect(live.hasClocks).toBe(false);
		deliver(snapshot({ clocks: { white: 60000, black: 60000 } }));
		expect(live.hasClocks).toBe(true);
		expect(live.whiteClockMs).toBe(60000);
	});

	it("toasts and reverts when the local player's move is rejected", () => {
		deliver(snapshot());
		deliver({
			DiceRolled: { v: 1, seat: 'White', dice: [2], dfen: `${START_FEN} N`, clocks: null },
		});
		const confirmedFenBefore = live.currentBoardFen;

		deliver({ Rejected: { v: 2, seat: 'White', reason: 'IllegalMove' } });

		expect(vi.mocked(toastStore.error)).toHaveBeenCalledTimes(1);
		expect(live.currentBoardFen).toBe(confirmedFenBefore); // rolled back, not left diverged
	});

	it("does not toast when a REJECTION is for the opponent's seat", () => {
		deliver(snapshot());
		deliver({ Rejected: { v: 1, seat: 'Black', reason: 'IllegalMove' } });

		expect(vi.mocked(toastStore.error)).not.toHaveBeenCalled();
	});

	it('toasts and drops a board-move attempt made while reconnecting', async () => {
		deliver(snapshot());
		deliver({
			DiceRolled: { v: 1, seat: 'White', dice: [2], dfen: `${START_FEN} N`, clocks: null },
		});
		await vi.advanceTimersByTimeAsync(600); // let the own-roll spin land — see issue #70
		const fenBefore = live.currentBoardFen;

		MockWebSocket.last!.onclose?.(); // unexpected drop -> connection goes to 'connecting'
		expect(live.connection).toBe('connecting');

		live.handleBoardMove('b1', 'c3'); // a legal knight move, were the connection open

		expect(vi.mocked(toastStore.error)).toHaveBeenCalledWith(
			'Reconnecting… your move will go through once back online.',
		);
		expect(live.currentBoardFen).toBe(fenBefore); // no optimistic move applied
	});

	it('toasts a distinct reload message once reconnect attempts are exhausted', async () => {
		deliver(snapshot());
		deliver({
			DiceRolled: { v: 1, seat: 'White', dice: [2], dfen: `${START_FEN} N`, clocks: null },
		});
		await vi.advanceTimersByTimeAsync(600);

		// LiveClient.handleDrop gives up after MAX_ATTEMPTS (10): the 11th drop finds attempts
		// already at 10 and flips to 'closed' instead of scheduling another retry. Each drop's
		// teardownSocket() nulls the CURRENT mock's onclose (so it can't double-fire), and the
		// scheduled reconnect only constructs a fresh MockWebSocket once its backoff timer fires
		// — so each iteration must advance past that backoff before the next onclose can land.
		for (let i = 0; i < 11 && live.connection !== 'closed'; i++) {
			MockWebSocket.last!.onclose?.();
			await vi.advanceTimersByTimeAsync(6000); // past the longest backoff step + jitter
		}
		expect(live.connection).toBe('closed');

		live.handleBoardMove('b1', 'c3');

		// Distinct from the still-retrying 'connecting' message: nothing will bring this move
		// through without a manual reload (see issue #76 review — Gemini caught the ambiguity).
		expect(vi.mocked(toastStore.error)).toHaveBeenCalledWith(
			'Disconnected — reload the page to reconnect.',
		);
	});
});

/** play-api #285: the seat-claim only works if `connect` actually puts our guest id on the socket URL. The `wsUrl`
 * unit tests pin the URL shape; these pin the WIRING, which is the half that silently regresses — a caller that stops
 * passing the id leaves those tests perfectly green while friend games go back to being recorded as self-play.
 */
describe('LiveGameStore connect', () => {
	let live: LiveGameStore;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
		MockWebSocket.last = null;
		live = new LiveGameStore();
	});

	afterEach(() => {
		live.dispose();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('sends our guest id alongside a seat token, so the seat can be attributed to us', () => {
		live.connect('g1', 'tok', 'white');
		expect(MockWebSocket.last!.url).toContain('token=tok');
		expect(MockWebSocket.last!.url).toContain('guest=fixed-guest-uuid');
	});

	it('claims nothing when spectating — no token, so no identity to attach', () => {
		live.connect('g1', null, null);
		expect(MockWebSocket.last!.url).not.toContain('guest=');
		expect(MockWebSocket.last!.url).not.toContain('token=');
	});
});

describe('LiveGameStore rated flag (play-api #290)', () => {
	let live: LiveGameStore;

	beforeEach(() => {
		vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
		MockWebSocket.last = null;
		live = new LiveGameStore();
		live.connect('g', 'tok', 'white');
		MockWebSocket.last!.onopen?.();
	});

	afterEach(() => {
		live.dispose();
		vi.unstubAllGlobals();
	});

	const deliver = (ev: ServerEvent) =>
		MockWebSocket.last!.onmessage?.({ data: JSON.stringify(ev) });

	it('is undefined until a Snapshot says otherwise — never assumed false/casual', () => {
		expect(live.rated).toBeUndefined();
	});

	it('adopts an explicit true from the snapshot', () => {
		deliver(snapshot({ rated: true }));
		expect(live.rated).toBe(true);
	});

	it('stays undefined ("server does not say") on a pre-#290 snapshot without the field', () => {
		deliver(snapshot());
		expect(live.rated).toBeUndefined();
	});

	it('resets to undefined when the store is reused for a new game', () => {
		deliver(snapshot({ rated: true }));
		expect(live.rated).toBe(true);
		live.connect('g2', 'tok2', 'white');
		expect(live.rated).toBeUndefined();
	});
});

describe('LiveGameStore draw offers (play-api #327, this repo #253)', () => {
	let live: LiveGameStore;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
		MockWebSocket.last = null;
		vi.clearAllMocks();
		live = new LiveGameStore();
		live.connect('g', 'tok', 'white');
		MockWebSocket.last!.onopen?.();
	});

	afterEach(() => {
		live.dispose();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	const deliver = (ev: ServerEvent) =>
		MockWebSocket.last!.onmessage?.({ data: JSON.stringify(ev) });

	const lastSent = () => JSON.parse(MockWebSocket.last!.sent[MockWebSocket.last!.sent.length - 1]);

	it('arms and disarms through the server, in any phase', () => {
		// Black is on move: the whole point of a standing flag is that it can be set while waiting, which
		// is the only way an offer can ride on a forced pass.
		deliver(
			snapshot({
				dfen: `${START_FEN_BLACK} n`,
				dicePending: true,
				activeSeat: 'Black',
				mayOfferDrawBy: { white: true, black: true },
			}),
		);
		expect(live.canArmDrawOffer).toBe(true);
		expect(live.drawOfferControlState).toBe('idle');

		live.toggleArmDrawOffer();
		expect(lastSent()).toEqual({ ArmDrawOffer: { armed: true } });
		expect(live.drawOfferControlState).toBe('armed');

		live.toggleArmDrawOffer();
		expect(lastSent()).toEqual({ ArmDrawOffer: { armed: false } });
		expect(live.drawOfferControlState).toBe('idle');
	});

	it('lets the private frame overrule the optimistic flag, and keeps the refusal reason', () => {
		deliver(snapshot({ mayOfferDrawBy: { white: true, black: true } }));
		live.setArmDrawOffer(true);
		expect(live.isDrawOfferArmed).toBe(true);

		// The server refuses: the control snaps back and can say why rather than sit mutely disabled.
		deliver({ DrawOfferArmed: { armed: false, reason: 'opponent must offer next' } });
		expect(live.isDrawOfferArmed).toBe(false);
		expect(live.drawArmRefusal).toEqual({
			reason: 'opponent must offer next',
			availableAfterTurns: null,
		});

		// A deployment that lets the right return quotes a number of turns with it.
		deliver({
			DrawOfferArmed: { armed: false, reason: 'draw offer cooldown', availableAfterTurns: 7 },
		});
		expect(live.drawArmRefusal?.availableAfterTurns).toBe(7);

		// And a plain confirmation clears it.
		deliver({ DrawOfferArmed: { armed: true, reason: null, availableAfterTurns: null } });
		expect(live.isDrawOfferArmed).toBe(true);
		expect(live.drawArmRefusal).toBeNull();
	});

	it('re-states the armed intent on every socket open, because the flag is transient server state', () => {
		deliver(snapshot({ mayOfferDrawBy: { white: true, black: true } }));
		live.setArmDrawOffer(true);

		const before = MockWebSocket.last!.sent.length;
		MockWebSocket.last!.onopen?.(); // a reconnect re-opens the same mock socket
		expect(MockWebSocket.last!.sent.slice(before)).toContain(
			JSON.stringify({ ArmDrawOffer: { armed: true } }),
		);
	});

	it('does not re-state anything when the flag is not armed', () => {
		deliver(snapshot({ mayOfferDrawBy: { white: true, black: true } }));

		const before = MockWebSocket.last!.sent.length;
		MockWebSocket.last!.onopen?.();
		expect(
			MockWebSocket.last!.sent.slice(before).filter((m) => m.includes('ArmDrawOffer')),
		).toHaveLength(0);
	});

	it('reads the right to offer from this seat, not from the side to move', () => {
		deliver(
			snapshot({
				dfen: `${START_FEN} N`,
				dicePending: true,
				activeSeat: 'White',
				mayOfferDrawBy: { white: false, black: true },
			}),
		);
		expect(live.canArmDrawOffer).toBe(false);
		expect(live.drawOfferControlState).toBe('forbidden');

		live.toggleArmDrawOffer();
		expect(live.isDrawOfferArmed).toBe(false);
		expect(MockWebSocket.last!.sent.filter((m) => m.includes('ArmDrawOffer'))).toHaveLength(0);
	});

	it("shows the control as pending while this seat's own offer is out", () => {
		deliver(snapshot({ activeSeat: 'White', mayOfferDrawBy: { white: true, black: true } }));
		deliver({ DrawOffered: { v: 1, by: 'White' } });

		expect(live.isMyDrawOfferPending).toBe(true);
		expect(live.drawOfferControlState).toBe('pending');
	});

	it('answers an incoming offer at once when the viewer asked never to be interrupted', () => {
		preferencesStore.setDrawOfferPolicy('autoDecline');
		try {
			deliver(snapshot({ activeSeat: 'White', dicePending: false }));
			deliver({ DrawOffered: { v: 1, by: 'Black' } });

			expect(lastSent()).toEqual({ RespondDraw: { accept: false } });
			expect(toastStore.info).toHaveBeenCalled();
		} finally {
			preferencesStore.setDrawOfferPolicy('ask');
		}
	});

	it('answers a pending offer found in a reconnect snapshot too', () => {
		preferencesStore.setDrawOfferPolicy('autoDecline');
		try {
			deliver(
				snapshot({
					activeSeat: 'White',
					dicePending: false,
					drawOffer: { pending: true },
				}),
			);

			expect(lastSent()).toEqual({ RespondDraw: { accept: false } });
		} finally {
			preferencesStore.setDrawOfferPolicy('ask');
		}
	});

	it('leaves the gate open under the default preference', () => {
		deliver(snapshot({ activeSeat: 'White', dicePending: false }));
		deliver({ DrawOffered: { v: 1, by: 'Black' } });

		expect(live.isPreRollResponder).toBe(true);
		expect(MockWebSocket.last!.sent.filter((m) => m.includes('RespondDraw'))).toHaveLength(0);
	});

	it('hides the control while this seat is the one being asked', () => {
		deliver(
			snapshot({
				activeSeat: 'White',
				dicePending: false,
				mayOfferDrawBy: { white: true, black: true },
			}),
		);
		deliver({ DrawOffered: { v: 1, by: 'Black' } });

		expect(live.isPreRollResponder).toBe(true);
		expect(live.drawOfferControlState).toBe('hidden');
	});

	it('disallows arming when spectating', () => {
		const specLive = new LiveGameStore();
		specLive.connect('g', null, null);
		MockWebSocket.last!.onopen?.();
		MockWebSocket.last!.onmessage?.({
			data: JSON.stringify(
				snapshot({ dfen: `${START_FEN} N`, dicePending: true, activeSeat: 'White' }),
			),
		});
		expect(specLive.canArmDrawOffer).toBe(false);
		specLive.dispose();
	});

	it('sends offerDraw: true with SubmitTurn when armed and clears the armed flag', () => {
		// White's turn with a knight die: play Nb1-c3
		deliver(snapshot({ dfen: `${START_FEN} N`, dicePending: true, activeSeat: 'White' }));
		live.setArmDrawOffer(true);
		expect(live.isDrawOfferArmed).toBe(true);

		live.handleBoardMove('b1', 'c3');

		const sent = MockWebSocket.last!.sent;
		const lastMsg = JSON.parse(sent[sent.length - 1]);
		expect(lastMsg).toEqual({
			SubmitTurn: {
				moves: ['b1c3'],
				offerDraw: true,
			},
		});
		expect(live.isDrawOfferArmed).toBe(false);
	});

	it('activates pre-roll gate and plays sound when opponent offers a draw', () => {
		deliver(snapshot({ activeSeat: 'White', dicePending: false }));
		expect(live.isPreRollGateActive).toBe(false);

		deliver({
			DrawOffered: {
				v: 1,
				by: 'Black',
			},
		});

		expect(live.isDrawOfferPending).toBe(true);
		expect(live.isPreRollGateActive).toBe(true);
		expect(live.isPreRollResponder).toBe(true);
		expect(live.drawOfferedBy).toBe('Black');
		expect(playDrawOfferSound).toHaveBeenCalledOnce();
	});

	it('switches active seat and starts ticking clock for responder on TurnPlayed followed by DrawOffered', async () => {
		const blackLive = new LiveGameStore();
		blackLive.connect('g', 'tok-black', 'black');
		MockWebSocket.last!.onopen?.();

		MockWebSocket.last!.onmessage?.({
			data: JSON.stringify(
				snapshot({
					dfen: `${START_FEN} N`,
					activeSeat: 'White',
					dicePending: true,
					clocks: { white: 180000, black: 180000 },
				}),
			),
		});

		// White finishes their turn (e.g. played b1c3)
		MockWebSocket.last!.onmessage?.({
			data: JSON.stringify({
				TurnPlayed: {
					v: 1,
					seat: 'White',
					moves: ['b1c3'],
					fenAfter: AFTER_WHITE_KNIGHTS,
				},
			}),
		});

		// White also offered a draw with their turn
		MockWebSocket.last!.onmessage?.({
			data: JSON.stringify({
				DrawOffered: {
					v: 2,
					by: 'White',
				},
			}),
		});

		// Let the paced turn animation reveal
		await vi.advanceTimersByTimeAsync(1500);

		expect(blackLive.activeColor).toBe('b');
		expect(blackLive.isPreRollGateActive).toBe(true);
		expect(blackLive.isPreRollResponder).toBe(true);
		expect(blackLive.drawOfferedBy).toBe('White');
		expect(blackLive.tickingClockSeat).toBe('Black');
		expect(playDrawOfferSound).toHaveBeenCalledOnce();

		blackLive.dispose();
	});

	it('does not play sound when receiving our own offer broadcast', () => {
		deliver(snapshot({ activeSeat: 'Black', dicePending: false }));

		deliver({
			DrawOffered: {
				v: 1,
				by: 'White',
			},
		});

		expect(live.isDrawOfferPending).toBe(true);
		expect(live.isPreRollGateActive).toBe(true);
		expect(live.isPreRollResponder).toBe(false);
		expect(playDrawOfferSound).not.toHaveBeenCalled();
	});

	it('sends RespondDraw accept: true on acceptance', () => {
		deliver(snapshot({ activeSeat: 'White', dicePending: false }));
		deliver({
			DrawOffered: {
				v: 1,
				by: 'Black',
			},
		});

		live.respondDraw(true);

		const sent = MockWebSocket.last!.sent;
		const lastMsg = JSON.parse(sent[sent.length - 1]);
		expect(lastMsg).toEqual({
			RespondDraw: { accept: true },
		});
	});

	it('sends RespondDraw accept: false on roll/decline', () => {
		deliver(snapshot({ activeSeat: 'White', dicePending: false }));
		deliver({
			DrawOffered: {
				v: 1,
				by: 'Black',
			},
		});

		live.respondDraw(false);

		const sent = MockWebSocket.last!.sent;
		const lastMsg = JSON.parse(sent[sent.length - 1]);
		expect(lastMsg).toEqual({
			RespondDraw: { accept: false },
		});
	});

	it('clears pre-roll gate on DrawDeclined', () => {
		deliver(snapshot({ activeSeat: 'White', dicePending: false }));
		deliver({
			DrawOffered: {
				v: 1,
				by: 'Black',
			},
		});
		expect(live.isPreRollGateActive).toBe(true);

		deliver({
			DrawDeclined: {
				v: 2,
				by: 'White',
			},
		});

		expect(live.isDrawOfferPending).toBe(false);
		expect(live.isPreRollGateActive).toBe(false);
		expect(live.drawOfferedBy).toBeNull();
	});

	it('clears pre-roll gate and hides offer when DiceRolled arrives', () => {
		deliver(snapshot({ activeSeat: 'White', dicePending: false }));
		deliver({
			DrawOffered: {
				v: 1,
				by: 'Black',
			},
		});
		expect(live.isPreRollGateActive).toBe(true);

		deliver({
			DiceRolled: {
				v: 2,
				seat: 'White',
				dice: [2],
				dfen: `${START_FEN} N`,
				clocks: null,
			},
		});

		expect(live.isDrawOfferPending).toBe(false);
		expect(live.isPreRollGateActive).toBe(false);
		expect(live.currentDice).toHaveLength(1);
	});

	it('restores pre-roll gate from snapshot on reconnect', () => {
		deliver(
			snapshot({
				dfen: START_FEN,
				activeSeat: 'White',
				dicePending: false,
				drawOffer: { pending: true },
			}),
		);

		expect(live.isDrawOfferPending).toBe(true);
		expect(live.isPreRollGateActive).toBe(true);
		expect(live.isPreRollResponder).toBe(true);
		expect(live.drawOfferedBy).toBe('Black');
	});
});

describe('LiveGameStore stake doubling (#75)', () => {
	let live: LiveGameStore;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
		MockWebSocket.last = null;
		live = new LiveGameStore();
		live.connect('g', 'tok', 'white');
		MockWebSocket.last!.onopen?.();
	});

	afterEach(() => {
		live.dispose();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	const deliver = (ev: ServerEvent) =>
		MockWebSocket.last!.onmessage?.({ data: JSON.stringify(ev) });

	// The canonical play-api contract examples (fixtures/stake-doubling/README.md).
	const fixture = <T>(name: string): T =>
		JSON.parse(
			readFileSync(
				path.join(process.cwd(), 'src/lib/live/fixtures/stake-doubling', `${name}.json`),
				'utf8',
			),
		) as T;
	const stakedState = fixture<PublicGameState>('state-response');
	const accepted = fixture<Extract<ServerEvent, { DoubleAccepted: unknown }>>('event-accepted');
	const declined = fixture<Extract<ServerEvent, { DoubleDeclined: unknown }>>('event-declined');

	it('mirrors the server’s doubling state from the snapshot and adjusts it on cube events', () => {
		deliver({ Snapshot: { v: 1, state: stakedState } });
		expect(live.doubling?.currentStake).toBe(10);
		expect(live.doubling?.cubeOwner).toBeNull();
		expect(live.doubling?.decision?.kind).toBe('response');

		deliver(accepted); // v 2: the take moves the stake to 20 and the cube to Black
		expect(live.doubling?.currentStake).toBe(20);
		expect(live.doubling?.cubeValue).toBe(2);
		expect(live.doubling?.cubeOwner).toBe('Black');
		expect(live.doubling?.decision).toBeNull();

		deliver({ DoubleDeclined: { ...declined.DoubleDeclined, v: 3 } });
		expect(live.doubling?.currentStake).toBe(10); // the drop names the pre-offer stake
	});

	it('announces a declined double as a loss at the pre-offer stake', async () => {
		deliver({ Snapshot: { v: 1, state: stakedState } });
		deliver(declined); // v 2
		deliver({
			GameEnded: {
				v: 3,
				over: { result: { Win: { side: 'Black' } }, termination: 'DoubleDeclined' },
			},
		});
		expect(live.settlement).toBeNull(); // nothing is announced before the suspense beat

		await vi.advanceTimersByTimeAsync(800);
		expect(live.gameStatus).toBe('over');
		expect(live.termination).toBe('DoubleDeclined');
		expect(live.outcome).toBe('lost');
		expect(live.settlement).toBe('−10 credits');
	});

	it('signs the settled stake from the winner’s side after a take', async () => {
		deliver({ Snapshot: { v: 1, state: stakedState } });
		deliver(accepted); // stake 20
		deliver({
			GameEnded: { v: 3, over: { result: { Win: { side: 'White' } }, termination: 'Resign' } },
		});
		await vi.advanceTimersByTimeAsync(800);
		expect(live.outcome).toBe('won');
		expect(live.settlement).toBe('+20 credits');
	});

	it('stays silent about credits in a classic game', async () => {
		deliver(snapshot());
		deliver({
			GameEnded: { v: 1, over: { result: { Win: { side: 'White' } }, termination: 'Resign' } },
		});
		await vi.advanceTimersByTimeAsync(800);
		expect(live.gameStatus).toBe('over');
		expect(live.doubling).toBeNull();
		expect(live.settlement).toBeNull();
	});

	it('tolerates a termination this build does not know', async () => {
		deliver(snapshot());
		const unknown = {
			GameEnded: {
				v: 1,
				over: { result: { Win: { side: 'White' } }, termination: 'SomethingNew' },
			},
		} as unknown as ServerEvent;
		expect(() => deliver(unknown)).not.toThrow();
		await vi.advanceTimersByTimeAsync(800);
		expect(live.gameStatus).toBe('over');
		expect(live.termination).toBe('SomethingNew');
		expect(live.outcome).toBe('won');
	});

	it('sets authoritativeOver immediately upon GameEnded before animation/suspense drains', () => {
		deliver(snapshot());
		expect(live.authoritativeOver).toBeNull();
		expect(live.gameStatus).toBe('playing');

		deliver({
			GameEnded: { v: 1, over: { result: { Win: { side: 'White' } }, termination: 'Resign' } },
		});

		// Authoritatively over immediately
		expect(live.authoritativeOver).toEqual({
			result: { Win: { side: 'White' } },
			termination: 'Resign',
		});
		// But presentation / gameStatus hasn't finished the suspense beat yet
		expect(live.gameStatus).toBe('playing');
	});

	it('tracks rematchStartup and prevents clocks ticking during awaiting_joins', async () => {
		deliver(
			snapshot({
				rematchStartup: {
					phase: 'awaiting_joins',
					joinDeadlineAt: '2026-09-07T12:00:35Z',
				},
				clocks: { white: 300000, black: 300000 },
				dicePending: true,
			}),
		);

		expect(live.rematchStartup).toEqual({
			phase: 'awaiting_joins',
			joinDeadlineAt: '2026-09-07T12:00:35Z',
		});
		// In awaiting_joins, clocks must NOT be ticking down
		expect(live.tickingClockSeat).toBeNull();

		// When first roll arrives, it transitions to active
		deliver({
			DiceRolled: {
				v: 2,
				seat: 'White',
				dice: [1, 2, 3],
				dfen: `${START_FEN} 123`,
				clocks: { white: 300000, black: 300000 },
			},
		});

		expect(live.rematchStartup).toEqual({ phase: 'active' });
		expect(live.tickingClockSeat).toBeNull(); // roll spin active

		await vi.advanceTimersByTimeAsync(600); // spin finishes
		expect(live.tickingClockSeat).toBe('White');
	});
});
