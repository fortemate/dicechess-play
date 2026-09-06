import { describe, expect, it } from 'vitest';
import {
	createSeatStore,
	memorySeatStore,
	SEAT_STORAGE_KEY,
	type SeatStorage,
} from './showcaseSeat';

function fakeStorage(
	initial: Record<string, string> = {},
): SeatStorage & { data: Map<string, string> } {
	const data = new Map(Object.entries(initial));
	return {
		data,
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => void data.set(key, value),
		removeItem: (key) => void data.delete(key),
	};
}

describe('showcaseSeat', () => {
	const seat = { gameId: 'game-1', seatToken: 'tok-1', seat: 'White' as const };

	it('round-trips a seat through the tab storage and clears it', () => {
		const storage = fakeStorage();
		const store = createSeatStore(() => storage);
		expect(store.load()).toBeNull();

		store.save(seat);
		expect(storage.data.get(SEAT_STORAGE_KEY)).toBe(JSON.stringify(seat));
		expect(store.load()).toEqual(seat);

		store.clear();
		expect(store.load()).toBeNull();
		expect(storage.data.has(SEAT_STORAGE_KEY)).toBe(false);
	});

	it('treats corrupt or foreign content as no seat', () => {
		expect(
			createSeatStore(() => fakeStorage({ [SEAT_STORAGE_KEY]: '{not json' })).load(),
		).toBeNull();
		expect(
			createSeatStore(() =>
				fakeStorage({ [SEAT_STORAGE_KEY]: JSON.stringify({ gameId: 'g' }) }),
			).load(),
		).toBeNull();
		expect(
			createSeatStore(() =>
				fakeStorage({
					[SEAT_STORAGE_KEY]: JSON.stringify({ gameId: 'g', seatToken: 't', seat: 'Red' }),
				}),
			).load(),
		).toBeNull();
	});

	it('never throws when storage is missing or hostile', () => {
		const none = createSeatStore(() => null);
		expect(() => none.save(seat)).not.toThrow();
		expect(none.load()).toBeNull();
		expect(() => none.clear()).not.toThrow();

		const hostile: SeatStorage = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			},
			removeItem: () => {
				throw new Error('blocked');
			},
		};
		const guarded = createSeatStore(() => hostile);
		expect(() => guarded.save(seat)).not.toThrow();
		expect(guarded.load()).toBeNull();
		expect(() => guarded.clear()).not.toThrow();
	});

	it('memorySeatStore keeps a seat for the lifetime of the object only', () => {
		const store = memorySeatStore(seat);
		expect(store.load()).toEqual(seat);
		store.clear();
		expect(store.load()).toBeNull();
		store.save({ ...seat, seat: 'Black' });
		expect(store.load()?.seat).toBe('Black');
	});
});
