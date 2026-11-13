/**
 * Owns the laboratory surface's two-palette appearance preference. It deliberately uses a separate
 * storage key and root dataset from the main game shell; keep bootstrapAppearance self-contained so
 * Vite can inline it as a classic head script before the laboratory app mounts.
 */
export const APPEARANCE_KEY = 'dicechess-laboratory-appearance';

export type AppearancePreference = 'light' | 'dark' | 'system';

export function resolveAppearance(
	preference: AppearancePreference,
	darkSystem: boolean,
): 'light' | 'dark' {
	if (preference === 'system') return darkSystem ? 'dark' : 'light';
	return preference;
}

/**
 * Early, dependency-free theme bootstrap for Vite's inline classic head script. Keep all values and
 * helpers local: this function's toString() is injected into HTML without its module environment.
 */
export function bootstrapAppearance(): void {
	let preference: string | null = null;
	try {
		preference = window.localStorage.getItem('dicechess-laboratory-appearance');
	} catch (_error) {
		// Storage can be unavailable in restricted browsing contexts.
	}
	if (preference !== 'light' && preference !== 'dark' && preference !== 'system') {
		preference = 'system';
	}
	let darkSystem = false;
	try {
		darkSystem = window.matchMedia('(prefers-color-scheme: dark)').matches;
	} catch (_error) {
		// Light is the safe fallback when system appearance cannot be read.
	}
	try {
		const dark = preference === 'dark' || (preference === 'system' && darkSystem);
		document.documentElement.dataset.labTheme = dark ? 'dark' : 'light';
	} catch (_error) {
		// The document root may not be available in non-browser execution contexts.
	}
}

export type AppearanceController = {
	readonly preference: AppearancePreference;
	setPreference(value: AppearancePreference): void;
	destroy(): void;
};

/**
 * Creates an independent appearance controller for the laboratory surface. With no explicit
 * preference, a valid saved value is restored; otherwise the preference defaults to system.
 */
export function setupAppearance(
	initialPreference?: AppearancePreference,
	onPreferenceChange?: (preference: AppearancePreference) => void,
): AppearanceController {
	let preference: AppearancePreference = 'system';
	if (isPreference(initialPreference)) {
		preference = initialPreference;
	} else {
		try {
			const stored = window.localStorage.getItem(APPEARANCE_KEY);
			if (isPreference(stored)) preference = stored;
		} catch (_error) {
			// Storage can be unavailable in restricted browsing contexts.
		}
	}

	let media: MediaQueryList | undefined;
	let destroyed = false;
	const apply = () => {
		let darkSystem = false;
		try {
			media ??= window.matchMedia('(prefers-color-scheme: dark)');
			darkSystem = media.matches;
		} catch (_error) {
			// Light is the safe fallback when matchMedia is absent or denied.
		}
		try {
			document.documentElement.dataset.labTheme = resolveAppearance(preference, darkSystem);
		} catch (_error) {
			// This module is also safe to import outside a browser.
		}
	};
	const onSystemChange = (event: MediaQueryListEvent) => {
		if (preference === 'system' && !destroyed) {
			try {
				document.documentElement.dataset.labTheme = event.matches ? 'dark' : 'light';
			} catch (_error) {
				// Ignore unavailable document APIs.
			}
		}
	};

	apply();
	try {
		media?.addEventListener('change', onSystemChange);
	} catch (_error) {
		// Older or restricted media query implementations may not support listeners.
	}

	return {
		get preference() {
			return preference;
		},
		setPreference(value) {
			if (!isPreference(value) || destroyed) return;
			preference = value;
			apply();
			try {
				window.localStorage.setItem(APPEARANCE_KEY, value);
			} catch (_error) {
				// A storage failure must not prevent the in-memory preference from taking effect.
			}
			onPreferenceChange?.(preference);
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			try {
				media?.removeEventListener('change', onSystemChange);
			} catch (_error) {
				// Ignore unavailable media query cleanup APIs.
			}
		},
	};
}

function isPreference(value: unknown): value is AppearancePreference {
	return value === 'light' || value === 'dark' || value === 'system';
}
