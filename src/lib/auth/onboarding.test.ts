import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isOnboarded, markOnboarded } from './onboarding';

/** A minimal in-memory localStorage, plus a switch to make every call throw (private mode). */
function fakeStorage(throwing = false) {
	const map = new Map<string, string>();
	return {
		getItem: (k: string) => {
			if (throwing) throw new DOMException('blocked');
			return map.get(k) ?? null;
		},
		setItem: (k: string, v: string) => {
			if (throwing) throw new DOMException('blocked');
			map.set(k, v);
		},
		removeItem: (k: string) => void map.delete(k),
		clear: () => map.clear(),
		key: () => null,
		length: 0,
	};
}

describe('onboarding guard', () => {
	beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
	afterEach(() => vi.unstubAllGlobals());

	it('reports a fresh account as not yet onboarded', () => {
		expect(isOnboarded('account-a')).toBe(false);
	});

	it('remembers an account once marked', () => {
		markOnboarded('account-a');
		expect(isOnboarded('account-a')).toBe(true);
	});

	it('keys per account, so a second person on a shared browser gets their own onboarding', () => {
		markOnboarded('account-a');
		expect(isOnboarded('account-b')).toBe(false);
	});

	describe('when storage is unavailable', () => {
		it('reports not-onboarded rather than silently skipping the prompt', () => {
			vi.stubGlobal('localStorage', fakeStorage(true));
			// The safe direction: a repeated prompt is an annoyance, a never-shown guest-claim offer
			// loses history the person cannot recover without knowing the feature exists.
			expect(isOnboarded('account-a')).toBe(false);
		});

		it('does not throw when marking', () => {
			vi.stubGlobal('localStorage', fakeStorage(true));
			expect(() => markOnboarded('account-a')).not.toThrow();
		});

		it('survives localStorage being absent entirely', () => {
			vi.stubGlobal('localStorage', undefined);
			expect(isOnboarded('account-a')).toBe(false);
			expect(() => markOnboarded('account-a')).not.toThrow();
		});
	});
});
