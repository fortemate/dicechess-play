import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	APPEARANCE_KEY,
	bootstrapAppearance,
	resolveAppearance,
	setupAppearance,
	type AppearancePreference,
} from './appearance';

class MemoryStorage {
	private readonly values = new Map<string, string>();
	getItem(key: string) {
		return this.values.get(key) ?? null;
	}
	setItem(key: string, value: string) {
		this.values.set(key, value);
	}
	removeItem(key: string) {
		this.values.delete(key);
	}
	clear() {
		this.values.clear();
	}
	key(index: number) {
		return [...this.values.keys()][index] ?? null;
	}
	get length() {
		return this.values.size;
	}
}

function createMediaQuery(initialMatches: boolean) {
	let matches = initialMatches;
	const listeners = new Set<(event: MediaQueryListEvent) => void>();
	const media = {
		get matches() {
			return matches;
		},
		media: '(prefers-color-scheme: dark)',
		onchange: null,
		addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
			listeners.add(listener);
		}),
		removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
			listeners.delete(listener);
		}),
		addListener: vi.fn(),
		removeListener: vi.fn(),
		dispatch(next: boolean) {
			matches = next;
			for (const listener of listeners) listener({ matches: next } as MediaQueryListEvent);
		},
	} as unknown as MediaQueryList & { dispatch(next: boolean): void };
	return media;
}

describe('laboratory appearance', () => {
	let media: ReturnType<typeof createMediaQuery>;

	beforeEach(() => {
		Object.defineProperty(window, 'localStorage', {
			configurable: true,
			value: new MemoryStorage(),
		});
		window.localStorage.clear();
		delete document.documentElement.dataset.labTheme;
		media = createMediaQuery(false);
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			value: vi.fn(() => media),
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete (window as unknown as { localStorage?: Storage }).localStorage;
		delete (window as unknown as { matchMedia?: typeof window.matchMedia }).matchMedia;
	});

	it('resolves the two palettes and defaults to the light system palette', () => {
		expect(resolveAppearance('system', false)).toBe('light');
		expect(resolveAppearance('system', true)).toBe('dark');
		expect(resolveAppearance('light', true)).toBe('light');
		expect(resolveAppearance('dark', false)).toBe('dark');
		const controller = setupAppearance();
		expect(controller.preference).toBe('system');
		expect(document.documentElement.dataset.labTheme).toBe('light');
		expect(APPEARANCE_KEY).toBe('dicechess-laboratory-appearance');
		expect(window.localStorage.getItem('dicechess-theme')).toBeNull();
		controller.destroy();
	});

	it('restores valid preferences and ignores invalid saved values', () => {
		for (const preference of ['light', 'dark', 'system'] as const) {
			window.localStorage.setItem(APPEARANCE_KEY, preference);
			const controller = setupAppearance();
			expect(controller.preference).toBe(preference);
			controller.destroy();
		}
		window.localStorage.setItem(APPEARANCE_KEY, 'sepia');
		const controller = setupAppearance();
		expect(controller.preference).toBe('system');
		expect(document.documentElement.dataset.labTheme).toBe('light');
		controller.destroy();
	});

	it('persists changes, notifies the optional observer, and follows system changes only in system mode', () => {
		const observer = vi.fn();
		const controller = setupAppearance(undefined, observer);
		media.dispatch(true);
		expect(document.documentElement.dataset.labTheme).toBe('dark');
		controller.setPreference('light');
		expect(document.documentElement.dataset.labTheme).toBe('light');
		expect(window.localStorage.getItem(APPEARANCE_KEY)).toBe('light');
		expect(observer).toHaveBeenCalledWith('light');
		media.dispatch(true);
		expect(document.documentElement.dataset.labTheme).toBe('light');
		controller.setPreference('system');
		expect(document.documentElement.dataset.labTheme).toBe('dark');
		media.dispatch(false);
		expect(document.documentElement.dataset.labTheme).toBe('light');
		controller.setPreference('dark');
		media.dispatch(false);
		expect(document.documentElement.dataset.labTheme).toBe('dark');
		controller.destroy();
	});

	it('ignores invalid runtime values and cleans up its system listener', () => {
		const controller = setupAppearance();
		controller.setPreference('dark');
		controller.setPreference('invalid' as AppearancePreference);
		expect(controller.preference).toBe('dark');
		expect(window.localStorage.getItem(APPEARANCE_KEY)).toBe('dark');
		controller.destroy();
		expect(media.removeEventListener).toHaveBeenCalledTimes(1);
		media.dispatch(true);
		expect(document.documentElement.dataset.labTheme).toBe('dark');
	});

	it('uses light on denied storage or matchMedia while explicit dark still applies', () => {
		Object.defineProperty(window, 'localStorage', {
			configurable: true,
			get() {
				throw new Error('storage denied');
			},
		});
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			value: vi.fn(() => {
				throw new Error('media denied');
			}),
		});
		const controller = setupAppearance();
		expect(controller.preference).toBe('system');
		expect(document.documentElement.dataset.labTheme).toBe('light');
		controller.setPreference('dark');
		expect(document.documentElement.dataset.labTheme).toBe('dark');
		controller.destroy();
	});

	it('runs the actual self-contained bootstrap function as an injected classic head script', () => {
		window.localStorage.setItem(APPEARANCE_KEY, 'system');
		media.dispatch(true);
		const injected = new Function(
			'window',
			'document',
			`return (${bootstrapAppearance.toString()})();`,
		);
		injected(window, document);
		expect(document.documentElement.dataset.labTheme).toBe('dark');

		window.localStorage.setItem(APPEARANCE_KEY, 'invalid');
		media.dispatch(false);
		injected(window, document);
		expect(document.documentElement.dataset.labTheme).toBe('light');
	});

	it('bootstrap falls back safely when storage and matchMedia are denied', () => {
		Object.defineProperty(window, 'localStorage', {
			configurable: true,
			get() {
				throw new Error('storage denied');
			},
		});
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			value: vi.fn(() => {
				throw new Error('media denied');
			}),
		});
		new Function(`(${bootstrapAppearance.toString()})()`)();
		expect(document.documentElement.dataset.labTheme).toBe('light');
	});
});
