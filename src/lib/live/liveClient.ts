import type { ClientCommand, ServerEvent } from './liveTypes';

export type ConnStatus = 'connecting' | 'open' | 'closed';

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
	// A command (re)sent on every successful open — used for the dice seed, so a reconnect before the
	// opening roll re-announces it (the server ignores a duplicate or post-roll seed).
	private hello: ClientCommand | null = null;

	// Backoff schedule (ms); the last entry repeats. ~33s over MAX_ATTEMPTS covers the server grace.
	private static readonly BACKOFF = [250, 500, 1000, 2000, 4000, 5000];
	private static readonly MAX_ATTEMPTS = 10;

	constructor(private readonly url: string) {}

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
		socket.onopen = () => {
			this.attempts = 0; // a successful connection resets the backoff
			this.statusCb?.('open');
			if (this.hello) this.send(this.hello); // (re)announce on every open, e.g. the dice seed
		};
		socket.onclose = () => this.handleDrop();
		socket.onerror = () => this.handleDrop();
		socket.onmessage = (event: MessageEvent) => {
			if (typeof event.data !== 'string') return;
			try {
				this.eventCb?.(JSON.parse(event.data) as ServerEvent);
			} catch {
				// Ignore non-JSON frames (e.g. keep-alives).
			}
		};
	}

	/** An unexpected close/error: schedule a backoff reconnect, or give up after MAX_ATTEMPTS. */
	private handleDrop(): void {
		this.teardownSocket(); // detach handlers so onerror→onclose can't double-fire
		if (!this.shouldReconnect) return;
		if (this.attempts >= LiveClient.MAX_ATTEMPTS) {
			this.shouldReconnect = false;
			this.statusCb?.('closed');
			return;
		}
		const base = LiveClient.BACKOFF[Math.min(this.attempts, LiveClient.BACKOFF.length - 1)];
		const delay = base + Math.random() * base * 0.2; // light jitter to avoid synchronized retries
		this.attempts += 1;
		this.statusCb?.('connecting');
		this.reconnectTimer = setTimeout(() => this.open(), delay);
	}

	send(command: ClientCommand): void {
		// Drop commands when not connected — the WebSocket throws if it isn't OPEN.
		if (this.socket?.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify(command));
		}
	}

	/** Intentional close (teardown or game over): stop reconnecting and detach handlers. */
	close(): void {
		this.shouldReconnect = false;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.teardownSocket();
	}

	private teardownSocket(): void {
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
