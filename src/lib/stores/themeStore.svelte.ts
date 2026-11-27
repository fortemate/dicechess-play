/**
 * Applies the appearance model (`#lib/appearance.ts`, #249) to the page. The store holds the
 * visitor's preference (`system`, `light` or `dark`), follows the system setting for as long as
 * that preference is `system`, and keeps two things in step with the resolved theme: `data-theme`
 * on the root element, which is always `light` or `dark`, and the `theme-color` meta.
 *
 * The inline bootstrap in `src/app.html` has already set both before first paint; constructing
 * the store re-applies the same decision and takes over from there. A legacy value left by the
 * seven-theme picker is rewritten to `dark` once, here. A value this version does not know is
 * treated as `system` but left in storage, so an older bundle served from a stale cache cannot
 * erase a choice made in a newer one.
 *
 * Storage and `matchMedia` can both be missing or denied (privacy modes, sandboxed frames).
 * Neither failure may stop the page from rendering: the preference then lives in memory, and the
 * system reads as dark.
 */
import {
	APPEARANCE_STORAGE_KEY,
	DEFAULT_APPEARANCE_PREFERENCE,
	SYSTEM_LIGHT_QUERY,
	THEME_COLORS,
	isAppearancePreference,
	isLegacyDarkTheme,
	migrateStoredAppearance,
	resolveTheme,
	type AppearancePreference,
	type Theme,
} from '#lib/appearance.js';

const THEME_COLOR_META_ID = 'theme-color-meta';

function readStored(): string | null {
	try {
		return window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
	} catch (_error) {
		return null;
	}
}

function writeStored(preference: AppearancePreference): void {
	try {
		window.localStorage.setItem(APPEARANCE_STORAGE_KEY, preference);
	} catch (_error) {
		// A storage failure must not stop the in-memory preference from taking effect.
	}
}

export class ThemeStore {
	/** What the visitor chose. */
	preference = $state<AppearancePreference>(DEFAULT_APPEARANCE_PREFERENCE);
	/** Whether the system asks for light. Only decides the theme while the preference is `system`. */
	private systemLight = $state(false);
	/** What the page renders. Never `system`. */
	readonly theme: Theme = $derived(resolveTheme(this.preference, this.systemLight));

	private readonly media: MediaQueryList | undefined;
	/** The hold in force, if any. An object, so two holds of the same colour stay distinct. */
	private themeColorHold: { readonly color: string } | null = null;

	constructor() {
		if (typeof window === 'undefined') return;

		const stored = readStored();
		this.preference = migrateStoredAppearance(stored);
		if (isLegacyDarkTheme(stored)) writeStored(this.preference);

		try {
			this.media = window.matchMedia(SYSTEM_LIGHT_QUERY);
			this.systemLight = this.media.matches;
			this.media.addEventListener('change', (event) => {
				this.systemLight = event.matches;
				this.apply();
			});
		} catch (_error) {
			// No readable system setting, or no change events: `system` stays on its fallback.
		}

		this.apply();
	}

	setPreference(preference: AppearancePreference): void {
		if (!isAppearancePreference(preference)) return;
		// Re-read the live setting rather than trust the last event: `matches` is always current,
		// while a browser without change events would leave the cached value stale.
		if (this.media) this.systemLight = this.media.matches;
		this.preference = preference;
		writeStored(preference);
		this.apply();
	}

	/**
	 * Lets a page that paints its own background (the Fire TV storefront at `/`) hold the
	 * browser-chrome colour while it is shown. Returns the release function. After a release the
	 * meta follows the theme again, including any change that happened in the meantime.
	 *
	 * A later hold replaces an earlier one, and each release only ends its own hold: a page that
	 * unmounts after its successor has mounted must not take the successor's colour with it, even
	 * when both asked for the same one.
	 */
	holdThemeColor(color: string): () => void {
		const hold = { color };
		this.themeColorHold = hold;
		this.apply();
		return () => {
			if (this.themeColorHold !== hold) return;
			this.themeColorHold = null;
			this.apply();
		};
	}

	private apply(): void {
		if (typeof document === 'undefined') return;
		const theme = this.theme;
		document.documentElement.dataset.theme = theme;
		document
			.getElementById(THEME_COLOR_META_ID)
			?.setAttribute('content', this.themeColorHold?.color ?? THEME_COLORS[theme]);
	}
}

export const themeStore = new ThemeStore();
