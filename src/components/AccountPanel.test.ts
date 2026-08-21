import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';

vi.mock('$app/paths', () => ({
	resolve: (path: string, params?: Record<string, string>) =>
		params ? path.replace(/\[(\w+)\]/g, (_, key) => params[key]) : path,
}));

const toasts = vi.hoisted(() => ({
	toastStore: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('$lib/toastStore.svelte', () => toasts);

// A mutable stand-in for the store: these tests are about how each rename outcome is surfaced, and
// the real store can only produce those outcomes by talking to play-api.
type MockCategoryRating = {
	category: string;
	rating: number;
	rd: number;
	provisional: boolean;
	games: number;
	wins: number;
	draws: number;
	losses: number;
};

const auth = vi.hoisted(() => ({
	authStore: {
		account: null as {
			id: string;
			nickname: string;
			rating: number;
			rd: number;
			provisional: boolean;
			games: number;
			ratings: MockCategoryRating[];
		} | null,
		nickname: null as string | null,
		initial: null as string | null,
		rename: vi.fn(),
		signOut: vi.fn(),
	},
}));
vi.mock('$lib/authStore.svelte', () => auth);

import AccountPanel from './AccountPanel.svelte';

const ME = {
	id: 'a-uuid',
	nickname: 'BraveDie',
	rating: 1500.4,
	rd: 350,
	provisional: true,
	games: 0,
	ratings: [] as MockCategoryRating[],
};

function signIn(over: Partial<typeof ME> = {}) {
	auth.authStore.account = { ...ME, ...over };
	auth.authStore.nickname = auth.authStore.account.nickname;
	auth.authStore.initial = auth.authStore.account.nickname[0].toUpperCase();
}

// The narrow signature actually used below. `ReturnType<typeof render>['getByRole']` is a union that
// includes `null` and promises, which `fireEvent` cannot take — declaring what we use keeps the
// helper honest instead of casting at every call.
type GetByRole = (role: string, options?: { name?: RegExp | string }) => HTMLElement;

/** Opens the inline editor and submits `next`. */
async function rename(getByRole: GetByRole, next: string) {
	await fireEvent.click(getByRole('button', { name: /rename/i }));
	await fireEvent.input(getByRole('textbox', { name: /nickname/i }), { target: { value: next } });
	await fireEvent.click(getByRole('button', { name: /^save$/i }));
}

describe('AccountPanel', () => {
	beforeEach(() => {
		auth.authStore.account = null;
		auth.authStore.nickname = null;
		auth.authStore.initial = null;
		auth.authStore.rename.mockReset();
		auth.authStore.signOut.mockReset();
		toasts.toastStore.success.mockReset();
		toasts.toastStore.error.mockReset();
	});

	it('renders nothing without an account — the guest view is the page default', () => {
		const { container } = render(AccountPanel);
		expect(container.textContent?.trim()).toBe('');
	});

	it('shows the nickname and the rounded rating, labelled with its speed (#258)', () => {
		signIn();
		const { getByText } = render(AccountPanel);
		expect(getByText('BraveDie')).toBeTruthy();
		expect(getByText('1500')).toBeTruthy();
		// The scalar the wire carries IS the blitz rating since play-api #280 — the label is what
		// keeps this panel honest next to a per-speed profile.
		expect(getByText(/blitz rating/i)).toBeTruthy();
	});

	it('lists other PLAYED speeds in one compact line, and unplayed ones not at all', () => {
		signIn({
			ratings: [
				{
					category: 'bullet',
					rating: 1480.6,
					rd: 190,
					provisional: true,
					games: 4,
					wins: 1,
					draws: 1,
					losses: 2,
				},
				{
					category: 'blitz',
					rating: 1500.4,
					rd: 350,
					provisional: true,
					games: 0,
					wins: 0,
					draws: 0,
					losses: 0,
				},
			],
		});
		const { getByText, queryByText } = render(AccountPanel);
		// Bullet is played → listed (the ? marks it provisional); rapid is unplayed → invisible here,
		// the compact block earns no dash rows (the public profile shows the full per-speed view).
		expect(getByText(/Bullet\s*1481\?/)).toBeTruthy();
		expect(queryByText(/rapid/i)).toBeNull();
	});

	it('explains a provisional rating, so a missing board entry does not read as a bug', () => {
		signIn({ provisional: true });
		const { getByText } = render(AccountPanel);
		expect(getByText(/provisional/i)).toBeTruthy();
	});

	it('says nothing about provisional once the rating has settled', () => {
		signIn({ provisional: false });
		const { queryByText } = render(AccountPanel);
		expect(queryByText(/provisional/i)).toBeNull();
	});

	it("links to the account's own public profile (#213)", () => {
		signIn();
		const { getByRole } = render(AccountPanel);
		expect(getByRole('link', { name: /public profile/i }).getAttribute('href')).toBe(
			'/players/BraveDie',
		);
	});

	describe('rename', () => {
		it('delegates to the store and confirms on success', async () => {
			signIn();
			auth.authStore.rename.mockResolvedValue({
				outcome: 'updated',
				me: { ...ME, nickname: 'QuietRook' },
			});
			const { getByRole } = render(AccountPanel);

			await rename(getByRole, 'QuietRook');
			expect(auth.authStore.rename).toHaveBeenCalledWith('QuietRook');
			expect(toasts.toastStore.success).toHaveBeenCalled();
		});

		it('reports a taken nickname inline and keeps the editor open to try another', async () => {
			signIn();
			auth.authStore.rename.mockResolvedValue({ outcome: 'taken' });
			const { getByRole, getByText } = render(AccountPanel);

			await rename(getByRole, 'QuietRook');
			expect(getByText(/already taken/i)).toBeTruthy();
			// Still editable — a 409 is something the person fixes by choosing again.
			expect(getByRole('textbox', { name: /nickname/i })).toBeTruthy();
		});

		it("shows play-api's own reason verbatim rather than a guess at the rule", async () => {
			signIn();
			auth.authStore.rename.mockResolvedValue({
				outcome: 'invalid',
				reason: 'that nickname is reserved',
			});
			const { getByRole, getByText } = render(AccountPanel);

			await rename(getByRole, 'admin');
			expect(getByText('that nickname is reserved')).toBeTruthy();
		});

		it('does not call the server when the name is unchanged', async () => {
			signIn();
			const { getByRole } = render(AccountPanel);

			await rename(getByRole, 'BraveDie');
			expect(auth.authStore.rename).not.toHaveBeenCalled();
		});

		it('does not call the server for an empty name', async () => {
			signIn();
			const { getByRole } = render(AccountPanel);

			await rename(getByRole, '   ');
			expect(auth.authStore.rename).not.toHaveBeenCalled();
		});
	});

	it('signs out through the store', async () => {
		signIn();
		const { getByRole } = render(AccountPanel);
		await fireEvent.click(getByRole('button', { name: /sign out/i }));
		expect(auth.authStore.signOut).toHaveBeenCalledOnce();
	});
});
