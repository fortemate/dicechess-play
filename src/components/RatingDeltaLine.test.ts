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
