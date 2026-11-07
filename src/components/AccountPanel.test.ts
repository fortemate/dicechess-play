import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, within } from '@testing-library/svelte';
import type { CategoryRating } from '#lib/leaderboard/leaderboardApi.js';

vi.mock('$app/paths', () => ({
	resolve: (path: string, params?: Record<string, string>) =>
		params ? path.replace(/\[(\w+)\]/g, (_, key) => params[key]) : path,
}));

const toasts = vi.hoisted(() => ({
	toastStore: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('#lib/toastStore.svelte.js', () => toasts);

// A mutable stand-in for the store: these tests are about how each rename outcome is surfaced, and
// the real store can only produce those outcomes by talking to play-api.
type MockCategoryRating = CategoryRating;

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
vi.mock('#lib/authStore.svelte.js', () => auth);

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

	it('shows all speeds as unrated when no category has been measured, without the legacy scalar', () => {
		signIn();
		const { getByText, getByRole, getAllByLabelText, queryByText } = render(AccountPanel);
		expect(getByText('BraveDie')).toBeTruthy();
		expect(getByRole('heading', { name: 'Competitive ratings' })).toBeTruthy();
		expect(getAllByLabelText('Unrated at this speed')).toHaveLength(3);
		expect(queryByText(/^1,?500$/)).toBeNull();
	});

	it('renders a sparse measured speed with uncertainty and keeps missing blitz unrated', () => {
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
			],
		});
		const { getAllByRole, queryByText } = render(AccountPanel);
		const rows = getAllByRole('listitem');
		expect(rows.map((row) => row.firstElementChild?.textContent?.trim())).toEqual([
			'Bullet',
			'Blitz',
			'Rapid',
		]);
		expect(within(rows[0]).getByText('1,481')).toBeTruthy();
		expect(within(rows[0]).getByText('95% interval 1,108–1,853')).toBeTruthy();
		expect(within(rows[0]).getByText('provisional')).toBeTruthy();
		for (const row of [rows[1], rows[2]]) {
			expect(within(row).getByLabelText('Unrated at this speed')).toBeTruthy();
			expect(within(row).queryByText('provisional')).toBeNull();
		}
		expect(queryByText(/^1,?500$/)).toBeNull();
	});

	it('explains a provisional rating, so a missing board entry does not read as a bug', () => {
		signIn({
			ratings: [
				{
					category: 'blitz',
					rating: 1300,
					rd: 150,
					provisional: true,
					games: 2,
					wins: 1,
					draws: 0,
					losses: 1,
				},
			],
		});
		const { getByText } = render(AccountPanel);
		expect(getByText(/provisional/i)).toBeTruthy();
	});

	it('says nothing about provisional once the rating has settled', () => {
		signIn({
			provisional: true,
			ratings: [
				{
					category: 'blitz',
					rating: 1300,
					rd: 50,
					provisional: false,
					games: 12,
					wins: 6,
					draws: 0,
					losses: 6,
				},
			],
		});
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
