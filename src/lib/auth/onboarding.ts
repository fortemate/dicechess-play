// Whether this browser has already walked a given account through first-login onboarding.
//
// The flag has to live client-side because play-api deliberately does not say "this account is new":
// `/auth/me` answers the same shape on the first login and the thousandth. Inferring newness from the
// data would mean guessing — a generated-looking nickname is not proof, since someone may rename
// themselves to exactly that shape.
//
// Keyed per account, not globally, so a second person signing in on a shared browser gets their own
// onboarding instead of inheriting the first person's "already seen".
//
// The failure mode is deliberately "prompt again", not "never prompt": if storage is unavailable
// (private mode, or a browser with it blocked) every call reports not-onboarded. A one-time prompt
// reappearing is a mild annoyance; silently swallowing the only chance to offer the guest-history
// claim loses data the person cannot get back later without knowing the feature exists.

const PREFIX = 'dicechess-play-onboarded:';

function keyFor(accountId: string): string {
	return `${PREFIX}${accountId}`;
}

/** Whether onboarding was already completed or dismissed for this account in this browser. */
export function isOnboarded(accountId: string): boolean {
	if (typeof localStorage === 'undefined') return false;
	try {
		return localStorage.getItem(keyFor(accountId)) !== null;
	} catch {
		// Storage blocked — treat as not onboarded; see the module comment for why that direction.
		return false;
	}
}

/**
 * Record that onboarding is done for this account. Called both when it is completed and when it is
 * dismissed — from the person's point of view "I already dealt with this" covers both, and a prompt
 * that returns after being waved away is worse than one that never appears.
 */
export function markOnboarded(accountId: string): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(keyFor(accountId), new Date().toISOString());
	} catch {
		// ignore — the prompt may reappear next visit, which is the safe direction
	}
}
