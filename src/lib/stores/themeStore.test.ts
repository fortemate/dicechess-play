import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	APPEARANCE_PREFERENCES,
	APPEARANCE_STORAGE_KEY,
	LEGACY_DARK_THEMES,
	SYSTEM_LIGHT_QUERY,
	THEMES,
	THEME_COLORS,
	type AppearancePreference,
} from '#lib/appearance.js';
import { ThemeStore } from './themeStore.svelte';

// Each test builds its own ThemeStore against a fake storage and a fake system setting; the
// exported singleton is not involved. The store reads both once, in its constructor.

class MemoryStorage {
	private readonly values = new Map<string, string>();
	getItem(key: string) {
		return this.values.get(key) ?? null;
	}
	setItem(key: string, value: string) {
		this.values.set(key, value);
	}
}

/**
 * A `(prefers-color-scheme: light)` media query whose answer a test can change. With
 * `changeEvents: false` it stands in for a browser that cannot subscribe to changes.
 */
function createSystemSetting(initiallyLight: boolean, { changeEvents = true } = {}) {
	let light = initiallyLight;
	const listeners = new Set<(event: MediaQueryListEvent) => void>();
	return {
		query: {
			get matches() {
				return light;
			},
			media: SYSTEM_LIGHT_QUERY,
			addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
				if (!changeEvents) throw new TypeError('addEventListener is not a function');
				listeners.add(listener);
			},
			removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
				listeners.delete(listener);
			},
		} as unknown as MediaQueryList,
		/** The visitor (or the clock, at sunset) switches the operating system's setting. */
		switchTo(next: 'light' | 'dark') {
			light = next === 'light';
			for (const listener of listeners) listener({ matches: light } as MediaQueryListEvent);
		},
	};
}

const root = () => document.documentElement;
const themeColor = () => document.getElementById('theme-color-meta')?.getAttribute('content');

