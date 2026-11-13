import { describe, expect, it } from 'vitest';
import {
	buildLabBoardUrl,
	buildLabInviteUrl,
	loadRoomAccess,
	parseLabLocation,
	saveRoomAccess,
	type RoomAccess,
	type SeatAccess,
} from './seatLinks';

const gameId = 'a12b3456-7890-4abc-def0-1234567890ab';
const white: SeatAccess = { gameId, seat: 'White', token: 'white_dummy-token_1' };
const black: SeatAccess = { gameId, seat: 'Black', token: 'black_dummy-token_2' };

class MemoryStorage {
	private readonly values = new Map<string, string>();
	throwOnRead = false;
	throwOnWrite = false;

	getItem(key: string): string | null {
		if (this.throwOnRead) throw new Error('storage unavailable');
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		if (this.throwOnWrite) throw new Error('storage unavailable');
		this.values.set(key, value);
	}

	removeItem(key: string): void {
		this.values.delete(key);
	}

	clear(): void {
		this.values.clear();
	}

	key(index: number): string | null {
		return [...this.values.keys()][index] ?? null;
	}

	get length(): number {
		return this.values.size;
	}
}

const storageLike = (storage: MemoryStorage) => storage as unknown as Storage;

describe('laboratory seat links', () => {
	it('puts only the opponent token in invite links for either seat color', () => {
		const url = new URL(buildLabInviteUrl('https://play.example', black));
		expect(url.pathname).toBe(`/invite/${gameId}`);
		expect(url.search).toBe('');
		expect(url.hash).toBe('#token=black_dummy-token_2&as=black');
		expect(url.href).not.toContain(white.token);
		expect(buildLabInviteUrl('https://play.example', white)).toBe(
			`https://play.example/invite/${gameId}#token=${white.token}&as=white`,
		);
		expect(buildLabBoardUrl('https://play.example', white)).toBe(
			`https://play.example/game/${gameId}#token=${white.token}&as=white`,
		);
		expect(buildLabBoardUrl('https://play.example', black)).toBe(
			`https://play.example/game/${gameId}#token=${black.token}&as=black`,
		);
	});

	it('rejects noncanonical origins and invalid access data without echoing credentials', () => {
		for (const origin of [
			'//play.example',
			'ftp://play.example',
			'https://user:pass@play.example',
			'https://play.example/path',
			'https://play.example?mode=lab',
			'https://play.example#fragment',
			'https://PLAY.example',
		]) {
			expect(() => buildLabBoardUrl(origin, black)).toThrow('Invalid laboratory link input');
		}
		const invalid = { ...black, token: 'private dummy credential!' };
		try {
			buildLabBoardUrl('https://play.example', invalid);
			throw new Error('expected invalid access to throw');
		} catch (error) {
			expect((error as Error).message).toBe('Invalid laboratory link input');
			expect((error as Error).message).not.toContain(invalid.token);
		}
		expect(() => buildLabBoardUrl('https://play.example', { ...black, gameId: 'g1' })).toThrow(
			'Invalid laboratory link input',
		);
	});

	it('parses home, board, invite, and tokenless links with lowercase UUIDs', () => {
		expect(parseLabLocation(new URL('https://play.example/'))).toEqual({ kind: 'home' });
		expect(
			parseLabLocation(new URL(`https://play.example/invite/${gameId.toUpperCase()}`)),
		).toEqual({
			kind: 'invite',
			gameId,
			access: null,
		});
		expect(parseLabLocation(new URL(buildLabBoardUrl('https://play.example', white)))).toEqual({
			kind: 'board',
			gameId,
			access: white,
		});
		expect(parseLabLocation(new URL(buildLabInviteUrl('https://play.example', black)))).toEqual({
			kind: 'invite',
			gameId,
			access: black,
		});
	});

	it('rejects malformed, duplicate, partial, unknown, and query-based credentials', () => {
		const invalidUrls = [
			`https://play.example/game/${gameId}#token=x`,
			`https://play.example/game/${gameId}#as=white`,
			`https://play.example/game/${gameId}#token=x&token=y&as=white`,
			`https://play.example/game/${gameId}#token=x&as=white&as=black`,
			`https://play.example/game/${gameId}#token=x&as=white&extra=1`,
			`https://play.example/game/${gameId}#token=x&as=white&`,
			`https://play.example/game/${gameId}#&token=x&as=white`,
			`https://play.example/game/${gameId}#token=x&&as=white`,
			`https://play.example/game/${gameId}#token=has%20space&as=white`,
			`https://play.example/game/${gameId}?seat=x`,
			`https://play.example/invite/${gameId}?token=x`,
			`https://play.example/game/${gameId}?as=white`,
			`https://play.example/game/not-a-uuid#token=x&as=white`,
			`https://play.example/other/${gameId}`,
			`https://play.example/game/${gameId}/extra`,
		];
		for (const value of invalidUrls) {
			expect(parseLabLocation(new URL(value))).toEqual({ kind: 'invalid' });
		}
	});

	it('round trips a versioned room and preserves an existing invitation when omitted', () => {
		const storage = storageLike(new MemoryStorage());
		const room: RoomAccess = { mine: white, invitation: black };
		expect(saveRoomAccess(storage, room)).toBe(true);
		expect(JSON.parse(storage.getItem(`dicechess-laboratory-room:${gameId}`)!)).toMatchObject({
			schemaVersion: 1,
		});
		expect(loadRoomAccess(storage, gameId)).toEqual(room);
		expect(saveRoomAccess(storage, { mine: white })).toBe(true);
		expect(loadRoomAccess(storage, gameId)).toEqual(room);
	});

	it('returns null for corrupt, unsupported, cross-game, or blocked storage', () => {
		const memory = new MemoryStorage();
		const storage = storageLike(memory);
		const key = `dicechess-laboratory-room:${gameId}`;
		memory.setItem(key, '{');
		expect(loadRoomAccess(storage, gameId)).toBeNull();
		memory.setItem(key, JSON.stringify({ schemaVersion: 2, room: { mine: white } }));
		expect(loadRoomAccess(storage, gameId)).toBeNull();
		memory.setItem(
			key,
			JSON.stringify({
				schemaVersion: 1,
				room: { mine: { ...white, gameId: 'b12b3456-7890-4abc-def0-1234567890ab' } },
			}),
		);
		expect(loadRoomAccess(storage, gameId)).toBeNull();
		expect(loadRoomAccess(storage, 'bad-id')).toBeNull();
		memory.throwOnRead = true;
		expect(loadRoomAccess(storage, gameId)).toBeNull();
		expect(saveRoomAccess(storage, { mine: white })).toBe(false);
		memory.throwOnRead = false;
		memory.throwOnWrite = true;
		expect(saveRoomAccess(storage, { mine: white })).toBe(false);
	});

	it('rejects invalid or same-seat invitations and protects the original seat slot', () => {
		const storage = storageLike(new MemoryStorage());
		expect(saveRoomAccess(storage, { mine: white, invitation: { ...white, token: 'other' } })).toBe(
			false,
		);
		expect(
			saveRoomAccess(storage, { mine: white, invitation: { ...black, token: white.token } }),
		).toBe(false);
		expect(saveRoomAccess(storage, { mine: white })).toBe(true);
		expect(saveRoomAccess(storage, { mine: { ...white, seat: 'Black' } })).toBe(false);
		expect(saveRoomAccess(storage, { mine: { ...white, token: 'replacement' } })).toBe(false);
		expect(loadRoomAccess(storage, gameId)).toEqual({ mine: white });
	});
});
