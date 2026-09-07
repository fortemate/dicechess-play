/**
 * "Stay on this game": the spectator's opt-out of automatic rematch following, kept for this tab.
 *
 * Follow intent belongs to the VIEWER, not to the historical game (play-api ADR 007 /
 * rematch-v1) — so it is stored per browsing session rather than derived from the game. A live
 * spectator follows by default; pressing "Stay on this game" pins the game they are on, and that
 * choice has to survive the reload it most often precedes (a PWA service-worker update, a
 * refresh to unstick a socket), or the page would jump to the successor the visitor just refused.
 *
 * sessionStorage, deliberately, exactly as `showcaseSeat.ts` reasons about the seat credential:
 * it is scoped to this tab, so a second tab watching the same chain keeps following, and it dies
 * with the tab, so a decision about one afternoon's game is not remembered forever. Every access
 * is guarded — a sandboxed frame or a privacy mode throws on the accessor itself — and without
 * usable storage following simply behaves as it did before the reload.
 *
 * Pins are ids, never tokens: nothing here is a credential.
 */

export const FOLLOW_INTENT_KEY = 'dicechess-play-follow-intent';

/** How many pinned games a tab remembers; oldest fall off. A viewer only ever needs the recent few. */
export const MAX_PINNED = 20;

export interface FollowIntentStore {
	/** True when the viewer asked to stay on this game, so the follow loop must not navigate. */
	isPinned(gameId: string): boolean;
	pin(gameId: string): void;
	unpin(gameId: string): void;
}

/** The slice of Storage this module touches, so tests can pass a fake. */
export type IntentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function tabStorage(): IntentStorage | null {
	try {
		return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
	} catch {
		return null; // a sandboxed frame or a privacy mode: the accessor itself throws
	}
}

function readPinned(storage: () => IntentStorage | null): string[] {
	try {
		const raw = storage()?.getItem(FOLLOW_INTENT_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
	} catch {
		return []; // unreadable or corrupt: nothing is pinned, so following resumes
	}
}

function writePinned(storage: () => IntentStorage | null, ids: string[]): void {
	try {
		storage()?.setItem(FOLLOW_INTENT_KEY, JSON.stringify(ids.slice(0, MAX_PINNED)));
	} catch {
		// quota or unavailable storage: the choice holds for this page view only, see above
	}
}

/** A FollowIntentStore over sessionStorage. */
export function createFollowIntentStore(
	storage: () => IntentStorage | null = tabStorage,
): FollowIntentStore {
	return {
		isPinned: (gameId) => readPinned(storage).includes(gameId),
		pin(gameId) {
			const ids = readPinned(storage);
			if (ids.includes(gameId)) return;
			writePinned(storage, [gameId, ...ids]);
		},
		unpin(gameId) {
			const ids = readPinned(storage);
			if (!ids.includes(gameId)) return;
			writePinned(
				storage,
				ids.filter((id) => id !== gameId),
			);
		},
	};
}

/** An in-memory FollowIntentStore: tests, and a fallback for environments without storage. */
export function memoryFollowIntentStore(initial: string[] = []): FollowIntentStore {
	let ids = [...initial];
	return {
		isPinned: (gameId) => ids.includes(gameId),
		pin(gameId) {
			if (!ids.includes(gameId)) ids = [gameId, ...ids].slice(0, MAX_PINNED);
		},
		unpin(gameId) {
			ids = ids.filter((id) => id !== gameId);
		},
	};
}
