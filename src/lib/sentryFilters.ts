// Which browser errors deserve a Sentry issue, and which are the site healing itself.
//
// Every push to main replaces the hash-named chunks, so a tab opened before a deploy fails its
// next lazy import. `staleBundleRecovery.ts` already answers that with one full reload and the
// user never notices — but the failed import still reaches Sentry through SvelteKit's
// `handleError` and the global rejection handler. Unfiltered, the loudest issue in the project
// would be a self-healing non-event, one burst of it per deploy.
//
// The filter is deliberately narrower than "ignore chunk-load errors": it drops the failure only
// while the reload it triggers is still pending in THIS document. A failure that survives the
// reload is left alone — the recovery's own 30 s guard stops retrying at that point, and an
// import that is still broken on a freshly fetched index.html is a genuinely broken deploy,
// exactly the thing a blanket `ignoreErrors` entry would have hidden.
//
// Ordering note: this relies on the `vite:preloadError` listener running before the event
// reaches `beforeSend`, which it does — that event fires synchronously on the failed fetch while
// the capture is a later task. If it ever inverted, the cost would be one spurious issue per
// deploy, never a swallowed real one.

import type { ErrorEvent } from '@sentry/sveltekit';
import { RELOADED_AT_KEY } from './staleBundleRecovery';

// The same failure, as each engine words it.
const STALE_CHUNK_MESSAGES = [
	/Failed to fetch dynamically imported module/i, // Chromium
	/error loading dynamically imported module/i, // Firefox
	/Importing a module script failed/i, // Safari
	/Unable to preload CSS/i, // Vite's CSS preload helper
];

/** The slice of the platform this module reads, so tests can pass a fake. */
export type SelfHealHost = {
	sessionStorage: Pick<Storage, 'getItem'>;
	/** Epoch ms at which the current document started loading (`performance.timeOrigin`). */
	timeOrigin: number;
};

function browserHost(): SelfHealHost {
	return { sessionStorage: window.sessionStorage, timeOrigin: performance.timeOrigin };
}

/** True when the event describes a chunk that could not be fetched. */
export function isStaleChunkError(event: ErrorEvent): boolean {
	const messages = [event.message, ...(event.exception?.values ?? []).map((value) => value.value)];
	return messages.some(
		(message) => !!message && STALE_CHUNK_MESSAGES.some((pattern) => pattern.test(message)),
	);
}

/**
 * True when `staleBundleRecovery` has decided to reload during the life of this document, i.e.
 * the page is on its way out and the import failure is about to be fixed. A timestamp older than
 * `timeOrigin` was written by the PREVIOUS document — the reload already happened and did not
 * help.
 */
export function isReloadPending(host: SelfHealHost): boolean {
	try {
		return Number(host.sessionStorage.getItem(RELOADED_AT_KEY) ?? '0') >= host.timeOrigin;
	} catch {
		// Unreadable sessionStorage leaves no way to tell a pending self-heal from a failed one.
		// Report it: a spurious issue is cheaper than a silently broken deploy.
		return false;
	}
}

/** `beforeSend`: drop a stale-bundle import failure that the page is already reloading to fix. */
export function dropSelfHealingChunkErrors(
	event: ErrorEvent,
	_hint: unknown,
	host: SelfHealHost = browserHost(),
): ErrorEvent | null {
	return isStaleChunkError(event) && isReloadPending(host) ? null : event;
}
