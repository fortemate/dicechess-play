import { describe, expect, it } from 'vitest';
import type { AdminBot } from './adminApi';
import {
	applyAdminBotsQuery,
	countActiveFilters,
	DEFAULT_ADMIN_BOTS_QUERY,
	extractAvailableCapabilities,
	isCapacityReached,
	normalizeForSearch,
	parseAdminBotsQuery,
	serializeAdminBotsQuery,
	type AdminBotsQuery,
} from './adminBotsFilter';

// ---------------------------------------------------------------------------
// Baseline fixtures (pre-existing)
// ---------------------------------------------------------------------------

const testBots: AdminBot[] = [
	{
		team: 'acme',
		name: 'alpha',
		rating: 1800,
		rd: 50,
		provisional: false,
		onLadder: true,
		openToHumans: true,
		description: 'Alpha bot',
		maxConcurrentGames: 4,
		ladderAllowance: 3,
		activeGames: 4, // 100% capacity reached
		owned: true,
		webhook: {
			url: 'https://acme.org/hooks/alpha',
			verifiedAt: '2026-08-01T00:00:00Z',
			capabilities: ['draws', 'resign'],
			lastFailure: null,
		},
	},
	{
		team: 'beta',
		name: 'bravo',
		rating: 1400,
		rd: 300,
		provisional: true,
		onLadder: false,
		openToHumans: false,
		description: null,
		maxConcurrentGames: 2,
		ladderAllowance: 2,
		activeGames: 0, // 0% utilization
		owned: false,
		webhook: null,
	},
	{
		team: 'acme',
		name: 'charlie',
		rating: 1600,
		rd: 70,
		provisional: false,
		onLadder: true,
		openToHumans: false,
		description: 'Charlie bot',
		maxConcurrentGames: 8,
		ladderAllowance: 8,
		activeGames: 2, // 25% utilization
		owned: true,
		webhook: {
			url: 'https://acme.org/hooks/charlie',
			verifiedAt: '2026-08-05T00:00:00Z',
			capabilities: ['custom'],
			lastFailure: {
				at: '2026-08-10T12:00:00Z',
				reason: 'timeout',
			},
		},
	},
];

// ---------------------------------------------------------------------------
// Extended fixtures (added for #49 DoD gaps)
// ---------------------------------------------------------------------------

/** Bot with no webhook registration at all. */
const noWebhookBot: AdminBot = {
	team: 'delta',
	name: 'echo',
	rating: 1500,
	rd: 120,
	provisional: false,
	onLadder: false,
	openToHumans: false,
	description: null,
	maxConcurrentGames: 0, // unlimited (utilization = 0 by definition)
	ladderAllowance: 0,
	activeGames: 0, // zero active games
	owned: false,
	webhook: null,
};

/** Bot at full capacity (maxConcurrentGames > 0 && activeGames >= max). */
const fullCapacityBot: AdminBot = {
	team: 'gamma',
	name: 'full',
	rating: 1550,
	rd: 60,
	provisional: false,
	onLadder: true,
	openToHumans: true,
	description: 'At capacity',
	maxConcurrentGames: 1,
	ladderAllowance: 1,
	activeGames: 1,
	owned: true,
	webhook: {
		url: 'https://gamma.io/hook',
		verifiedAt: '2026-07-01T00:00:00Z',
		capabilities: ['DRAWS', 'Resign'], // mixed-case — duplicates from alpha's 'draws'/'resign'
		lastFailure: null,
	},
};

/** Provisional bot. */
const provisionalBot: AdminBot = {
	team: 'epsilon',
	name: 'newbot',
	rating: NaN, // absent/invalid rating — must be treated as 0 for sorting
	rd: 350,
	provisional: true,
	onLadder: false,
	openToHumans: false,
	description: null,
	maxConcurrentGames: 2,
	ladderAllowance: 0,
	activeGames: 0,
	owned: true,
	webhook: null,
};

/** Bot with an unknown/legacy capability value. */
const unknownCapabilityBot: AdminBot = {
	team: 'zeta',
	name: 'legacy',
	rating: 1300,
	rd: 80,
	provisional: false,
	onLadder: true,
	openToHumans: false,
	description: null,
	maxConcurrentGames: 4,
	ladderAllowance: 4,
	activeGames: 1,
	owned: false,
	webhook: {
		url: 'https://zeta.example/hook',
		verifiedAt: '2026-06-01T00:00:00Z',
		capabilities: ['legacy-protocol-v1'], // unknown legacy value — must be preserved
		lastFailure: null,
	},
};

