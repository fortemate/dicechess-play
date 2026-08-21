import { afterEach, describe, expect, it, vi } from 'vitest';

import appHtml from './app.html?raw';

// The watchdog ships as an inline, module-free script in app.html — it must keep working
// when every module import fails, so it cannot be a module itself. These tests therefore
// execute the exact shipped source: slice the script out of app.html and run it against a
// fake `window` (the script's IIFE argument shadows the global). Plain string search, not
// a regexp — an HTML-shaped regexp trips CodeQL's js/bad-tag-filter, and we are slicing a
// document we author, not filtering untrusted markup.
function extractWatchdogSource(html: string): string | undefined {
	const section = html.split('<!-- boot-watchdog')[1];
	if (!section) return undefined;
	const open = section.indexOf('<script>');
	const close = section.indexOf('</script>');
	if (open === -1 || close === -1 || close < open) return undefined;
	return section.slice(open + '<script>'.length, close);
}

const source = extractWatchdogSource(appHtml);

function makeWindow() {
	const target = new EventTarget();
	const reload = vi.fn();
	const store = new Map<string, string>();
	const unregister = vi.fn(async () => true);
	const cacheDelete = vi.fn(async () => true);
	const fetch = vi.fn(async (_url: string, _init?: { cache?: string }) => ({
		text: async () =>
			'<link href="/_app/immutable/entry/start.AAA.js">' +
			'<script src="/_app/immutable/entry/start.AAA.js"><' +
			'/script>' +
			'<link href="/_app/immutable/chunks/BBB.js">',
	}));
	const win = {
		__dcBooted: undefined as boolean | undefined,
		addEventListener: target.addEventListener.bind(target),
		location: { reload },
		sessionStorage: {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => {
				store.set(key, value);
			},
		},
		navigator: {
			onLine: true,
			serviceWorker: { getRegistrations: vi.fn(async () => [{ unregister }]) },
		},
		caches: { keys: vi.fn(async () => ['workbox-precache-v2-x']), delete: cacheDelete },
		fetch,
	};
	const fireBootFailure = (
		message = 'TypeError: Failed to fetch dynamically imported module: start.js',
	) => {
		const event = new Event('unhandledrejection') as Event & { reason?: unknown };
		event.reason = new TypeError(message);
		target.dispatchEvent(event);
	};
	return { win, reload, unregister, cacheDelete, fetch, fireBootFailure };
}

function install(win: unknown) {
	expect(source).toBeTruthy();
	new Function('window', source as string)(win);
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
	vi.useRealTimers();
});

describe('boot watchdog (inline in app.html)', () => {
	it('on a boot import failure: unregisters SWs, drops caches, refetches assets, reloads', async () => {
		const { win, reload, unregister, cacheDelete, fetch, fireBootFailure } = makeWindow();
		install(win);

		fireBootFailure();
		await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

		expect(unregister).toHaveBeenCalledTimes(1);
		expect(cacheDelete).toHaveBeenCalledWith('workbox-precache-v2-x');
		expect(fetch).toHaveBeenCalledWith('/', { cache: 'reload' });
		expect(fetch).toHaveBeenCalledWith('/_app/immutable/chunks/BBB.js', { cache: 'reload' });
		// The same asset appears twice in the fetched HTML — refetched only once.
		const entryCalls = fetch.mock.calls.filter(
			(call) => call[0] === '/_app/immutable/entry/start.AAA.js',
		);
		expect(entryCalls).toHaveLength(1);
	});

	it('never fires once the app has booted', async () => {
		const { win, reload, fireBootFailure } = makeWindow();
		win.__dcBooted = true;
		install(win);

		fireBootFailure();
		await flush();

		expect(reload).not.toHaveBeenCalled();
	});

	it('ignores rejections that are not module-load failures', async () => {
		const { win, reload, fireBootFailure } = makeWindow();
		install(win);

		fireBootFailure('database is on fire');
		await flush();

		expect(reload).not.toHaveBeenCalled();
	});

	it('heals at most once per minute, then re-arms', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-08-09T12:00:00Z'));
		const { win, reload, fireBootFailure } = makeWindow();
		install(win);

		fireBootFailure();
		await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
		fireBootFailure();
		await flush();
		expect(reload).toHaveBeenCalledTimes(1);

		vi.setSystemTime(new Date('2026-08-09T12:01:01Z'));
		fireBootFailure();
		await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
	});

	it('does nothing without usable sessionStorage — no loop guard, no reload', async () => {
		const { win, reload, unregister, fireBootFailure } = makeWindow();
		win.sessionStorage.getItem = () => {
			throw new Error('storage disabled');
		};
		install(win);

		fireBootFailure();
		await flush();

		expect(reload).not.toHaveBeenCalled();
		expect(unregister).not.toHaveBeenCalled();
	});

	it('stays put while offline — a reload cannot help there', async () => {
		const { win, reload, fireBootFailure } = makeWindow();
		win.navigator.onLine = false;
		install(win);

		fireBootFailure();
		await flush();

		expect(reload).not.toHaveBeenCalled();
	});

	it('still reloads when the asset refetch fails — every heal step is best-effort', async () => {
		const { win, reload, unregister, fireBootFailure } = makeWindow();
		win.fetch = vi.fn(async () => {
			throw new Error('network down');
		});
		install(win);

		fireBootFailure();
		await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

		expect(unregister).toHaveBeenCalledTimes(1);
	});
});
