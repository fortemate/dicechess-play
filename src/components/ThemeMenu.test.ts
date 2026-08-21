import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, within } from '@testing-library/svelte';
import ThemeMenu from './ThemeMenu.svelte';
import { themeStore } from '$lib/stores/themeStore.svelte';

// The store is a singleton shared with the component; pin it to a known theme around each test.
beforeEach(() => themeStore.setTheme('dark'));
afterEach(() => themeStore.setTheme('dark'));

describe('ThemeMenu', () => {
	it('names the trigger by the current theme and starts closed', () => {
		const { getByRole, queryByRole } = render(ThemeMenu);
		// Accessible name is composed from content ("Theme: Dark"), not an overriding aria-label.
		expect(getByRole('button', { name: /theme:\s*dark/i })).toBeTruthy();
		expect(queryByRole('listbox')).toBeNull();
	});

	it('opens a listbox of every theme with the current one selected', async () => {
		const { getByRole } = render(ThemeMenu);
		await fireEvent.click(getByRole('button', { name: /theme/i }));

		const listbox = getByRole('listbox');
		expect(within(listbox).getAllByRole('option')).toHaveLength(7);
		expect(within(listbox).getByRole('option', { selected: true }).textContent).toContain('Dark');
	});

	it('applies the picked theme and closes the menu', async () => {
		const { getByRole, queryByRole } = render(ThemeMenu);
		await fireEvent.click(getByRole('button', { name: /theme/i }));
		await fireEvent.click(getByRole('option', { name: /nord/i }));

		expect(themeStore.theme).toBe('nord');
		expect(queryByRole('listbox')).toBeNull();
	});

	it('closes on Escape without changing the theme', async () => {
		const { getByRole, queryByRole } = render(ThemeMenu);
		await fireEvent.click(getByRole('button', { name: /theme/i }));
		await fireEvent.keyDown(getByRole('listbox'), { key: 'Escape' });

		expect(queryByRole('listbox')).toBeNull();
		expect(themeStore.theme).toBe('dark');
	});
});
