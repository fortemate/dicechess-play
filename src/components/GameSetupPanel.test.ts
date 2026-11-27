import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/svelte';
import { tick } from 'svelte';

// A mutable stand-in for the store singleton, the pattern of RatedChoice.test.ts: whether rated
// play is offered depends on the sign-in state, and the real store only reaches those states by
// talking to play-api.
const auth = vi.hoisted(() => ({
	authStore: {
		status: 'signed-out' as 'loading' | 'signed-in' | 'signed-out' | 'unavailable',
		canSignIn: true,
		signIn: vi.fn(),
	},
}));
vi.mock('#lib/authStore.svelte.js', () => auth);

import { botTimeControlPresets, timeControlPresets } from '#lib/live/timeControls.js';
import GameSetupPanelHarness from './GameSetupPanelHarness.svelte';

// GameSetupPanel is the one place a game is configured (#253). It owns the look and the order;
// what may be chosen is a property of the mode. These tests configure the panel the way each of
// the four pages does (through the harness) and pin the rules that must not leak from one mode
// into another: a catalog bot never offers a game without a clock, an open table offers no
// colour, rated play is offered only where the mode has it and only to a signed-in account.
// What each page then SENDS is covered by that page's own tests, which this change left as
// they were.

const MODES = ['bot', 'practice', 'friend', 'table'] as const;

