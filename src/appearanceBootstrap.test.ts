import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import appHtml from './app.html?raw';
import {
	APPEARANCE_PREFERENCES,
	APPEARANCE_STORAGE_KEY,
	DEFAULT_APPEARANCE_PREFERENCE,
	LEGACY_DARK_THEMES,
	SYSTEM_LIGHT_QUERY,
	THEMES,
	THEME_COLORS,
	migrateStoredAppearance,
	resolveTheme,
	type Theme,
} from './lib/appearance';

// The appearance bootstrap ships as an inline, module-free script in app.html: it has to run
// before first paint, so it cannot import `lib/appearance.ts` and repeats its values instead
// (#249). These tests are what keeps the two from drifting. They execute the exact shipped
// source — sliced out of app.html, the way bootWatchdog.test.ts does — against every value the
// model lists, and compare the outcome with what the model itself decides. Add a preference, a
// legacy theme, or change a key, a query or a colour on one side only, and a case here fails.
//
// Plain string search, not a regexp: an HTML-shaped regexp trips CodeQL's js/bad-tag-filter,
// and we are slicing a document we author, not filtering untrusted markup.
const MARKER = '<!-- appearance-bootstrap';

function extractBootstrapSource(html: string): string | undefined {
	const section = html.split(MARKER)[1];
	if (!section) return undefined;
	const open = section.indexOf('<script>');
	const close = section.indexOf('</script>');
	if (open === -1 || close === -1 || close < open) return undefined;
	return section.slice(open + '<script>'.length, close);
}

const source = extractBootstrapSource(appHtml);

type Environment = {
	/** What the storage key holds; `undefined` makes storage throw, as a privacy mode can. */
	stored: string | null | undefined;
	/** The system setting; `undefined` makes matchMedia throw. */
	systemLight: boolean | undefined;
};

/** Runs the shipped script against a fake page and returns what it left behind. */
function boot({ stored, systemLight }: Environment) {
	expect(source).toBeTruthy();
	const meta: Record<string, string> = {};
	const fakeDocument = {
		documentElement: { dataset: {} as Record<string, string> },
		getElementById: (id: string) =>
			id === 'theme-color-meta'
				? { setAttribute: (name: string, value: string) => void (meta[name] = value) }
				: null,
	};
	const fakeStorage = {
		getItem(key: string) {
			if (stored === undefined) throw new Error('storage denied');
			// Only the model's key answers: a bootstrap reading another key sees nothing.
			return key === APPEARANCE_STORAGE_KEY ? stored : null;
		},
	};
	const fakeWindow = {
		matchMedia(query: string) {
			if (systemLight === undefined) throw new Error('media denied');
			// Answer by meaning, so the bootstrap may ask for light or for dark, but a query for
			// anything else gets nothing useful.
			if (query === SYSTEM_LIGHT_QUERY) return { matches: systemLight };
			if (query === '(prefers-color-scheme: dark)') return { matches: !systemLight };
			throw new Error(`unexpected media query: ${query}`);
		},
		localStorage: fakeStorage,
	};
	new Function('window', 'document', 'localStorage', source as string)(
		fakeWindow,
		fakeDocument,
		fakeStorage,
	);
	return { theme: fakeDocument.documentElement.dataset.theme, themeColor: meta.content };
}

/** What the model decides for the same environment. */
function expected({ stored, systemLight }: Environment): Theme {
	return resolveTheme(migrateStoredAppearance(stored ?? null), systemLight ?? false);
}

const STORED_VALUES: (string | null)[] = [
	null,
	...APPEARANCE_PREFERENCES,
	...LEGACY_DARK_THEMES,
	'',
	'sepia',
];

describe('appearance bootstrap (inline in app.html)', () => {
	it('is present in app.html', () => {
		expect(source).toBeTruthy();
	});

	describe.each([
		{ systemLight: true, system: 'light' },
		{ systemLight: false, system: 'dark' },
	])('under a $system system', ({ systemLight }) => {
		it.each(STORED_VALUES)('resolves the stored value %j the way the model does', (stored) => {
			const environment = { stored, systemLight };
			const theme = expected(environment);

			expect(boot(environment)).toEqual({ theme, themeColor: THEME_COLORS[theme] });
		});
	});

	it('follows the system when nothing is stored', () => {
		expect(DEFAULT_APPEARANCE_PREFERENCE).toBe('system');
		expect(boot({ stored: null, systemLight: true }).theme).toBe('light');
		expect(boot({ stored: null, systemLight: false }).theme).toBe('dark');
	});

	it.each(LEGACY_DARK_THEMES)('renders the legacy editor theme %s as dark', (legacy) => {
		// A light system proves this is the migration and not the system default.
		expect(boot({ stored: legacy, systemLight: true }).theme).toBe('dark');
	});

	it('only ever puts light or dark on the root element', () => {
		for (const stored of [...STORED_VALUES, undefined]) {
			for (const systemLight of [true, false, undefined]) {
				expect(THEMES).toContain(boot({ stored, systemLight }).theme);
			}
		}
	});

	it('follows the system when storage is denied', () => {
		expect(boot({ stored: undefined, systemLight: true }).theme).toBe('light');
		expect(boot({ stored: undefined, systemLight: false }).theme).toBe('dark');
	});

	it('still honours a stored choice when the system setting cannot be read', () => {
		expect(boot({ stored: 'light', systemLight: undefined }).theme).toBe('light');
		expect(boot({ stored: 'dark', systemLight: undefined }).theme).toBe('dark');
	});

	it('falls back the way the model does when nothing can be read', () => {
		const environment = { stored: undefined, systemLight: undefined };
		const theme = expected(environment);
		expect(boot(environment)).toEqual({ theme, themeColor: THEME_COLORS[theme] });
	});
});

describe('first paint (app.html and app.css)', () => {
	const fallbackTheme = resolveTheme(DEFAULT_APPEARANCE_PREFERENCE, false);

	it('runs the bootstrap after the meta it updates and before the application', () => {
		const meta = appHtml.indexOf('id="theme-color-meta"');
		const bootstrap = appHtml.indexOf(MARKER);
		const application = appHtml.indexOf('%sveltekit.head%');

		expect(meta).toBeGreaterThan(-1);
		expect(bootstrap).toBeGreaterThan(meta);
		expect(application).toBeGreaterThan(bootstrap);
	});

	it('ships the fallback theme colour in the static meta, for a page whose script cannot run', () => {
		const tag = appHtml.slice(appHtml.indexOf('<meta id="theme-color-meta"')).split('>')[0];
		expect(tag).toContain(`content="${THEME_COLORS[fallbackTheme]}"`);
	});

	// The `theme-color` meta is the page background of each theme. The values live in two places,
	// TypeScript for the meta and CSS for the page, so a token change (#250) has to reach both.
	const appCss = readFileSync('src/app.css', 'utf-8');
	const backgroundOf = (theme: Theme) => {
		const block = appCss.split(`[data-theme='${theme}'] {`)[1]?.split('}')[0];
		return block?.match(/--bg-app:\s*(#[0-9a-f]{3,8})/i)?.[1].toLowerCase();
	};

	it.each(THEMES)('has a %s token block whose page background is the meta colour', (theme) => {
		expect(backgroundOf(theme)).toBe(THEME_COLORS[theme].toLowerCase());
	});

	it('styles a page without data-theme as the fallback theme', () => {
		expect(appCss).toContain(`:root,\n[data-theme='${fallbackTheme}'] {`);
	});
});
