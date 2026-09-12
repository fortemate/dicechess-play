import { afterEach, describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { render } from '@testing-library/svelte';
import ToastContainer from './ToastContainer.svelte';
import { toastStore } from '../lib/toastStore.svelte';
import { m } from '$lib/paraglide/messages.js';

afterEach(() => {
	toastStore.toasts = [];
});

describe('ToastContainer', () => {
	it('mounts the live region up front so later toasts are announced', () => {
		const { container } = render(ToastContainer);
		const region = container.querySelector('[aria-live="polite"]');
		expect(region).not.toBeNull();
		expect(region?.getAttribute('aria-atomic')).toBe('false');
	});

	it('renders pushed toasts inside the live region', () => {
		const { container } = render(ToastContainer);
		toastStore.info(m.game_toast_no_legal_moves_you());
		flushSync();
		const region = container.querySelector('[aria-live="polite"]');
		expect(region?.textContent).toContain(m.game_toast_no_legal_moves_you());
	});
});
