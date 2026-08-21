import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';

// The menu links out via resolve(); stub it so the component renders without the SvelteKit runtime.
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));

// A mutable stand-in for the store singleton: these tests are entirely about which of the four auth
// states renders what, and the real store can only reach them by talking to play-api.
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

import AuthMenu from './AuthMenu.svelte';

function signedIn(nickname = 'BraveDie', initial = 'B') {
	auth.authStore.status = 'signed-in';
	auth.authStore.nickname = nickname;
	auth.authStore.initial = initial;
}

describe('AuthMenu', () => {
	beforeEach(() => {
		auth.authStore.status = 'loading';
		auth.authStore.canSignIn = true;
		auth.authStore.nickname = null;
		auth.authStore.initial = null;
		auth.authStore.signIn.mockReset();
	});

	describe('renders nothing at all', () => {
		it('while the session is still being checked, rather than flashing "Sign in"', () => {
			const { container, queryByRole } = render(AuthMenu);
			expect(queryByRole('button')).toBeNull();
			expect(container.textContent?.trim()).toBe('');
		});

		it('when play-api cannot be reached — a button that cannot work is a dead end', () => {
			auth.authStore.status = 'unavailable';
			const { container, queryByRole } = render(AuthMenu);
			expect(queryByRole('button')).toBeNull();
			expect(container.textContent?.trim()).toBe('');
		});

		it('when accounts are not available in this build, even though nobody is signed in', () => {
			auth.authStore.status = 'signed-out';
			auth.authStore.canSignIn = false;
			const { queryByRole } = render(AuthMenu);
			expect(queryByRole('button')).toBeNull();
		});
	});

	describe('signed out', () => {
		beforeEach(() => {
			auth.authStore.status = 'signed-out';
		});

		it('offers one low-key sign-in control — signing in is optional here', () => {
			const { getByRole } = render(AuthMenu);
			expect(getByRole('button', { name: /sign in/i })).toBeTruthy();
		});

		it('starts the login round-trip through the store, not with its own navigation', async () => {
			const { getByRole } = render(AuthMenu);
			await fireEvent.click(getByRole('button', { name: /sign in/i }));
			expect(auth.authStore.signIn).toHaveBeenCalledOnce();
		});
	});

	describe('signed in', () => {
		it('shows the nickname and links to the profile', () => {
			signedIn();
			const { getByRole } = render(AuthMenu);
			const link = getByRole('link');
			expect(link.getAttribute('href')).toBe('/me');
			expect(link.textContent).toContain('BraveDie');
		});

		it('shows the derived initial, and hides it from assistive tech as decoration', () => {
			signedIn('BraveDie', 'B');
			const { container } = render(AuthMenu);
			const badge = container.querySelector('[aria-hidden="true"]');
			expect(badge?.textContent?.trim()).toBe('B');
		});

		it('offers no sign-in control once signed in', () => {
			signedIn();
			const { queryByRole } = render(AuthMenu);
			expect(queryByRole('button', { name: /sign in/i })).toBeNull();
		});
	});
});
