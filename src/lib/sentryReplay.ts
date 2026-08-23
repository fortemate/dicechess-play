// Session Replay, kept out of the entry chunk.
//
// Replay is ~39 kB gzip — three quarters of the SDK's total weight and, imported the usual way,
// all of it in `entry/app.js`, which every visitor downloads before the first board is drawn.
// This module exists purely so the bundler has something to split: it is never imported
// statically, so Rollup puts it (and everything it pulls in) in its own async chunk that
// `hooks.client.ts` requests once the browser is idle.
//
// The trade-off is deliberate and small: replays cover errors from the moment the integration is
// added, so a failure in the first seconds of a page load arrives without one. Sampling still
// comes from the client options set in `hooks.client.ts` — this module only decides WHEN the
// recorder exists, never whether a replay is kept.

import { addIntegration, replayIntegration } from '@sentry/sveltekit';

export function startReplay(): void {
	addIntegration(
		replayIntegration({
			// The defaults mask every text node, which would blank the move list, the clocks and
			// the coordinates — the parts that make a replay worth watching. Play is anonymous and
			// every game here is public, so that text is safe to keep. Typed input stays masked
			// (`maskAllInputs` defaults to true) for the account screens.
			maskAllText: false,
			blockAllMedia: false,
		}),
	);
}
