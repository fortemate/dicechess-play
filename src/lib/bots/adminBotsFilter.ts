// Pure query, search, filtering, and sorting logic for `/me/admin/bots` (#47).
//
// This module deliberately stays pure and rune-free so its filtering, search, and sorting behavior
// can be tested, reviewed, and reasoned about independently of Svelte rendering. URL search params
// are the source of truth for sharable, back-button friendly administrative views.

import type { AdminBot } from './adminApi';

export type LadderFilter = 'all' | 'on' | 'off';
export type CatalogFilter = 'all' | 'open' | 'closed';
export type OwnershipFilter = 'all' | 'owned' | 'unowned';
export type WebhookFilter = 'all' | 'configured' | 'verified' | 'unverified' | 'none';
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
const WEBHOOK_VALUES: readonly WebhookFilter[] = [
	'all',
	'configured',
	'verified',
	'unverified',
	'none',
];
const PROVISIONAL_VALUES: readonly ProvisionalFilter[] = ['all', 'provisional', 'established'];
const CAPACITY_VALUES: readonly CapacityFilter[] = ['all', 'reached', 'available'];
const SORT_KEYS: readonly AdminBotSortKey[] = ['identity', 'rating', 'utilization'];
const SORT_DIRS: readonly SortDirection[] = ['asc', 'desc'];

function normalizeString(val: string): string {
	return val.normalize('NFC').trim().toLowerCase();
}

// Identity ordering is part of this module's deterministic contract, so it must not depend on
// the runtime's default locale the way a bare `localeCompare` does. The collator is built once
// instead of per comparison, which is what `localeCompare` costs inside a sort.
const IDENTITY_COLLATOR = new Intl.Collator('en');

/** A webhook counts as verified only when it carries a non-blank `verifiedAt` timestamp. */
function isWebhookVerified(webhook: AdminBot['webhook']): boolean {
	return Boolean(webhook?.verifiedAt?.trim());
}

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
	// Keyed by the same normalization the capability filter matches on, so the dropdown cannot
	// offer two entries ('Draws' and 'draws') that select an identical set of bots. First wins.
	const byKey = new Map<string, string>();
	for (const bot of bots) {
		if (bot.webhook?.capabilities) {
			for (const cap of bot.webhook.capabilities) {
				const trimmed = cap.trim();
				if (!trimmed) continue;
				const key = normalizeString(cap);
				if (!byKey.has(key)) byKey.set(key, trimmed);
			}
		}
	}
	return Array.from(byKey.values()).sort(IDENTITY_COLLATOR.compare);
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
	const searchNorm = normalizeString(query.search);

	const filtered = bots.filter((bot) => {
		// Search matches team, bot name, and webhook URL case-insensitively with NFC normalization
		if (searchNorm) {
			const teamNorm = normalizeString(bot.team);
			const nameNorm = normalizeString(bot.name);
			const combinedNorm = normalizeString(`${bot.team}/${bot.name}`);
			const webhookNorm = bot.webhook?.url ? normalizeString(bot.webhook.url) : '';

			const matchesTeam = teamNorm.includes(searchNorm);
			const matchesName = nameNorm.includes(searchNorm);
			const matchesCombined = combinedNorm.includes(searchNorm);
			const matchesWebhook = webhookNorm !== '' && webhookNorm.includes(searchNorm);

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
		if (query.webhook === 'verified' && !isWebhookVerified(bot.webhook)) return false;
		// 'unverified' is configured-but-not-yet-verified, so a bot with no webhook is excluded too.
		if (query.webhook === 'unverified' && (!bot.webhook || isWebhookVerified(bot.webhook))) {
			return false;
		}
		if (query.webhook === 'none' && bot.webhook !== null) return false;

		// Provisional filter
		if (query.provisional === 'provisional' && !bot.provisional) return false;
		if (query.provisional === 'established' && bot.provisional) return false;

		// Capacity reached filter
		if (query.capacity === 'reached' && !isCapacityReached(bot)) return false;
		if (query.capacity === 'available' && isCapacityReached(bot)) return false;

		// Capability filter
		if (query.capability !== 'all' && query.capability.trim() !== '') {
			const targetCap = normalizeString(query.capability);
			const hasCap =
				bot.webhook?.capabilities.some((c) => normalizeString(c) === targetCap) ?? false;
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
			const teamComp = IDENTITY_COLLATOR.compare(a.team, b.team);
			if (teamComp !== 0) return teamComp * sign;
			return IDENTITY_COLLATOR.compare(a.name, b.name) * sign;
		}

		// Always break ties deterministically by team then name (ascending for stability)
		const teamComp = IDENTITY_COLLATOR.compare(a.team, b.team);
		if (teamComp !== 0) return teamComp;
		return IDENTITY_COLLATOR.compare(a.name, b.name);
	});
}
