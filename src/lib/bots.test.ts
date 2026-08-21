import { describe, it, expect } from 'vitest';
import { BOTS, PLAYABLE_BOTS, botAlgorithm, botLabel } from './bots';

describe('botAlgorithm', () => {
	it('strips the bot: prefix', () => {
		expect(botAlgorithm('bot:greedy')).toBe('greedy');
	});

	it('leaves a bare id unchanged', () => {
		expect(botAlgorithm('greedy')).toBe('greedy');
	});
});

describe('botLabel', () => {
	it('resolves a known prefixed id to its catalog label', () => {
		expect(botLabel('bot:monte-carlo')).toBe('Monte-Carlo');
		expect(botLabel('aggressive-book')).toBe('Aggressive + Book');
	});

	it('title-cases an unknown algorithm as a fallback', () => {
		expect(botLabel('bot:some-new-bot')).toBe('Some New Bot');
	});

	it('every catalog entry resolves to its own label, prefixed or not', () => {
		for (const bot of BOTS) {
			expect(botLabel(bot.id)).toBe(bot.label);
			expect(botLabel(`bot:${bot.id}`)).toBe(bot.label);
		}
	});
});

describe('PLAYABLE_BOTS', () => {
	it('excludes retired bots from the new-game picker', () => {
		expect(PLAYABLE_BOTS.map((b) => b.id)).not.toContain('monte-carlo');
		expect(PLAYABLE_BOTS.length).toBeGreaterThan(0);
	});

	it('keeps retired bots resolvable for history labels', () => {
		expect(botLabel('bot:monte-carlo')).toBe('Monte-Carlo');
	});
});