const radios = (container: HTMLElement, name: string) =>
	[...container.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`)].map(
		(input) => input.closest('label')?.textContent?.trim(),
	);

describe('GameSetupPanel', () => {
	beforeEach(() => {
		auth.authStore.status = 'signed-out';
		auth.authStore.canSignIn = true;
	});
	afterEach(() => cleanup());

	describe('colour', () => {
		it.each(['bot', 'practice', 'friend'] as const)(
			'offers Random, White, Black in that order for a %s game',
			(mode) => {
				const { container, getByRole } = render(GameSetupPanelHarness, { mode });
				expect(radios(container, 'color-harness')).toEqual(['Random', 'White', 'Black']);
				expect(getByRole('group', { name: 'Your color' })).toBeTruthy();
				expect((getByRole('radio', { name: 'Random' }) as HTMLInputElement).checked).toBe(true);
			},
		);

		it('writes the choice back in the vocabulary of the page', async () => {
			// The bot and the friend request name a seat ("White"); the practice store takes "white".
			const bot = render(GameSetupPanelHarness, { mode: 'bot' });
			await fireEvent.click(bot.getByRole('radio', { name: 'White' }));
			expect(bot.getByTestId('color').textContent).toBe('White');
			bot.unmount();

			const practice = render(GameSetupPanelHarness, { mode: 'practice' });
			await fireEvent.click(practice.getByRole('radio', { name: 'Black' }));
			expect(practice.getByTestId('color').textContent).toBe('black');
		});

		it('offers no colour for an open table, and says why', () => {
			const { container, getByText, queryByRole } = render(GameSetupPanelHarness, {
				mode: 'table',
			});
			expect(radios(container, 'color-harness')).toEqual([]);
			expect(queryByRole('radio', { name: 'White' })).toBeNull();
			expect(getByText('Your color is drawn when someone sits down.')).toBeTruthy();
		});
	});

	describe('time control', () => {
		it('never offers a catalog bot a game without a clock', () => {
			const { container } = render(GameSetupPanelHarness, { mode: 'bot' });
			const labels = radios(container, 'time-harness');
			expect(labels).toEqual(botTimeControlPresets.map((preset) => preset.label));
			expect(labels).not.toContain('Unlimited');
		});

		it('offers a practice game its own list, with "Unlimited"', () => {
			const { container } = render(GameSetupPanelHarness, { mode: 'practice' });
			expect(radios(container, 'time-harness')).toContain('Unlimited');
		});

		it.each(['friend', 'table'] as const)(
			'offers a %s game every lobby preset, under its rating category',
			(mode) => {
				const { container, getByText } = render(GameSetupPanelHarness, { mode });
				const labels = radios(container, 'time-harness');
				expect([...labels].sort()).toEqual(timeControlPresets.map((p) => p.label).sort());
				expect(getByText('Blitz')).toBeTruthy();
				expect(getByText('Rapid')).toBeTruthy();
			},
		);

		it('writes back the index of the preset, not its position on screen', async () => {
			// The rows are sorted for display, so the third chip is not the third preset.
			const { getByRole, getByTestId } = render(GameSetupPanelHarness, { mode: 'friend' });
			const last = timeControlPresets.length - 1;
			await fireEvent.click(getByRole('radio', { name: timeControlPresets[last].label }));
			expect(getByTestId('time').textContent).toBe(String(last));
		});
	});

	describe('rating', () => {
		it.each(['bot', 'table'] as const)(
			'offers Casual and Rated to a signed-in account for a %s game',
			async (mode) => {
				auth.authStore.status = 'signed-in';
				const { getByRole, getByTestId } = render(GameSetupPanelHarness, { mode });
				expect((getByRole('radio', { name: 'Casual' }) as HTMLInputElement).checked).toBe(true);
				await fireEvent.click(getByRole('radio', { name: 'Rated' }));
				expect(getByTestId('rated').textContent).toBe('true');
			},
		);

		it.each(['bot', 'table'] as const)(
			'does not offer rated play for a %s game to a visitor who is not signed in',
			async (mode) => {
				// Seeded as a stored preference would seed it: the gate must still force it down.
				const { queryByRole, getByRole, getByTestId } = render(GameSetupPanelHarness, {
					mode,
					rated: true,
				});
				await tick();
				expect(queryByRole('radio', { name: 'Rated' })).toBeNull();
				expect(getByTestId('rated').textContent).toBe('false');
				expect(getByRole('button', { name: 'sign in' })).toBeTruthy();
			},
		);

		it('never offers rated play for a game by link, signed in or not', () => {
			auth.authStore.status = 'signed-in';
			const { queryByRole, getByText } = render(GameSetupPanelHarness, { mode: 'friend' });
			expect(queryByRole('radio', { name: 'Rated' })).toBeNull();
			expect(getByText('A game by link is casual: it does not change ratings.')).toBeTruthy();
		});

		it('never offers rated play for a practice game', () => {
			auth.authStore.status = 'signed-in';
			const { queryByRole, getByText } = render(GameSetupPanelHarness, { mode: 'practice' });
			expect(queryByRole('radio', { name: 'Rated' })).toBeNull();
			expect(getByText('A practice game is not rated.')).toBeTruthy();
		});
	});

	describe('the selected option', () => {
		it.each(MODES)('is filled, and only it, in a %s game', async (mode) => {
			const { container } = render(GameSetupPanelHarness, { mode });
			const groups = [...container.querySelectorAll('fieldset')];
			expect(groups.length).toBeGreaterThan(0);
			for (const group of groups) {
				const labels = [...group.querySelectorAll('label')];
				const filled = labels.filter((label) => label.className.includes('bg-primary'));
				expect(filled).toHaveLength(1);
				expect(filled[0].querySelector('input')?.checked).toBe(true);
			}
		});

		it('moves with the choice', async () => {
			const { getByRole } = render(GameSetupPanelHarness, { mode: 'friend' });
			const labelOf = (name: string) => getByRole('radio', { name }).closest('label')!;
			await fireEvent.click(getByRole('radio', { name: 'Black' }));
			expect(labelOf('Black').className).toContain('bg-primary');
			expect(labelOf('Random').className).not.toContain('bg-primary');
		});

		it('is a target of at least 44 px that shows keyboard focus', () => {
			const { container } = render(GameSetupPanelHarness, { mode: 'bot' });
			for (const label of container.querySelectorAll('fieldset label')) {
				expect(label.className).toContain('min-h-11');
				expect(label.className).toContain('has-focus-visible:focus-ring');
			}
		});
	});

	describe('the call to action', () => {
		it.each([
			['bot', 'Start game'],
			['practice', 'Start game'],
			['friend', 'Create game'],
			['table', 'Open a table'],
		] as const)('is the one primary button of a %s game, named "%s"', async (mode, label) => {
			const onstart = vi.fn();
			const { getByRole } = render(GameSetupPanelHarness, { mode, onstart });
			const button = getByRole('button', { name: label });
			expect(button.className).toContain('bg-primary');
			await fireEvent.click(button);
			expect(onstart).toHaveBeenCalledTimes(1);
		});

		it('cannot be pressed twice while the request is on its way', () => {
			const onstart = vi.fn();
			const { getByRole } = render(GameSetupPanelHarness, { mode: 'table', busy: true, onstart });
			const button = getByRole('button', { name: 'Opening…' }) as HTMLButtonElement;
			expect(button.disabled).toBe(true);
			expect(button.getAttribute('aria-busy')).toBe('true');
			button.click();
			expect(onstart).not.toHaveBeenCalled();
		});

		it('announces a failure next to the button', () => {
			const { getByRole } = render(GameSetupPanelHarness, {
				mode: 'friend',
				error: 'Live play is unavailable right now.',
			});
			expect(getByRole('alert').textContent).toContain('Live play is unavailable right now.');
		});
	});

	it('keeps two panels on one page apart', async () => {
		// HTML groups radios by name across the whole document: one panel per bot card must not
		// share a selection with the next.
		const first = render(GameSetupPanelHarness, { mode: 'bot', name: 'acme-alice' });
		const second = render(GameSetupPanelHarness, { mode: 'bot', name: 'acme-bob' });
		await fireEvent.click(within(first.container).getByRole('radio', { name: 'Black' }));
		expect(within(first.container).getByTestId('color').textContent).toBe('Black');
		expect(within(second.container).getByTestId('color').textContent).toBe('random');
		expect(
			(within(second.container).getByRole('radio', { name: 'Random' }) as HTMLInputElement).checked,
		).toBe(true);
	});
});
