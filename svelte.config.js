import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		// SPA mode: every unknown path falls back to index.html. Output to dist/.
		adapter: adapter({
			pages: 'dist',
			assets: 'dist',
			fallback: 'index.html',
		}),
		// Every push to main deploys, replacing the hash-named chunks a long-lived tab will
		// lazy-load on its next navigation. Polling version.json lets SvelteKit spot the new
		// deployment and turn that navigation into a full-page load instead of a broken dynamic
		// import (src/lib/staleBundleRecovery.ts covers the non-navigation imports).
		version: { pollInterval: 60_000 },
	},
};
