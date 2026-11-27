import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';

import MoveStepper from './MoveStepper.svelte';

// The step controls of a game's history (#254): four named buttons of at least 44 px and the
// position between them. They only report an index; what viewing that position means is the
// store's business.

afterEach(() => cleanup());

const NAMES = ['First move', 'Previous move', 'Next move', 'Last move'];

describe('MoveStepper', () => {
	it('gives every control an accessible name and a target of at least 44 px', () => {
		const { getAllByRole } = render(MoveStepper, {
			currentMoveIndex: 3,
			maxMoveIndex: 9,
			onSetMove: vi.fn(),
		});
		const buttons = getAllByRole('button');
		expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(NAMES);
		for (const button of buttons) {
			expect(button.className).toContain('min-h-11');
			expect(button.className).toContain('min-w-11');
			expect(button.className).toContain('focus-visible:focus-ring');
		}
	});

	it('asks for the first, previous, next and last position', async () => {
		const onSetMove = vi.fn();
		const { getByRole } = render(MoveStepper, {
			currentMoveIndex: 3,
			maxMoveIndex: 9,
			onSetMove,
		});
		for (const name of NAMES) await fireEvent.click(getByRole('button', { name }));
		expect(onSetMove.mock.calls.map(([index]) => index)).toEqual([0, 2, 4, 9]);
	});

	it('cannot step before the start or past the end', () => {
		const onSetMove = vi.fn();
		const disabled = (view: { container: HTMLElement }) =>
			NAMES.filter(
				(name) =>
					view.container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)?.disabled,
			);

		const start = render(MoveStepper, { currentMoveIndex: 0, maxMoveIndex: 9, onSetMove });
		expect(disabled(start)).toEqual(['First move', 'Previous move']);
		(start.getByRole('button', { name: 'Previous move' }) as HTMLButtonElement).click();
		start.unmount();

		const end = render(MoveStepper, { currentMoveIndex: 9, maxMoveIndex: 9, onSetMove });
		expect(disabled(end)).toEqual(['Next move', 'Last move']);
		(end.getByRole('button', { name: 'Next move' }) as HTMLButtonElement).click();
		end.unmount();

		// A game without a move yet has nowhere to go.
		const empty = render(MoveStepper, { currentMoveIndex: 0, maxMoveIndex: 0, onSetMove });
		expect(disabled(empty)).toEqual(NAMES);
		expect(onSetMove).not.toHaveBeenCalled();
	});

	it('shows the position as a sibling of the buttons', () => {
		// The smoke test reads the counter as `div:has(> button[aria-label="First move"]) > span`.
		const { container } = render(MoveStepper, {
			currentMoveIndex: 3,
			maxMoveIndex: 9,
			onSetMove: vi.fn(),
		});
		const counter = container.querySelector('div:has(> button[aria-label="First move"]) > span');
		expect(counter?.textContent?.trim()).toBe('3 / 9');
	});
});
