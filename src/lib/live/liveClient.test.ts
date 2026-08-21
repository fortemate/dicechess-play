import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveClient, randomClientSeed } from './liveClient';
import type { ServerEvent } from './liveTypes';

class MockWebSocket {
	static readonly OPEN = 1;
	static last: MockWebSocket | null = null;
	onopen: (() => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	sent: string[] = [];
	closed = false;
	readyState = MockWebSocket.OPEN;
	constructor(public url: string) {
		MockWebSocket.last = this;
	}
	send(data: string) {
		this.sent.push(data);
	}
	close() {
		this.closed = true;
		this.onclose?.();
	}
}

describe('LiveClient', () => {
	beforeEach(() => {
		vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
		MockWebSocket.last = null;
	});
	afterEach(() => vi.unstubAllGlobals());

	it('reports status and delivers parsed events', () => {
		const statuses: string[] = [];
		const events: ServerEvent[] = [];
		const client = new LiveClient('ws://x/games/g/ws?token=t');
		client.onStatus((s) => statuses.push(s));
		client.onEvent((e) => events.push(e));
		client.connect();

		expect(statuses).toContain('connecting');
		const ws = MockWebSocket.last!;
		expect(ws.url).toBe('ws://x/games/g/ws?token=t');

		ws.onopen!();
		expect(statuses).toContain('open');

		const event: ServerEvent = {
			DiceRolled: { v: 1, seat: 'White', dice: [2, 3, 6], dfen: 'fen', clocks: null },
		};
		ws.onmessage!({ data: JSON.stringify(event) });
		expect(events).toEqual([event]);
	});

	it('sends commands as JSON', () => {
		const client = new LiveClient('ws://x');
		client.connect();
		client.send({ Resign: {} });
		expect(MockWebSocket.last!.sent).toEqual(['{"Resign":{}}']);
	});

	it('ignores non-JSON frames', () => {
		const events: ServerEvent[] = [];
		const client = new LiveClient('ws://x');
		client.onEvent((e) => events.push(e));
		client.connect();
		MockWebSocket.last!.onmessage!({ data: 'ping' });
		expect(events).toEqual([]);
	});

	it('drops a command when the socket is not open', () => {
		const client = new LiveClient('ws://x');
		client.connect();
		MockWebSocket.last!.readyState = 0; // CONNECTING
		client.send({ Resign: {} });
		expect(MockWebSocket.last!.sent).toEqual([]);
	});

	it('closing detaches handlers so no status fires afterwards', () => {
		const statuses: string[] = [];
		const client = new LiveClient('ws://x');
		client.onStatus((s) => statuses.push(s));
		client.connect();
		const ws = MockWebSocket.last!;
		client.close();
		expect(ws.closed).toBe(true);
		expect(statuses).not.toContain('closed'); // onclose was detached before close()
	});

	it('reconnecting closes the previous socket', () => {
		const client = new LiveClient('ws://x');
		client.connect();
		const first = MockWebSocket.last!;
		client.connect();
		expect(first.closed).toBe(true);
		expect(MockWebSocket.last).not.toBe(first);
	});

	it('reconnects with backoff after an unexpected drop, staying in connecting', () => {
		vi.useFakeTimers();
		try {
			const statuses: string[] = [];
			const client = new LiveClient('ws://x/games/g/ws?token=t');
			client.onStatus((s) => statuses.push(s));
			client.connect();
			const first = MockWebSocket.last!;
			first.onopen!();
			expect(statuses).toContain('open');

			first.onclose!(); // unexpected drop
			// It schedules a retry rather than giving up: 'connecting' again, never 'closed'.
			expect(statuses).not.toContain('closed');
			expect(statuses.filter((s) => s === 'connecting').length).toBeGreaterThanOrEqual(2);

			vi.advanceTimersByTime(400); // past the first backoff (250ms + jitter)
			const second = MockWebSocket.last!;
			expect(second).not.toBe(first);
			second.onopen!();
			expect(statuses[statuses.length - 1]).toBe('open');
		} finally {
			vi.useRealTimers();
		}
	});

	it('a fresh connect() cancels a pending reconnect timer (no duplicate socket)', () => {
		vi.useFakeTimers();
		try {
			const client = new LiveClient('ws://x');
			client.connect();
			const first = MockWebSocket.last!;
			first.onopen!();
			first.onclose!(); // schedules a backoff reconnect
			client.connect(); // a fresh connect must cancel that pending timer
			const reconnected = MockWebSocket.last!;
			expect(reconnected).not.toBe(first);
			vi.advanceTimersByTime(10_000); // the stale timer must not open another socket
			expect(MockWebSocket.last).toBe(reconnected);
		} finally {
			vi.useRealTimers();
		}
	});

	it('sends the hello command on open and re-announces it on reconnect', () => {
		vi.useFakeTimers();
		try {
			const client = new LiveClient('ws://x');
			client.connect({ SubmitSeed: { seed: 'abcd' } });
			const first = MockWebSocket.last!;
			first.onopen!();
			expect(first.sent).toEqual(['{"SubmitSeed":{"seed":"abcd"}}']);

			first.onclose!(); // unexpected drop → backoff reconnect
			vi.advanceTimersByTime(400);
			const second = MockWebSocket.last!;
			expect(second).not.toBe(first);
			second.onopen!();
			expect(second.sent).toEqual(['{"SubmitSeed":{"seed":"abcd"}}']); // re-announced on the new socket
		} finally {
			vi.useRealTimers();
		}
	});

	it('sends no hello when none is given', () => {
		const client = new LiveClient('ws://x');
		client.connect(null); // the spectator wiring passes null explicitly
		MockWebSocket.last!.onopen!();
		expect(MockWebSocket.last!.sent).toEqual([]);
	});

	it('randomClientSeed is 32 lowercase hex characters, fresh each call', () => {
		const seed = randomClientSeed();
		expect(seed).toMatch(/^[0-9a-f]{32}$/);
		expect(randomClientSeed()).not.toBe(seed);
	});

	it('stops reconnecting after an intentional close', () => {
		vi.useFakeTimers();
		try {
			const client = new LiveClient('ws://x');
			client.connect();
			const ws = MockWebSocket.last!;
			ws.onopen!();
			client.close();
			vi.advanceTimersByTime(60_000);
			expect(MockWebSocket.last).toBe(ws); // no new socket was opened
		} finally {
			vi.useRealTimers();
		}
	});

	it('gives up and reports closed after exhausting reconnect attempts', () => {
		vi.useFakeTimers();
		try {
			const statuses: string[] = [];
			const client = new LiveClient('ws://x');
			client.onStatus((s) => statuses.push(s));
			client.connect();
			// Every attempt fails immediately; advance past the capped backoff each round until it gives up.
			for (let i = 0; i < 15 && !statuses.includes('closed'); i++) {
				MockWebSocket.last!.onclose?.();
				vi.advanceTimersByTime(6_000);
			}
			expect(statuses).toContain('closed');
		} finally {
			vi.useRealTimers();
		}
	});
});
