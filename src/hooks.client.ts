// Sentry wiring for the browser — the only place the SDK is initialised.
//
// There is deliberately no server-side counterpart: `adapter-static` plus `ssr = false`
// (+layout.ts) means no server exists at runtime, and `hooks.server.ts` runs only while the
// prerendered pages are built. Everything Sentry knows about this site is reported by a browser.
//
// The DSN is baked in at BUILD time like every other VITE_ var here — the bundle is built in
// Actions and Direct-Uploaded, so a Cloudflare Pages dashboard variable would never reach `vite
// build` (deploy.yaml passes it). An empty DSN disables the SDK completely, which is what
// `npm run dev`, CI and fork PR builds get; nothing else in the app needs to know.
//
// Weight is the reason this file looks the way it does. Measured on the production bundle, the
// JS that index.html pulls in before the first board appears is 46.8 kB gzip; the error SDK adds
// 31.5 kB to that, performance tracing would add another 20.5 kB and Replay another 39.6 kB. So
// tracing is compiled out (`__SENTRY_TRACING__` in vite.config.ts) and Replay loads as its own
// chunk after the page is idle ($lib/sentryReplay), leaving errors — the reason for the
// integration — as the only thing on the critical path.

import * as Sentry from '@sentry/sveltekit';
import { dropSelfHealingChunkErrors } from '$lib/sentryFilters';

const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? '';

if (dsn) {
	Sentry.init({
		dsn,
		// 'production' for main, 'preview' for a PR deployment (deploy.yaml). A preview talks to
		// the production play-api and is CORS-blocked on every live surface, so its errors must
		// not land in the same bucket as real ones.
		environment:
			(import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? import.meta.env.MODE,
		// A replay of the session that ended in an error is the whole point on a board game: which
		// square, which drag, which dice. Sessions that end fine are never recorded.
		replaysSessionSampleRate: 0,
		replaysOnErrorSampleRate: 1,
		beforeSend: dropSelfHealingChunkErrors,
	});

	// Replay is the heaviest part of the SDK by far, so it arrives as its own chunk once the
	// browser has nothing better to do rather than delaying the first board. `timeout` keeps a
	// permanently busy tab from never recording at all.
	const startReplay = (): void => void import('$lib/sentryReplay').then((m) => m.startReplay());
	// `typeof`, not `'requestIdleCallback' in window`: lib.dom declares the method as always
	// present, so the `in` form narrows the else branch to `never` and stops compiling.
	if (typeof window.requestIdleCallback === 'function') {
		window.requestIdleCallback(startReplay, { timeout: 5_000 });
	} else {
		window.setTimeout(startReplay, 2_000);
	}
}

// Errors SvelteKit catches during client-side navigation and rendering. Exported
// unconditionally: with no initialised client, capturing is a no-op.
export const handleError = Sentry.handleErrorWithSentry();