/**
 * Bot whose team/name contain non-ASCII characters stored in NFD decomposed form.
 * U+00E9 "é" decomposed = U+0065 "e" + U+0301 combining acute.
 */
const nfdTeam = 'e\u0301quipe'; // NFD "équipe"
const nfdName = 'robot-e\u0301'; // NFD "robot-é"
const decomposedBot: AdminBot = {
	team: nfdTeam,
	name: nfdName,
	rating: 1450,
	rd: 90,
	provisional: false,
	onLadder: true,
	openToHumans: true,
	description: null,
	maxConcurrentGames: 3,
	ladderAllowance: 3,
	activeGames: 1,
	owned: false,
	webhook: {
		url: 'https://equipe.example/hook',
		verifiedAt: '2026-08-20T00:00:00Z',
		capabilities: ['\u00e9lan'], // NFC "élan"
		lastFailure: null,
	},
};

/** Same logical identity as decomposedBot but stored NFC. */
const nfcTeam = '\u00e9quipe'; // NFC "équipe"
const nfcName = 'robot-\u00e9'; // NFC "robot-é"

// ---------------------------------------------------------------------------
// Baseline tests (pre-existing, must continue to pass)
// ---------------------------------------------------------------------------

describe('adminBotsFilter', () => {
	describe('search matching', () => {
		it.each([
			['team name case-insensitively', 'BETA', ['bravo']],
			['bot name case-insensitively', 'Alpha', ['alpha']],
			['combined team/name query', 'acme/charlie', ['charlie']],
			['webhook URL case-insensitively', 'HOOKS/ALPHA', ['alpha']],
			['non-matching query returning empty', 'nonexistent', []],
		])('evaluates search for %s', (_, searchTerm, expectedBotNames) => {
			const res = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				search: searchTerm,
			});
			expect(res.map((b) => b.name)).toEqual(expectedBotNames);
		});
	});

	describe('multi-attribute filtering', () => {
		it.each([
			['ladder on', { ladder: 'on' as const }, ['alpha', 'charlie']],
			['ladder off', { ladder: 'off' as const }, ['bravo']],
			['catalog open', { catalog: 'open' as const }, ['alpha']],
			['catalog closed', { catalog: 'closed' as const }, ['charlie', 'bravo']],
			['ownership owned', { ownership: 'owned' as const }, ['alpha', 'charlie']],
			['ownership unowned', { ownership: 'unowned' as const }, ['bravo']],
			['webhook configured', { webhook: 'configured' as const }, ['alpha', 'charlie']],
			['webhook none', { webhook: 'none' as const }, ['bravo']],
			['provisional true', { provisional: 'provisional' as const }, ['bravo']],
			['provisional established', { provisional: 'established' as const }, ['alpha', 'charlie']],
			['capacity reached', { capacity: 'reached' as const }, ['alpha']],
			['capacity available', { capacity: 'available' as const }, ['charlie', 'bravo']],
			['capability draws', { capability: 'draws' }, ['alpha']],
			['capability draws with whitespace', { capability: '  draws  ' }, ['alpha']],
			['capability custom', { capability: 'custom' }, ['charlie']],
		])('filters by %s', (_, filterOverride, expectedBotNames) => {
			const res = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				...filterOverride,
			});
			expect(res.map((b) => b.name)).toEqual(expectedBotNames);
		});
	});

	describe('sorting', () => {
		it('sorts by identity asc and desc', () => {
			const asc = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				sort: 'identity',
				dir: 'asc',
			});
			expect(asc.map((b) => `${b.team}/${b.name}`)).toEqual([
				'acme/alpha',
				'acme/charlie',
				'beta/bravo',
			]);

			const desc = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				sort: 'identity',
				dir: 'desc',
			});
			expect(desc.map((b) => `${b.team}/${b.name}`)).toEqual([
				'beta/bravo',
				'acme/charlie',
				'acme/alpha',
			]);
		});

		it('sorts by rating asc and desc with tie breaking', () => {
			const asc = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				sort: 'rating',
				dir: 'asc',
			});
			expect(asc.map((b) => b.rating)).toEqual([1400, 1600, 1800]);

			const desc = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				sort: 'rating',
				dir: 'desc',
			});
			expect(desc.map((b) => b.rating)).toEqual([1800, 1600, 1400]);
		});

		it('sorts by utilization asc and desc', () => {
			// alpha: 4/4 (1.0), bravo: 0/2 (0.0), charlie: 2/8 (0.25)
			const asc = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				sort: 'utilization',
				dir: 'asc',
			});
			expect(asc.map((b) => b.name)).toEqual(['bravo', 'charlie', 'alpha']);

			const desc = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				sort: 'utilization',
				dir: 'desc',
			});
			expect(desc.map((b) => b.name)).toEqual(['alpha', 'charlie', 'bravo']);
		});
	});

	describe('helpers and utilities', () => {
		it('extractAvailableCapabilities lists sorted unique capabilities', () => {
			expect(extractAvailableCapabilities(testBots)).toEqual(['custom', 'draws', 'resign']);
		});

		it('isCapacityReached computes boolean correctly', () => {
			expect(isCapacityReached(testBots[0])).toBe(true);
			expect(isCapacityReached(testBots[1])).toBe(false);
			expect(isCapacityReached(testBots[2])).toBe(false);
		});

		it('countActiveFilters counts only non-default filters', () => {
			expect(countActiveFilters(DEFAULT_ADMIN_BOTS_QUERY)).toBe(0);

			const query: AdminBotsQuery = {
				...DEFAULT_ADMIN_BOTS_QUERY,
				search: 'some search', // search does not count as filter
				ladder: 'on',
				webhook: 'configured',
				capability: 'draws',
			};
			expect(countActiveFilters(query)).toBe(3);
		});
	});

	describe('URL serialization and parsing', () => {
		it('serializes default query to empty search params', () => {
			const params = serializeAdminBotsQuery(DEFAULT_ADMIN_BOTS_QUERY);
			expect(params.toString()).toBe('');
		});

		it('serializes active filters cleanly', () => {
			const query: AdminBotsQuery = {
				search: 'bot',
				ladder: 'on',
				catalog: 'closed',
				ownership: 'owned',
				webhook: 'configured',
				provisional: 'established',
				capacity: 'reached',
				capability: 'draws',
				sort: 'rating',
				dir: 'desc',
			};
			const params = serializeAdminBotsQuery(query);
			expect(params.get('q')).toBe('bot');
			expect(params.get('ladder')).toBe('on');
			expect(params.get('catalog')).toBe('closed');
			expect(params.get('ownership')).toBe('owned');
			expect(params.get('webhook')).toBe('configured');
			expect(params.get('provisional')).toBe('established');
			expect(params.get('capacity')).toBe('reached');
			expect(params.get('capability')).toBe('draws');
			expect(params.get('sort')).toBe('rating');
			expect(params.get('dir')).toBe('desc');
		});

		it('round-trips full query through parseAdminBotsQuery with URLSearchParams and URL object', () => {
			const query: AdminBotsQuery = {
				search: 'alpha',
				ladder: 'off',
				catalog: 'open',
				ownership: 'unowned',
				webhook: 'none',
				provisional: 'provisional',
				capacity: 'available',
				capability: 'custom',
				sort: 'utilization',
				dir: 'desc',
			};
			const params = serializeAdminBotsQuery(query);
			const parsedFromParams = parseAdminBotsQuery(params);
			expect(parsedFromParams).toEqual(query);

			const url = new URL(`http://localhost:3000/me/admin/bots?${params.toString()}`);
			const parsedFromUrl = parseAdminBotsQuery(url);
			expect(parsedFromUrl).toEqual(query);
		});

		it('handles malformed or unrecognised query params safely', () => {
			const parsed = parseAdminBotsQuery(
				'?ladder=invalid&catalog=unknown&sort=hack&dir=sideways&ownership=bad',
			);
			expect(parsed).toEqual(DEFAULT_ADMIN_BOTS_QUERY);
		});
	});

	// -------------------------------------------------------------------------
	// Regression tests added for #49
	// -------------------------------------------------------------------------

	describe('regression: Unicode search normalization', () => {
		it('normalizeForSearch produces identical keys for NFC and NFD forms', () => {
			const nfc = '\u00e9'; // precomposed é
			const nfd = 'e\u0301'; // decomposed é
			expect(normalizeForSearch(nfc)).toBe(normalizeForSearch(nfd));
		});

		it('NFC search term matches bot whose team is stored in NFD', () => {
			// decomposedBot.team = NFD "équipe"; search with NFC "équipe"
			const res = applyAdminBotsQuery([decomposedBot], {
				...DEFAULT_ADMIN_BOTS_QUERY,
				search: nfcTeam, // NFC form
			});
			expect(res.map((b) => b.name)).toEqual([nfdName]);
		});

		it('NFD search term matches bot whose team is stored in NFC', () => {
			// Artificially create a bot stored with NFC team, search with NFD term
			const nfcBot: AdminBot = { ...decomposedBot, team: nfcTeam, name: nfcName };
			const res = applyAdminBotsQuery([nfcBot], {
				...DEFAULT_ADMIN_BOTS_QUERY,
				search: nfdTeam, // NFD form
			});
			expect(res.map((b) => b.name)).toEqual([nfcName]);
		});

		it('case-insensitive Unicode search matches mixed-case NFC team', () => {
			const mixedCaseBot: AdminBot = { ...testBots[0], team: 'ACME', name: 'upperbot' };
			const res = applyAdminBotsQuery([mixedCaseBot], {
				...DEFAULT_ADMIN_BOTS_QUERY,
				search: 'acme',
			});
			expect(res.map((b) => b.name)).toEqual(['upperbot']);
		});
	});

	describe('regression: locale-pinned identity sort tie-breaking', () => {
		it('two bots with identical ratings break ties by identity in pinned locale order', () => {
			const botA: AdminBot = {
				...testBots[0],
				team: 'zebra',
				name: 'ant',
				rating: 1500,
			};
			const botB: AdminBot = {
				...testBots[0],
				team: 'alpha',
				name: 'zoo',
				rating: 1500,
			};
			const asc = applyAdminBotsQuery([botA, botB], {
				...DEFAULT_ADMIN_BOTS_QUERY,
				sort: 'rating',
				dir: 'asc',
			});
			// Tied on rating: break by team asc → "alpha" before "zebra"
			expect(asc.map((b) => b.team)).toEqual(['alpha', 'zebra']);
		});

		it('two bots with identical utilization break ties by identity stably', () => {
			const botA: AdminBot = {
				...testBots[0],
				team: 'zz-team',
				name: 'bot',
				maxConcurrentGames: 4,
				activeGames: 2, // 0.5
			};
			const botB: AdminBot = {
				...testBots[0],
				team: 'aa-team',
				name: 'bot',
				maxConcurrentGames: 4,
				activeGames: 2, // 0.5
			};
			const asc = applyAdminBotsQuery([botA, botB], {
				...DEFAULT_ADMIN_BOTS_QUERY,
				sort: 'utilization',
				dir: 'asc',
			});
			// Tied on utilization: break by team asc → "aa-team" before "zz-team"
			expect(asc.map((b) => b.team)).toEqual(['aa-team', 'zz-team']);
		});

		it('tie-break order is ascending identity regardless of sort direction', () => {
			const botA: AdminBot = {
				...testBots[0],
				team: 'zebra',
				name: 'bot',
				rating: 1500,
			};
			const botB: AdminBot = {
				...testBots[0],
				team: 'alpha',
				name: 'bot',
				rating: 1500,
			};
			// Even when dir='desc', ties must still break ascending by identity
			const desc = applyAdminBotsQuery([botA, botB], {
				...DEFAULT_ADMIN_BOTS_QUERY,
				sort: 'rating',
				dir: 'desc',
			});
			expect(desc.map((b) => b.team)).toEqual(['alpha', 'zebra']);
		});
	});

	describe('regression: capability deduplication (case and Unicode canonical form)', () => {
		it('collapses case-equivalent capability values to a single entry', () => {
			// fullCapacityBot has 'DRAWS' and 'Resign'; testBots[0] has 'draws' and 'resign'
			const caps = extractAvailableCapabilities([testBots[0], fullCapacityBot]);
			// Should deduplicate: 'draws'/'DRAWS' → one, 'resign'/'Resign' → one
			expect(caps.filter((c) => c.toLowerCase() === 'draws')).toHaveLength(1);
			expect(caps.filter((c) => c.toLowerCase() === 'resign')).toHaveLength(1);
		});

		it('preserves first-seen casing for display', () => {
			// testBots[0] (draws/resign) is listed before fullCapacityBot (DRAWS/Resign)
			// → first-seen wins: 'draws' and 'resign' (lowercase)
			const caps = extractAvailableCapabilities([testBots[0], fullCapacityBot]);
			expect(caps).toContain('draws');
			expect(caps).toContain('resign');
			expect(caps).not.toContain('DRAWS');
			expect(caps).not.toContain('Resign');
		});

		it('collapses NFC/NFD-equivalent capability values to a single entry', () => {
			// decomposedBot.webhook.capabilities = ['\u00e9lan'] (NFC)
			const nfdCapBot: AdminBot = {
				...unknownCapabilityBot,
				webhook: {
					url: 'https://x.example',
					verifiedAt: '2026-01-01T00:00:00Z',
					capabilities: ['e\u0301lan'], // NFD "élan"
					lastFailure: null,
				},
			};
			const caps = extractAvailableCapabilities([decomposedBot, nfdCapBot]);
			// NFC '\u00e9lan' and NFD 'e\u0301lan' are canonical equivalents — one entry
			expect(caps.filter((c) => c.normalize('NFC') === '\u00e9lan')).toHaveLength(1);
		});

		it('preserves unknown legacy capability values for display', () => {
			const caps = extractAvailableCapabilities([unknownCapabilityBot]);
			expect(caps).toContain('legacy-protocol-v1');
		});
	});

	describe('regression: absent/invalid numeric values in sort', () => {
		it('treats NaN rating as 0 for sort ordering', () => {
			// provisionalBot has NaN rating — should sort alongside other zero-rated bots
			const botZero: AdminBot = { ...testBots[0], team: 'zzz', name: 'zero', rating: 0 };
			const asc = applyAdminBotsQuery([provisionalBot, botZero], {
				...DEFAULT_ADMIN_BOTS_QUERY,
				sort: 'rating',
				dir: 'asc',
			});
			// Both map to 0 — tie broken by identity: 'epsilon/newbot' < 'zzz/zero'
			expect(asc.map((b) => b.name)).toEqual(['newbot', 'zero']);
		});

		it('treats Infinity rating as 0 for sort ordering', () => {
			const infBot: AdminBot = { ...testBots[0], team: 'inf', name: 'bot', rating: Infinity };
			const normalBot: AdminBot = { ...testBots[0], team: 'mid', name: 'bot', rating: 1500 };
			const asc = applyAdminBotsQuery([infBot, normalBot], {
				...DEFAULT_ADMIN_BOTS_QUERY,
				sort: 'rating',
				dir: 'asc',
			});
			// Infinity → 0, 1500 stays — 0 < 1500 → infBot first
			expect(asc.map((b) => b.team)).toEqual(['inf', 'mid']);
		});

		it('bot with maxConcurrentGames=0 has utilization 0 and does not divide by zero', () => {
			expect(() =>
				applyAdminBotsQuery([noWebhookBot], { ...DEFAULT_ADMIN_BOTS_QUERY, sort: 'utilization' }),
			).not.toThrow();
			const res = applyAdminBotsQuery([noWebhookBot], {
				...DEFAULT_ADMIN_BOTS_QUERY,
				sort: 'utilization',
			});
			expect(res).toHaveLength(1);
			expect(res[0].name).toBe('echo');
		});
	});

	describe('extended fixture coverage', () => {
		it('bot with no webhook passes webhook:none filter', () => {
			const res = applyAdminBotsQuery([noWebhookBot], {
				...DEFAULT_ADMIN_BOTS_QUERY,
				webhook: 'none',
			});
			expect(res).toHaveLength(1);
		});

		it('bot with no webhook is excluded from webhook:configured filter', () => {
			const res = applyAdminBotsQuery([noWebhookBot], {
				...DEFAULT_ADMIN_BOTS_QUERY,
				webhook: 'configured',
			});
			expect(res).toHaveLength(0);
		});

		it('fullCapacityBot passes capacity:reached filter', () => {
			const res = applyAdminBotsQuery([fullCapacityBot], {
				...DEFAULT_ADMIN_BOTS_QUERY,
				capacity: 'reached',
			});
			expect(res).toHaveLength(1);
		});

		it('provisionalBot passes provisional:provisional filter', () => {
			const res = applyAdminBotsQuery([provisionalBot], {
				...DEFAULT_ADMIN_BOTS_QUERY,
				provisional: 'provisional',
			});
			expect(res).toHaveLength(1);
		});

		it('capability filter matches case-insensitively (query DRAWS matches stored draws)', () => {
			const res = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				capability: 'DRAWS',
			});
			// testBots[0] has 'draws' (lowercase) — should match
			expect(res.map((b) => b.name)).toEqual(['alpha']);
		});

		it('capability filter matches case-insensitively (query draws matches stored DRAWS)', () => {
			const res = applyAdminBotsQuery([fullCapacityBot], {
				...DEFAULT_ADMIN_BOTS_QUERY,
				capability: 'draws',
			});
			// fullCapacityBot has 'DRAWS' — should match via normalizeForSearch
			expect(res.map((b) => b.name)).toEqual(['full']);
		});

		it('decomposed non-ASCII bot is found by NFC search term', () => {
			const all = [testBots[0], decomposedBot];
			const res = applyAdminBotsQuery(all, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				search: '\u00e9quipe', // NFC "équipe"
			});
			expect(res.map((b) => b.name)).toEqual([nfdName]);
		});
	});
});
