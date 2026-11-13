import type { ClientCommand, ServerEvent } from './liveTypes';

export type ConnStatus = 'connecting' | 'open' | 'closed';

export interface LaboratorySocketAuth {
	token: string;
	guest: string;
	seat: 'White' | 'Black';
}

/** A fresh 16-byte (128-bit) client dice seed, hex-encoded — the player's post-commit entropy contribution. */
export function randomClientSeed(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Thin WebSocket transport to a play-api game socket: parses each text frame into a ServerEvent and
// sends ClientCommands as JSON. No Svelte/runes here (pure + unit-testable).
//
// On an *unexpected* drop (network blip, server idle close) it reconnects with exponential backoff,
// staying in 'connecting' while it retries — long enough to ride out the server's reconnect grace, so
// a brief disconnect no longer forfeits the game. A reconnect re-attaches the same seat token and the
// server replies with a fresh Snapshot that re-syncs the store. An intentional close() (teardown or
// game over) stops reconnecting; exhausting the attempts surfaces 'closed'.
export class LiveClient {
	private socket: WebSocket | null = null;
	private eventCb: ((event: ServerEvent) => void) | null = null;
	private statusCb: ((status: ConnStatus) => void) | null = null;

	private shouldReconnect = false;
	private attempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private authTimer: ReturnType<typeof setTimeout> | null = null;
	private authenticated = false;
	// A command (re)sent on every successful open — used for the dice seed, so a reconnect before the
	// opening roll re-announces it (the server ignores a duplicate or post-roll seed).
	private hello: ClientCommand | null = null;

	// Backoff schedule (ms); the last entry repeats. ~33s over MAX_ATTEMPTS covers the server grace.
	private static readonly BACKOFF = [250, 500, 1000, 2000, 4000, 5000];
	private static readonly MAX_ATTEMPTS = 10;

	private static reconnectDelay(base: number): number {
		try {
			const samples = new Uint32Array(1);
			crypto.getRandomValues(samples);
			const jitter = (samples[0] ?? 0) / 2 ** 32;
			return base + jitter * base * 0.2;
		} catch {
			// Jitter only spreads reconnect load; it must not prevent a retry when crypto is unavailable.
			return base;
		}
	}

	private queue: ClientCommand[] = [];

	constructor(
		private readonly url: string,
		private readonly options: { laboratoryAuth?: LaboratorySocketAuth } = {},
	) {}

	onEvent(cb: (event: ServerEvent) => void): void {
		this.eventCb = cb;
	}

	onStatus(cb: (status: ConnStatus) => void): void {
		this.statusCb = cb;
	}

	/** Open the socket. `hello`, if given, is (re)sent on every successful open (e.g. the dice seed). */
	connect(hello: ClientCommand | null = null): void {
		this.hello = hello;
		this.shouldReconnect = true;
		this.attempts = 0;
		this.open();
	}

	private open(): void {
		// Cancel any pending backoff timer so a stale reconnect can't fire after a fresh connect()/open().
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.teardownSocket(); // idempotent: tear down any existing socket before (re)connecting
		this.statusCb?.('connecting');
		const socket = new WebSocket(this.url);
		this.socket = socket;
		this.authenticated = !this.options.laboratoryAuth;
		socket.onopen = () => {
			if (this.options.laboratoryAuth) {
				const { token, guest } = this.options.laboratoryAuth;
				socket.send(JSON.stringify({ LabAuthenticate: { token, guest } }));
				this.authTimer = setTimeout(() => this.handleAuthFailure(), 6000);
				return;
			}
			this.authenticated = true;
			this.attempts = 0; // classic sockets retain their original open behavior
			this.finishOpen();
		};
		socket.onclose = (event: CloseEvent) => {
			if (this.options.laboratoryAuth && event.code === 1008) {
				this.stopAfterAuthFailure();
				return;
			}
			this.handleDrop();
		};
		socket.onerror = () => {
			this.handleDrop();
		};
		socket.onmessage = (event: MessageEvent) => {
			if (typeof event.data !== 'string') return;
			try {
				const parsed = JSON.parse(event.data) as unknown;
				if (!this.authenticated) {
					if (this.isAuthAck(parsed)) this.acceptAuthAck(parsed);
					return;
				}
				this.eventCb?.(parsed as ServerEvent);
			} catch {
				// Ignore non-JSON frames (e.g. keep-alives).
			}
		};
	}

	private isAuthAck(value: unknown): value is { LabAuthenticated: { seat: 'White' | 'Black' } } {
		if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
		const record = value as Record<string, unknown>;
		if (Object.keys(record).length !== 1 || !('LabAuthenticated' in record)) return false;
		const ack = record.LabAuthenticated;
		return (
			typeof ack === 'object' &&
			ack !== null &&
			!Array.isArray(ack) &&
			((ack as Record<string, unknown>).seat === 'White' ||
				(ack as Record<string, unknown>).seat === 'Black')
		);
	}

	private acceptAuthAck(value: { LabAuthenticated: { seat: 'White' | 'Black' } }): void {
		if (this.authenticated) return;
		if (this.authTimer) {
			clearTimeout(this.authTimer);
			this.authTimer = null;
		}
		if (value.LabAuthenticated.seat !== this.options.laboratoryAuth?.seat) {
			this.stopAfterAuthFailure();
			return;
		}
		this.authenticated = true;
		this.attempts = 0;
		this.finishOpen();
	}

	private finishOpen(): void {
		this.statusCb?.('open');
		if (this.hello) this.send(this.hello);
		while (this.queue.length > 0) {
			const cmd = this.queue.shift();
			if (cmd) this.send(cmd);
		}
	}

	private handleAuthFailure(): void {
		this.authTimer = null;
		this.handleDrop();
	}

	private stopAfterAuthFailure(): void {
		this.shouldReconnect = false;
		this.queue = [];
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.teardownSocket();
		this.statusCb?.('closed');
	}

	/** An unexpected close/error: schedule a backoff reconnect, or give up after MAX_ATTEMPTS. */
	private handleDrop(): void {
		if (this.authTimer) {
			clearTimeout(this.authTimer);
			this.authTimer = null;
		}
		this.teardownSocket(); // detach handlers so onerror→onclose can't double-fire
		if (!this.shouldReconnect) return;
		if (this.attempts >= LiveClient.MAX_ATTEMPTS) {
			this.shouldReconnect = false;
			this.statusCb?.('closed');
			return;
		}
		const base = LiveClient.BACKOFF[Math.min(this.attempts, LiveClient.BACKOFF.length - 1)];
		const delay = LiveClient.reconnectDelay(base);
		this.attempts += 1;
		this.statusCb?.('connecting');
		this.reconnectTimer = setTimeout(() => this.open(), delay);
	}

	send(command: ClientCommand): void {
		if (this.socket?.readyState === WebSocket.OPEN) {
			if (this.authenticated) this.socket.send(JSON.stringify(command));
			else this.queue.push(command);
		} else if (this.socket?.readyState === WebSocket.CONNECTING) {
			this.queue.push(command);
		}
	}

	/** Intentional close (teardown or game over): stop reconnecting and detach handlers. */
	close(): void {
		this.shouldReconnect = false;
		if (this.authTimer) {
			clearTimeout(this.authTimer);
			this.authTimer = null;
		}
		this.queue = [];
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.teardownSocket();
	}

	private teardownSocket(): void {
		if (this.authTimer) {
			clearTimeout(this.authTimer);
			this.authTimer = null;
		}
		const socket = this.socket;
		if (!socket) return;
		// Detach handlers so a pending close/error after teardown can't fire callbacks or a reconnect.
		socket.onopen = null;
		socket.onclose = null;
		socket.onerror = null;
		socket.onmessage = null;
		socket.close();
		this.socket = null;
	}
}
