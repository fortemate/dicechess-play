import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';

// A mutable stand-in for the store singleton, same pattern as AuthMenu.test.ts: these tests are
// entirely about which auth state offers the rated choice, and the real store can only reach those
// states by talking to play-api.
const auth = vi.hoisted(() => ({
	authStore: {
		status: 'loading' as 'loading' | 'signed-in' | 'signed-out' | 'unavailable',
		canSignIn: true,
		signIn: vi.fn(),
	},
}));
vi.mock('$lib/authStore.svelte', () => auth);

import RatedChoice from './RatedChoice.svelte';
import RatedChoiceHarness from './RatedChoiceHarness.svelte';

describe('RatedChoice', () => {
	beforeEach(() => {
		auth.authStore.status = 'loading';
		auth.authStore.canSignIn = true;
		auth.authStore.signIn.mockClear();
	});

	afterEach(() => {
		cleanup();
	});

	it('offers Casual and Rated to a signed-in account, defaulting to Casual', () => {
		auth.authStore.status = 'signed-in';
		const { getByRole } = render(RatedChoice, { name: 'seek' });
		const casual = getByRole('radio', { name: 'Casual' }) as HTMLInputElement;
		const rated = getByRole('radio', { name: 'Rated' }) as HTMLInputElement;
		expect(casual.checked).toBe(true);
		expect(rated.checked).toBe(false);
	});

	// The radio itself is `sr-only`, so the ONLY thing that shows a visitor which mode is selected is
	// the highlight class on the enclosing label. Neither /lobby nor /bots can be reviewed in a
	// Cloudflare preview (both need play-api, whose CORS is pinned to the production origin), so this
	// stands in for the visual check: a silent class typo would otherwise ship a picker that never
	// looks like it responded to a click.
	it('moves the selected-option highlight when the mode changes', async () => {
		auth.authStore.status = 'signed-in';
		const { getByRole } = render(RatedChoice, { name: 'seek' });
		const labelOf = (n: string) => getByRole('radio', { name: n }).closest('label')!;
		expect(labelOf('Casual').className).toContain('bg-primary');
		expect(labelOf('Rated').className).not.toContain('bg-primary');

		await fireEvent.click(getByRole('radio', { name: 'Rated' }));
		expect(labelOf('Rated').className).toContain('bg-primary');
		expect(labelOf('Casual').className).not.toContain('bg-primary');
	});

	it('renders nothing at all while the auth state is still loading', () => {
		// Flashing "sign in to play rated" at an account that IS signed in, for the split second before
		// authStore resolves, is the mistake AuthMenu documents — so this state shows neither branch.
		const { container } = render(RatedChoice, { name: 'seek' });
		expect(container.textContent?.trim()).toBe('');
	});

	it('tells a signed-out visitor the game will be casual, and offers sign-in', async () => {
		auth.authStore.status = 'signed-out';
		const { getByRole, getByText } = render(RatedChoice, { name: 'seek' });
		expect(getByText(/Casual game/)).toBeTruthy();
		await fireEvent.click(getByRole('button', { name: 'sign in' }));
		expect(auth.authStore.signIn).toHaveBeenCalled();
	});

	it('stays silent when play-api could not be asked who we are', () => {
		// 'unavailable' is not 'signed-out': we do not know that nobody is signed in, only that we could
		// not find out. Advertising sign-in would be a guess, and offering Rated would be worse.
		auth.authStore.status = 'unavailable';
		const { container } = render(RatedChoice, { name: 'seek' });
		expect(container.textContent?.trim()).toBe('');
	});

	it('stays silent when signing in is not offered at all', () => {
		// A deployment without play-api auth: there is no rated play to advertise and no way in.
		auth.authStore.status = 'signed-out';
		auth.authStore.canSignIn = false;
		const { container } = render(RatedChoice, { name: 'seek' });
		expect(container.textContent?.trim()).toBe('');
	});

	it('namespaces the radio group, so two of these on one page do not fight', () => {
		auth.authStore.status = 'signed-in';
		const first = render(RatedChoice, { name: 'acme-alice' });
		expect((first.getByRole('radio', { name: 'Rated' }) as HTMLInputElement).name).toBe(
			'rated-acme-alice',
		);
	});

	// What the component writes back through `bind:rated` matters more than what it draws: a stale
	// `true` left in the parent's state is a request play-api would strip, i.e. a UI that quietly
	// promised rating and did not deliver it. RatedChoiceHarness reflects the bound value into the DOM
	// so these can assert on it. Each case mounts with rated already armed — the state a reopened
	// panel is in when the visitor picked Rated earlier and their session has since gone.
	describe('the value it writes back', () => {
		const boundValue = async (rated: boolean) => {
			const { getByTestId } = render(RatedChoiceHarness, { rated });
			await tick();
			return getByTestId('bound-rated').textContent;
		};

		it('disarms an inherited rated request when nobody is signed in', async () => {
			auth.authStore.status = 'signed-out';
			expect(await boundValue(true)).toBe('false');
		});

		it('disarms it when play-api could not be asked who we are', async () => {
			auth.authStore.status = 'unavailable';
			expect(await boundValue(true)).toBe('false');
		});

		it('leaves a signed-in account’s rated choice alone', async () => {
			auth.authStore.status = 'signed-in';
			expect(await boundValue(true)).toBe('true');
		});

		// #212: a parent may now seed `rated` from a stored preference before the very first
		// authStore.refresh() settles. If `loading` were treated the same as signed-out here, a
		// returning signed-in visitor would have their own preference wiped during that split
		// second, with nothing left to restore it once the status resolves.
		it('leaves a preference alone while auth is still loading', async () => {
			auth.authStore.status = 'loading';
			expect(await boundValue(true)).toBe('true');
		});

		it('propagates the account’s pick back to the parent', async () => {
			auth.authStore.status = 'signed-in';
			const { getByRole, getByTestId } = render(RatedChoiceHarness, { rated: false });
			await fireEvent.click(getByRole('radio', { name: 'Rated' }));
			expect(getByTestId('bound-rated').textContent).toBe('true');
		});
	});
});
