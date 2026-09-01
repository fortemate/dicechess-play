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
});
