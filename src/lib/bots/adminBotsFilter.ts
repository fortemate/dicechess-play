// Pure query, search, filtering, and sorting logic for `/me/admin/bots` (#47).
//
// This module deliberately stays pure and rune-free so its filtering, search, and sorting behavior
// can be tested, reviewed, and reasoned about independently of Svelte rendering. URL search params
// are the source of truth for sharable, back-button friendly administrative views.

import type { AdminBot } from './adminApi';

export type LadderFilter = 'all' | 'on' | 'off';
export type CatalogFilter = 'all' | 'open' | 'closed';
export type OwnershipFilter = 'all' | 'owned' | 'unowned';
export type WebhookFilter = 'all' | 'configured' | 'none';
export type ProvisionalFilter = 'all' | 'provisional' | 'established';
export type CapacityFilter = 'all' | 'reached' | 'available';

export type AdminBotSortKey = 'identity' | 'rating' | 'utilization';
export type SortDirection = 'asc' | 'desc';

export interface AdminBotsQuery {
	search: string;
	ladder: LadderFilter;
	catalog: CatalogFilter;
	ownership: OwnershipFilter;
	webhook: WebhookFilter;
	provisional: ProvisionalFilter;
	capacity: CapacityFilter;
	capability: string; // 'all' or specific capability name
	sort: AdminBotSortKey;
	dir: SortDirection;
}

export const DEFAULT_ADMIN_BOTS_QUERY: AdminBotsQuery = {
	search: '',
	ladder: 'all',
	catalog: 'all',
	ownership: 'all',
	webhook: 'all',
	provisional: 'all',
	capacity: 'all',
	capability: 'all',
	sort: 'identity',
	dir: 'asc',
};

const LADDER_VALUES: readonly LadderFilter[] = ['all', 'on', 'off'];
const CATALOG_VALUES: readonly CatalogFilter[] = ['all', 'open', 'closed'];
const OWNERSHIP_VALUES: readonly OwnershipFilter[] = ['all', 'owned', 'unowned'];
const WEBHOOK_VALUES: readonly WebhookFilter[] = ['all', 'configured', 'none'];
const PROVISIONAL_VALUES: readonly ProvisionalFilter[] = ['all', 'provisional', 'established'];
const CAPACITY_VALUES: readonly CapacityFilter[] = ['all', 'reached', 'available'];
const SORT_KEYS: readonly AdminBotSortKey[] = ['identity', 'rating', 'utilization'];
const SORT_DIRS: readonly SortDirection[] = ['asc', 'desc'];

export function parseAdminBotsQuery(input: URLSearchParams | URL | string): AdminBotsQuery {
	const params =
		typeof input === 'string'
			? new URLSearchParams(input.startsWith('?') ? input.slice(1) : input)
			: input instanceof URL
				? input.searchParams
				: input;

	const search = params.get('q')?.trim() ?? '';
	const ladder = (params.get('ladder') as LadderFilter) ?? 'all';
	const catalog = (params.get('catalog') as CatalogFilter) ?? 'all';
	const ownership = (params.get('ownership') as OwnershipFilter) ?? 'all';
	const webhook = (params.get('webhook') as WebhookFilter) ?? 'all';
	const provisional = (params.get('provisional') as ProvisionalFilter) ?? 'all';
	const capacity = (params.get('capacity') as CapacityFilter) ?? 'all';
	const capability = params.get('capability')?.trim() ?? 'all';
	const sort = (params.get('sort') as AdminBotSortKey) ?? 'identity';
	const dir = (params.get('dir') as SortDirection) ?? 'asc';

	return {
		search,
		ladder: LADDER_VALUES.includes(ladder) ? ladder : 'all',
		catalog: CATALOG_VALUES.includes(catalog) ? catalog : 'all',
		ownership: OWNERSHIP_VALUES.includes(ownership) ? ownership : 'all',
		webhook: WEBHOOK_VALUES.includes(webhook) ? webhook : 'all',
		provisional: PROVISIONAL_VALUES.includes(provisional) ? provisional : 'all',
		capacity: CAPACITY_VALUES.includes(capacity) ? capacity : 'all',
		capability: capability === '' ? 'all' : capability,
		sort: SORT_KEYS.includes(sort) ? sort : 'identity',
		dir: SORT_DIRS.includes(dir) ? dir : 'asc',
	};
}

export function serializeAdminBotsQuery(query: AdminBotsQuery): URLSearchParams {
	const params = new URLSearchParams();

	if (query.search.trim() !== '') params.set('q', query.search.trim());
	if (query.ladder !== 'all') params.set('ladder', query.ladder);
	if (query.catalog !== 'all') params.set('catalog', query.catalog);
	if (query.ownership !== 'all') params.set('ownership', query.ownership);
	if (query.webhook !== 'all') params.set('webhook', query.webhook);
	if (query.provisional !== 'all') params.set('provisional', query.provisional);
	if (query.capacity !== 'all') params.set('capacity', query.capacity);
	if (query.capability !== 'all' && query.capability.trim() !== '') {
		params.set('capability', query.capability.trim());
	}
	if (query.sort !== 'identity') params.set('sort', query.sort);
	if (query.dir !== 'asc') params.set('dir', query.dir);

	return params;
}

