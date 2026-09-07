import { describe, expect, it, vi } from 'vitest';
import { ContinuationError } from './continuationApi';
import { MAX_FOLLOW_HOPS, resolveChainHead } from './continuationChain';
import type { PublicContinuation } from './rematchTypes';

const SERVER_NOW = '2026-09-07T12:00:20Z';

function matched(id: string, next: string): PublicContinuation {
	return { sourceGameId: id, serverNow: SERVER_NOW, phase: 'matched', nextGameId: next };
}

function waiting(id: string, deadlineAt?: string): PublicContinuation {
	return { sourceGameId: id, serverNow: SERVER_NOW, phase: 'waiting', deadlineAt };
}

function closed(id: string): PublicContinuation {
	return { sourceGameId: id, serverNow: SERVER_NOW, phase: 'closed' };
}

/** A reader over a fixed map; anything absent is an unknown game (404). */
function readerOf(chain: Record<string, PublicContinuation>) {
	return vi.fn(async (id: string) => {
		const state = chain[id];
		if (!state) throw new ContinuationError(404);
		return state;
	});
}

describe('resolveChainHead', () => {
	it('stays put when the game has no committed successor', async () => {
		const read = readerOf({ a: waiting('a') });

		const res = await resolveChainHead('a', read);

		expect(res).toMatchObject({ gameId: 'a', hops: 0, stop: 'terminal' });
		expect(res.state).toEqual(waiting('a'));
		expect(read).toHaveBeenCalledTimes(1);
	});

	it('walks A → B → C to the head of the chain', async () => {
		const read = readerOf({
			a: matched('a', 'b'),
			b: matched('b', 'c'),
			c: waiting('c'),
		});

		const res = await resolveChainHead('a', read);

		expect(res).toMatchObject({ gameId: 'c', hops: 2, stop: 'terminal' });
		expect(read.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'c']);
	});

	it('treats a matched source without a readable successor as the head', async () => {
		// The server committed but is still registering the room: `nextGameId` is withheld until it
		// is readable, and the follower simply polls again rather than inventing a destination.
		const read = readerOf({ a: { ...matched('a', 'b'), nextGameId: undefined } });

		const res = await resolveChainHead('a', read);

		expect(res).toMatchObject({ gameId: 'a', hops: 0, stop: 'terminal' });
	});

	it('stops on a cycle instead of looping forever', async () => {
		const read = readerOf({ a: matched('a', 'b'), b: matched('b', 'a') });

		const res = await resolveChainHead('a', read);

		expect(res).toMatchObject({ gameId: 'b', hops: 1, stop: 'cycle' });
		expect(read).toHaveBeenCalledTimes(2);
	});

	it('stops on a self-link', async () => {
		const read = readerOf({ a: matched('a', 'a') });

		expect(await resolveChainHead('a', read)).toMatchObject({ gameId: 'a', stop: 'cycle' });
	});

	it('bounds how many links one resolution walks', async () => {
		const chain: Record<string, PublicContinuation> = {};
		for (let i = 0; i < 30; i += 1) chain[`g${i}`] = matched(`g${i}`, `g${i + 1}`);
		const read = readerOf(chain);

		const res = await resolveChainHead('g0', read, { maxHops: 3 });

		expect(res).toMatchObject({ gameId: 'g3', hops: 3, stop: 'limit' });
		expect(read).toHaveBeenCalledTimes(4);
		expect(MAX_FOLLOW_HOPS).toBeGreaterThan(0);
	});

	it('reports the last readable game when a link cannot be read', async () => {
		// B is named by A but unreachable this time: the follower keeps A's readable result and
		// retries, rather than moving the viewer to a board it knows nothing about.
		const read = readerOf({ a: matched('a', 'b') });

		const res = await resolveChainHead('a', read);

		expect(res).toMatchObject({ gameId: 'a', hops: 0, stop: 'error' });
		expect(res.state).toEqual(matched('a', 'b'));
		expect((res.error as ContinuationError).status).toBe(404);
	});

	it('reports no readable state when even the start game fails', async () => {
		const read = readerOf({});

		const res = await resolveChainHead('a', read);

		expect(res).toMatchObject({ gameId: 'a', hops: 0, stop: 'error', state: null });
	});

	it('keeps its cycle guard across resolutions through a shared visited set', async () => {
		const read = readerOf({ a: matched('a', 'b'), b: closed('b') });
		const visited = new Set<string>();

		await resolveChainHead('a', read, { visited });
		const second = await resolveChainHead('a', read, { visited });

		expect(second).toMatchObject({ gameId: 'a', stop: 'cycle' });
	});
});
