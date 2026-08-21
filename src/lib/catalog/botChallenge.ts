import { PlayBotError, playBot, type PlayBotMatch, type PlayBotRequest } from './catalogApi';
import { buildJoinUrl } from '$lib/live/seatLink';

// The parts of "challenge a bot" that both entry points share (#215): the catalog/profile panel
// (`BotChallengePanel`) and the rematch button on a finished board. Rune-free on purpose, like
// `liveClient.ts` — components own their own phase state and layout, this module owns what it
// means to start a game and how a failure reads.

export const GENERIC_START_FAILURE = 'Could not start the game right now — try again in a minute.';

/** play-api writes its 409 body specifically to be shown to a visitor — two distinct causes share
 * the status (an unfinished catalog game of the visitor's own vs. the bot being at its declared
 * concurrent-game limit), so displaying the server's own text is how the two stay distinguishable
 * without the client hardcoding either message. Capitalized and given a trailing period for
 * consistency with the surrounding copy; falls back to the generic message if the body is ever
 * empty (never expected, but a thrown response is not a promise about its own body).
 */
export function presentableConflictMessage(body: string): string {
	const trimmed = body.trim();
	if (!trimmed) return GENERIC_START_FAILURE;
	const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
	return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

/** What to show a visitor when starting a game threw. A 409 has TWO distinct causes since play-api's
 * per-bot concurrency (#189) and only the server knows which, so its own text is surfaced; every
 * other status collapses to one honest message, same philosophy as the lobby's create/accept —
 * there is nothing more useful to say.
 */
export function describeStartFailure(error: unknown): string {
	return error instanceof PlayBotError && error.status === 409
		? presentableConflictMessage(error.body)
		: GENERIC_START_FAILURE;
}

/** Starts the game and resolves both the seat URL to move to and the match itself — callers need
 * the game id as well, to record the setup for a later rematch (`lastBotGame.ts`).
 *
 * Callers navigate with a full page load (`window.location.href`): the board page connects fresh
 * from the seat token in the URL — the same pattern the lobby's seek-accept flow uses.
 */
export async function startBotGame(
	request: PlayBotRequest,
	origin: string,
): Promise<{ match: PlayBotMatch; url: string }> {
	const match = await playBot(request);
	return { match, url: buildJoinUrl(origin, match.gameId, match.token, match.seat) };
}
