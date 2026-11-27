import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';

import GameResultCard from './GameResultCard.svelte';

// The result of a game as a card of the rail (#256). It replaced a dialog over the board, so the
// two things the dialog gave for free have to be pinned here: the result can be found (a named
// region) and it is announced when it appears (a status), without anything modal.

afterEach(() => cleanup());

describe('GameResultCard', () => {
	it('is a named region that announces the outcome, and nothing modal', () => {
		const { getByRole, queryByRole } = render(GameResultCard, {
			headline: 'You won! 🎉',
			tone: 'win',
			reason: 'King captured',
		});
		const region = getByRole('region', { name: 'Result' });
		expect(getByRole('heading', { name: 'You won! 🎉' })).toBeTruthy();
		const status = getByRole('status');
		expect(region.contains(status)).toBe(true);
		expect(status.textContent).toContain('You won! 🎉');
		expect(status.textContent).toContain('King captured');
		expect(queryByRole('dialog')).toBeNull();
		expect(region.getAttribute('aria-modal')).toBeNull();
	});

	it.each([
		['win', 'text-success'],
		['loss', 'text-danger'],
		['neutral', 'text-content'],
	] as const)('colours a %s headline, and says the outcome in words', (tone, className) => {
		const { getByRole } = render(GameResultCard, { headline: 'Draw.', tone });
		expect(getByRole('heading').className).toContain(className);
		expect(getByRole('heading').textContent).toBe('Draw.');
	});

	it('shows the credits line of a staked game, and none for a classic one', () => {
		const staked = render(GameResultCard, { headline: 'You won! 🎉', settlement: '+10 credits' });
		expect(staked.getByTestId('settlement-line').textContent?.trim()).toBe('+10 credits');
		staked.unmount();

		const classic = render(GameResultCard, { headline: 'You won! 🎉' });
		expect(classic.queryByTestId('settlement-line')).toBeNull();
	});

	it('puts the content of the page (the rating line, the actions) outside the announced part', () => {
		// The rating line is its own live region and arrives up to a minute later: it must not make
		// the whole result be read out again.
		const { getByRole, getByText } = render(GameResultCard, {
			headline: 'You lost.',
			tone: 'loss',
			children: createRawSnippet(() => ({ render: () => '<p>Rating unchanged.</p>' })),
		});
		const line = getByText('Rating unchanged.');
		expect(getByRole('region', { name: 'Result' }).contains(line)).toBe(true);
		expect(getByRole('status').contains(line)).toBe(false);
	});
});
