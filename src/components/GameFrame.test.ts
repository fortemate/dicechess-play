import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';

import GameFrameHarness from './GameFrameHarness.svelte';

// The frame of a game (#255) is layout: where the board, the rail and the actions go. jsdom does
// no layout, so these tests pin what can be pinned without one: every part the page hands over
// is rendered exactly once and in reading order, the top bar offers leave and sound by name, and
// the move sheet of a phone opens and closes through the hooks the frame hands back, taking
// keyboard focus with it. The frame reads no store, so nothing has to be mocked.

afterEach(() => cleanup());

describe('GameFrame', () => {
	it('renders every part once, in reading order: bar, board column, then the rail', () => {
		const { container, getByRole } = render(GameFrameHarness, { onleave: vi.fn() });
		const order = [...container.querySelectorAll('[data-testid]')].map((el) =>
			el.getAttribute('data-testid'),
		);
		expect(order).toEqual(['top', 'board', 'under', 'bottom', 'card', 'extra', 'close', 'toggle']);

		// The title of the game is the heading of the screen, ahead of everything else.
		const heading = getByRole('heading', { level: 1, name: 'Greedy · level 3' });
		const top = container.querySelector('[data-testid="top"]')!;
		expect(heading.compareDocumentPosition(top) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	describe('leave', () => {
		it('is a link when the page leaves by navigation', () => {
			const { getByRole } = render(GameFrameHarness, { leaveHref: '/lobby' });
			const leave = getByRole('link', { name: 'Leave game' });
			expect(leave.getAttribute('href')).toBe('/lobby');
			expect(leave.className).toContain('min-h-11');
		});

		it('is a button when the page leaves by an action', async () => {
			const onleave = vi.fn();
			const { getByRole, queryByRole } = render(GameFrameHarness, { onleave });
			expect(queryByRole('link', { name: 'Leave game' })).toBeNull();
			await fireEvent.click(getByRole('button', { name: 'Leave game' }));
			expect(onleave).toHaveBeenCalledTimes(1);
		});
	});

	describe('sound', () => {
		it('says that the sound of the page is on and asks the page to switch it', async () => {
			const onsound = vi.fn();
			const { getByRole } = render(GameFrameHarness, { onleave: vi.fn(), onsound });
			const sound = getByRole('button', { name: 'Sound effects' });
			expect(sound.getAttribute('aria-pressed')).toBe('true');
			expect(sound.getAttribute('title')).toBe('Sound on');
			expect(sound.className).toContain('min-h-11');
			await fireEvent.click(sound);
			expect(onsound).toHaveBeenCalledTimes(1);
		});

		it('says so when it is off', () => {
			const { getByRole } = render(GameFrameHarness, { onleave: vi.fn(), soundEnabled: false });
			const sound = getByRole('button', { name: 'Sound effects' });
			expect(sound.getAttribute('aria-pressed')).toBe('false');
			expect(sound.getAttribute('title')).toBe('Sound off');
		});
	});

	it('shows the status of the page in the top bar only when there is one', () => {
		const without = render(GameFrameHarness, { onleave: vi.fn() });
		expect(without.queryByTestId('status')).toBeNull();
		without.unmount();

		const withStatus = render(GameFrameHarness, { onleave: vi.fn(), withStatus: true });
		const status = withStatus.getByTestId('status');
		expect(status.closest('header')).toBeTruthy();
	});

	describe('the move list', () => {
		const panelOf = (toggle: HTMLElement) =>
			document.getElementById(toggle.getAttribute('aria-controls')!)!;

		it('is hidden on a phone until asked for, and always shown from md up', () => {
			const { getByTestId } = render(GameFrameHarness, { onleave: vi.fn() });
			const panel = panelOf(getByTestId('toggle'));
			expect(panel.contains(getByTestId('close'))).toBe(true);
			expect(panel.className).toContain('max-md:hidden');
			// The same element, with no class that would hide it on a wider screen.
			expect(panel.className).not.toMatch(/(^|\s)(md:)?hidden(\s|$)/);
		});

		it('opens as a sheet from the actions and closes from the list itself', async () => {
			const { getByTestId } = render(GameFrameHarness, { onleave: vi.fn() });
			const toggle = getByTestId('toggle');
			const panel = panelOf(toggle);
			expect(toggle.textContent?.trim()).toBe('closed');

			await fireEvent.click(toggle);
			expect(toggle.textContent?.trim()).toBe('open');
			expect(panel.className).toContain('max-md:fixed');
			expect(panel.className).not.toContain('max-md:hidden');

			await fireEvent.click(getByTestId('close'));
			expect(toggle.textContent?.trim()).toBe('closed');
			expect(panel.className).toContain('max-md:hidden');
		});

		it('moves keyboard focus into the sheet and back to the button that opened it', async () => {
			// The list precedes the button in the page: without this a keyboard user would tab
			// past what they just opened, and closing would leave focus on a hidden button.
			const { getByTestId } = render(GameFrameHarness, { onleave: vi.fn() });
			const toggle = getByTestId('toggle');
			toggle.focus();

			await fireEvent.click(toggle);
			await tick();
			expect(document.activeElement).toBe(getByTestId('close'));

			await fireEvent.click(getByTestId('close'));
			await tick();
			expect(document.activeElement).toBe(toggle);
		});

		it('starts the next game on the same page with the sheet closed', async () => {
			// A rematch, or a spectator following one, reuses the page for another game.
			const view = render(GameFrameHarness, { onleave: vi.fn(), gameKey: 'game-a' });
			const toggle = view.getByTestId('toggle');
			await fireEvent.click(toggle);
			expect(toggle.textContent?.trim()).toBe('open');

			await view.rerender({ onleave: vi.fn(), gameKey: 'game-a' });
			expect(toggle.textContent?.trim()).toBe('open');

			await view.rerender({ onleave: vi.fn(), gameKey: 'game-b' });
			expect(view.getByTestId('toggle').textContent?.trim()).toBe('closed');
		});

		it('toggles closed from the same button that opened it', async () => {
			const { getByTestId } = render(GameFrameHarness, { onleave: vi.fn() });
			const toggle = getByTestId('toggle');
			await fireEvent.click(toggle);
			await fireEvent.click(toggle);
			expect(toggle.textContent?.trim()).toBe('closed');
		});
	});

	it('renders without actions, for a page that has none to offer', () => {
		const { queryByTestId, getByTestId } = render(GameFrameHarness, {
			onleave: vi.fn(),
			withActions: false,
		});
		expect(queryByTestId('toggle')).toBeNull();
		expect(getByTestId('card')).toBeTruthy();
	});
});
