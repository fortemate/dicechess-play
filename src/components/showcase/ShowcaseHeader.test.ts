import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';

vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));

const auth = vi.hoisted(() => ({
	authStore: {
		status: 'loading' as 'loading' | 'signed-in' | 'signed-out' | 'unavailable',
		canSignIn: true,
		nickname: null as string | null,
		initial: null as string | null,
		signIn: vi.fn(),
	},
}));
vi.mock('$lib/authStore.svelte', () => auth);

import ShowcaseHeader from './ShowcaseHeader.svelte';

function signedIn(nickname = 'BraveDie', initial = 'B') {
	auth.authStore.status = 'signed-in';
	auth.authStore.nickname = nickname;
	auth.authStore.initial = initial;
}

describe('ShowcaseHeader', () => {
	beforeEach(() => {
		auth.authStore.status = 'loading';
		auth.authStore.canSignIn = true;
		auth.authStore.nickname = null;
		auth.authStore.initial = null;
		auth.authStore.signIn.mockReset();
	});

	it('renders brand mark, name and navigation links', () => {
		const { getByRole, getAllByText } = render(ShowcaseHeader);

		expect(getByRole('link', { name: /fortemate/i })).toBeTruthy();
		expect(getAllByText(/play bots & friends/i).length).toBeGreaterThan(0);
		expect(getAllByText(/how to play/i).length).toBeGreaterThan(0);
	});

	describe('auth integration via AuthMenu', () => {
		it('renders sign-in button when signed out and canSignIn is true', () => {
			auth.authStore.status = 'signed-out';
			const { getByRole } = render(ShowcaseHeader);

			const signInBtn = getByRole('button', { name: /sign in/i });
			expect(signInBtn).toBeTruthy();
		});

		it('triggers signIn() when sign-in button is clicked', async () => {
			auth.authStore.status = 'signed-out';
			const { getByRole } = render(ShowcaseHeader);

			const signInBtn = getByRole('button', { name: /sign in/i });
			await fireEvent.click(signInBtn);
			expect(auth.authStore.signIn).toHaveBeenCalledOnce();
		});

		it('renders profile link with nickname and initial when signed in', () => {
			signedIn('Grandmaster', 'G');
			const { getByRole, getByText } = render(ShowcaseHeader);

			const profileLink = getByRole('link', { name: /grandmaster/i });
			expect(profileLink.getAttribute('href')).toBe('/me');
			expect(profileLink.getAttribute('title')).toBe('Your profile');
			expect(profileLink.textContent).toContain('Grandmaster');
			expect(getByText('G')).toBeTruthy();
		});

		it('renders no sign-in button while loading', () => {
			auth.authStore.status = 'loading';
			const { queryByRole } = render(ShowcaseHeader);

			expect(queryByRole('button', { name: /sign in/i })).toBeNull();
		});

		it('renders no sign-in button when auth is unavailable', () => {
			auth.authStore.status = 'unavailable';
			const { queryByRole } = render(ShowcaseHeader);

			expect(queryByRole('button', { name: /sign in/i })).toBeNull();
		});
	});
});
