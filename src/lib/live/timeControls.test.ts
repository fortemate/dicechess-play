import { describe, expect, it } from 'vitest';
import { RATING_CATEGORY_LABELS, ratingCategoryOf } from './ratingCategory';
import {
	botTimeControlPresets,
	defaultBotTimeControlIndex,
	parseGameResultsTimeControl,
	timeControlGroups,
	timeControlLabel,
	timeControlPresets,
} from './timeControls';

describe('timeControlPresets', () => {
	it('defaults (index 0) to a timed control so new games get clocks', () => {
		// Both the lobby and the play-a-friend page start their picker at index 0. If the first
		// preset were Unlimited, a quickly-created game would silently have no clocks.
		expect(timeControlPresets[0].value).not.toBeNull();
	});

	it('labels every preset consistently with timeControlLabel', () => {
		for (const p of timeControlPresets) {
			expect(timeControlLabel(p.value)).toBe(p.label);
		}
	});
});

describe('botTimeControlPresets', () => {
	it('has exactly 6 presets, none of them unlimited (ADR-0014: catalog games are never unlimited)', () => {
		expect(botTimeControlPresets).toHaveLength(6);
		for (const p of botTimeControlPresets) expect(p.value).not.toBeNull();
	});

	it('labels every preset consistently with timeControlLabel', () => {
		for (const p of botTimeControlPresets) {
			expect(timeControlLabel(p.value)).toBe(p.label);
		}
	});

	it('defaults to the 5 + 5 preset', () => {
		expect(botTimeControlPresets[defaultBotTimeControlIndex].label).toBe('5 + 5');
	});
});

describe('parseGameResultsTimeControl', () => {
	it('parses a Fischer control the same way timeControlLabel renders the structured form', () => {
		expect(parseGameResultsTimeControl('Fischer(300,3)')).toBe(
			timeControlLabel({ Fischer: { initialSeconds: 300, incrementSeconds: 3 } }),
		);
	});

	it('parses a SuddenDeath control', () => {
		expect(parseGameResultsTimeControl('SuddenDeath(300)')).toBe('5 min');
	});

	it('parses a PerMove control', () => {
		expect(parseGameResultsTimeControl('PerMove(30)')).toBe('30s / move');
	});

	it('falls back to Unlimited for the literal Unlimited value and anything unrecognised', () => {
		expect(parseGameResultsTimeControl('Unlimited')).toBe('Unlimited');
		expect(parseGameResultsTimeControl('garbage')).toBe('Unlimited');
		expect(parseGameResultsTimeControl('')).toBe('Unlimited');
	});
});

describe('timeControlGroups', () => {
	it('derives exactly the grouping that used to be hand-maintained (#258)', () => {
		// The grouping was a literal list before it became a rule. This pins the derivation to that
		// literal — labels, membership, and display order — so the refactor is proven to be a
		// refactor. If a preset changes category here, it is because its time control changed, and
		// the leaderboard scale it counts on changes with it; update this expectation consciously.
		expect(
			timeControlGroups.map((g) => ({
				label: g.label,
				presets: g.presets.map((e) => e.preset.label),
			})),
		).toEqual([
			{ label: 'Blitz', presets: ['3 + 2', '5 + 3', '5 + 5', '5 min'] },
			{ label: 'Rapid', presets: ['10 + 5', '10 + 10', '15 + 10', '10 min'] },
		]);
	});

	it("labels every group as its own category's display name", () => {
		for (const g of timeControlGroups) {
			for (const e of g.presets) {
				expect(ratingCategoryOf(e.preset.value)).toBe(g.category);
			}
			expect(g.label).toBe(RATING_CATEGORY_LABELS[g.category]);
		}
	});

	it('covers every preset exactly once', () => {
		const indexes = timeControlGroups.flatMap((g) => g.presets.map((e) => e.index));
		expect([...indexes].sort((a, b) => a - b)).toEqual(timeControlPresets.map((_, i) => i));
	});

	it('resolves every entry to its preset', () => {
		for (const g of timeControlGroups) {
			for (const e of g.presets) {
				expect(timeControlPresets[e.index]).toBe(e.preset);
			}
		}
	});
});
