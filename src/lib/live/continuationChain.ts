import type { PublicContinuation } from './rematchTypes';

/**
 * Walking a rematch chain A → B → C from public reads alone (play-api ADR 007 / rematch-v1).
 *
 * A follower that has been away — a reload, a laptop that slept through two rematches — cannot
 * assume the game it holds is still the live one, and there is no push channel to ask: the old
 * game's WebSocket is gone and the coordinator outlives it. So it walks the retained links
 * forward until a game says it has no committed successor yet.
 *
 * Pure and transport-free (`read` is injected) so the traversal rules are unit-testable and the
 * store stays a thin reactive shell. Three rules make an untrusted, server-owned chain safe to
 * walk automatically:
 *
 *  - bounded: at most `maxHops` reads per resolution, so a long or hostile chain cannot spin;
 *  - cycle-guarded: a successor already visited (including a self-link) stops the walk instead of
 *    looping forever;
 *  - only server-declared successors: the next id always comes from `nextGameId` of the game we
 *    just read, never from matching players or timing, so an unrelated new game between the same
 *    two people can never be mistaken for a rematch.
 *
 * A read that fails does NOT invalidate the walk: resolution stops and reports the last game that
 * WAS readable, which is what the follower keeps showing while it retries.
 */

/** Why the walk stopped. Only `terminal` means "this is the head of the chain right now". */
export type ChainStop = 'terminal' | 'limit' | 'cycle' | 'error';

export interface ChainResolution {
	/** The last game that was readable — the one to show or follow. */
	gameId: string;
	/** How many successors were traversed (0 = the start game is still the head). */
	hops: number;
	stop: ChainStop;
	/** The last successful read — the head's own public projection; null when the first read failed. */
	state: PublicContinuation | null;
	/** The failure that stopped the walk, for `stop === 'error'` only. */
	error?: unknown;
}

/** A resolution never reads more than this many links; a follower resumes on its next tick. */
export const MAX_FOLLOW_HOPS = 8;

export type ContinuationReader = (gameId: string) => Promise<PublicContinuation>;

/**
 * Follow committed successors from `startId` and report the head of the chain.
 *
 * `visited` seeds the cycle guard with ids the caller has already walked in this session, so a
 * resumed traversal keeps its protection across calls.
 */
export async function resolveChainHead(
	startId: string,
	read: ContinuationReader,
	options: { maxHops?: number; visited?: Set<string> } = {},
): Promise<ChainResolution> {
	const maxHops = options.maxHops ?? MAX_FOLLOW_HOPS;
	const visited = options.visited ?? new Set<string>();
	visited.add(startId);

	let cursor = startId;
	let hops = 0;
	// The furthest game that actually answered. A failure returns THIS rather than the id it
	// failed on: the follower keeps showing the last readable game while it retries.
	let head: { id: string; hops: number; state: PublicContinuation } | null = null;

	for (;;) {
		let state: PublicContinuation;
		try {
			state = await read(cursor);
		} catch (error) {
			return {
				gameId: head?.id ?? cursor,
				hops: head?.hops ?? 0,
				stop: 'error',
				state: head?.state ?? null,
				error,
			};
		}
		head = { id: cursor, hops, state };

		const next = state.phase === 'matched' ? (state.nextGameId ?? null) : null;
		// `matched` without a readable successor is the server still registering the new room: the
		// head is still this game, and the caller's next poll picks the successor up.
		if (!next) return { gameId: cursor, hops, stop: 'terminal', state };
		if (visited.has(next)) return { gameId: cursor, hops, stop: 'cycle', state };
		if (hops >= maxHops) return { gameId: cursor, hops, stop: 'limit', state };

		visited.add(next);
		cursor = next;
		hops += 1;
	}
}
