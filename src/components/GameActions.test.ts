import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';

import GameActions from './GameActions.svelte';

// The actions of a game as labelled buttons (#255). The component decides nothing, so these
// tests pin what it must carry faithfully: the page's sentence as the accessible name, a short
// text a visitor can read, the disabled states, and that a control the page leaves out is not
// there at all.

const draw = (overrides = {}) => ({
	state: 'idle' as const,
	label: 'Offer a draw with your next turn',
	ontoggle: vi.fn(),
	...overrides,
});
const resign = (overrides = {}) => ({
	armed: false,
	onpress: vi.fn(),
	...overrides,
});
const moves = (overrides = {}) => ({
	open: false,
	controls: 'moves-panel',
	toggle: vi.fn(),
	...overrides,
});

afterEach(() => cleanup());

describe('GameActions', () => {
	it('is a named group of labelled buttons, each at least 44 px', () => {
		const { getByRole, getAllByRole } = render(GameActions, {
			moves: moves(),
			draw: draw(),
			resign: resign(),
		});
		expect(getByRole('group', { name: 'Game actions' })).toBeTruthy();
		const buttons = getAllByRole('button');
		expect(buttons.map((button) => button.textContent?.trim())).toEqual([
			'Moves',
			'Offer a draw',
			'Resign',
		]);
		for (const button of buttons) {
			expect(button.className).toContain('min-h-11');
			expect(button.className).toContain('focus-visible:focus-ring');
		}
	});

	it('renders nothing for a spectator, who has no action', () => {
		const { container } = render(GameActions, {});
		expect(container.querySelector('[role="group"]')).toBeNull();
		expect(container.querySelector('button')).toBeNull();
	});

	it('leaves out a control the page does not pass', () => {
		const { getAllByRole } = render(GameActions, { resign: resign() });
		expect(getAllByRole('button').map((button) => button.textContent?.trim())).toEqual(['Resign']);
	});

	describe('the draw button', () => {
		it('carries the sentence of the page as its name and tooltip, and toggles the offer', async () => {
			const ontoggle = vi.fn();
			const { getByRole } = render(GameActions, { draw: draw({ ontoggle }) });
			const button = getByRole('button', { name: 'Offer a draw with your next turn' });
			expect(button.getAttribute('title')).toBe('Offer a draw with your next turn');
			expect(button.getAttribute('aria-pressed')).toBe('false');
			await fireEvent.click(button);
			expect(ontoggle).toHaveBeenCalledTimes(1);
		});

		it('says in words that the offer is armed, and can still be pressed to cancel', async () => {
			const ontoggle = vi.fn();
			const { getByRole } = render(GameActions, {
				draw: draw({
					state: 'armed',
					label: 'Draw offer armed — sent when your turn completes',
					ontoggle,
				}),
			});
			const button = getByRole('button', { name: /draw offer armed/i }) as HTMLButtonElement;
			expect(button.textContent?.trim()).toBe('Draw offer armed');
			expect(button.getAttribute('aria-pressed')).toBe('true');
			expect(button.disabled).toBe(false);
			await fireEvent.click(button);
			expect(ontoggle).toHaveBeenCalledTimes(1);
		});

		it.each([
			['pending', 'Draw offered — waiting for your opponent', 'Draw offered'],
			['forbidden', 'Opponent must offer the next draw', 'Offer a draw'],
		] as const)('cannot be pressed while %s', (state, label, text) => {
			const ontoggle = vi.fn();
			const { getByRole } = render(GameActions, { draw: draw({ state, label, ontoggle }) });
			const button = getByRole('button', { name: label }) as HTMLButtonElement;
			expect(button.textContent?.trim()).toBe(text);
			expect(button.disabled).toBe(true);
			button.click();
			expect(ontoggle).not.toHaveBeenCalled();
		});

		it('cannot be pressed when the page disables it, whatever its state', () => {
			const { getByRole } = render(GameActions, { draw: draw({ disabled: true }) });
			expect((getByRole('button') as HTMLButtonElement).disabled).toBe(true);
		});
	});

	describe('the resign button', () => {
		it('is outlined at rest and filled once armed', () => {
			const resting = render(GameActions, { resign: resign() });
			const button = resting.getByRole('button', { name: 'Resign' });
			expect(button.className).not.toContain('text-danger-content');
			resting.unmount();

			const armed = render(GameActions, { resign: resign({ armed: true }) });
			expect(armed.getByRole('button').className).toContain('bg-danger text-danger-content');
		});

		it('is named by the words it shows, at rest and armed', () => {
			// What a visitor reads is what a voice command or a screen reader finds (WCAG 2.5.3):
			// no separate name that says something else than the button.
			const resting = render(GameActions, { resign: resign() });
			const button = resting.getByRole('button', { name: 'Resign' });
			expect(button.textContent?.trim()).toBe('Resign');
			expect(button.hasAttribute('aria-label')).toBe(false);
			resting.unmount();

			const armed = render(GameActions, { resign: resign({ armed: true }) });
			const again = armed.getByRole('button', { name: 'Press again to resign' });
			expect(again.textContent?.trim()).toBe('Press again to resign');
			expect(again.hasAttribute('aria-label')).toBe(false);
		});

		it('is named by the words of the page when armed with them, e.g. what resigning costs', () => {
			const { getByRole } = render(GameActions, {
				resign: resign({ armed: true, armedText: 'Press again to resign (−2)' }),
			});
			const button = getByRole('button', { name: 'Press again to resign (−2)' });
			expect(button.textContent?.trim()).toBe('Press again to resign (−2)');
		});

		it('reports every press and a loss of focus to the page, which owns the confirmation', async () => {
			const onpress = vi.fn();
			const onblur = vi.fn();
			const { getByRole } = render(GameActions, { resign: resign({ onpress, onblur }) });
			const button = getByRole('button');
			await fireEvent.click(button);
			await fireEvent.click(button);
			expect(onpress).toHaveBeenCalledTimes(2);
			await fireEvent.blur(button);
			expect(onblur).toHaveBeenCalledTimes(1);
		});

		it('cannot be pressed while disconnected, and says why in a name that contains its text', () => {
			const onpress = vi.fn();
			const { getByRole } = render(GameActions, {
				resign: resign({
					disabled: true,
					disabledReason: 'Resign unavailable while disconnected',
					onpress,
				}),
			});
			const button = getByRole('button', {
				name: 'Resign unavailable while disconnected',
			}) as HTMLButtonElement;
			expect(button.textContent?.trim()).toBe('Resign');
			expect(button.disabled).toBe(true);
			button.click();
			expect(onpress).not.toHaveBeenCalled();
		});

		it('keeps the reason to itself while the button can be pressed', () => {
			const { getByRole } = render(GameActions, {
				resign: resign({ disabledReason: 'Resign unavailable while disconnected' }),
			});
			expect(getByRole('button', { name: 'Resign' }).hasAttribute('title')).toBe(false);
		});
	});

	describe('the moves button', () => {
		it('opens the move sheet, says whether it is open, and is for phones only', async () => {
			const toggle = vi.fn();
			const closed = render(GameActions, { moves: moves({ toggle }) });
			const button = closed.getByRole('button', { name: 'Moves' });
			expect(button.getAttribute('aria-expanded')).toBe('false');
			expect(button.getAttribute('aria-controls')).toBe('moves-panel');
			expect(button.className).toContain('md:hidden');
			await fireEvent.click(button);
			expect(toggle).toHaveBeenCalledTimes(1);
			closed.unmount();

			const open = render(GameActions, { moves: moves({ open: true }) });
			expect(open.getByRole('button', { name: 'Moves' }).getAttribute('aria-expanded')).toBe(
				'true',
			);
		});
	});
});
