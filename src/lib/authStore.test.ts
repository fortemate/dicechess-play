import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '$lib/auth/authApi';

// The store is a module-level singleton, so every test imports it fresh — otherwise state from one
// case (a signed-in account, say) leaks into the next and the suite passes for the wrong reason.
const ME: Me = {
	id: 'account-uuid',
	nickname: 'BraveDie',
	rating: 1500,
	rd: 350,
	provisional: true,
	games: 0,
	ratings: [],
	admin: false,
};

const authApi = vi.hoisted(() => ({
	fetchMe: vi.fn(),
	logout: vi.fn(),
	isAuthEnabled: vi.fn(() => true),
	loginUrl: vi.fn(() => 'http://localhost:8080/auth/login'),
	updateNickname: vi.fn(),
	fetchClaimedGuests: vi.fn(),
	claimGuest: vi.fn(),
	deleteAccount: vi.fn(),
}));

vi.mock('$lib/auth/authApi', () => authApi);
vi.mock('$lib/ingest/guestIdentity', () => ({ getGuestUuid: () => 'guest-uuid' }));

async function freshStore() {
	vi.resetModules();
	return (await import('./authStore.svelte')).authStore;
}

describe('initialOf', () => {
	it('uppercases the first character, since the badge is a single glyph', async () => {
		const { initialOf } = await import('./authStore.svelte');
		expect(initialOf('bravedie')).toBe('B');
	});

	it('ignores surrounding whitespace rather than rendering a blank badge', async () => {
		const { initialOf } = await import('./authStore.svelte');
		expect(initialOf('  quietRook ')).toBe('Q');
	});

	it('falls back to "?" for a name with nothing in it', async () => {
		const { initialOf } = await import('./authStore.svelte');
		expect(initialOf('   ')).toBe('?');
		expect(initialOf('')).toBe('?');
	});

	it('takes whole characters, so an astral glyph is not split into half a surrogate pair', async () => {
		const { initialOf } = await import('./authStore.svelte');
		// Naive `nickname[0]` would return a lone surrogate here and render as a replacement box.
		expect(initialOf('🎲roller')).toBe('🎲');
	});

	it('leaves a caseless script alone instead of mangling it', async () => {
		const { initialOf } = await import('./authStore.svelte');
		expect(initialOf('日本語')).toBe('日');
	});
});

