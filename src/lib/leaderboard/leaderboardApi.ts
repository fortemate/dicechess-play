import { apiBase } from '../live/liveApi';
import type { PlayerOpponent } from '../games/gamesApi';
import type { RatingCategory } from '../live/ratingCategory';

// REST client for the public rating-ladder read API (play-api D.2). The wire mirrors
// play-api's `LeaderboardRoutes.scala` verbatim (camelCase, like the rest of the live wire) —
// do NOT reshape it here. Both endpoints exist only when play-api runs with persistence, and
// on this side only when VITE_PLAY_API_URL is configured (same gate as live play).

/** Which population a row comes from. Bots and accounts share ONE Glicko-2 scale (play-api
 * ADR-0017), which is what makes a merged board honest rather than a mixing of two currencies.
 *
 * Branch on `kind === 'player'`, never on `kind === 'bot'`: on a server that predates the field
 * the absent value then degrades to a bot row, which is what every row used to be.
 */
export type LeaderKind = 'bot' | 'player';

/** Which populations to ask for. play-api's own default is `bots` — kept that way so #249 could
 * not change what this client already received — so the merged view has to be requested.
 */
export type BoardScope = 'all' | 'bots' | 'players';

/** One leaderboard row. `rank` is 1-based within the response; W-D-L counts rated, decided
 * games only (the ladder record). Provisional entrants (rating not yet converged) are absent from
 * the board by server policy — the same rule for people as for bots, since it is one scale.
 */
export interface LeaderRow {
	rank: number;
	kind: LeaderKind;
	/** Null for a person: they have no team, and their nickname is carried in `name`. */
	team: string | null;
	name: string;
	rating: number;
	rd: number;
	/** False for a bot that left the ladder — its rating is frozen but still listed. Always false
	 * for a player: the flag belongs to the bot pairing scheduler, and there is none for people.
	 */
	onLadder: boolean;
	games: number;
	wins: number;
	draws: number;
	losses: number;
}

export interface Leaderboard {
	/** The category this board answers for, echoed by the server (wireName form: 'blitz', …). */
	category: string;
	leaders: LeaderRow[];
}

/** One scale's worth of a participant's rating (play-api #280 phase 2). Profiles and `/auth/me`
 * carry these as an ORDERED LIST in `RatingCategory.values` order (bullet, blitz, rapid), and an
 * UNPLAYED category is ABSENT from the list — not null and not 1500: the server's sparse tables
 * mean "never measured here", and inventing a number would publish a rating nobody played for.
 * `provisional` is per category (`rd > 110`): settled at blitz and provisional at bullet is a
 * normal state. `games`/`wins`/`draws`/`losses` count rated, decided games IN this category only.
 */
export interface CategoryRating {
	category: RatingCategory;
	rating: number;
	rd: number;
	provisional: boolean;
	games: number;
	wins: number;
	draws: number;
	losses: number;
}

/** One recent game from the profiled bot's point of view. `opponent` is a public face — bots by
 * team-qualified name, humans anonymous (name null) — same shape as the live wire's players.
 */
export interface ProfileRecentGame {
	gameId: string;
	seat: 'White' | 'Black';
	opponent: { kind: 'Human' | 'Bot'; name: string | null };
	result: 'win' | 'draw' | 'loss' | 'unknown';
	rated: boolean;
	termination: string;
	finishedAt: string; // ISO-8601
}

