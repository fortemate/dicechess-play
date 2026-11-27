import { describe, expect, it } from 'vitest';
import type { CatalogBot } from '#lib/catalog/catalogApi.js';
import type { Seek } from '#lib/live/liveTypes.js';
import { findBot, matchesFilter, onlineBots, starterBots, type BotEntry } from './botList';

// The one list of bots on Play (#257) has three sources. These tests pin how they are joined:
// which bot counts as "Ready now", which rows a filter keeps, and how a link names a bot.

const catalogBot = (team: string, name: string, extra: Partial<CatalogBot> = {}): CatalogBot => ({
	team,
	name,
	rating: 1500,
	rd: 60,
	provisional: false,
	description: null,
	...extra,
});

const blitz = { Fischer: { initialSeconds: 300, incrementSeconds: 3 } };
const rapid = { SuddenDeath: { initialSeconds: 600 } };
const seek = (id: string, name: string | null, extra: Partial<Seek> = {}): Seek => ({
	id,
	timeControl: blitz,
	kind: 'Bot',
	name,
	...extra,
});

describe('starterBots', () => {
	it('lists the bots that run in the browser, without the retired one', () => {
		const bots = starterBots();
		expect(bots.map((bot) => bot.key)).toContain('greedy');
		expect(bots.map((bot) => bot.key)).not.toContain('monte-carlo');
		expect(bots.every((bot) => bot.kind === 'starter')).toBe(true);
	});
});

describe('onlineBots', () => {
	it('marks a catalog bot ready while it holds an open seek, matched by its public name', () => {
		const catalog = [catalogBot('grove', 'willow'), catalogBot('grove', 'larch')];
		const [larch, willow] = onlineBots(catalog, [seek('s1', 'grove willow')]).sort((a, b) =>
			a.label.localeCompare(b.label),
		);
		expect(willow).toMatchObject({ kind: 'arena', key: 'grove/willow', state: 'ready' });
		expect(larch).toMatchObject({ kind: 'arena', key: 'grove/larch', state: 'asleep' });
	});

	it('follows the seeks: the mark goes when the seek goes', () => {
		const catalog = [catalogBot('grove', 'willow')];
		expect(onlineBots(catalog, [seek('s1', 'grove willow')])[0]).toMatchObject({ state: 'ready' });
		expect(onlineBots(catalog, [])[0]).toMatchObject({ state: 'asleep' });
	});

	it('calls a bot busy only when the catalog says so, never when it says nothing', () => {
		const [unknown] = onlineBots([catalogBot('grove', 'willow')], []);
		const [busy] = onlineBots([catalogBot('grove', 'willow', { available: false })], []);
		expect(unknown).toMatchObject({ state: 'asleep' });
		expect(busy).toMatchObject({ state: 'busy' });
	});

	it('lists a bot that waits at a table and is not in the catalog, with its tables', () => {
		const bots = onlineBots(
			[],
			[
				seek('s1', 'house oracle', { rated: false }),
				seek('s2', 'house oracle', { timeControl: rapid, rated: true }),
			],
		);
		expect(bots).toEqual([
			{
				kind: 'table',
				key: 'house oracle',
				label: 'house oracle',
				tables: [
					{
						terms: expect.stringContaining('casual'),
						seekId: 's1',
						timeControl: blitz,
						rated: false,
					},
					{
						terms: expect.stringContaining('rated'),
						seekId: 's2',
						timeControl: rapid,
						rated: true,
					},
				],
			},
		]);
	});

	it('shows two tables with the same terms as one choice', () => {
		const [bot] = onlineBots([], [seek('s1', 'house oracle'), seek('s2', 'house oracle')]);
		expect(bot.kind === 'table' && bot.tables.map((table) => table.seekId)).toEqual(['s1']);
	});

	it('gives a table the same terms after the bot has posted its seek again', () => {
		const [before] = onlineBots([], [seek('s1', 'house oracle')]);
		const [after] = onlineBots([], [seek('s7', 'house oracle')]);
		const [other] = onlineBots([], [seek('s8', 'house oracle', { rated: true })]);
		const terms = (bot: typeof before) => (bot.kind === 'table' ? bot.tables[0].terms : null);
		expect(terms(after)).toBe(terms(before));
		expect(terms(other)).not.toBe(terms(before));
	});

	it('does not read an absent rated flag as a rated table', () => {
		const [bot] = onlineBots([], [seek('s1', 'house oracle')]);
		expect(bot.kind === 'table' && bot.tables[0].rated).toBe(false);
	});

	it('leaves out the seeks of people and of a bot without a name', () => {
		const bots = onlineBots(
			[],
			[
				seek('s1', 'Alice', { kind: 'Human' }),
				seek('s2', null),
				seek('s3', 'Bob', { kind: undefined }),
			],
		);
		expect(bots).toEqual([]);
	});

	it('puts the waiting bots first, then the catalog from weakest to strongest, provisional last', () => {
		const catalog = [
			catalogBot('grove', 'strong', { rating: 2400 }),
			catalogBot('grove', 'new', { rating: 1500, provisional: true }),
			catalogBot('grove', 'weak', { rating: 1600 }),
		];
		const labels = onlineBots(catalog, [seek('s1', 'house oracle')]).map((bot) => bot.label);
		expect(labels).toEqual(['house oracle', 'grove weak', 'grove strong', 'grove new']);
	});

	it('keeps the order of the catalog when a bot sits down at a table', () => {
		const catalog = [
			catalogBot('grove', 'weak', { rating: 1600 }),
			catalogBot('grove', 'strong', { rating: 2400 }),
		];
		const before = onlineBots(catalog, []).map((bot) => bot.label);
		const after = onlineBots(catalog, [seek('s1', 'grove strong')]).map((bot) => bot.label);
		expect(after).toEqual(before);
	});
});

