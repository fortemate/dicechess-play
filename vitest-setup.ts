// IndexedDB shim for tests that exercise localGamesDB (the durable game outbox).
import 'fake-indexeddb/auto';

// jsdom has no matchMedia, which themeStore reads on construction (the singleton is built at
// import time). Stub it as "no light preference" so the store defaults to its dark theme.
if (typeof window !== 'undefined' && !window.matchMedia) {
	window.matchMedia = (query: string) =>
		({
			matches: false,
			media: query,
			onchange: null,
			addEventListener() {},
			removeEventListener() {},
			addListener() {},
			removeListener() {},
			dispatchEvent: () => false,
		}) as unknown as MediaQueryList;
}

// jsdom has no Web Animations API, which Svelte transitions call (element.animate) —
// stub just enough of it that components using in:/out: can mount in component tests.
if (typeof Element !== 'undefined' && !Element.prototype.animate) {
	Element.prototype.animate = () =>
		({
			cancel() {},
			finish() {},
			pause() {},
			play() {},
			reverse() {},
			persist() {},
			commitStyles() {},
			onfinish: null,
			oncancel: null,
			finished: Promise.resolve(),
			currentTime: 0,
			playState: 'finished',
		}) as unknown as Animation;
}
