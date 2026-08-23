// Recovery from a deployment landing mid-session. Every push to main replaces the
// hash-named bundles, and Cloudflare Pages answers a request for a vanished file with the
// SPA fallback (200 + index.html), so a stale client that lazy-loads a chunk receives HTML
// instead of JS and the import fails. Vite surfaces exactly that failure as a
// 'vite:preloadError' event; one full reload fetches a fresh index.html and with it a
// consistent set of bundles.
//
// The reload is deliberately one-shot per RETRY_WINDOW_MS: if reloading did not fix the
// import (offline, a genuinely broken deploy), reloading again would loop forever, so the
// next failure is left to propagate to the console instead.

// Exported for `sentryFilters.ts`, which reads the same timestamp to tell a chunk failure
// that is about to be reloaded away from one that already survived a reload.
export const RELOADED_AT_KEY = 'dicechess-play-preload-error-reload';
const RETRY_WINDOW_MS = 30_000;

// The slice of `window` this module touches, so tests can pass a fake.
export type RecoveryHost = {
	addEventListener(type: string, listener: (event: Event) => void): void;
	location: { reload(): void };
	sessionStorage: Pick<Storage, 'getItem' | 'setItem'>;
};

export function attachStaleBundleRecovery(host: RecoveryHost = window): void {
	host.addEventListener('vite:preloadError', (event) => {
		try {
			const reloadedAt = Number(host.sessionStorage.getItem(RELOADED_AT_KEY) ?? '0');
			if (Date.now() - reloadedAt < RETRY_WINDOW_MS) return;
			host.sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
		} catch {
			// No usable sessionStorage means no loop guard — better a visible error than a
			// reload loop, so leave the failure alone.
			return;
		}
		event.preventDefault();
		host.location.reload();
	});
}
