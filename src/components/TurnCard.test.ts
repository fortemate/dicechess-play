import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';

import { DICE_STAGGER_MS } from '#lib/timings.js';
import TurnCard from './TurnCard.svelte';

/*
 * TurnCard is one of the two reference implementations for the i18n pattern (#24, it took that
 * role over from the dice panel it replaced), so these tests pin the two shapes a migrating
 * component has to get right: message-as-text and message-as-attribute.
 *
 * They also serve as the canary for a whole class of i18n failure: a locale strategy that
 * touches unavailable browser storage throws on the FIRST m.*() call, which looks like an
 * unrelated component crash. If this file starts failing with a storage error, read the
 * strategy comment in vite.config.ts before touching anything here.
 */

const die = (value: string, used = false, allowed = true) => ({ value, allowed, used });

afterEach(() => cleanup());

describe('TurnCard', () => {
	it('is a named region of the page', () => {
		const { getByRole } = render(TurnCard, { dice: [] });
		expect(getByRole('region', { name: 'Turn' })).toBeTruthy();
	});

	it('labels the dice for assistive tech, with and without dice', () => {
		const withDice = render(TurnCard, { dice: [die('P')] });
		expect(withDice.getByLabelText('Dice')).toBeTruthy();
		withDice.unmount();

		// The placeholder branch renders a second, separate group — it must carry the label too.
		const empty = render(TurnCard, { dice: [] });
		expect(empty.getByLabelText('Dice')).toBeTruthy();
	});

	it('says who is to move and which dice are left', () => {
		const { getByRole, getByText } = render(TurnCard, {
			title: 'Your turn',
			mine: true,
			dice: [die('P', true), die('N'), die('B')],
		});
		expect(getByRole('heading', { name: 'Your turn' })).toBeTruthy();
		expect(getByText('Two dice left: knight and bishop.')).toBeTruthy();
	});

	it('only names the dice when they belong to somebody else', () => {
		const { getByText } = render(TurnCard, {
			title: 'Greedy is thinking',
			dice: [die('q'), die('k'), die('n')],
		});
		expect(getByText('Dice rolled: queen, king, and knight.')).toBeTruthy();
	});

	describe('die states', () => {
		const dice = [die('P', true), die('N'), die('R', false, false)];

		it('names every die, and says in words when one is used or has no move', () => {
			const { getByLabelText } = render(TurnCard, { dice, mine: true });
			const labels = [...getByLabelText('Dice').querySelectorAll('li')].map((item) =>
				item.textContent?.trim(),
			);
			expect(labels).toEqual(['Pawn, used', 'Knight', 'Rook, no move']);
		});

		it('dims the used die, highlights the one that is left and leaves the third plain', () => {
			const { getByLabelText } = render(TurnCard, { dice, mine: true });
			const [used, available, idle] = [...getByLabelText('Dice').querySelectorAll('li')];
			const face = (item: Element) => item.querySelector('div')!.className;

			expect(used.getAttribute('data-die')).toBe('used');
			expect(face(used)).toContain('opacity-40');
			expect(face(used)).not.toContain('border-badge-accent');

			expect(available.getAttribute('data-die')).toBe('available');
			expect(face(available)).toContain('border-badge-accent');
			expect(face(available)).not.toContain('opacity-40');

			expect(idle.getAttribute('data-die')).toBe('idle');
			expect(face(idle)).toContain('border-board-dark');
			expect(face(idle)).not.toContain('opacity-40');
			expect(face(idle)).not.toContain('border-badge-accent');
		});

		it('draws every die on the light board square, so both piece colours read on it', () => {
			const { getByLabelText } = render(TurnCard, { dice: [die('P'), die('p')] });
			for (const item of getByLabelText('Dice').querySelectorAll('li')) {
				expect(item.querySelector('div')!.className).toContain('bg-dice-surface');
			}
		});

		it('shows two dice when the roll has two', () => {
			// A roll is three dice, but nothing here may depend on that.
			const { getByLabelText } = render(TurnCard, { dice: [die('Q'), die('K')] });
			expect(getByLabelText('Dice').querySelectorAll('li')).toHaveLength(2);
		});
	});

	it('tumbles the dice, staggered, only while a roll is animating', () => {
		const dice = [die('P'), die('N'), die('B')];
		const rolling = render(TurnCard, { dice, animating: true });
		const tumbling = rolling.container.querySelectorAll('.animate-dice-tumble');
		expect(tumbling).toHaveLength(3);
		expect((tumbling[2] as HTMLElement).style.animationDelay).toBe(`${2 * DICE_STAGGER_MS}ms`);
		rolling.unmount();

		const settled = render(TurnCard, { dice });
		expect(settled.container.querySelectorAll('.animate-dice-tumble')).toHaveLength(0);
	});

	describe('the roll button', () => {
		it('appears when a roll is due, with a hint, and rolls', async () => {
			const onRoll = vi.fn();
			const { getByRole, getByText } = render(TurnCard, {
				title: 'Your turn',
				mine: true,
				dice: [],
				canRoll: true,
				onRoll,
			});
			expect(getByText('Roll to see which pieces you may move.')).toBeTruthy();
			await fireEvent.click(getByRole('button', { name: 'Roll the dice' }));
			expect(onRoll).toHaveBeenCalledTimes(1);
		});

		it('is absent when no roll is due or nothing can roll', () => {
			const noRoll = render(TurnCard, { dice: [], onRoll: vi.fn() });
			expect(noRoll.queryByRole('button')).toBeNull();
			noRoll.unmount();

			const noHandler = render(TurnCard, { dice: [], canRoll: true });
			expect(noHandler.queryByRole('button')).toBeNull();
		});
	});

	it('shows the waiting text of a live game under the empty slots', () => {
		const { getByText } = render(TurnCard, { dice: [], emptyText: 'Connecting…' });
		expect(getByText('Connecting…')).toBeTruthy();
	});
});
