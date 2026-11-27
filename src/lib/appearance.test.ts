import { describe, expect, it } from 'vitest';
import {
	APPEARANCE_PREFERENCES,
	APPEARANCE_STORAGE_KEY,
	DEFAULT_APPEARANCE_PREFERENCE,
	LEGACY_DARK_THEMES,
	THEMES,
	THEME_COLORS,
	isAppearancePreference,
	isLegacyDarkTheme,
	migrateStoredAppearance,
	resolveTheme,
} from './appearance';

describe('appearance model', () => {
	it('offers system, light and dark, and defaults to system', () => {
		expect(APPEARANCE_PREFERENCES).toEqual(['system', 'light', 'dark']);
		expect(DEFAULT_APPEARANCE_PREFERENCE).toBe('system');
		expect(THEMES).toEqual(['light', 'dark']);
	});

	it('keeps the storage key of the seven-theme picker, so stored choices migrate in place', () => {
		expect(APPEARANCE_STORAGE_KEY).toBe('dicechess-theme');
	});

	it('has a browser-chrome colour for every theme and for nothing else', () => {
		expect(Object.keys(THEME_COLORS).sort()).toEqual([...THEMES].sort());
	});

	describe('resolveTheme', () => {
		it('follows the system setting while the preference is system', () => {
			expect(resolveTheme('system', true)).toBe('light');
			expect(resolveTheme('system', false)).toBe('dark');
		});

		it('lets an explicit choice win over the system setting', () => {
			expect(resolveTheme('light', false)).toBe('light');
			expect(resolveTheme('light', true)).toBe('light');
			expect(resolveTheme('dark', true)).toBe('dark');
			expect(resolveTheme('dark', false)).toBe('dark');
		});

		it('only ever resolves to one of the two themes', () => {
			for (const preference of APPEARANCE_PREFERENCES) {
				for (const systemLight of [true, false]) {
					expect(THEMES).toContain(resolveTheme(preference, systemLight));
				}
			}
		});
	});

	describe('migrateStoredAppearance', () => {
		it.each(APPEARANCE_PREFERENCES)('keeps the current value %s', (value) => {
			expect(migrateStoredAppearance(value)).toBe(value);
		});

		it.each(LEGACY_DARK_THEMES)('turns the legacy editor theme %s into dark', (value) => {
			expect(migrateStoredAppearance(value)).toBe('dark');
		});

		it('covers all five legacy editor themes', () => {
			expect([...LEGACY_DARK_THEMES].sort()).toEqual(
				['dracula', 'gruvbox', 'nord', 'solarized-dark', 'tokyo-night'].sort(),
			);
		});

		it.each([null, undefined, '', 'sepia', 'DARK', 42, {}])(
			'follows the system for the unknown value %j',
			(value) => {
				expect(migrateStoredAppearance(value)).toBe('system');
			},
		);
	});

	it('tells current values and legacy values apart', () => {
		for (const value of APPEARANCE_PREFERENCES) {
			expect(isAppearancePreference(value)).toBe(true);
			expect(isLegacyDarkTheme(value)).toBe(false);
		}
		for (const value of LEGACY_DARK_THEMES) {
			expect(isAppearancePreference(value)).toBe(false);
			expect(isLegacyDarkTheme(value)).toBe(true);
		}
		expect(isAppearancePreference(null)).toBe(false);
		expect(isLegacyDarkTheme(null)).toBe(false);
	});
});
