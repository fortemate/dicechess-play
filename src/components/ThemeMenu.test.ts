import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import ThemeMenu from './ThemeMenu.svelte';
import { APPEARANCE_PREFERENCES } from '#lib/appearance.js';
import { themeStore } from '#lib/stores/themeStore.svelte.js';

// The store is a singleton shared with the component; pin it to a known preference around each
// test. vitest-setup.ts stubs matchMedia as "no light preference", so `system` renders dark.
beforeEach(() => themeStore.setPreference('system'));
afterEach(() => themeStore.setPreference('system'));

const open = async () => {
	await fireEvent.click(screen.getByRole('button', { name: /theme/i }));
	return screen.getByRole('listbox');
};

describe('ThemeMenu', () => {
	it('names the trigger by the current choice and starts closed', () => {
		render(ThemeMenu);
		const trigger = screen.getByRole('button', { name: 'Theme: System' });

		// The visible label is part of the accessible name (WCAG 2.5.3, Label in Name).
		expect(trigger.textContent?.trim()).toBe('System');
		expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(screen.queryByRole('listbox')).toBeNull();
	});

	it.each([
		{ preference: 'light', name: 'Theme: Light' },
		{ preference: 'dark', name: 'Theme: Dark' },
	] as const)('renames the trigger to "$name" when the choice changes', ({ preference, name }) => {
		themeStore.setPreference(preference);
		render(ThemeMenu);
		expect(screen.getByRole('button', { name })).toBeTruthy();
	});

	it('opens a named listbox of the three choices with the current one selected', async () => {
		render(ThemeMenu);
		const listbox = await open();

		expect(listbox.getAttribute('aria-label')).toBe('Theme');
		expect(screen.getByRole('button', { name: /theme/i }).getAttribute('aria-expanded')).toBe(
			'true',
		);
		const options = within(listbox).getAllByRole('option');
		expect(options.map((option) => option.textContent?.trim())).toEqual([
			'System',
			'Light',
			'Dark',
		]);
		// One option per value of the model: the control cannot fall behind the list.
		expect(options).toHaveLength(APPEARANCE_PREFERENCES.length);
		expect(within(listbox).getByRole('option', { selected: true }).textContent).toContain('System');
	});

	it('applies the picked choice, closes the menu and returns focus to the trigger', async () => {
		render(ThemeMenu);
		await open();
		await fireEvent.click(screen.getByRole('option', { name: 'Light' }));

		expect(themeStore.preference).toBe('light');
		expect(themeStore.theme).toBe('light');
		expect(document.documentElement.dataset.theme).toBe('light');
		expect(screen.queryByRole('listbox')).toBeNull();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Theme: Light' }));
	});

	it('closes on Escape without changing the choice and returns focus to the trigger', async () => {
		render(ThemeMenu);
		await fireEvent.keyDown(await open(), { key: 'Escape' });

		expect(screen.queryByRole('listbox')).toBeNull();
		expect(themeStore.preference).toBe('system');
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Theme: System' }));
	});

	describe('keyboard support', () => {
		const active = (listbox: HTMLElement) =>
			document.getElementById(listbox.getAttribute('aria-activedescendant') ?? '')?.textContent;

		it.each(['ArrowDown', 'ArrowUp', 'Enter', ' '])(
			'opens from the trigger on %j and moves focus into the list',
			async (key) => {
				render(ThemeMenu);
				await fireEvent.keyDown(screen.getByRole('button', { name: /theme/i }), { key });

				const listbox = await screen.findByRole('listbox');
				expect(document.activeElement).toBe(listbox);
				// The highlight starts on the current choice.
				expect(active(listbox)).toContain('System');
			},
		);

		it('moves the highlight with the arrow keys, wrapping at both ends, and with Home and End', async () => {
			render(ThemeMenu);
			const listbox = await open();

			await fireEvent.keyDown(listbox, { key: 'ArrowDown' });
			expect(active(listbox)).toContain('Light');
			await fireEvent.keyDown(listbox, { key: 'ArrowDown' });
			expect(active(listbox)).toContain('Dark');
			await fireEvent.keyDown(listbox, { key: 'ArrowDown' });
			expect(active(listbox)).toContain('System');
			await fireEvent.keyDown(listbox, { key: 'ArrowUp' });
			expect(active(listbox)).toContain('Dark');
			await fireEvent.keyDown(listbox, { key: 'Home' });
			expect(active(listbox)).toContain('System');
			await fireEvent.keyDown(listbox, { key: 'End' });
			expect(active(listbox)).toContain('Dark');

			// Moving the highlight is not choosing.
			expect(themeStore.preference).toBe('system');
		});

		it.each(['Enter', ' '])('chooses the highlighted option on %j', async (key) => {
			render(ThemeMenu);
			const listbox = await open();
			await fireEvent.keyDown(listbox, { key: 'End' });
			await fireEvent.keyDown(listbox, { key });

			expect(themeStore.preference).toBe('dark');
			expect(screen.queryByRole('listbox')).toBeNull();
			expect(screen.getByRole('button', { name: 'Theme: Dark' })).toBeTruthy();
		});

		it('closes on Tab without changing the choice', async () => {
			render(ThemeMenu);
			const listbox = await open();
			await fireEvent.keyDown(listbox, { key: 'ArrowDown' });
			await fireEvent.keyDown(listbox, { key: 'Tab' });

			expect(screen.queryByRole('listbox')).toBeNull();
			expect(themeStore.preference).toBe('system');
		});
	});

	it('closes on a pointer press outside the control', async () => {
		render(ThemeMenu);
		await open();
		await fireEvent.pointerDown(document.body);

		expect(screen.queryByRole('listbox')).toBeNull();
	});
});
