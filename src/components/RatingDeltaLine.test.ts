import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import RatingDeltaLine from './RatingDeltaLine.svelte';

describe('RatingDeltaLine', () => {
	it('says the rating is still updating while the batch has not applied the game', () => {
		// The whole reason this state exists: play-api applies rating up to a minute after the game
		// ends, and a blank modal for that minute was read as the feature being broken.
		const { getByText } = render(RatingDeltaLine, { outcome: { kind: 'waiting' } });
		expect(getByText('Rating updating…')).toBeTruthy();
	});

	it('shows the rounded pair and the delta once the movement is known', () => {
		const { getByText } = render(RatingDeltaLine, {
			outcome: { kind: 'moved', change: { before: 1775.6714474976957, after: 1797.2144251082318 } },
		});
		expect(getByText('1776 → 1797')).toBeTruthy();
		expect(getByText('(+21)')).toBeTruthy();
	});

	it('renders nothing at all when the game moved no rating', () => {
		// Final answer, not a wait — and no honest text to put here, since the server's skip reason
		// (guest seat, unregistered opponent, self-play) never reaches the client.
		const { container } = render(RatingDeltaLine, { outcome: { kind: 'unmoved' } });
		expect(container.querySelector('p')).toBeNull();
	});

	it('renders nothing when there is nothing to say — no empty line left in the modal', () => {
		const { container } = render(RatingDeltaLine, { outcome: null });
		expect(container.querySelector('p')).toBeNull();
	});

	it('can be muted for a screen reader, for the surface the player is not looking at', () => {
		// Both finished-game surfaces are mounted while the modal is open, so exactly one of them may
		// carry a live region — otherwise the same line is announced twice.
		const { container } = render(RatingDeltaLine, {
			outcome: { kind: 'waiting' },
			announce: false,
		});
		expect(container.querySelector('p')?.getAttribute('aria-live')).toBe('off');
		expect(container.querySelector('[aria-live="polite"]')).toBeNull();
	});

	it('announces by default — a lone instance must not need the caller to opt in', () => {
		const { container } = render(RatingDeltaLine, { outcome: { kind: 'waiting' } });
		expect(container.querySelector('p')?.getAttribute('aria-live')).toBe('polite');
	});

	it('keeps ONE live region across the wait, so the delta replaces the pending text', () => {
		const { container, rerender, getByText } = render(RatingDeltaLine, {
			outcome: { kind: 'waiting' },
		});
		const live = container.querySelector('[aria-live="polite"]');
		expect(live).toBeTruthy();
		rerender({ outcome: { kind: 'moved', change: { before: 1500, after: 1489.4 } } });
		expect(container.querySelector('[aria-live="polite"]')).toBe(live);
		expect(getByText('(-11)')).toBeTruthy();
	});
});

describe('recorded rating explanations', () => {
	it('replaces pending with an authoritative skipped reason in the same live region', async () => {
		const { container, rerender, getByText, queryByText } = render(RatingDeltaLine, {
			outcome: { kind: 'waiting', details: { outcome: 'pending', ratingDomain: 'competitive' } },
		});
		const live = container.querySelector('[aria-live="polite"]');
		await rerender({
			outcome: {
				kind: 'unmoved',
				details: {
					outcome: 'skipped',
					ratingDomain: 'competitive',
					reason: 'a participant has no rating state',
				},
			},
		});
		expect(container.querySelector('[aria-live="polite"]')).toBe(live);
		expect(queryByText('Rating updating…')).toBeNull();
		expect(getByText('Rating unchanged.')).toBeTruthy();
		expect(getByText('Reason: a participant has no rating state.')).toBeTruthy();
	});

	it('explains casual games without implying a rating movement', () => {
		const { getByText } = render(RatingDeltaLine, {
			outcome: {
				kind: 'unmoved',
				details: {
					outcome: 'casual',
					ratingDomain: 'casual',
				},
			},
		});
		expect(getByText('Casual games do not change competitive or training ratings.')).toBeTruthy();
	});

	it.each(['anchor', 'bot_rating'] as const)(
		'labels training and its captured %s reference',
		(source) => {
			const { getByText } = render(RatingDeltaLine, {
				outcome: {
					kind: 'moved',
					change: { before: 1500, after: 1507 },
					details: {
						ratingDomain: 'training',
						outcome: 'applied',
						trainingReference: {
							source,
							rating: 1462.75,
							rd: 81.5,
							anchorSetVersion: 'test-set',
							epoch: 7,
						},
					},
				},
			});
			expect(getByText('Training rating')).toBeTruthy();
			expect(getByText(/rating 1,463, RD 82/)).toBeTruthy();
			expect(getByText('Anchor set: test-set.')).toBeTruthy();
			expect(getByText('Reference epoch: 7.')).toBeTruthy();
		},
	);

	it.each([
		undefined,
		null,
		{ source: 'unavailable' as const, rating: 1500, rd: 350, anchorSetVersion: null, epoch: null },
	])('makes absent or unavailable training reference explicit', (trainingReference) => {
		const { getByText, queryByText } = render(RatingDeltaLine, {
			outcome: {
				kind: 'unmoved',
				details: {
					ratingDomain: 'training',
					outcome: 'legacy',
					trainingReference,
				},
			},
		});
		expect(
			getByText('The training reference for this game is unknown or unavailable.'),
		).toBeTruthy();
		expect(queryByText(/rating 1500/)).toBeNull();
	});

	it('escapes unfamiliar outcomes and reasons as text without interpreting them', () => {
		const unknown = '<img src=x onerror=alert(1)>';
		const { container, getByText } = render(RatingDeltaLine, {
			outcome: {
				kind: 'unmoved',
				details: {
					outcome: unknown as 'skipped',
					reason: unknown,
				},
			},
		});
		expect(getByText('Rating details are incomplete.')).toBeTruthy();
		expect(getByText('Rating movement not recorded.')).toBeTruthy();
		expect(getByText(`Reason: ${unknown}.`)).toBeTruthy();
		expect(container.querySelector('img')).toBeNull();
	});
});

describe('historical movement wording', () => {
	it.each(['legacy', undefined, 'future-outcome'])(
		'does not assert unchanged for %s without recorded numbers',
		(serverOutcome) => {
			const { getByText, queryByText } = render(RatingDeltaLine, {
				outcome: {
					kind: 'unmoved',
					details: { outcome: serverOutcome as 'legacy' },
				},
			});
			expect(getByText('Rating movement not recorded.')).toBeTruthy();
			expect(queryByText('Rating unchanged.')).toBeNull();
		},
	);

	it('can hide shared explanations while retaining the seat movement', () => {
		const { getByText, queryByText } = render(RatingDeltaLine, {
			outcome: {
				kind: 'moved',
				change: { before: 1500, after: 1510 },
				details: { outcome: 'applied', ratingDomain: 'training' },
			},
			showDetails: false,
		});
		expect(getByText('1500 → 1510')).toBeTruthy();
		expect(queryByText('Training rating')).toBeNull();
		expect(queryByText('Rating update recorded.')).toBeNull();
	});
});
