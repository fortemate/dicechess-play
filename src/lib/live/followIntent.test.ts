import { describe, expect, it } from 'vitest';
import {
	createFollowIntentStore,
	FOLLOW_INTENT_KEY,
	MAX_PINNED,
	memoryFollowIntentStore,
	type IntentStorage,
} from './followIntent';

function fakeStorage(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	const storage: IntentStorage = {
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => void data.set(key, value),
		removeItem: (key) => void data.delete(key),
	};
	return { storage, data };
}

describe('followIntent', () => {
	it('pins a game and reads it back — the choice survives a reload', () => {
		const { storage, data } = fakeStorage();
		const store = createFollowIntentStore(() => storage);

		expect(store.isPinned('game-a')).toBe(false);
		store.pin('game-a');

		expect(store.isPinned('game-a')).toBe(true);
		expect(JSON.parse(data.get(FOLLOW_INTENT_KEY) as string)).toEqual(['game-a']);
		// A fresh store over the same storage is what a reload looks like.
		expect(createFollowIntentStore(() => storage).isPinned('game-a')).toBe(true);
	});

	it('pins each game independently and unpins only the named one', () => {
		const { storage } = fakeStorage();
		const store = createFollowIntentStore(() => storage);

		store.pin('game-a');
		store.pin('game-b');
		store.unpin('game-a');

		expect(store.isPinned('game-a')).toBe(false);
		expect(store.isPinned('game-b')).toBe(true);
	});

	it('is idempotent on repeated pins and unknown unpins', () => {
		const { storage, data } = fakeStorage();
		const store = createFollowIntentStore(() => storage);

		store.pin('game-a');
		store.pin('game-a');
		store.unpin('never-pinned');

		expect(JSON.parse(data.get(FOLLOW_INTENT_KEY) as string)).toEqual(['game-a']);
	});

	it('bounds how many games a tab remembers, keeping the most recent', () => {
		const { storage, data } = fakeStorage();
		const store = createFollowIntentStore(() => storage);

		for (let i = 0; i < MAX_PINNED + 5; i += 1) store.pin(`game-${i}`);

		const stored = JSON.parse(data.get(FOLLOW_INTENT_KEY) as string) as string[];
		expect(stored).toHaveLength(MAX_PINNED);
		expect(stored[0]).toBe(`game-${MAX_PINNED + 4}`);
		expect(store.isPinned('game-0')).toBe(false);
	});

	it('follows normally when storage is unusable or corrupt', () => {
		const corrupt = createFollowIntentStore(
			() => fakeStorage({ [FOLLOW_INTENT_KEY]: '{' }).storage,
		);
		expect(corrupt.isPinned('game-a')).toBe(false);

		const wrongShape = createFollowIntentStore(
			() => fakeStorage({ [FOLLOW_INTENT_KEY]: '{"pinned":true}' }).storage,
		);
		expect(wrongShape.isPinned('game-a')).toBe(false);

		const throwing = createFollowIntentStore(() => {
			throw new Error('sandboxed frame');
		});
		expect(throwing.isPinned('game-a')).toBe(false);
		expect(() => throwing.pin('game-a')).not.toThrow();
	});

	it('drops non-string entries rather than trusting stored junk', () => {
		const { storage } = fakeStorage({ [FOLLOW_INTENT_KEY]: '["game-a", 7, null, ""]' });
		const store = createFollowIntentStore(() => storage);

		expect(store.isPinned('game-a')).toBe(true);
		store.pin('game-b');
		expect(store.isPinned('game-b')).toBe(true);
	});

	it('memory store behaves like the persistent one', () => {
		const store = memoryFollowIntentStore(['game-a']);

		expect(store.isPinned('game-a')).toBe(true);
		store.unpin('game-a');
		store.pin('game-b');

		expect(store.isPinned('game-a')).toBe(false);
		expect(store.isPinned('game-b')).toBe(true);
	});
});
