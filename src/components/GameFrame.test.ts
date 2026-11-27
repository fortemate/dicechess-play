import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';

const prefs = vi.hoisted(() => ({
	preferencesStore: {
		soundEnabled: true,
		setSoundEnabled: vi.fn(),
	},
}));
vi.mock('#lib/preferencesStore.svelte.js', () => prefs);

import GameFrameHarness from './GameFrameHarness.svelte';

// The frame of a game (#255) is layout: where the board, the rail and the actions go. jsdom does
// no layout, so these tests pin what can be pinned without one: every part the page hands over
// is rendered exactly once and in reading order, the top bar offers leave and sound by name, and
// the move sheet of a phone opens and closes through the hooks the frame hands back.

beforeEach(() => {
	prefs.preferencesStore.soundEnabled = true;
	prefs.preferencesStore.setSoundEnabled.mockClear();
});
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
		it('says whether sound is on and switches it', async () => {
			const { getByRole } = render(GameFrameHarness, { onleave: vi.fn() });
			const sound = getByRole('button', { name: 'Sound effects' });
			expect(sound.getAttribute('aria-pressed')).toBe('true');
			expect(sound.getAttribute('title')).toBe('Sound on');
			expect(sound.className).toContain('min-h-11');
			await fireEvent.click(sound);
			expect(prefs.preferencesStore.setSoundEnabled).toHaveBeenCalledExactlyOnceWith(false);
		});

		it('offers to switch it back on when it is off', async () => {
			prefs.preferencesStore.soundEnabled = false;
			const { getByRole } = render(GameFrameHarness, { onleave: vi.fn() });
			const sound = getByRole('button', { name: 'Sound effects' });
			expect(sound.getAttribute('aria-pressed')).toBe('false');
			expect(sound.getAttribute('title')).toBe('Sound off');
			await fireEvent.click(sound);
			expect(prefs.preferencesStore.setSoundEnabled).toHaveBeenCalledExactlyOnceWith(true);
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
