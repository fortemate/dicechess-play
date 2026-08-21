import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toastStore } from './toastStore.svelte';

beforeEach(() => {
	toastStore.toasts = [];
	vi.useFakeTimers();
});
afterEach(() => {
	// Drain any pending dismissal timers so tests don't leak toasts into each other.
	vi.runAllTimers();
	vi.useRealTimers();
});

describe('toastStore coalescing', () => {
	it('collapses a burst of identical toasts into a single one', () => {
		for (let i = 0; i < 11; i++) toastStore.info('Opponent has no legal moves — turn passed.');
		expect(toastStore.toasts).toHaveLength(1);
	});

	it('keeps distinct messages, and same text with a different type, separate', () => {
		toastStore.info('Hello');
		toastStore.info('World');
		toastStore.error('Hello'); // same text, different type → not coalesced
		expect(toastStore.toasts.map((t) => `${t.type}:${t.text}`)).toEqual([
			'info:Hello',
			'info:World',
			'error:Hello',
		]);
	});

	it('a coalesced repeat refreshes the dismissal timer instead of stacking', () => {
		toastStore.info('Pass', 3000);
		vi.advanceTimersByTime(2000); // 1s left on the original
		toastStore.info('Pass', 3000); // coalesced → timer reset to 3s
		vi.advanceTimersByTime(2000); // 4s since first, but only 2s since the refresh
		expect(toastStore.toasts).toHaveLength(1); // still alive thanks to the refresh
		vi.advanceTimersByTime(1500); // now past the refreshed 3s
		expect(toastStore.toasts).toHaveLength(0);
	});

	it('auto-dismisses after the duration and clears its timer', () => {
		toastStore.success('Done', 3000);
		expect(toastStore.toasts).toHaveLength(1);
		vi.advanceTimersByTime(3000);
		expect(toastStore.toasts).toHaveLength(0);
	});
});