describe('themeStore', () => {
	const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
	const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
	let storage: MemoryStorage;
	let system: ReturnType<typeof createSystemSetting>;
	let matchMedia: ReturnType<typeof vi.fn>;

	function useSystem(setting: 'light' | 'dark') {
		system = createSystemSetting(setting === 'light');
		matchMedia = vi.fn(() => system.query);
		Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia });
	}

	beforeEach(() => {
		storage = new MemoryStorage();
		Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
		useSystem('dark');
		delete root().dataset.theme;
		const meta = document.createElement('meta');
		meta.id = 'theme-color-meta';
		meta.name = 'theme-color';
		meta.content = 'unset';
		document.head.append(meta);
	});

	afterEach(() => {
		document.getElementById('theme-color-meta')?.remove();
		delete root().dataset.theme;
		if (originalStorage) Object.defineProperty(window, 'localStorage', originalStorage);
		else delete (window as unknown as { localStorage?: Storage }).localStorage;
		if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
	});

	describe('resolving the preference', () => {
		it.each(['light', 'dark'] as const)(
			'defaults to system and renders the %s system setting',
			(setting) => {
				useSystem(setting);
				const store = new ThemeStore();

				expect(store.preference).toBe('system');
				expect(store.theme).toBe(setting);
				expect(root().dataset.theme).toBe(setting);
				expect(themeColor()).toBe(THEME_COLORS[setting]);
				expect(matchMedia).toHaveBeenCalledWith(SYSTEM_LIGHT_QUERY);
				// Reading a default writes nothing: "nothing stored" already means system.
				expect(storage.getItem(APPEARANCE_STORAGE_KEY)).toBeNull();
			},
		);

		it.each([
			{ stored: 'light', system: 'dark', theme: 'light' },
			{ stored: 'dark', system: 'light', theme: 'dark' },
			{ stored: 'system', system: 'light', theme: 'light' },
			{ stored: 'system', system: 'dark', theme: 'dark' },
		] as const)(
			'restores the stored $stored under a $system system as $theme',
			({ stored, system: setting, theme }) => {
				storage.setItem(APPEARANCE_STORAGE_KEY, stored);
				useSystem(setting);
				const store = new ThemeStore();

				expect(store.preference).toBe(stored);
				expect(store.theme).toBe(theme);
				expect(root().dataset.theme).toBe(theme);
				expect(themeColor()).toBe(THEME_COLORS[theme]);
				expect(storage.getItem(APPEARANCE_STORAGE_KEY)).toBe(stored);
			},
		);
	});

	describe('migrating stored values', () => {
		it.each(LEGACY_DARK_THEMES)('turns the stored legacy theme %s into dark', (legacy) => {
			storage.setItem(APPEARANCE_STORAGE_KEY, legacy);
			// A light system proves the result is the explicit dark choice, not the default.
			useSystem('light');
			const store = new ThemeStore();

			expect(store.preference).toBe('dark');
			expect(store.theme).toBe('dark');
			expect(root().dataset.theme).toBe('dark');
			expect(themeColor()).toBe(THEME_COLORS.dark);
			expect(storage.getItem(APPEARANCE_STORAGE_KEY)).toBe('dark');
		});

		it('follows the system for an unknown stored value and leaves it in storage', () => {
			storage.setItem(APPEARANCE_STORAGE_KEY, 'sepia');
			useSystem('light');
			const store = new ThemeStore();

			expect(store.preference).toBe('system');
			expect(root().dataset.theme).toBe('light');
			expect(storage.getItem(APPEARANCE_STORAGE_KEY)).toBe('sepia');
		});
	});

	describe('reacting to a system change', () => {
		it('follows the system while the preference is system', () => {
			const store = new ThemeStore();
			expect(root().dataset.theme).toBe('dark');

			system.switchTo('light');
			expect(store.theme).toBe('light');
			expect(root().dataset.theme).toBe('light');
			expect(themeColor()).toBe(THEME_COLORS.light);

			system.switchTo('dark');
			expect(store.theme).toBe('dark');
			expect(root().dataset.theme).toBe('dark');
			expect(themeColor()).toBe(THEME_COLORS.dark);

			// Following the system is not a choice to remember: nothing is stored.
			expect(store.preference).toBe('system');
			expect(storage.getItem(APPEARANCE_STORAGE_KEY)).toBeNull();
		});

		it.each(['light', 'dark'] as const)('keeps an explicit %s through system changes', (choice) => {
			const store = new ThemeStore();
			store.setPreference(choice);

			system.switchTo('light');
			expect(root().dataset.theme).toBe(choice);
			system.switchTo('dark');
			expect(root().dataset.theme).toBe(choice);
			expect(themeColor()).toBe(THEME_COLORS[choice]);
			expect(store.preference).toBe(choice);
		});

		it('picks up the current system setting when the visitor goes back to system', () => {
			const store = new ThemeStore();
			store.setPreference('dark');
			system.switchTo('light');
			expect(root().dataset.theme).toBe('dark');

			store.setPreference('system');
			expect(root().dataset.theme).toBe('light');
			expect(themeColor()).toBe(THEME_COLORS.light);

			system.switchTo('dark');
			expect(root().dataset.theme).toBe('dark');
		});

		it('reads the live setting on a choice where change events cannot be subscribed to', () => {
			system = createSystemSetting(false, { changeEvents: false });
			Object.defineProperty(window, 'matchMedia', {
				configurable: true,
				value: () => system.query,
			});
			const store = new ThemeStore();
			expect(root().dataset.theme).toBe('dark');

			// No listener was attached, so this reaches nobody: the page stays as it is…
			system.switchTo('light');
			expect(root().dataset.theme).toBe('dark');

			// …until the next choice, which asks the media query instead of a cached answer.
			store.setPreference('system');
			expect(root().dataset.theme).toBe('light');
		});
	});

	describe('choosing a preference', () => {
		it.each(APPEARANCE_PREFERENCES)('stores and applies %s', (choice) => {
			useSystem('light');
			const store = new ThemeStore();
			store.setPreference(choice);

			const expected = choice === 'system' ? 'light' : choice;
			expect(store.preference).toBe(choice);
			expect(store.theme).toBe(expected);
			expect(root().dataset.theme).toBe(expected);
			expect(themeColor()).toBe(THEME_COLORS[expected]);
			expect(storage.getItem(APPEARANCE_STORAGE_KEY)).toBe(choice);
		});

		it('ignores a value that is not a preference', () => {
			const store = new ThemeStore();
			store.setPreference('light');
			store.setPreference('nord' as AppearancePreference);

			expect(store.preference).toBe('light');
			expect(root().dataset.theme).toBe('light');
			expect(storage.getItem(APPEARANCE_STORAGE_KEY)).toBe('light');
		});
	});

	it('only ever puts light or dark on the root element', () => {
		const storedValues = [null, ...APPEARANCE_PREFERENCES, ...LEGACY_DARK_THEMES, 'sepia', ''];
		for (const stored of storedValues) {
			for (const setting of ['light', 'dark'] as const) {
				storage = new MemoryStorage();
				Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
				if (stored !== null) storage.setItem(APPEARANCE_STORAGE_KEY, stored);
				useSystem(setting);
				const store = new ThemeStore();

				expect(THEMES).toContain(root().dataset.theme);
				for (const choice of APPEARANCE_PREFERENCES) {
					store.setPreference(choice);
					expect(THEMES).toContain(root().dataset.theme);
					system.switchTo(setting === 'light' ? 'dark' : 'light');
					expect(THEMES).toContain(root().dataset.theme);
					system.switchTo(setting);
				}
			}
		}
	});

	it('still renders and takes a choice when storage and the system setting are denied', () => {
		Object.defineProperty(window, 'localStorage', {
			configurable: true,
			get() {
				throw new Error('storage denied');
			},
		});
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			value: () => {
				throw new Error('media denied');
			},
		});
		const store = new ThemeStore();

		expect(store.preference).toBe('system');
		expect(root().dataset.theme).toBe('dark');
		expect(themeColor()).toBe(THEME_COLORS.dark);

		store.setPreference('light');
		expect(store.preference).toBe('light');
		expect(root().dataset.theme).toBe('light');
		expect(themeColor()).toBe(THEME_COLORS.light);
	});

	describe('a held browser-chrome colour', () => {
		const STOREFRONT = '#10251f';

		it('wins over the theme colour until it is released', () => {
			const store = new ThemeStore();
			const release = store.holdThemeColor(STOREFRONT);
			expect(themeColor()).toBe(STOREFRONT);

			release();
			expect(themeColor()).toBe(THEME_COLORS.dark);
		});

		it('survives a theme change and releases to the theme of that moment', () => {
			const store = new ThemeStore();
			const release = store.holdThemeColor(STOREFRONT);

			system.switchTo('light');
			expect(root().dataset.theme).toBe('light');
			expect(themeColor()).toBe(STOREFRONT);

			release();
			expect(themeColor()).toBe(THEME_COLORS.light);
		});

		it('ignores a release that a later hold has replaced', () => {
			const store = new ThemeStore();
			const releaseFirst = store.holdThemeColor(STOREFRONT);
			const releaseSecond = store.holdThemeColor('#123456');

			releaseFirst();
			expect(themeColor()).toBe('#123456');
			releaseSecond();
			expect(themeColor()).toBe(THEME_COLORS.dark);
		});

		it('tells two holds of the same colour apart', () => {
			// The storefront remounting: the new page holds before the old one lets go.
			const store = new ThemeStore();
			const releaseOld = store.holdThemeColor(STOREFRONT);
			const releaseNew = store.holdThemeColor(STOREFRONT);

			releaseOld();
			system.switchTo('light');
			expect(themeColor()).toBe(STOREFRONT);

			releaseNew();
			expect(themeColor()).toBe(THEME_COLORS.light);
		});

		it('lets a release be called twice without ending a later hold', () => {
			const store = new ThemeStore();
			const release = store.holdThemeColor(STOREFRONT);
			release();
			const releaseLater = store.holdThemeColor(STOREFRONT);

			release();
			expect(themeColor()).toBe(STOREFRONT);
			releaseLater();
			expect(themeColor()).toBe(THEME_COLORS.dark);
		});
	});
});
