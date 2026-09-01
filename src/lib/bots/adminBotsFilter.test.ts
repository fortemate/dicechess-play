import { describe, expect, it } from 'vitest';
import type { AdminBot } from './adminApi';
import {
	applyAdminBotsQuery,
	computeUtilization,
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
		activeGames: 0, // 0 active games, 0% utilization
		owned: false,
		webhook: null, // missing webhook
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
	{
		team: 'Ácme',
		name: 'Éclair',
		rating: NaN, // non-finite rating value
		rd: 350,
		provisional: true,
		onLadder: false,
		openToHumans: true,
		description: 'Non-ASCII test bot',
		maxConcurrentGames: 0, // unconfigured capacity (0 max)
		ladderAllowance: 0,
		activeGames: 0,
		owned: false,
		webhook: {
			url: 'https://eclair.org/hook',
			verifiedAt: '', // unverified webhook
			capabilities: ['unknown_cap'], // unknown capability
			lastFailure: null,
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
			['non-ASCII team search', 'ácme', ['Éclair']],
			['non-ASCII bot name search', 'éclair', ['Éclair']],
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
			['ladder off', { ladder: 'off' as const }, ['Éclair', 'bravo']],
			['catalog open', { catalog: 'open' as const }, ['alpha', 'Éclair']],
			['catalog closed', { catalog: 'closed' as const }, ['charlie', 'bravo']],
			['ownership owned', { ownership: 'owned' as const }, ['alpha', 'charlie']],
			['ownership unowned', { ownership: 'unowned' as const }, ['Éclair', 'bravo']],
			['webhook configured', { webhook: 'configured' as const }, ['alpha', 'charlie', 'Éclair']],
			['webhook verified', { webhook: 'verified' as const }, ['alpha', 'charlie']],
			['webhook unverified', { webhook: 'unverified' as const }, ['Éclair']],
			['webhook none', { webhook: 'none' as const }, ['bravo']],
			['provisional true', { provisional: 'provisional' as const }, ['Éclair', 'bravo']],
			['provisional established', { provisional: 'established' as const }, ['alpha', 'charlie']],
			['capacity reached', { capacity: 'reached' as const }, ['alpha']],
			['capacity available', { capacity: 'available' as const }, ['charlie', 'Éclair', 'bravo']],
			['capability draws', { capability: 'draws' }, ['alpha']],
			['capability draws with whitespace', { capability: '  draws  ' }, ['alpha']],
			['capability custom', { capability: 'custom' }, ['charlie']],
			['capability unknown_cap', { capability: 'unknown_cap' }, ['Éclair']],
		])('filters by %s', (_, filterOverride, expectedBotNames) => {
			const res = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				...filterOverride,
			});
			expect(res.map((b) => b.name)).toEqual(expectedBotNames);
		});

		it('combines multiple filter dimensions simultaneously', () => {
			const res = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				ladder: 'on',
				ownership: 'owned',
				webhook: 'verified',
				capacity: 'available',
			});
			expect(res.map((b) => b.name)).toEqual(['charlie']);
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
				'Ácme/Éclair',
				'beta/bravo',
			]);

			const desc = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				sort: 'identity',
				dir: 'desc',
			});
			expect(desc.map((b) => `${b.team}/${b.name}`)).toEqual([
				'beta/bravo',
				'Ácme/Éclair',
				'acme/charlie',
				'acme/alpha',
			]);
		});

		it('sorts by rating asc and desc with explicit behavior for NaN rating', () => {
			const asc = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				sort: 'rating',
				dir: 'asc',
			});
			// Non-finite rating (NaN on Éclair) falls back to 0
			expect(asc.map((b) => `${b.name}:${Number.isNaN(b.rating) ? 0 : b.rating}`)).toEqual([
				'Éclair:0',
				'bravo:1400',
				'charlie:1600',
				'alpha:1800',
			]);

			const desc = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				sort: 'rating',
				dir: 'desc',
			});
			expect(desc.map((b) => `${b.name}:${Number.isNaN(b.rating) ? 0 : b.rating}`)).toEqual([
				'alpha:1800',
				'charlie:1600',
				'bravo:1400',
				'Éclair:0',
			]);
		});

		it('sorts by utilization asc and desc with tie breaking', () => {
			// alpha: 4/4 (1.0), bravo: 0/2 (0.0), charlie: 2/8 (0.25), Éclair: 0/0 (0.0)
			const asc = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				sort: 'utilization',
				dir: 'asc',
			});
			// bravo and Éclair tie at 0.0 utilization, broken deterministically by team then name
			expect(asc.map((b) => b.name)).toEqual(['Éclair', 'bravo', 'charlie', 'alpha']);

			const desc = applyAdminBotsQuery(testBots, {
				...DEFAULT_ADMIN_BOTS_QUERY,
				sort: 'utilization',
				dir: 'desc',
			});
			expect(desc.map((b) => b.name)).toEqual(['alpha', 'charlie', 'Éclair', 'bravo']);
		});
	});

	describe('helpers and utilities', () => {
		it('extractAvailableCapabilities lists sorted unique capabilities', () => {
			expect(extractAvailableCapabilities(testBots)).toEqual([
				'custom',
				'draws',
				'resign',
				'unknown_cap',
			]);
		});

		it('isCapacityReached computes boolean correctly', () => {
			expect(isCapacityReached(testBots[0])).toBe(true); // 4/4
			expect(isCapacityReached(testBots[1])).toBe(false); // 0/2
			expect(isCapacityReached(testBots[2])).toBe(false); // 2/8
			expect(isCapacityReached(testBots[3])).toBe(false); // 0/0
		});

		it('computeUtilization computes utilization ratio with safe fallbacks', () => {
			expect(computeUtilization(testBots[0])).toBe(1.0);
			expect(computeUtilization(testBots[1])).toBe(0);
			expect(computeUtilization(testBots[2])).toBe(0.25);
			expect(computeUtilization(testBots[3])).toBe(0);
		});

		it('countActiveFilters counts only non-default filters', () => {
			expect(countActiveFilters(DEFAULT_ADMIN_BOTS_QUERY)).toBe(0);

			const query: AdminBotsQuery = {
				...DEFAULT_ADMIN_BOTS_QUERY,
				search: 'some search', // search does not count as filter
				ladder: 'on',
				webhook: 'verified',
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

		it('serializes active filters cleanly in canonical order', () => {
			const query: AdminBotsQuery = {
				search: 'bot',
				ladder: 'on',
				catalog: 'closed',
				ownership: 'owned',
				webhook: 'verified',
				provisional: 'established',
				capacity: 'reached',
				capability: 'draws',
				sort: 'rating',
				dir: 'desc',
			};
			const params = serializeAdminBotsQuery(query);

			// Check canonical key ordering
			expect(Array.from(params.keys())).toEqual([
				'q',
				'ladder',
				'catalog',
				'ownership',
				'webhook',
				'provisional',
				'capacity',
				'capability',
				'sort',
				'dir',
			]);

			expect(params.get('q')).toBe('bot');
			expect(params.get('ladder')).toBe('on');
			expect(params.get('catalog')).toBe('closed');
			expect(params.get('ownership')).toBe('owned');
			expect(params.get('webhook')).toBe('verified');
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
				webhook: 'unverified',
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
				'?ladder=invalid&catalog=unknown&sort=hack&dir=sideways&ownership=bad&webhook=bogus',
			);
			expect(parsed).toEqual(DEFAULT_ADMIN_BOTS_QUERY);
		});
	});
});
