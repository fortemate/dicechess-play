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
			// Text stays masked, which is the default. Unmasking is tempting — the move list, the
			// clocks and the coordinates are what make a replay worth watching, and play is anonymous
			// — but /bots reveals a freshly rotated bot token as a `<code>` text node exactly once
			// (AdminBotDetailDrawer, OwnedBotCard) and `maskAllInputs` does not cover a text node. One
			// credential in one replay costs more than every replay being duller. Unmasking specific
			// reviewed elements with `unmask` is the safe direction if replays turn out too redacted.
			//
			// Media is deliberately NOT blocked: the pieces are images, and the default would leave a
			// replay of a board game without a board.
			blockAllMedia: false,
		}),
	);
}