describe('authStore', () => {
	beforeEach(() => {
		authApi.fetchMe.mockReset();
		authApi.logout.mockReset().mockResolvedValue(undefined);
		authApi.isAuthEnabled.mockReset().mockReturnValue(true);
		authApi.loginUrl.mockReset().mockReturnValue('http://localhost:8080/auth/login');
		authApi.updateNickname.mockReset();
		authApi.fetchClaimedGuests.mockReset();
		authApi.claimGuest.mockReset();
		authApi.deleteAccount.mockReset();
	});

	/** A store already settled on a signed-in account, which is the precondition for everything below. */
	async function signedInStore() {
		authApi.fetchMe.mockResolvedValue({ outcome: 'signed-in', me: ME });
		const store = await freshStore();
		await store.refresh();
		return store;
	}

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('starts as loading, so the nav renders nothing rather than flashing "Sign in"', async () => {
		const store = await freshStore();
		expect(store.status).toBe('loading');
		expect(store.isLoading).toBe(true);
		expect(store.isAuthenticated).toBe(false);
	});

	it('adopts the account on a successful refresh', async () => {
		authApi.fetchMe.mockResolvedValue({ outcome: 'signed-in', me: ME });
		const store = await freshStore();
		await store.refresh();
		expect(store.status).toBe('signed-in');
		expect(store.isAuthenticated).toBe(true);
		expect(store.nickname).toBe('BraveDie');
		expect(store.account).toEqual(ME);
	});

	it('exposes administrator status only from the server-supplied account flag', async () => {
		authApi.fetchMe.mockResolvedValue({ outcome: 'signed-in', me: { ...ME, admin: true } });
		const store = await freshStore();
		await store.refresh();
		expect(store.isAdmin).toBe(true);
	});

	it('settles on signed-out for an anonymous visitor, which is a normal state here', async () => {
		authApi.fetchMe.mockResolvedValue({ outcome: 'signed-out' });
		const store = await freshStore();
		await store.refresh();
		expect(store.status).toBe('signed-out');
		expect(store.nickname).toBeNull();
	});

	it('distinguishes "could not ask" from "signed out"', async () => {
		authApi.fetchMe.mockResolvedValue({ outcome: 'unavailable' });
		const store = await freshStore();
		await store.refresh();
		expect(store.status).toBe('unavailable');
	});

	describe('externalId', () => {
		it('is the guest identity while anonymous — never the old user:guest', async () => {
			authApi.fetchMe.mockResolvedValue({ outcome: 'signed-out' });
			const store = await freshStore();
			await store.refresh();
			expect(store.externalId).toBe('guest:guest-uuid');
		});

		it('becomes the account identity once signed in', async () => {
			authApi.fetchMe.mockResolvedValue({ outcome: 'signed-in', me: ME });
			const store = await freshStore();
			await store.refresh();
			expect(store.externalId).toBe('user:account-uuid');
		});

		it('stays the guest identity when the account could not be fetched', async () => {
			authApi.fetchMe.mockResolvedValue({ outcome: 'unavailable' });
			const store = await freshStore();
			await store.refresh();
			expect(store.externalId).toBe('guest:guest-uuid');
		});
	});

	describe('the legacy surface the play-with-bot store consumes', () => {
		it('mirrors the nickname onto user.name so ported components keep working', async () => {
			authApi.fetchMe.mockResolvedValue({ outcome: 'signed-in', me: ME });
			const store = await freshStore();
			await store.refresh();
			expect(store.user.id).toBe('account-uuid');
			expect(store.user.name).toBe('BraveDie');
		});

		it('keeps balance local and clamped at zero — it is not an account balance', async () => {
			const store = await freshStore();
			store.adjustBalance(50);
			expect(store.user.balance).toBe(50);
			store.adjustBalance(-500);
			expect(store.user.balance).toBe(0);
		});

		it('reports guests as approved, since the public site has no approval gate', async () => {
			const store = await freshStore();
			expect(store.isApproved).toBe(true);
			expect(store.isAdmin).toBe(false);
		});
	});

	describe('signIn', () => {
		it('is a full-page navigation, because an XHR cannot carry the Google round-trip', async () => {
			const assign = vi.fn();
			vi.stubGlobal('window', { location: { assign } });
			const store = await freshStore();
			store.signIn();
			expect(assign).toHaveBeenCalledWith('http://localhost:8080/auth/login');
		});

		it('does nothing when accounts are unreachable, rather than navigating to a dead URL', async () => {
			authApi.isAuthEnabled.mockReturnValue(false);
			const assign = vi.fn();
			vi.stubGlobal('window', { location: { assign } });
			const store = await freshStore();
			store.signIn();
			expect(assign).not.toHaveBeenCalled();
		});
	});

	describe('rename', () => {
		it('adopts the renamed account, so the nav and the delete confirmation move together', async () => {
			const store = await signedInStore();
			const renamed = { ...ME, nickname: 'QuietRook' };
			authApi.updateNickname.mockResolvedValue({ outcome: 'updated', me: renamed });

			expect(await store.rename('QuietRook')).toEqual({ outcome: 'updated', me: renamed });
			expect(store.nickname).toBe('QuietRook');
			// The delete guard echoes the CURRENT nickname; a stale copy here would make the account
			// impossible to delete right after a rename.
			expect(store.initial).toBe('Q');
		});

		it('returns "taken" without touching the account, since the old name is still ours', async () => {
			const store = await signedInStore();
			authApi.updateNickname.mockResolvedValue({ outcome: 'taken' });

			expect(await store.rename('QuietRook')).toEqual({ outcome: 'taken' });
			expect(store.nickname).toBe('BraveDie');
		});

		it("passes play-api's own reason through for a rejected format", async () => {
			const store = await signedInStore();
			authApi.updateNickname.mockResolvedValue({
				outcome: 'invalid',
				reason: 'that nickname is reserved',
			});

			expect(await store.rename('admin')).toEqual({
				outcome: 'invalid',
				reason: 'that nickname is reserved',
			});
			expect(store.nickname).toBe('BraveDie');
		});

		it('drops to signed-out when the session died between the check and the write', async () => {
			const store = await signedInStore();
			authApi.updateNickname.mockResolvedValue({ outcome: 'signed-out' });

			await store.rename('QuietRook');
			expect(store.status).toBe('signed-out');
			expect(store.account).toBeNull();
		});
	});

	describe('claimed guests', () => {
		it('is empty and unloaded until asked, so the nav pays for no extra request', async () => {
			const store = await signedInStore();
			expect(store.guests).toEqual([]);
			expect(store.guestsLoaded).toBe(false);
			expect(authApi.fetchClaimedGuests).not.toHaveBeenCalled();
		});

		it('loads the claim set on demand', async () => {
			const store = await signedInStore();
			authApi.fetchClaimedGuests.mockResolvedValue({ outcome: 'ok', guests: ['other-uuid'] });

			await store.loadGuests();
			expect(store.guests).toEqual(['other-uuid']);
			expect(store.guestsLoaded).toBe(true);
		});

		it('knows whether THIS browser is among the linked identities', async () => {
			const store = await signedInStore();
			authApi.fetchClaimedGuests.mockResolvedValue({ outcome: 'ok', guests: ['other-uuid'] });
			await store.loadGuests();
			expect(store.currentGuestLinked).toBe(false);

			authApi.fetchClaimedGuests.mockResolvedValue({
				outcome: 'ok',
				guests: ['other-uuid', 'guest-uuid'],
			});
			await store.loadGuests();
			expect(store.currentGuestLinked).toBe(true);
		});

		it('claims with the BARE uuid and adopts the returned set', async () => {
			const store = await signedInStore();
			authApi.claimGuest.mockResolvedValue({ outcome: 'linked', guests: ['guest-uuid'] });

			expect(await store.claimCurrentGuest()).toEqual({
				outcome: 'linked',
				guests: ['guest-uuid'],
			});
			expect(authApi.claimGuest).toHaveBeenCalledWith('guest-uuid');
			expect(store.currentGuestLinked).toBe(true);
		});

		it('reports a guest owned elsewhere as terminal, leaving the set untouched', async () => {
			const store = await signedInStore();
			authApi.fetchClaimedGuests.mockResolvedValue({ outcome: 'ok', guests: [] });
			await store.loadGuests();
			authApi.claimGuest.mockResolvedValue({ outcome: 'claimed-by-another' });

			expect(await store.claimCurrentGuest()).toEqual({ outcome: 'claimed-by-another' });
			expect(store.guests).toEqual([]);
			expect(store.currentGuestLinked).toBe(false);
		});

		it('forgets the claim set on sign-out, so the next account never sees the previous one', async () => {
			const store = await signedInStore();
			authApi.fetchClaimedGuests.mockResolvedValue({ outcome: 'ok', guests: ['guest-uuid'] });
			await store.loadGuests();
			expect(store.guests).toHaveLength(1);

			await store.signOut();
			expect(store.guests).toEqual([]);
			expect(store.guestsLoaded).toBe(false);
		});
	});

	describe('remove', () => {
		it('turns the browser back into a plain guest, keeping the guest identity', async () => {
			const store = await signedInStore();
			authApi.deleteAccount.mockResolvedValue({ outcome: 'deleted' });

			expect(await store.remove('BraveDie')).toEqual({ outcome: 'deleted' });
			expect(store.status).toBe('signed-out');
			expect(store.account).toBeNull();
			// The guest identity was never part of the account, so it survives deletion.
			expect(store.externalId).toBe('guest:guest-uuid');
		});

		it('keeps the account when the confirmation did not match', async () => {
			const store = await signedInStore();
			authApi.deleteAccount.mockResolvedValue({
				outcome: 'invalid',
				reason: 'confirm must be your current nickname',
			});

			await store.remove('wrong');
			expect(store.status).toBe('signed-in');
			expect(store.account).toEqual(ME);
		});
	});

	describe('signOut', () => {
		it('clears the account', async () => {
			authApi.fetchMe.mockResolvedValue({ outcome: 'signed-in', me: ME });
			const store = await freshStore();
			await store.refresh();
			await store.signOut();
			expect(store.status).toBe('signed-out');
			expect(store.account).toBeNull();
			expect(store.externalId).toBe('guest:guest-uuid');
		});

		it('clears local state even when the logout request fails, so the UI cannot get stuck', async () => {
			authApi.fetchMe.mockResolvedValue({ outcome: 'signed-in', me: ME });
			// The transport swallows its own failures today; this drives the store's own guarantee, so
			// the UI cannot be left claiming a signed-in session if that ever changes.
			authApi.logout.mockRejectedValue(new TypeError('network down'));
			const store = await freshStore();
			await store.refresh();
			await expect(store.signOut()).rejects.toThrow();
			expect(store.status).toBe('signed-out');
			expect(store.account).toBeNull();
			expect(store.externalId).toBe('guest:guest-uuid');
		});
	});
});
