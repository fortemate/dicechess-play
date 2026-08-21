import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getGuestId, getGuestUuid, setGuestId, resetGuestId } from './guestIdentity';

const VALID_CODE = 'guest:0190a000-1111-7222-8333-444455556666';

describe('guestIdentity', () => {
	const localStorageMock = (() => {
		let store: Record<string, string> = {};
		return {
			getItem: vi.fn((key: string) => store[key] ?? null),
			setItem: vi.fn((key: string, value: string) => {
				store[key] = String(value);
			}),
			removeItem: vi.fn((key: string) => {
				delete store[key];
			}),
			clear: vi.fn(() => {
				store = {};
			}),
		};
	})();

	beforeEach(() => {
		vi.stubGlobal('localStorage', localStorageMock);
		localStorage.clear();
		vi.clearAllMocks();
	});

	it('mints and persists a stable guest id on first use', () => {
		const id = getGuestId();
		expect(id).toMatch(/^guest:[0-9a-f-]{36}$/i);
		expect(getGuestId()).toBe(id);
	});

	it('restores a valid pasted code', () => {
		expect(setGuestId(VALID_CODE)).toBe(true);
		expect(getGuestId()).toBe(VALID_CODE);
	});

	it('trims surrounding whitespace when restoring', () => {
		expect(setGuestId(`  ${VALID_CODE}\n`)).toBe(true);
		expect(getGuestId()).toBe(VALID_CODE);
	});

	it('rejects a malformed code without changing the stored id', () => {
		const id = getGuestId();
		expect(setGuestId('not-a-code')).toBe(false);
		expect(setGuestId('guest:short')).toBe(false);
		expect(getGuestId()).toBe(id);
	});

	it('mints a different id on reset', () => {
		const before = getGuestId();
		const after = resetGuestId();
		expect(after).toMatch(/^guest:[0-9a-f-]{36}$/i);
		expect(after).not.toBe(before);
		expect(getGuestId()).toBe(after);
	});

	it('getGuestUuid strips the guest: prefix getGuestId carries', () => {
		expect(setGuestId(VALID_CODE)).toBe(true);
		expect(getGuestUuid()).toBe('0190a000-1111-7222-8333-444455556666');
		expect(`guest:${getGuestUuid()}`).toBe(getGuestId());
	});
});
