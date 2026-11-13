/**
 * Owns the laboratory room's authenticated live connection and resynchronization loop. It sends
 * the post-commit dice seed, uses laboratory-scoped guest/seed storage, and accepts state only after
 * laboratory provenance, version, commit and time-control checks pass.
 */
import { LiveClient, randomClientSeed } from '../live/liveClient';
import {
	LaboratoryApi,
	LaboratoryError,
	parseGameState,
	timeControlKey,
	type LabErrorCode,
	type LaboratoryGameState,
} from './api';
import type { SeatAccess } from './seatLinks';
import type { ClientCommand } from '../live/liveTypes';
import type { CommandFrame } from './protocol';

export const LABORATORY_GUEST_KEY = 'dicechess-laboratory-guest';

const SEED_KEY_PREFIX = 'dicechess-laboratory-seed:';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEED_PATTERN = /^[0-9a-f]{32}$/;
let volatileGuest: string | null = null;

function newGuestId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		try {
			const hex = randomClientSeed();
			return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
		} catch {
			// A shared predictable fallback would identify unrelated visitors as the same human.
			throw new LaboratoryError('unavailable');
		}
	}
}

/** Restores this surface's anonymous identity, or keeps a generated fallback for this page session. */
export function laboratoryGuest(storage: Storage | null): string {
	if (storage) {
		try {
			const saved = storage.getItem(LABORATORY_GUEST_KEY);
			if (saved && UUID_PATTERN.test(saved)) {
				volatileGuest = saved;
				return saved;
			}
		} catch {
			// Blocked storage falls back to a stable in-memory identity.
		}
	}
	if (!volatileGuest) volatileGuest = newGuestId();
	if (storage) {
		try {
			storage.setItem(LABORATORY_GUEST_KEY, volatileGuest);
		} catch {
			// Identity remains stable for this page session even when persistence is blocked.
		}
	}
	return volatileGuest;
}

export interface RoomConnectionCallbacks {
	onState(state: LaboratoryGameState): void;
	onStatus(status: 'connecting' | 'open' | 'closed'): void;
	onError(code: LabErrorCode): void;
	onFrame?(frame: unknown): void;
	onReady?(ready: boolean, resynced: boolean): void;
}

export interface RoomConnection {
	close(): void;
	send(command: CommandFrame | ClientCommand): boolean;
}

