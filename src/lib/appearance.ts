/**
 * The appearance model of the main site (#249). A visitor's PREFERENCE is `system`, `light` or
 * `dark`; the page only ever renders one of two THEMES, `light` or `dark`. `system` is the
 * default and resolves through the operating system's colour-scheme setting.
 *
 * This module is the single source of truth for the list of values, the storage key, the
 * migration of values stored by the earlier seven-theme picker, and the browser-chrome colour of
 * each theme. It is rune-free and DOM-free on purpose, so two consumers can share it:
 *
 *   - `stores/themeStore.svelte.ts` applies it to the page and follows system changes;
 *   - the inline bootstrap in `src/app.html` makes the same decision before first paint. That
 *     script cannot import this module (a module runs after first paint, which would flash the
 *     wrong theme), so it repeats the values, and `src/appearanceBootstrap.test.ts` executes the
 *     shipped script against every value below and fails when the two disagree.
 *
 * The storage key is the one the seven-theme picker used, so a stored choice is migrated where
 * it already lives instead of being orphaned under a new key.
 *
 * Not shared with the laboratory build: `laboratory/appearance.ts` keeps its own preference
 * under a separate storage key and root attribute, and the two are deliberately independent.
 */

/** The `localStorage` key that holds the preference. */
export const APPEARANCE_STORAGE_KEY = 'dicechess-theme';

/** What the page renders. `data-theme` on the root element is always one of these. */
export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** What a visitor can choose, in the order the control lists the choices. */
export const APPEARANCE_PREFERENCES = ['system', ...THEMES] as const;
export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number];

/** Nothing stored, or nothing readable, means "follow the system". */
export const DEFAULT_APPEARANCE_PREFERENCE: AppearancePreference = 'system';

/**
 * Values the seven-theme picker could store besides `light` and `dark`. All five were dark
 * editor palettes, so each migrates to `dark`. The list has to stay for as long as a returning
 * visitor may still hold one of them.
 */
export const LEGACY_DARK_THEMES = [
	'dracula',
	'nord',
	'solarized-dark',
	'tokyo-night',
	'gruvbox',
] as const;

/**
 * The media query that reads the system setting. The model asks for LIGHT, so a browser that
 * cannot answer falls back to dark: the theme the static page defaults to (the `:root` tokens in
 * `app.css` and the `theme-color` meta in `app.html`).
 */
export const SYSTEM_LIGHT_QUERY = '(prefers-color-scheme: light)';

/**
 * The browser-chrome colour (`<meta name="theme-color">`) of each theme: the page background,
 * `--bg-app` of the matching `[data-theme]` block in `app.css`. A test keeps the two equal.
 */
export const THEME_COLORS: Record<Theme, string> = {
	light: '#f8fafc',
	dark: '#020617',
};

export function isAppearancePreference(value: unknown): value is AppearancePreference {
	return (APPEARANCE_PREFERENCES as readonly unknown[]).includes(value);
}

export function isLegacyDarkTheme(value: unknown): value is (typeof LEGACY_DARK_THEMES)[number] {
	return (LEGACY_DARK_THEMES as readonly unknown[]).includes(value);
}

/**
 * Turns whatever the storage key holds into a preference: a current value stays, a legacy editor
 * theme becomes `dark`, and anything else (nothing stored, or a value this version does not
 * know) follows the system.
 */
export function migrateStoredAppearance(stored: unknown): AppearancePreference {
	if (isAppearancePreference(stored)) return stored;
	if (isLegacyDarkTheme(stored)) return 'dark';
	return DEFAULT_APPEARANCE_PREFERENCE;
}

/** The theme to render for a preference, given whether the system currently asks for light. */
export function resolveTheme(preference: AppearancePreference, systemLight: boolean): Theme {
	if (preference === 'system') return systemLight ? 'light' : 'dark';
	return preference;
}