/** Counts how many filter dimensions are currently non-default (excluding search, sort, and dir). */
export function countActiveFilters(query: AdminBotsQuery): number {
	let count = 0;
	if (query.ladder !== 'all') count++;
	if (query.catalog !== 'all') count++;
	if (query.ownership !== 'all') count++;
	if (query.webhook !== 'all') count++;
	if (query.provisional !== 'all') count++;
	if (query.capacity !== 'all') count++;
	if (query.capability !== 'all' && query.capability.trim() !== '') count++;
	return count;
}

/** Extracts all unique capability names present across the given bots list, sorted alphabetically. */
export function extractAvailableCapabilities(bots: AdminBot[]): string[] {
	const set = new Set<string>();
	for (const bot of bots) {
		if (bot.webhook?.capabilities) {
			for (const cap of bot.webhook.capabilities) {
				const trimmed = cap.trim();
				if (trimmed) set.add(trimmed);
			}
		}
	}
	return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Determines if a bot's capacity is fully reached. */
export function isCapacityReached(bot: AdminBot): boolean {
	return bot.maxConcurrentGames > 0 && bot.activeGames >= bot.maxConcurrentGames;
}

/** Computes load utilization ratio for a bot (0 to 1+). */
export function computeUtilization(bot: AdminBot): number {
	if (bot.maxConcurrentGames <= 0) return 0;
	return bot.activeGames / bot.maxConcurrentGames;
}

/** Applies search, filters, and deterministic sorting to a fleet of AdminBots. */
export function applyAdminBotsQuery(bots: AdminBot[], query: AdminBotsQuery): AdminBot[] {
	const searchLower = query.search.trim().toLowerCase();

	const filtered = bots.filter((bot) => {
		// Search matches team, bot name, and webhook URL case-insensitively
		if (searchLower) {
			const matchesTeam = bot.team.toLowerCase().includes(searchLower);
			const matchesName = bot.name.toLowerCase().includes(searchLower);
			const matchesCombined = `${bot.team}/${bot.name}`.toLowerCase().includes(searchLower);
			const matchesWebhook =
				bot.webhook?.url !== undefined && bot.webhook.url.toLowerCase().includes(searchLower);

			if (!matchesTeam && !matchesName && !matchesCombined && !matchesWebhook) {
				return false;
			}
		}

		// Ladder filter
		if (query.ladder === 'on' && !bot.onLadder) return false;
		if (query.ladder === 'off' && bot.onLadder) return false;

		// Catalog filter
		if (query.catalog === 'open' && !bot.openToHumans) return false;
		if (query.catalog === 'closed' && bot.openToHumans) return false;

		// Ownership filter
		if (query.ownership === 'owned' && !bot.owned) return false;
		if (query.ownership === 'unowned' && bot.owned) return false;

		// Webhook filter
		if (query.webhook === 'configured' && !bot.webhook) return false;
		if (query.webhook === 'none' && bot.webhook !== null) return false;

		// Provisional filter
		if (query.provisional === 'provisional' && !bot.provisional) return false;
		if (query.provisional === 'established' && bot.provisional) return false;

		// Capacity reached filter
		if (query.capacity === 'reached' && !isCapacityReached(bot)) return false;
		if (query.capacity === 'available' && isCapacityReached(bot)) return false;

		// Capability filter
		if (query.capability !== 'all' && query.capability.trim() !== '') {
			const targetCap = query.capability.trim().toLowerCase();
			const hasCap =
				bot.webhook?.capabilities.some((c) => c.trim().toLowerCase() === targetCap) ?? false;
			if (!hasCap) return false;
		}

		return true;
	});

	// Deterministic sort with tie-breaking by identity (team, then name)
	const sign = query.dir === 'desc' ? -1 : 1;

	return filtered.slice().sort((a, b) => {
		if (query.sort === 'rating') {
			const rA = Number.isFinite(a.rating) ? a.rating : 0;
			const rB = Number.isFinite(b.rating) ? b.rating : 0;
			const diff = rA - rB;
			if (diff !== 0) return diff * sign;
		} else if (query.sort === 'utilization') {
			const uA = computeUtilization(a);
			const uB = computeUtilization(b);
			const diff = uA - uB;
			if (diff !== 0) return diff * sign;
		} else {
			const teamComp = a.team.localeCompare(b.team);
			if (teamComp !== 0) return teamComp * sign;
			return a.name.localeCompare(b.name) * sign;
		}

		// Always break ties deterministically by team then name (ascending for stability)
		const teamComp = a.team.localeCompare(b.team);
		if (teamComp !== 0) return teamComp;
		return a.name.localeCompare(b.name);
	});
}
