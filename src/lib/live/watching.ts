// What the watching view of a live game says beyond the game itself (#263). Pure and
// rune-free.
//
// A spectator has no seat, so nothing here leads to one: the functions name the players of
// the game on screen, build the link that challenges a bot on Play, and pick the other live
// games a spectator can move on to.
//
// Other games come from the public list of live games, in the order of the Arena: the rule
// that picks its featured game (`arena/featured`), so "watch another game" opens the game the
// Arena would feature next.
import { rankGames } from '../arena/featured';
import { m } from '../paraglide/messages';
import { pieceList } from '../turnCard';
import { fullmoveOf } from './boardGrid';
import type { LiveGame, PublicPlayer } from './liveTypes';
import { timeControlTerms } from './timeControls';

/** Other games shown beside the one being watched. */
export const OTHER_GAMES = 3;

/** The live games other than the one on screen, the most notable first. */
export function otherGames(games: readonly LiveGame[], currentId: string | undefined): LiveGame[] {
	return rankGames(games.filter((game) => game.gameId !== currentId));
}

const sideName = (player: PublicPlayer | null | undefined, fallback: string): string =>
	player?.name || fallback;

/** "cedar-3 vs larch-3": the two sides of a listed game, a nameless seat by its colour. */
export function pairing(game: Pick<LiveGame, 'players'>): string {
	return m.game_live_title({
		white: sideName(game.players?.white, m.common_seat_white()),
		black: sideName(game.players?.black, m.common_seat_black()),
	});
}

/** "Blitz 5 + 3 · move 14": what a listed game is and how far it has got. */
export function progress(game: Pick<LiveGame, 'timeControl' | 'dfen'>): string {
	return m.game_watch_progress({
		terms: timeControlTerms(game.timeControl),
		move: fullmoveOf(game.dfen),
	});
}

/** The query that preselects a bot on Play. A spectator knows a bot only by its public name,
 * "<team> <name>", which is a form `findBot` accepts. */
export function challengeQuery(publicName: string): string {
	return `?bot=${encodeURIComponent(publicName)}`;
}

/** "cedar-4 rolled a queen, a king and a knight.": the dice of the side to move, with its
 * name. Empty when there are no dice to talk about. */
export function rolledLine(name: string, dice: readonly { value: string }[]): string {
	if (dice.length === 0) return '';
	return m.game_watch_rolled({ name, pieces: pieceList(dice.map((die) => die.value)) });
}

/** How the game counts, in one word, from what the server recorded; null when it does not say.
 * `rated: false` alone cannot tell a casual game from a training one, so it names neither. */
export function gameKind(
	domain: string | null | undefined,
	rated: boolean | null | undefined,
): string | null {
	if (domain === 'training') return m.common_rating_game_training();
	if (domain === 'casual') return m.common_rating_game_casual();
	if (domain === 'competitive' || (!domain && rated === true)) return m.game_watch_rated();
	return null;
}
