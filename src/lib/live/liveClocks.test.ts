import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveGameStore } from './liveGameStore.svelte';
import type { PublicGameState, ServerEvent } from './liveTypes';

// Minimal WebSocket stand-in: the store opens one via LiveClient; we drive events through it.
class MockWebSocket {
	static readonly OPEN = 1;
	static last: MockWebSocket | null = null;
	onopen: (() => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	readyState = MockWebSocket.OPEN;
	constructor(public url: string) {
		MockWebSocket.last = this;
	}
	send() {}
	close() {
		this.onclose?.();
	}
}

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 NBR';

function activeSnapshot(clocks: PublicGameState['clocks']): ServerEvent {
	return {
		Snapshot: {
			v: 0,
			state: {
				version: 0,
				dfen: FEN,
				activeSeat: 'White',
				dicePending: true,
				status: { Active: {} },
				clocks,
			},
		},
	};
}

describe('LiveGameStore clocks', () => {
	let live: LiveGameStore;

	beforeEach(() => {
		vi.useFakeTimers();
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

	it('ticks the side to move down and leaves the other side untouched', () => {
		deliver(activeSnapshot({ white: 60_000, black: 60_000 }));
		expect(live.hasClocks).toBe(true);

		vi.advanceTimersByTime(1_000);
		expect(live.whiteClockMs).toBeLessThanOrEqual(59_000);
		expect(live.whiteClockMs).toBeGreaterThan(58_000);
		expect(live.blackClockMs).toBe(60_000);
	});

	it('moves the running clock to the other side on the next roll', () => {
		deliver(activeSnapshot({ white: 60_000, black: 60_000 }));
		vi.advanceTimersByTime(1_000);
		// Server's authoritative roll for Black with fresh banks.
		deliver({
			DiceRolled: {
				v: 1,
				seat: 'Black',
				dice: [2],
				dfen: FEN,
				clocks: { white: 59_000, black: 60_000 },
			},
		});

		vi.advanceTimersByTime(2_000);
		expect(live.whiteClockMs).toBe(59_000); // frozen — no longer the side to move
		expect(live.blackClockMs).toBeLessThanOrEqual(58_000);
		expect(live.blackClockMs).toBeGreaterThan(57_000);
	});

	it('stops ticking between a completed turn and the next roll', () => {
		deliver(activeSnapshot({ white: 60_000, black: 60_000 }));
		expect(live.tickingClockSeat).toBe('White');

		vi.advanceTimersByTime(1_000);
		deliver({
			TurnPlayed: {
				v: 1,
				seat: 'White',
				moves: ['e2e4'],
				fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
			},
		});

		expect(live.tickingClockSeat).toBeNull();
		const frozen = live.whiteClockMs;
		vi.advanceTimersByTime(2_000);
		expect(live.whiteClockMs).toBe(frozen); // frozen until the next authoritative roll
	});

	it('zeroes the flagged side on a timeout', () => {
		deliver(activeSnapshot({ white: 1_000, black: 60_000 }));
		deliver({
			GameEnded: { v: 1, over: { result: { Win: { side: 'Black' } }, termination: 'Timeout' } },
		});
		expect(live.whiteClockMs).toBe(0); // White was to move when the flag fell
		expect(live.blackClockMs).toBe(60_000);
	});

	it('reports no clocks for an unlimited game', () => {
		deliver(activeSnapshot(null));
		expect(live.hasClocks).toBe(false);
	});
});
