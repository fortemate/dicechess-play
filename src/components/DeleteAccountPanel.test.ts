import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';

const toasts = vi.hoisted(() => ({
	toastStore: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('$lib/toastStore.svelte', () => toasts);

const auth = vi.hoisted(() => ({
	authStore: {
		status: 'signed-in' as 'signed-in' | 'signed-out',
		nickname: 'BraveDie' as string | null,
		remove: vi.fn(),
	},
}));
vi.mock('$lib/authStore.svelte', () => auth);

import DeleteAccountPanel from './DeleteAccountPanel.svelte';

// The narrow signature actually used. `RenderResult`'s query map is typed as a union that includes
// `null` and promises, so passing the whole result around fights the type system for no benefit.
type GetByRole = (role: string, options?: { name?: RegExp | string }) => HTMLElement;

/**
 * Opens the panel and returns its confirm field and submit button. The trigger unmounts when the
 * panel opens, so after this there is exactly one "Delete my account" button — the submit.
 */
async function openPanel(getByRole: GetByRole) {
	await fireEvent.click(getByRole('button', { name: /delete my account/i }));
	return {
		field: getByRole('textbox') as HTMLInputElement,
		submit: getByRole('button', { name: /^delete my account$/i }) as HTMLButtonElement,
	};
}

describe('DeleteAccountPanel', () => {
	beforeEach(() => {
		auth.authStore.status = 'signed-in';
		auth.authStore.nickname = 'BraveDie';
		auth.authStore.remove.mockReset();
		toasts.toastStore.info.mockReset();
		toasts.toastStore.error.mockReset();
	});

	it('renders nothing for a guest', () => {
		auth.authStore.status = 'signed-out';
		const { container } = render(DeleteAccountPanel);
		expect(container.textContent?.trim()).toBe('');
	});

	it('keeps the destructive action behind a disabled submit until the name is echoed', async () => {
		const { getByRole } = render(DeleteAccountPanel);
		const { submit } = await openPanel(getByRole);
		expect(submit.disabled).toBe(true);
	});

	describe('the confirmation guard', () => {
		it('accepts the exact nickname', async () => {
			const { getByRole } = render(DeleteAccountPanel);
			const { field, submit } = await openPanel(getByRole);
			await fireEvent.input(field, { target: { value: 'BraveDie' } });
			expect(submit.disabled).toBe(false);
		});

		it('accepts a different casing, because play-api compares with equalsIgnoreCase', async () => {
			// Pinned deliberately: tightening this to an exact match would refuse input the server
			// accepts. play-api's own suite creates "DelNick" and deletes with "delnick".
			const { getByRole } = render(DeleteAccountPanel);
			const { field, submit } = await openPanel(getByRole);
			await fireEvent.input(field, { target: { value: 'bravedie' } });
			expect(submit.disabled).toBe(false);
		});

		it('ignores surrounding whitespace, which the server also trims', async () => {
			const { getByRole } = render(DeleteAccountPanel);
			const { field, submit } = await openPanel(getByRole);
			await fireEvent.input(field, { target: { value: '  BraveDie  ' } });
			expect(submit.disabled).toBe(false);
		});

		it('refuses a different name', async () => {
			const { getByRole } = render(DeleteAccountPanel);
			const { field, submit } = await openPanel(getByRole);
			await fireEvent.input(field, { target: { value: 'SomeoneElse' } });
			expect(submit.disabled).toBe(true);
		});
	});

	it('deletes through the store and reports the outcome', async () => {
		auth.authStore.remove.mockResolvedValue({ outcome: 'deleted' });
		const view = render(DeleteAccountPanel);
		const { field, submit } = await openPanel(view.getByRole);
		await fireEvent.input(field, { target: { value: 'BraveDie' } });

		await fireEvent.click(submit);
		expect(auth.authStore.remove).toHaveBeenCalledWith('BraveDie');
		await waitFor(() => expect(toasts.toastStore.info).toHaveBeenCalled());
	});

	it('surfaces a server refusal inline instead of closing', async () => {
		auth.authStore.remove.mockResolvedValue({
			outcome: 'invalid',
			reason: 'confirm must be your current nickname',
		});
		const view = render(DeleteAccountPanel);
		const { field, submit } = await openPanel(view.getByRole);
		await fireEvent.input(field, { target: { value: 'BraveDie' } });

		await fireEvent.click(submit);
		await waitFor(() =>
			expect(view.getByText('confirm must be your current nickname')).toBeTruthy(),
		);
	});
});
