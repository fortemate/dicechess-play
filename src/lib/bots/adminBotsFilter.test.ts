import { describe, expect, it } from 'vitest';
import type { AdminBot } from './adminApi';
import {
	applyAdminBotsQuery,
	countActiveFilters,
	DEFAULT_ADMIN_BOTS_QUERY,
	extractAvailableCapabilities,
	isCapacityReached,
	parseAdminBotsQuery,
	serializeAdminBotsQuery,
	type AdminBotsQuery,
} from './adminBotsFilter';

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

describe('adminBotsFilter', () => {
	describe('search', () => {
		it('matches team name case-insensitively', () => {
			const res = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				search: 'BETA',
			});
			expect(res.map((b) => b.name)).toEqual(['bravo']);
		});

		it('matches bot name case-insensitively', () => {
			const res = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				search: 'Alpha',
			});
			expect(res.map((b) => b.name)).toEqual(['alpha']);
		});

		it('matches combined team/name', () => {
			const res = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				search: 'acme/charlie',
			});
			expect(res.map((b) => b.name)).toEqual(['charlie']);
		});

		it('matches webhook URL case-insensitively', () => {
			const res = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				search: 'HOOKS/ALPHA',
			});
			expect(res.map((b) => b.name)).toEqual(['alpha']);
		});

		it('returns empty list when search does not match any bot', () => {
			const res = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				search: 'nonexistent',
			});
			expect(res).toEqual([]);
		});
	});

	describe('filters', () => {
		it('filters by ladder status', () => {
			const on = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				ladder: 'on',
			});
			expect(on.map((b) => b.name)).toEqual(['alpha', 'charlie']);

			const off = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				ladder: 'off',
			});
			expect(off.map((b) => b.name)).toEqual(['bravo']);
		});

		it('filters by catalog open/closed', () => {
			const open = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				catalog: 'open',
			});
			expect(open.map((b) => b.name)).toEqual(['alpha']);

			const closed = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				catalog: 'closed',
			});
			expect(closed.map((b) => b.name)).toEqual(['charlie', 'bravo']);
		});

		it('filters by ownership', () => {
			const owned = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				ownership: 'owned',
			});
			expect(owned.map((b) => b.name)).toEqual(['alpha', 'charlie']);

			const unowned = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				ownership: 'unowned',
			});
			expect(unowned.map((b) => b.name)).toEqual(['bravo']);
		});

		it('filters by webhook configured vs none', () => {
			const configured = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				webhook: 'configured',
			});
			expect(configured.map((b) => b.name)).toEqual(['alpha', 'charlie']);

			const none = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				webhook: 'none',
			});
			expect(none.map((b) => b.name)).toEqual(['bravo']);
		});

		it('filters by provisional status', () => {
			const prov = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				provisional: 'provisional',
			});
			expect(prov.map((b) => b.name)).toEqual(['bravo']);

			const est = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				provisional: 'established',
			});
			expect(est.map((b) => b.name)).toEqual(['alpha', 'charlie']);
		});

		it('filters by capacity reached vs available', () => {
			const reached = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				capacity: 'reached',
			});
			expect(reached.map((b) => b.name)).toEqual(['alpha']);

			const avail = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				capacity: 'available',
			});
			expect(avail.map((b) => b.name)).toEqual(['charlie', 'bravo']);
		});

		it('filters by capability', () => {
			const draws = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				capability: 'draws',
			});
			expect(draws.map((b) => b.name)).toEqual(['alpha']);

			const custom = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				capability: 'custom',
			});
			expect(custom.map((b) => b.name)).toEqual(['charlie']);
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

		it('round-trips full query through parseAdminBotsQuery', () => {
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
			const parsed = parseAdminBotsQuery(params);
			expect(parsed).toEqual(query);
		});

		it('handles malformed or unrecognised query params safely', () => {
			const parsed = parseAdminBotsQuery(
				'?ladder=invalid&catalog=unknown&sort=hack&dir=sideways&ownership=bad',
			);
			expect(parsed).toEqual(DEFAULT_ADMIN_BOTS_QUERY);
		});
	});
});
