import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';

import Button from './Button.svelte';
import Card from './Card.svelte';
import Chip from './Chip.svelte';
import PageContainer from './PageContainer.svelte';
import PageHeader from './PageHeader.svelte';
import PrimitivesPreview from './PrimitivesPreview.svelte';
import SegmentedControl from './SegmentedControl.svelte';
import Tag from './Tag.svelte';

// The interface primitives (#252) carry the promises every redesigned page relies on: a control
// says what it is and what state it is in to assistive technology, a disabled control cannot be
// used, and every control is large enough to hit and shows where the keyboard focus is. These
// tests pin those promises, not the look. jsdom does no layout, so "at least 44 px" is checked
// as the presence of the size class that guarantees it (`min-h-11` is 2.75rem; `min-h-13`, the
// large button, is 3.25rem).
//
// A disabled control is pressed with the element's own `click()`: unlike a dispatched event, it
// does what a browser does and ignores a disabled button.

const text = (label: string) => createRawSnippet(() => ({ render: () => `<span>${label}</span>` }));

const TALL_ENOUGH = /\bmin-h-1[13]\b/;

afterEach(() => cleanup());

describe('Button', () => {
	it('is a button named by its content, and never submits a form by accident', () => {
		const { getByRole } = render(Button, { children: text('Start game') });
		const button = getByRole('button', { name: 'Start game' });
		expect(button.getAttribute('type')).toBe('button');
	});

	it('takes its accessible name from aria-label when the content is an icon', () => {
		const { getByRole } = render(Button, { children: text('⇅'), 'aria-label': 'Flip board' });
		expect(getByRole('button', { name: 'Flip board' })).toBeTruthy();
	});

	it('calls its handler when pressed, and not when disabled', async () => {
		const onclick = vi.fn();
		const enabled = render(Button, { children: text('Resign'), onclick });
		await fireEvent.click(enabled.getByRole('button'));
		expect(onclick).toHaveBeenCalledTimes(1);
		enabled.unmount();

		const disabled = render(Button, { children: text('Resign'), onclick, disabled: true });
		const button = disabled.getByRole('button') as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		button.click();
		expect(onclick).toHaveBeenCalledTimes(1);
	});

	it('renders a link with href, and a disabled button when that link is disabled', () => {
		const link = render(Button, { children: text('Watch'), href: '/arena' });
		expect(link.getByRole('link', { name: 'Watch' }).getAttribute('href')).toBe('/arena');
		link.unmount();

		// A link cannot be disabled, so a disabled one must not stay reachable as a link.
		const disabled = render(Button, { children: text('Watch'), href: '/arena', disabled: true });
		expect(disabled.queryByRole('link')).toBeNull();
		expect((disabled.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
	});

	it.each(['primary', 'secondary', 'danger'] as const)(
		'is tall enough and shows keyboard focus as %s',
		(variant) => {
			const { getByRole } = render(Button, { children: text('Go'), variant });
			const button = getByRole('button');
			expect(button.className).toMatch(TALL_ENOUGH);
			expect(button.className).toContain('focus-ring');
		},
	);

	it('fills a danger button only in its armed state', () => {
		const resting = render(Button, { children: text('Resign'), variant: 'danger' });
		expect(resting.getByRole('button').className).not.toContain('text-danger-content');
		resting.unmount();

		const armed = render(Button, { children: text('Resign'), variant: 'danger', filled: true });
		expect(armed.getByRole('button').className).toContain('bg-danger text-danger-content');
	});
});

describe('Chip', () => {
	it('reports its pressed state to assistive technology', async () => {
		const view = render(Chip, { children: text('Bots only'), pressed: false });
		const chip = view.getByRole('button', { name: 'Bots only' });
		expect(chip.getAttribute('aria-pressed')).toBe('false');

		await view.rerender({ children: text('Bots only'), pressed: true });
		expect(view.getByRole('button', { name: 'Bots only' }).getAttribute('aria-pressed')).toBe(
			'true',
		);
	});

	it('looks pressed by being filled, in both shapes', () => {
		for (const shape of ['pill', 'box'] as const) {
			const view = render(Chip, { children: text('5+3'), pressed: true, shape });
			expect(view.getByRole('button').className).toContain('bg-primary text-primary-content');
			view.unmount();
		}
	});

	it('calls its handler when pressed, and not when disabled', async () => {
		const onclick = vi.fn();
		const view = render(Chip, { children: text('5+3'), pressed: false, onclick });
		await fireEvent.click(view.getByRole('button'));
		expect(onclick).toHaveBeenCalledTimes(1);
		view.unmount();

		const disabled = render(Chip, {
			children: text('5+3'),
			pressed: true,
			onclick,
			disabled: true,
		});
		const chip = disabled.getByRole('button') as HTMLButtonElement;
		expect(chip.disabled).toBe(true);
		// A disabled chip still says which choice is in force.
		expect(chip.getAttribute('aria-pressed')).toBe('true');
		chip.click();
		expect(onclick).toHaveBeenCalledTimes(1);
	});

	it('is tall enough and shows keyboard focus', () => {
		const { getByRole } = render(Chip, { children: text('All'), pressed: false });
		expect(getByRole('button').className).toMatch(TALL_ENOUGH);
		expect(getByRole('button').className).toContain('focus-ring');
	});
});

describe('SegmentedControl', () => {
	const options = [
		{ value: 'system', label: 'System' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' },
	] as const;

	const pressed = (container: HTMLElement) =>
		[...container.querySelectorAll('button[aria-pressed="true"]')].map((b) =>
			b.textContent?.trim(),
		);

	it('is a named group with exactly one pressed segment', () => {
		const { getByRole, container } = render(SegmentedControl, {
			label: 'Appearance',
			options,
			value: 'light',
		});
		expect(getByRole('group', { name: 'Appearance' })).toBeTruthy();
		expect(pressed(container)).toEqual(['Light']);
	});

	it('moves the pressed state and reports the new value once', async () => {
		const onchange = vi.fn();
		const { getByRole, container } = render(SegmentedControl, {
			label: 'Appearance',
			options,
			value: 'light',
			onchange,
		});

		await fireEvent.click(getByRole('button', { name: 'Dark' }));
		expect(onchange).toHaveBeenCalledExactlyOnceWith('dark');
		expect(pressed(container)).toEqual(['Dark']);

		// Pressing the segment that is already chosen is not a change.
		await fireEvent.click(getByRole('button', { name: 'Dark' }));
		expect(onchange).toHaveBeenCalledTimes(1);
	});

	it('cannot be changed when disabled', () => {
		const onchange = vi.fn();
		const { getAllByRole, container } = render(SegmentedControl, {
			label: 'Appearance',
			options,
			value: 'system',
			onchange,
			disabled: true,
		});
		for (const segment of getAllByRole('button')) {
			expect((segment as HTMLButtonElement).disabled).toBe(true);
			(segment as HTMLButtonElement).click();
		}
		expect(onchange).not.toHaveBeenCalled();
		expect(pressed(container)).toEqual(['System']);
	});

	it('makes every segment tall enough, with a focus style', () => {
		const { getAllByRole } = render(SegmentedControl, { label: 'View', options, value: 'dark' });
		for (const segment of getAllByRole('button')) {
			expect(segment.className).toMatch(TALL_ENOUGH);
			expect(segment.className).toContain('focus-ring');
		}
	});
});

describe('Tag', () => {
	it('is plain text, not a control', () => {
		const { getByText, queryByRole } = render(Tag, { children: text('Bot') });
		expect(getByText('Bot')).toBeTruthy();
		expect(queryByRole('button')).toBeNull();
	});

	it('uses the highlight surface with its own text colour', () => {
		const { container } = render(Tag, { children: text('Player'), tone: 'highlight' });
		expect(container.firstElementChild?.className).toContain('bg-highlight text-highlight-content');
	});
});

describe('Card', () => {
	it('is a plain block by default and a named region as a section', () => {
		const plain = render(Card, { children: text('Content') });
		expect(plain.container.firstElementChild?.tagName).toBe('DIV');
		expect(plain.container.firstElementChild?.className).not.toContain('shadow');
		plain.unmount();

		const region = render(Card, {
			children: text('Content'),
			as: 'section',
			'aria-label': 'Your game',
			raised: true,
		});
		const section = region.getByRole('region', { name: 'Your game' });
		expect(section.tagName).toBe('SECTION');
		expect(section.className).toContain('shadow');
	});
});

describe('PageHeader and PageContainer', () => {
	it('renders one h1 and the lead line', () => {
		const { getAllByRole, getByText } = render(PageHeader, {
			title: 'Leaderboard',
			lead: 'Bots and players on one board.',
		});
		const headings = getAllByRole('heading');
		expect(headings).toHaveLength(1);
		expect(headings[0].tagName).toBe('H1');
		expect(headings[0].textContent?.trim()).toBe('Leaderboard');
		expect(headings[0].className).toContain('font-display');
		expect(getByText('Bots and players on one board.')).toBeTruthy();
	});

	it('sets a title that contains a name in the sans-serif face', () => {
		const { getByRole } = render(PageHeader, { title: 'falcon-v1-0', plain: true });
		expect(getByRole('heading', { level: 1 }).className).not.toContain('font-display');
	});

	it('holds content to the one page width', () => {
		const { container } = render(PageContainer, { children: text('Content') });
		expect(container.firstElementChild?.className).toContain('max-w-page');
	});
});

describe('PrimitivesPreview', () => {
	it.each(['light', 'dark'] as const)('renders every primitive in the %s theme', (theme) => {
		const { container, getAllByRole, getByRole } = render(PrimitivesPreview, { theme });
		expect(container.querySelector(`[data-theme="${theme}"]`)).toBeTruthy();

		expect(getAllByRole('heading', { level: 1 }).length).toBeGreaterThan(0);
		// One in the buttons card, and one per setup panel that starts a game.
		expect(getAllByRole('button', { name: 'Start game' }).length).toBeGreaterThan(0);
		expect(getAllByRole('radio', { name: 'Random' }).length).toBeGreaterThan(0);
		expect(getByRole('link', { name: 'A link' })).toBeTruthy();
		expect(getByRole('group', { name: 'Appearance' })).toBeTruthy();
		expect(container.querySelector('button[aria-pressed="true"]')).toBeTruthy();
		expect(container.querySelector('button:disabled')).toBeTruthy();
		expect(container.querySelector('.bg-highlight')).toBeTruthy();
		expect(container.querySelector('.rounded-card')).toBeTruthy();
	});

	it('shows no control that is too small or without a focus style', () => {
		const { container } = render(PrimitivesPreview, { theme: 'light' });
		const controls = [...container.querySelectorAll('button, a')];
		expect(controls.length).toBeGreaterThan(10);
		for (const control of controls) {
			expect(control.className, control.textContent ?? '').toMatch(TALL_ENOUGH);
			expect(control.className, control.textContent ?? '').toContain('focus-ring');
		}
	});
});
