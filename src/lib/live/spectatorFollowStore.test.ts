import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ContinuationError } from './continuationApi';
import { memoryFollowIntentStore } from './followIntent';
import { SpectatorFollowStore } from './spectatorFollowStore.svelte';
import type { PublicContinuation } from './rematchTypes';

const NOW = '2026-09-07T12:00:00Z';

function matched(id: string, next: string): PublicContinuation {
	return { sourceGameId: id, serverNow: NOW, phase: 'matched', nextGameId: next };
}

/** A finished game with a live offer window — the deadline is what says "the game has ended". */
function offerOpen(id: string, seconds = 15): PublicContinuation {
	return {
		sourceGameId: id,
		serverNow: NOW,
		phase: 'waiting',
		deadlineAt: new Date(Date.parse(NOW) + seconds * 1000).toISOString(),
	};
}

/** An ordinary game still being played: `waiting`, and deliberately without a deadline. */
function stillPlaying(id: string): PublicContinuation {
	return { sourceGameId: id, serverNow: NOW, phase: 'waiting' };
}

function closed(id: string): PublicContinuation {
	return { sourceGameId: id, serverNow: NOW, phase: 'closed' };
}

/** A reader over a mutable map, so a test can let the chain grow between polls. */
function reader(chain: Record<string, PublicContinuation>) {
	return vi.fn(async (id: string) => {
		const state = chain[id];
		if (!state) throw new ContinuationError(404);
		return state;
	});
}