describe('matchesFilter', () => {
	const entries: BotEntry[] = [
		...starterBots().filter((bot) => bot.key === 'greedy'),
		...onlineBots(
			[catalogBot('grove', 'awake'), catalogBot('grove', 'asleep')],
			[
				seek('s1', 'grove awake'),
				seek('s2', 'house casual'),
				seek('s3', 'house rated', { rated: true }),
			],
		),
	];
	const keys = (filter: Parameters<typeof matchesFilter>[1]) =>
		entries.filter((entry) => matchesFilter(entry, filter)).map((entry) => entry.key);

	it('all: every bot', () => {
		expect(keys('all')).toHaveLength(entries.length);
	});

	it('ready now: the bots at a table, in the catalog or not', () => {
		expect(keys('ready').sort()).toEqual(['grove/awake', 'house casual', 'house rated']);
	});

	it('in your browser: the starter bots only', () => {
		expect(keys('browser')).toEqual(['greedy']);
	});

	it('rated: the bots a rated game is possible against', () => {
		expect(keys('rated').sort()).toEqual(['grove/asleep', 'grove/awake', 'house rated']);
	});
});

describe('findBot', () => {
	const entries: BotEntry[] = [
		...starterBots(),
		...onlineBots([catalogBot('grove', 'willow')], [seek('s1', 'house oracle')]),
	];

	it('finds a starter bot by its id', () => {
		expect(findBot(entries, 'greedy')?.key).toBe('greedy');
	});

	it('finds an arena bot by the pair of its profile route or by its public name', () => {
		expect(findBot(entries, 'grove/willow')?.key).toBe('grove/willow');
		expect(findBot(entries, 'grove willow')?.key).toBe('grove/willow');
	});

	it('finds a table bot by its public name, written either way', () => {
		expect(findBot(entries, 'house oracle')?.key).toBe('house oracle');
		expect(findBot(entries, 'house/oracle')?.key).toBe('house oracle');
	});

	it('finds nothing for an unknown or an empty name', () => {
		expect(findBot(entries, 'grove/nobody')).toBeUndefined();
		expect(findBot(entries, '  ')).toBeUndefined();
	});
});