export interface BotProfile {
	team: string;
	name: string;
	/** The scalar rating fields describe the DEFAULT category (blitz) since #280 phase 2 — or the
	 * fresh 1500/350/provisional state when blitz was never played; `ratings` below is the honest
	 * per-category view and what new UI should read. Kept because the wire keeps them. */
	rating: number;
	rd: number;
	/** Rating not yet converged: counted internally, hidden from the public board. */
	provisional: boolean;
	onLadder: boolean;
	games: number;
	wins: number;
	draws: number;
	losses: number;
	/** One entry per PLAYED category, bullet→blitz→rapid; see `CategoryRating`. */
	ratings: CategoryRating[];
	/** Aggregate record per opponent (#182): one row per other registered bot (head-to-head) plus
	 * one collapsed row for every human/guest opponent combined ("vs humans", `team`/`botName`
	 * both null). Counts every game, rated and casual alike — unlike `wins`/`draws`/`losses` above
	 * (the ladder record: rated, decided only), so games against site visitors — always casual —
	 * are visible here even though they don't count above. Same `PlayerOpponent` shape
	 * `GET /players/{guestId}/opponents` uses (`$lib/games/gamesApi`) — the aggregate is symmetric
	 * in whose external id is queried, so one wire type serves both.
	 */
	opponents: PlayerOpponent[];
	recent: ProfileRecentGame[];
}

/** The public board for one scale: converged participants, best rating first. */
export async function fetchLeaderboard(
	scope: BoardScope,
	category: RatingCategory,
): Promise<Leaderboard> {
	// BOTH params always stated, never defaulted: the server defaults `kind` to `bots` — an omitted
	// scope is exactly how people stayed invisible on this page (#206) — and `category` to blitz,
	// which would repeat the same silent-mismatch trap the moment the default moves. The value is
	// case-sensitive on the wire (lowercase), which `RatingCategory`'s type already guarantees.
	const res = await fetch(`${apiBase()}/leaderboard?kind=${scope}&category=${category}`);
	if (!res.ok) throw new Error(`fetchLeaderboard failed: ${res.status}`);
	return (await res.json()) as Leaderboard;
}

/** One account's public card (#207). Keyed on the nickname because that is the only public handle a
 * person has — `user:<uuid>` never appears on the public wire.
 *
 * Deliberately the same shape as `BotProfile` minus what cannot apply to a person: no team/name pair,
 * and no `onLadder` (that flag belongs to the bot pairing scheduler). play-api shaped it this way on
 * purpose so both profiles render through the same cards.
 *
 * The public profile counts `user:` games ONLY — never the account's claimed guest ids. Merging them
 * here would retroactively deanonymise that history, which is the promise play-api #236 made; the
 * merged view is owner-only, at `/me`.
 */
export interface PlayerProfile {
	nickname: string;
	/** Scalars = the DEFAULT category (blitz) or the fresh-state fallback — see `BotProfile`. */
	rating: number;
	rd: number;
	/** Rating not yet converged: counted internally, absent from the public board. */
	provisional: boolean;
	/** Rated, decided games — the rating record (in the default category, like the scalars). */
	games: number;
	wins: number;
	draws: number;
	losses: number;
	/** One entry per PLAYED category, bullet→blitz→rapid; see `CategoryRating`. */
	ratings: CategoryRating[];
	/** Every finished game, rated or casual. Added by play-api #279 because a profile reading
	 * `games: 0` next to a non-empty recent list is a contradiction: before rated play existed for
	 * people, every game they had played was casual. Keep the two numbers distinct.
	 */
	totalGames: number;
	/** Same aggregate as a bot's: one row per bot faced (head-to-head), plus one collapsed row for
	 * every human opponent combined (`team`/`botName` both null). Counts all games, not just rated.
	 */
	opponents: PlayerOpponent[];
	recent: ProfileRecentGame[];
}

/** One account's public card; 404 (thrown) for an unknown or deactivated nickname. */
export async function fetchPlayerProfile(nickname: string): Promise<PlayerProfile> {
	const res = await fetch(`${apiBase()}/players/by-nickname/${encodeURIComponent(nickname)}`);
	if (!res.ok) throw new Error(`fetchPlayerProfile failed: ${res.status}`);
	return (await res.json()) as PlayerProfile;
}

/** One bot's public card; 404 (thrown) for identities that are not registered bots. */
export async function fetchBotProfile(team: string, name: string): Promise<BotProfile> {
	const res = await fetch(
		`${apiBase()}/bots/${encodeURIComponent(team)}/${encodeURIComponent(name)}`,
	);
	if (!res.ok) throw new Error(`fetchBotProfile failed: ${res.status}`);
	return (await res.json()) as BotProfile;
}
