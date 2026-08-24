import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import DicePanel from './DicePanel.svelte';

/*
 * DicePanel is one of the two reference implementations for the i18n pattern (#24), so these
 * tests pin the two shapes a migrating component has to get right: message-as-text and
 * message-as-attribute. The attribute case is the one with no other coverage in the suite.
 *
 * They also serve as the canary for a whole class of i18n failure: a locale strategy that
 * touches unavailable browser storage throws on the FIRST m.*() call, which looks like an
 * unrelated component crash. If this file starts failing with a storage error, read the
 * strategy comment in vite.config.ts before touching anything here.
 */
describe('DicePanel', () => {
	it('labels the dice region for assistive tech, with and without dice', () => {
		const withDice = render(DicePanel, { dice: [{ value: 'P', allowed: true, used: false }] });
		expect(withDice.getByLabelText('Dice')).toBeTruthy();
		withDice.unmount();

		// The placeholder branch renders a second, separate region — it must carry the label too.
		const empty = render(DicePanel, { dice: [] });
		expect(empty.getByLabelText('Dice')).toBeTruthy();
	});

	it('renders the roll action only when rolling is possible', () => {
		const { getByText, queryByText, unmount } = render(DicePanel, {
			dice: [],
			canRoll: true,
			onRoll: () => {},
		});
		expect(getByText('Roll')).toBeTruthy();
		unmount();

		// No handler means no button, even when canRoll is set.
		const idle = render(DicePanel, { dice: [], canRoll: true });
		expect(idle.queryByText('Roll')).toBeNull();
		expect(queryByText('Roll')).toBeNull();
	});
});
