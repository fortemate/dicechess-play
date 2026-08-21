/**
 * Catalog of playable bots, shared between the game lobby and the games history.
 *
 * Hardcoded by design — the engine's `getAvailableBots()` is not trusted as the
 * source of truth for what we expose to players (see the lobby ADR note).
 */
export interface BotCatalogEntry {
	/** Algorithm id without the `bot:` prefix, e.g. `greedy`. */
	id: string;
	/** Human-readable name shown in the UI. */
	label: string;
	/** Difficulty level (1 = easiest). */
	level: number;
	/** Withdrawn from the new-game picker; stays in the catalog so history labels resolve. */
	retired?: boolean;
}

export const BOTS: readonly BotCatalogEntry[] = [
	{ id: 'random', label: 'Random', level: 1 },
	{ id: 'checkmate-aware', label: 'Checkmate-aware', level: 2 },
	{ id: 'greedy', label: 'Greedy', level: 3 },
	{ id: 'aggressive', label: 'Aggressive', level: 5 },
	{ id: 'aggressive-book', label: 'Aggressive + Book', level: 5 },
	// Retired: the only bot that thinks for seconds while the rest reply instantly,
	// and its play barely edges out Aggressive — not worth the wait it causes.
	{ id: 'monte-carlo', label: 'Monte-Carlo', level: 6, retired: true },
];

/** The bots offered for a new game — instant movers only. */
export const PLAYABLE_BOTS: readonly BotCatalogEntry[] = BOTS.filter((b) => !b.retired);

const BOT_BY_ID = new Map(BOTS.map((b) => [b.id, b]));

/** Strips an optional `bot:` prefix from an external bot id. */
export function botAlgorithm(botId: string): string {
	return botId.startsWith('bot:') ? botId.slice(4) : botId;
}

/**
 * Resolves a bot's display label from either a bare algorithm id (`greedy`) or a
 * prefixed external id (`bot:greedy`). Unknown algorithms fall back to a
 * title-cased version of the slug so the history never shows a raw id.
 */
export function botLabel(botId: string): string {
	const algorithm = botAlgorithm(botId);
	return BOT_BY_ID.get(algorithm)?.label ?? titleCase(algorithm);
}

function titleCase(slug: string): string {
	return slug
		.split('-')
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}
