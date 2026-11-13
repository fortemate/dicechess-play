import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveClient, randomClientSeed } from './liveClient';
import type { ServerEvent } from './liveTypes';

class MockWebSocket {
	static readonly OPEN = 1;
	static readonly CONNECTING = 0;
	static last: MockWebSocket | null = null;
	onopen: (() => void) | null = null;
	onclose: ((event?: { code: number }) => void) | null = null;
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
		this.onclose?.({ code: 1000 });
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

	it('retries on the base delay when secure jitter randomness is unavailable', () => {
		vi.useFakeTimers();
		try {
			for (const unavailableCrypto of [
				undefined,
				{
					getRandomValues: () => {
						throw new Error('unavailable');
					},
				},
			]) {
				vi.stubGlobal('crypto', unavailableCrypto);
				const statuses: string[] = [];
				const client = new LiveClient('ws://x');
				client.onStatus((status) => statuses.push(status));
				client.connect();
				const first = MockWebSocket.last!;
				first.onopen!();
				first.onclose!({ code: 1006 });
				expect(statuses).not.toContain('closed');
				vi.advanceTimersByTime(249);
				expect(MockWebSocket.last).toBe(first);
				vi.advanceTimersByTime(1);
				expect(MockWebSocket.last).not.toBe(first);
				client.close();
			}
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

	it('authenticates the laboratory socket before opening it or sending the seed and queued commands', () => {
		const statuses: string[] = [];
		const events: ServerEvent[] = [];
		const client = new LiveClient('ws://x/games/g/ws', {
			laboratoryAuth: { token: 'seat_capability', guest: 'guest-id', seat: 'White' },
		});
		client.onStatus((status) => statuses.push(status));
		client.onEvent((event) => events.push(event));
		client.connect({ SubmitSeed: { seed: 'stable-seed' } });
		client.send({ Resign: {} });
		const socket = MockWebSocket.last!;
		socket.onopen!();
		expect(socket.url).toBe('ws://x/games/g/ws');
		expect(socket.sent).toEqual([
			'{"LabAuthenticate":{"token":"seat_capability","guest":"guest-id"}}',
		]);
		expect(statuses).not.toContain('open');
		socket.onmessage!({ data: JSON.stringify({ Snapshot: { v: 1 } }) });
		expect(events).toEqual([]);
		expect(socket.sent).toHaveLength(1);

		socket.onmessage!({ data: JSON.stringify({ LabAuthenticated: { seat: 'White' } }) });
		expect(statuses.at(-1)).toBe('open');
		expect(socket.sent).toEqual([
			'{"LabAuthenticate":{"token":"seat_capability","guest":"guest-id"}}',
			'{"SubmitSeed":{"seed":"stable-seed"}}',
			'{"Resign":{}}',
		]);
		socket.onmessage!({ data: JSON.stringify({ DiceRolled: { v: 1 } }) });
		expect(events).toEqual([{ DiceRolled: { v: 1 } }]);
		client.close();
	});

	it('reauthenticates each reconnect and resends hello only after a matching ACK', () => {
		vi.useFakeTimers();
		try {
			const client = new LiveClient('ws://x/games/g/ws', {
				laboratoryAuth: { token: 'cap', guest: 'guest-id', seat: 'Black' },
			});
			client.connect({ SubmitSeed: { seed: 'stable' } });
			const first = MockWebSocket.last!;
			first.onopen!();
			first.onmessage!({ data: '{"LabAuthenticated":{"seat":"Black"}}' });
			first.onclose!({ code: 1006 });
			vi.advanceTimersByTime(400);
			const second = MockWebSocket.last!;
			expect(second).not.toBe(first);
			second.onopen!();
			expect(second.sent).toEqual(['{"LabAuthenticate":{"token":"cap","guest":"guest-id"}}']);
			second.onmessage!({ data: '{"LabAuthenticated":{"seat":"Black"}}' });
			expect(second.sent).toEqual([
				'{"LabAuthenticate":{"token":"cap","guest":"guest-id"}}',
				'{"SubmitSeed":{"seed":"stable"}}',
			]);
			client.close();
		} finally {
			vi.useRealTimers();
		}
	});

	it('fails closed on a wrong-seat ACK and stops retrying on policy close', () => {
		vi.useFakeTimers();
		try {
			const mismatchStatuses: string[] = [];
			const mismatch = new LiveClient('ws://x', {
				laboratoryAuth: { token: 'cap', guest: 'guest-id', seat: 'White' },
			});
			mismatch.onStatus((status) => mismatchStatuses.push(status));
			mismatch.connect({ SubmitSeed: { seed: 'stable' } });
			const wrongSeat = MockWebSocket.last!;
			wrongSeat.onopen!();
			wrongSeat.onmessage!({ data: '{"LabAuthenticated":{"seat":"Black"}}' });
			expect(mismatchStatuses.at(-1)).toBe('closed');
			expect(wrongSeat.sent).toEqual(['{"LabAuthenticate":{"token":"cap","guest":"guest-id"}}']);
			vi.advanceTimersByTime(60_000);
			expect(MockWebSocket.last).toBe(wrongSeat);

			const rejected = new LiveClient('ws://x', {
				laboratoryAuth: { token: 'bad-cap', guest: 'guest-id', seat: 'White' },
			});
			const statuses: string[] = [];
			rejected.onStatus((status) => statuses.push(status));
			rejected.connect();
			const denied = MockWebSocket.last!;
			denied.onopen!();
			denied.onclose!({ code: 1008 });
			expect(statuses.at(-1)).toBe('closed');
			vi.advanceTimersByTime(60_000);
			expect(MockWebSocket.last).toBe(denied);
		} finally {
			vi.useRealTimers();
		}
	});

	it('retries auth timeouts with bounded backoff and clears auth timers on close', () => {
		vi.useFakeTimers();
		try {
			const statuses: string[] = [];
			const client = new LiveClient('ws://x', {
				laboratoryAuth: { token: 'cap', guest: 'guest-id', seat: 'White' },
			});
			client.onStatus((status) => statuses.push(status));
			client.connect();
			const first = MockWebSocket.last!;
			first.onopen!();
			vi.advanceTimersByTime(6000);
			expect(statuses).not.toContain('open');
			expect(statuses.at(-1)).toBe('connecting');
			vi.advanceTimersByTime(400);
			const second = MockWebSocket.last!;
			expect(second).not.toBe(first);
			second.onopen!();
			client.close();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('stops after the bounded auth timeout retry budget is exhausted', () => {
		vi.useFakeTimers();
		try {
			const statuses: string[] = [];
			const client = new LiveClient('ws://x', {
				laboratoryAuth: { token: 'cap', guest: 'guest-id', seat: 'White' },
			});
			client.onStatus((status) => statuses.push(status));
			client.connect();
			for (let attempt = 0; attempt <= 10 && !statuses.includes('closed'); attempt += 1) {
				MockWebSocket.last!.onopen!();
				vi.advanceTimersByTime(6000);
				if (!statuses.includes('closed')) vi.advanceTimersByTime(7000);
			}
			expect(statuses).toContain('closed');
			expect(statuses).not.toContain('open');
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});