describe('SpectatorFollowStore', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(NOW));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('keeps following an ordinary game that is still being played', async () => {
		// `waiting` with no deadline is the answer for a game in progress. It is NOT a closed chain:
		// the follower must stay armed, and it has nothing to poll for until the game ends.
		const chain = { a: stillPlaying('a') };
		const read = reader(chain);
		const store = new SpectatorFollowStore(memoryFollowIntentStore(), read);
		const onFollow = vi.fn();
		store.onFollow = onFollow;

		store.init('a');
		await vi.advanceTimersByTimeAsync(0);

		expect(store.status).toBe('waiting');
		expect(store.following).toBe(true);
		expect(onFollow).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(5000);
		expect(read).toHaveBeenCalledTimes(1); // nothing to poll for yet

		// The game ends: the room (and its socket) goes away, and the follower reads on its own.
		chain.a = offerOpen('a');
		store.sourceEnded();
		await vi.advanceTimersByTimeAsync(0);
		expect(store.status).toBe('waiting');
		expect(store.secondsRemaining).toBe(15);

		chain.a = matched('a', 'b');
		Object.assign(chain, { b: stillPlaying('b') });
		await vi.advanceTimersByTimeAsync(1000);

		expect(onFollow).toHaveBeenCalledWith('b');
		expect(store.status).toBe('matched');
		store.dispose();
	});

	it('polls the source after its socket closed and follows the committed successor once', async () => {
		const chain: Record<string, PublicContinuation> = { a: offerOpen('a') };
		const read = reader(chain);
		const store = new SpectatorFollowStore(memoryFollowIntentStore(), read);
		const onFollow = vi.fn();
		store.onFollow = onFollow;

		store.init('a');
		store.sourceEnded();
		await vi.advanceTimersByTimeAsync(0);
		expect(store.status).toBe('waiting');

		await vi.advanceTimersByTimeAsync(3000);
		expect(read.mock.calls.length).toBeGreaterThan(2); // one-second polling while waiting

		chain.a = matched('a', 'b');
		chain.b = stillPlaying('b');
		await vi.advanceTimersByTimeAsync(1000);
		expect(onFollow).toHaveBeenCalledTimes(1);

		// Polling stops at the successor: the page navigates and re-inits on the new game.
		await vi.advanceTimersByTimeAsync(5000);
		expect(onFollow).toHaveBeenCalledTimes(1);
		store.dispose();
	});

	it('walks A → B → C on entry, so a reload lands on the current game', async () => {
		const read = reader({
			a: matched('a', 'b'),
			b: matched('b', 'c'),
			c: stillPlaying('c'),
		});
		const store = new SpectatorFollowStore(memoryFollowIntentStore(), read);
		const onFollow = vi.fn();
		store.onFollow = onFollow;

		store.init('a');
		await vi.advanceTimersByTimeAsync(0);

		expect(onFollow).toHaveBeenCalledExactlyOnceWith('c');
		expect(store.nextGameId).toBe('c');
		store.dispose();
	});

	it('"Stay on this game" stops following, persists, and offers the way back', async () => {
		const chain: Record<string, PublicContinuation> = { a: offerOpen('a') };
		const read = reader(chain);
		const intent = memoryFollowIntentStore();
		const store = new SpectatorFollowStore(intent, read);
		const onFollow = vi.fn();
		store.onFollow = onFollow;

		store.init('a');
		store.sourceEnded();
		await vi.advanceTimersByTimeAsync(0);

		store.stayHere();
		expect(store.following).toBe(false);
		expect(intent.isPinned('a')).toBe(true);

		chain.a = matched('a', 'b');
		chain.b = stillPlaying('b');
		await vi.advanceTimersByTimeAsync(1000);

		// The chain is tracked but never taken automatically.
		expect(onFollow).not.toHaveBeenCalled();
		expect(store.status).toBe('matched');
		expect(store.nextGameId).toBe('b');

		store.resumeFollowing();
		await vi.advanceTimersByTimeAsync(0);
		expect(intent.isPinned('a')).toBe(false);
		expect(onFollow).toHaveBeenCalledExactlyOnceWith('b');
		store.dispose();
	});

	it('remembers "stay here" across a reload and does not follow on re-entry', async () => {
		const read = reader({ a: matched('a', 'b'), b: stillPlaying('b') });
		const intent = memoryFollowIntentStore(['a']); // what sessionStorage holds after the reload
		const store = new SpectatorFollowStore(intent, read);
		const onFollow = vi.fn();
		store.onFollow = onFollow;

		store.init('a');
		await vi.advanceTimersByTimeAsync(0);

		expect(store.following).toBe(false);
		expect(onFollow).not.toHaveBeenCalled();
		expect(store.nextGameId).toBe('b'); // still offered explicitly
		store.dispose();
	});

	it('keeps the last readable result on a transient failure and retries', async () => {
		const chain: Record<string, PublicContinuation> = { a: offerOpen('a') };
		let fail = false;
		const read = vi.fn(async (id: string) => {
			if (fail) throw new ContinuationError(503);
			const state = chain[id];
			if (!state) throw new ContinuationError(404);
			return state;
		});
		const store = new SpectatorFollowStore(memoryFollowIntentStore(), read);
		const onFollow = vi.fn();
		store.onFollow = onFollow;

		store.init('a');
		store.sourceEnded();
		await vi.advanceTimersByTimeAsync(0);
		expect(store.status).toBe('waiting');

		fail = true;
		await vi.advanceTimersByTimeAsync(1000);
		expect(store.error).not.toBeNull();
		expect(store.status).toBe('waiting'); // the last readable result stays on screen
		expect(onFollow).not.toHaveBeenCalled();

		const callsAfterFailure = read.mock.calls.length;
		await vi.advanceTimersByTimeAsync(500);
		expect(read.mock.calls.length).toBe(callsAfterFailure); // backed off, not hammering

		fail = false;
		store.retry();
		await vi.advanceTimersByTimeAsync(0);
		expect(store.error).toBeNull();
		store.dispose();
	});

	it('does not chase a successor it cannot read, and recovers when it can', async () => {
		const chain: Record<string, PublicContinuation> = { a: matched('a', 'b') };
		const read = reader(chain);
		const store = new SpectatorFollowStore(memoryFollowIntentStore(), read);
		const onFollow = vi.fn();
		store.onFollow = onFollow;

		store.init('a');
		store.sourceEnded();
		await vi.advanceTimersByTimeAsync(0);

		// A broken link: the source names a successor that does not answer.
		expect(onFollow).not.toHaveBeenCalled();
		expect(store.status).toBe('matched');
		expect(store.nextGameId).toBe('b');
		expect(store.error).not.toBeNull();

		chain.b = stillPlaying('b');
		store.retry();
		await vi.advanceTimersByTimeAsync(0);
		expect(onFollow).toHaveBeenCalledExactlyOnceWith('b');
		store.dispose();
	});

	it('treats an unknown source as a closed chain instead of retrying forever', async () => {
		const read = reader({});
		const store = new SpectatorFollowStore(memoryFollowIntentStore(), read);

		store.init('gone');
		store.sourceEnded();
		await vi.advanceTimersByTimeAsync(0);

		expect(store.status).toBe('closed');
		const calls = read.mock.calls.length;
		await vi.advanceTimersByTimeAsync(10000);
		expect(read.mock.calls.length).toBe(calls);
		store.dispose();
	});

	it('does not re-read a closed chain when the tab comes back to the foreground', async () => {
		const read = reader({ a: closed('a') });
		const store = new SpectatorFollowStore(memoryFollowIntentStore(), read);

		store.init('a');
		store.sourceEnded();
		await vi.advanceTimersByTimeAsync(0);
		expect(store.status).toBe('closed');

		const calls = read.mock.calls.length;
		window.dispatchEvent(new Event('focus'));
		document.dispatchEvent(new Event('visibilitychange'));
		await vi.advanceTimersByTimeAsync(0);

		expect(read.mock.calls.length).toBe(calls);
		// The explicit way back still works: a viewer asking is not a background poll.
		store.retry();
		await vi.advanceTimersByTimeAsync(0);
		expect(read.mock.calls.length).toBe(calls + 1);
		store.dispose();
	});

	it('stops the loop on navigation and never follows after dispose', async () => {
		const releases: Array<() => void> = [];
		const read = vi.fn(
			async (id: string) =>
				new Promise<PublicContinuation>((resolve) => {
					releases.push(() => resolve(matched(id, 'b')));
				}),
		);
		const store = new SpectatorFollowStore(memoryFollowIntentStore(), read);
		const onFollow = vi.fn();
		store.onFollow = onFollow;

		store.init('a');
		store.dispose(); // the viewer navigated away while the read was in flight
		for (const release of releases) release();
		await vi.advanceTimersByTimeAsync(2000);

		expect(onFollow).not.toHaveBeenCalled();
		expect(read).toHaveBeenCalledTimes(1);
	});

	it('drops an in-flight resolution that belongs to the previous game', async () => {
		const pending = new Map<string, (state: PublicContinuation) => void>();
		const read = vi.fn(
			async (id: string) => new Promise<PublicContinuation>((resolve) => pending.set(id, resolve)),
		);
		const store = new SpectatorFollowStore(memoryFollowIntentStore(), read);
		const onFollow = vi.fn();
		store.onFollow = onFollow;

		store.init('a');
		store.init('b'); // followed the chain onward before A's read landed
		pending.get('a')?.(matched('a', 'stale'));
		await vi.advanceTimersByTimeAsync(0);

		expect(onFollow).not.toHaveBeenCalled();

		pending.get('b')?.(closed('b'));
		await vi.advanceTimersByTimeAsync(0);
		expect(store.status).toBe('closed');
		store.dispose();
	});

	it('stops polling once the chain is closed', async () => {
		const chain: Record<string, PublicContinuation> = { a: offerOpen('a') };
		const read = reader(chain);
		const store = new SpectatorFollowStore(memoryFollowIntentStore(), read);

		store.init('a');
		store.sourceEnded();
		await vi.advanceTimersByTimeAsync(0);

		chain.a = closed('a');
		await vi.advanceTimersByTimeAsync(1000);
		expect(store.status).toBe('closed');

		const calls = read.mock.calls.length;
		await vi.advanceTimersByTimeAsync(10000);
		expect(read.mock.calls.length).toBe(calls);
		store.dispose();
	});
});
