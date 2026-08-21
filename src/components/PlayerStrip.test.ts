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
});
