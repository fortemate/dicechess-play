/**
 * The one list of bots on Play (#257).
 *
 * Bots used to be offered in three unrelated places: the levels of the practice page, the catalog
 * of rated bots, and the bots that sit at open tables in the lobby. A visitor does not care where
 * a bot lives, so this module turns the three sources into one list of three kinds of entry, and
 * each kind says how its game starts:
 *
 *   - `starter`: a bot that runs in the browser (`PLAYABLE_BOTS`). Needs no network, never rated.
 *   - `arena`: a bot of play-api's catalog (`GET /lobby/bots`). The visitor sets the terms and
 *     the game is created with `POST /lobby/play-bot`, exactly as the catalog page does it.
 *   - `table`: a bot that holds an open seek (`GET /lobby/seeks`) and is NOT in the catalog. Its
 *     game starts by sitting down at one of its tables, so the table sets the terms: the time
 *     control and whether the game is rated.
 *
 * "Ready now" follows the open seeks: a `table` bot is ready by definition, and an `arena` bot is
 * ready while it also holds a seek. A catalog bot is matched to a seek by name. play-api renders
 * a bot's public name as `"<team> <name>"` (its `PublicPlayer` face), which is the only identity a
 * seek carries, so that is the join key; an unnamed bot seek cannot be told apart and is left out.
 *
 * Pure and rune-free: the page owns the fetching and the polling, this module owns the shape.
 */
import { PLAYABLE_BOTS } from '#lib/bots.js';
import type { CatalogBot } from '#lib/catalog/catalogApi.js';
import type { Seek, TimeControl } from '#lib/live/liveTypes.js';

export interface StarterBot {
	kind: 'starter';
	/** Stable identity of the entry in the list and in a link: the algorithm id. */
	key: string;
	/** The algorithm id the game store takes (`greedy`). */
	id: string;
	label: string;
	level: number;
}

/** What choosing an arena bot leads to. `busy` is advisory: the catalog is read once per visit. */
export type ArenaState = 'ready' | 'busy' | 'asleep';

export interface ArenaBot {
	kind: 'arena';
	/** `<team>/<name>`, the same pair the bot's profile route takes. */
	key: string;
	team: string;
	name: string;
	label: string;
	rating: number;
	provisional: boolean;
	description: string | null;
	state: ArenaState;
}

/** One open seek of a table bot: the terms of the game that sitting down starts. */
export interface BotTable {
	seekId: string;
	timeControl: TimeControl;
	/** Only an explicit `true` counts as rated: an absent flag means the server does not say. */
	rated: boolean;
}

export interface TableBot {
	kind: 'table';
	/** The public name of the bot, as the seek carries it. */
	key: string;
	label: string;
	tables: BotTable[];
}

export type OnlineBot = ArenaBot | TableBot;
export type BotEntry = StarterBot | OnlineBot;

export type BotFilter = 'all' | 'ready' | 'browser' | 'rated';
export const BOT_FILTERS: readonly BotFilter[] = ['all', 'ready', 'browser', 'rated'];

/** The bots that run in the browser, in the order of their level. */
export function starterBots(): StarterBot[] {
	return PLAYABLE_BOTS.map((bot) => ({
		kind: 'starter',
		key: bot.id,
		id: bot.id,
		label: bot.label,
		level: bot.level,
	}));
}

const botSeekName = (seek: Seek): string | null =>
	seek.kind === 'Bot' && seek.name ? seek.name : null;

const sameTerms = (a: BotTable, seek: Seek): boolean =>
	a.rated === (seek.rated === true) &&
	JSON.stringify(a.timeControl) === JSON.stringify(seek.timeControl);

/**
 * The bots that play online: the bots waiting at a table first, because they answer at once,
 * then the catalog from the weakest to the strongest, which continues the levels of the starter
 * bots. A provisional rating says nothing about strength yet, so those bots come last.
 *
 * The order of the catalog does not depend on the seeks, so a row never jumps when a bot sits
 * down at a table or leaves it; only the rows of the table bots come and go.
 */
export function onlineBots(catalog: readonly CatalogBot[], seeks: readonly Seek[]): OnlineBot[] {
	const catalogLabels = new Set(catalog.map((bot) => `${bot.team} ${bot.name}`));
	const seated = new Set<string>();
	const tables = new Map<string, TableBot>();

	for (const seek of seeks) {
		const label = botSeekName(seek);
		if (label === null) continue;
		seated.add(label);
		if (catalogLabels.has(label)) continue;
		const bot = tables.get(label) ?? { kind: 'table', key: label, label, tables: [] };
		// A bot may hold several tables; two with the same terms are one choice to the visitor.
		if (!bot.tables.some((table) => sameTerms(table, seek))) {
			bot.tables.push({
				seekId: seek.id,
				timeControl: seek.timeControl,
				rated: seek.rated === true,
			});
		}
		tables.set(label, bot);
	}

	const arena = catalog.map((bot): ArenaBot => {
		const label = `${bot.team} ${bot.name}`;
		return {
			kind: 'arena',
			key: `${bot.team}/${bot.name}`,
			team: bot.team,
			name: bot.name,
			label,
			rating: bot.rating,
			provisional: bot.provisional,
			description: bot.description,
			// Tested `=== false`, never `!bot.available`: the field is absent on an older API, and
			// "unknown" must not read as "busy" (see `CatalogBot.available`).
			state: seated.has(label) ? 'ready' : bot.available === false ? 'busy' : 'asleep',
		};
	});
	arena.sort(
		(a, b) =>
			Number(a.provisional) - Number(b.provisional) ||
			(a.provisional ? 0 : a.rating - b.rating) ||
			a.label.localeCompare(b.label),
	);

	return [...[...tables.values()].sort((a, b) => a.label.localeCompare(b.label)), ...arena];
}

/** Whether a row belongs under a filter. `rated` means "a game against it can be rated". */
export function matchesFilter(entry: BotEntry, filter: BotFilter): boolean {
	switch (filter) {
		case 'all':
			return true;
		case 'ready':
			return entry.kind === 'table' || (entry.kind === 'arena' && entry.state === 'ready');
		case 'browser':
			return entry.kind === 'starter';
		case 'rated':
			return (
				entry.kind === 'arena' || (entry.kind === 'table' && entry.tables.some((t) => t.rated))
			);
	}
}

/**
 * The entry a link asks for (`/play?bot=…`), or `undefined` when the list has none.
 *
 * A link may name a bot the way its page knows it: a starter bot by its id (`greedy`), an arena
 * bot by the pair of its profile route (`team/name`), and any online bot by its public name
 * (`team name`), which is all a spectator view has.
 */
export function findBot(entries: readonly BotEntry[], param: string): BotEntry | undefined {
	const wanted = param.trim();
	if (!wanted) return undefined;
	const asName = wanted.replace('/', ' ');
	return (
		entries.find((entry) => entry.key === wanted) ??
		entries.find((entry) => entry.kind !== 'starter' && entry.label === asName)
	);
}
