import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import PlayerStrip from './PlayerStrip.svelte';

describe('PlayerStrip', () => {
	it('renders the name as plain text without an href', () => {
		const { getByText, queryByRole } = render(PlayerStrip, { name: 'BraveDie', sub: 'player' });
		expect(getByText('BraveDie')).toBeTruthy();
		expect(queryByRole('link')).toBeNull();
	});

	it('links the name to the given href (#213)', () => {
		const { getByRole } = render(PlayerStrip, {
			name: 'BraveDie',
			sub: 'player',
			href: '/players/BraveDie',
		});
		expect(getByRole('link', { name: 'BraveDie' }).getAttribute('href')).toBe('/players/BraveDie');
	});

	it('shows a settled rating next to the name (play-api #290)', () => {
		const { getByText } = render(PlayerStrip, {
			name: 'RollingDice',
			sub: 'player',
			rating: 1756,
		});
		expect(getByText('· 1756')).toBeTruthy();
	});

	it('rounds a raw Glicko-2 double to a whole point — the wire is never rounded (#235)', () => {
		const { getByText } = render(PlayerStrip, {
			name: 'RollingDice',
			sub: 'player',
			rating: 1797.2144251082318,
		});
		expect(getByText('· 1797')).toBeTruthy();
	});

	it('renders no rating when the server did not send one', () => {
		const { queryByText } = render(PlayerStrip, { name: 'BraveDie', sub: 'player' });
		expect(queryByText('·', { exact: false })).toBeNull();
	});

	it('associates each displayed seat rating with its own screen-reader context', () => {
		const first = render(PlayerStrip, { name: 'White', sub: 'player', rating: 1756 });
		const second = render(PlayerStrip, { name: 'Black', sub: 'player', rating: 1600 });
		const firstRating = first.getByText('· 1756');
		const secondRating = second.getByText('· 1600');
		const firstId = firstRating.getAttribute('aria-describedby');
		const secondId = secondRating.getAttribute('aria-describedby');
		expect(firstId).toBeTruthy();
		expect(secondId).toBeTruthy();
		expect(firstId).not.toBe(secondId);
		for (const [container, id] of [
			[first.container, firstId],
			[second.container, secondId],
		] as const) {
			const context = container.querySelector(`[id="${id}"]`);
			expect(context?.textContent).toBe(
				'Seat ratings are competitive ratings at game start. Their uncertainty and epoch are not reported here.',
			);
			expect(context?.classList.contains('sr-only')).toBe(true);
			expect(context?.getAttribute('aria-hidden')).not.toBe('true');
		}
	});

	it('renders the dense phone row only when asked for (showcase table)', () => {
		const regular = render(PlayerStrip, { name: 'BraveDie', sub: 'player' });
		expect(regular.container.firstElementChild?.className).toMatch(/\bmin-h-14\b/);
		expect(regular.container.firstElementChild?.className).not.toMatch(/\bmin-h-12\b/);
		regular.unmount();

		const compact = render(PlayerStrip, { name: 'BraveDie', sub: 'player', compact: true });
		expect(compact.container.firstElementChild?.className).toMatch(/\bmin-h-12\b/);
	});
});
