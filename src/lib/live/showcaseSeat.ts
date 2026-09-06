/**
 * The showcase seat credential, kept for this tab only.
 *
 * The seat token used to live purely in memory (issue #61), which made any page reload fatal to
 * the game: the service worker's auto-update reload and staleBundleRecovery both land mid-game
 * right after a deploy, the token was gone, and the visitor came back as a spectator of their own
 * game while the seat forfeited on the server. play-api keeps a disconnected seat for its
 * disconnect grace (30 s by default, `GameRoom.DefaultDisconnectGrace`) precisely so that a
 * refresh can rejoin — this module is the client half of that contract.
 *
 * sessionStorage keeps every isolation property the credential had: it is scoped to this tab,
 * never leaves the browser, is in no response the table serves, and is cleared the moment the game
 * changes (end, reset, another game on the table). localStorage would hand the seat to other tabs
 * and let it outlive the game; it is deliberately not used.
 */
import type { Seat } from './liveTypes';

export interface StoredSeat {
	gameId: string;
	seatToken: string;
	seat: Seat;
}

export interface SeatStore {
	load(): StoredSeat | null;
	save(seat: StoredSeat): void;
	clear(): void;
}

export const SEAT_STORAGE_KEY = 'dicechess-play-showcase-seat';

/** The slice of Storage this module touches, so tests can pass a fake. */
export type SeatStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function tabStorage(): SeatStorage | null {
	try {
		return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
	} catch {
		return null; // a sandboxed frame or a privacy mode: the accessor itself throws
	}
}

function isStoredSeat(value: unknown): value is StoredSeat {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.gameId === 'string' &&
		v.gameId.length > 0 &&
		typeof v.seatToken === 'string' &&
		v.seatToken.length > 0 &&
		(v.seat === 'White' || v.seat === 'Black')
	);
}

/**
 * A SeatStore over sessionStorage. Every access is guarded: without usable storage the game
 * still works exactly as before, a reload merely loses the seat as it always did.
 */
export function createSeatStore(storage: () => SeatStorage | null = tabStorage): SeatStore {
	return {
		load() {
			try {
				const raw = storage()?.getItem(SEAT_STORAGE_KEY);
				if (!raw) return null;
				const parsed: unknown = JSON.parse(raw);
				return isStoredSeat(parsed) ? parsed : null;
			} catch {
				return null; // unreadable or corrupt: no seat
			}
		},
		save(seat) {
			try {
				storage()?.setItem(SEAT_STORAGE_KEY, JSON.stringify(seat));
			} catch {
				// quota or unavailable storage: nothing to do, see above
			}
		},
		clear() {
			try {
				storage()?.removeItem(SEAT_STORAGE_KEY);
			} catch {
				// nothing to clear
			}
		},
	};
}

/** An in-memory SeatStore: tests, and a fallback for environments without storage. */
export function memorySeatStore(initial: StoredSeat | null = null): SeatStore {
	let seat = initial;
	return {
		load: () => seat,
		save: (next) => {
			seat = next;
		},
		clear: () => {
			seat = null;
		},
	};
}