function isValidSeatAccess(access: SeatAccess): boolean {
	return (
		!!access &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(access.gameId) &&
		(access.seat === 'White' || access.seat === 'Black') &&
		typeof access.token === 'string' &&
		/^[A-Za-z0-9_-]{1,256}$/.test(access.token)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function frameName(value: unknown): string | null {
	if (!isRecord(value)) return null;
	const keys = Object.keys(value);
	return keys.length === 1 ? keys[0] : null;
}

function connectionError(error: unknown): LabErrorCode {
	if (
		error instanceof LaboratoryError &&
		(error.code === 'expired' || error.code === 'incompatible')
	) {
		return error.code;
	}
	return 'connection';
}

function restoreSeatSeed(access: SeatAccess, storage: Storage | null): string {
	const seedKey = `${SEED_KEY_PREFIX}${access.gameId}:${access.seat}`;
	if (storage) {
		try {
			const saved = storage.getItem(seedKey);
			if (saved && SEED_PATTERN.test(saved)) return saved;
		} catch {
			// Seed remains stable for this connection even when storage is unavailable.
		}
	}
	const seed = randomClientSeed();
	if (storage) {
		try {
			storage.setItem(seedKey, seed);
		} catch {
			// Keep this seed in memory for reconnects during this page session.
		}
	}
	return seed;
}

/**
 * Opens a laboratory WebSocket, polls the public state to cover readiness/expiry changes, and
 * refreshes after public event frames. Commands are sent only after an authenticated snapshot;
 * this boundary never queues gameplay across reconnects or retries a roll/choice.
 */
export function openRoomConnection(
	api: LaboratoryApi,
	access: SeatAccess,
	guest: string,
	initialState: LaboratoryGameState,
	callbacks: RoomConnectionCallbacks,
	storage: Storage | null,
): RoomConnection {
	let closed = false;
	let authenticated = false;
	let ready = false;
	let acceptedState = initialState;
	let refreshPromise: Promise<void> | null = null;
	let pendingRefresh = false;
	let refreshAbort: AbortController | null = null;
	let interval: ReturnType<typeof setInterval> | null = null;
	let client: LiveClient | null = null;

	const closeResources = () => {
		ready = false;
		callbacks.onReady?.(false, false);
		if (interval !== null) {
			clearInterval(interval);
			interval = null;
		}
		refreshAbort?.abort();
		refreshAbort = null;
		client?.close();
	};
	const stopFor = (code: LabErrorCode) => {
		if (closed) return;
		closed = true;
		closeResources();
		callbacks.onError(code);
	};
	const acceptState = (next: LaboratoryGameState) => {
		if (closed || next.version < acceptedState.version) return;
		acceptedState = next;
		callbacks.onState(next);
		// A terminal snapshot is authoritative even if its receipt was lost. A finished room needs
		// no more transport; otherwise it would reconnect after every drain.
		if ('Ended' in next.status) {
			closed = true;
			closeResources();
		}
	};
	const refresh = (): Promise<void> => {
		if (closed) return Promise.resolve();
		if (refreshPromise) {
			pendingRefresh = true;
			return refreshPromise;
		}
		refreshAbort = new AbortController();
		const signal = refreshAbort.signal;
		refreshPromise = api
			.state(access.gameId, signal)
			.then((next) => {
				if (closed || signal.aborted) return;
				if (
					next.commit !== initialState.commit ||
					timeControlKey(next.timeControl) !== timeControlKey(initialState.timeControl)
				) {
					stopFor('incompatible');
					return;
				}
				acceptState(next);
			})
			.catch((error: unknown) => {
				if (closed || signal.aborted) return;
				const code = connectionError(error);
				if (code === 'expired' || code === 'incompatible') stopFor(code);
				else callbacks.onError('connection');
			})
			.finally(() => {
				refreshPromise = null;
				refreshAbort = null;
				if (pendingRefresh && !closed) {
					pendingRefresh = false;
					void refresh();
				}
			});
		return refreshPromise;
	};
	const onEvent = (frame: unknown) => {
		if (closed) return;
		const name = frameName(frame);
		if (!name) return;
		callbacks.onFrame?.(frame);
		if (name === 'DrawOfferArmed') return;
		if (name === 'Snapshot' && isRecord(frame) && isRecord(frame.Snapshot)) {
			try {
				const snapshot = frame.Snapshot;
				const next = parseGameState(snapshot.state, api.rulesVersion);
				if (
					snapshot.v !== next.version ||
					next.commit !== initialState.commit ||
					timeControlKey(next.timeControl) !== timeControlKey(initialState.timeControl)
				) {
					stopFor('incompatible');
					return;
				}
				acceptState(next);
				if (!closed && authenticated && !ready) {
					ready = true;
					callbacks.onReady?.(true, true);
				}
			} catch (error) {
				stopFor(connectionError(error) === 'expired' ? 'expired' : 'incompatible');
			}
			return;
		}
		// Any non-private public event can change the state not carried by its event DTO. GET is the
		// authoritative source for all fields, and in particular for readiness and room expiry.
		void refresh();
	};

	if (
		!isValidSeatAccess(access) ||
		!UUID_PATTERN.test(guest) ||
		access.gameId !== access.gameId.toLowerCase()
	) {
		stopFor('incompatible');
		return { close: () => {}, send: () => false };
	}

	let seed: string;
	try {
		seed = restoreSeatSeed(access, storage);
	} catch {
		stopFor('unavailable');
		return { close: () => {}, send: () => false };
	}

	const url = new URL(`/games/${access.gameId}/ws`, api.origin);
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	client = new LiveClient(url.toString(), {
		laboratoryAuth: { token: access.token, guest, seat: access.seat },
	});
	client.onEvent(onEvent);
	client.onStatus((status) => {
		if (closed) return;
		authenticated = status === 'open';
		if (!authenticated) {
			ready = false;
			callbacks.onReady?.(false, false);
		}
		callbacks.onStatus(status);
		if (status === 'closed') callbacks.onError('connection');
	});
	const hello = { SubmitSeed: { seed } } as const;
	client.connect(hello);
	if (!closed) interval = setInterval(() => void refresh(), 2000);

	return {
		send(command) {
			if (closed || !ready || !authenticated || !client) return false;
			client.send(command);
			return true;
		},
		close() {
			if (closed) return;
			closed = true;
			closeResources();
		},
	};
}
