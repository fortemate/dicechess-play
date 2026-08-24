/// <reference types="vitest/config" />
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

// Both halves of "Sentry is on". A token without a DSN would upload source maps for a bundle
// that contains no SDK and mint a release nothing can ever report against. Both are read from
// the PROCESS environment, which is where deploy.yaml puts them; Vite loads a local .env into
// import.meta.env rather than here, so a local build never uploads.
const sentryEnabled = Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.VITE_SENTRY_DSN);

// https://vite.dev/config/
export default defineConfig({
	// Compiles Sentry's performance-tracing code out of the bundle: it is 20.5 kB gzip on the
	// critical path (measured) for data this site does not act on yet — errors are what the
	// integration is for. Deleting this line is all it takes to turn tracing back on, plus a
	// `tracesSampleRate` in hooks.client.ts.
	define: { __SENTRY_TRACING__: 'false' },
	plugins: [
		// Must be registered before sveltekit(). Everything it does is gated on `sentryEnabled`:
		// without it the plugin adds no source-map generation and no upload step, so `npm run
		// dev`, CI and fork PR builds produce exactly the bundle they did before.
		sentrySvelteKit({
			autoUploadSourceMaps: sentryEnabled,
			org: 'fortemate',
			project: 'dicechess-play',
			// adapter-static is not one of the adapters the plugin knows (node | auto | vercel |
			// cloudflare), so tell it not to guess: 'other' points it at .svelte-kit/output, which is
			// where the client build and its maps live before the adapter copies them to dist/.
			adapter: 'other',
			sourcemaps: {
				// The plugin's own default only cleans .svelte-kit; by then the adapter has copied the
				// maps into dist/, and dist/ is what is uploaded to Cloudflare. Shipping them would be
				// harmless for AGPL source but is dead weight in every visitor's cache — Sentry keeps
				// the copy that matters.
				filesToDeleteAfterUpload: ['./.svelte-kit/output/**/*.map', './dist/**/*.map'],
			},
		}),
		// Compiles messages/*.json into src/lib/paraglide/ (generated, gitignored). Must run before
		// sveltekit() so the generated modules exist when SvelteKit resolves imports (i18n epic #8).
		//
		// NO `localStorage` in the strategy chain, deliberately. Paraglide's generated runtime calls
		// `localStorage.getItem(...)` bare, guarded only by `typeof window === 'undefined'` — so any
		// context where `window` exists but storage does not (privacy modes, sandboxed iframes, and
		// this repo's own vitest environment) throws on the FIRST message call, taking the whole page
		// with it. preferencesStore.svelte.ts already wraps its own storage access in try/catch for
		// exactly this reason; the Paraglide runtime does not. With a single locale the strategy buys
		// nothing anyway — every branch resolves to `en`. When a language switcher lands it will need
		// a persistence strategy, and that is the moment to solve the guarding properly.
		//
		// Deliberately NOT setting `isServer: 'import.meta.env.SSR'` (which the Paraglide docs
		// suggest for Vite): the bot engine runs in a Web Worker (playWithBot.worker.ts), where
		// import.meta.env.SSR is false while `window` is undefined — the runtime would then take a
		// browser-only branch. The default `typeof window === 'undefined'` is correct in a worker.
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['preferredLanguage', 'baseLocale'],
		}),
		sveltekit(),
		// Test-mode only: points Svelte imports at the client build so component
		// tests can mount (vitest otherwise resolves the SSR build and mount() throws).
		svelteTesting(),
		tailwindcss(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				id: 'dicechess-play',
				name: 'Dice Chess — Play',
				short_name: 'Dice Chess',
				description: 'Play Dice Chess against our bots',
				theme_color: '#020617',
				background_color: '#020617',
				display: 'standalone',
				// No orientation lock: the board is playable in portrait or landscape
				// (e.g. tablets), so pinning to portrait-primary only hurt those users.
				orientation: 'any',
				start_url: '/',
				scope: '/',
				categories: ['games', 'entertainment'],
				icons: [
					{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
					{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
					{ src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
					{ src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
				],
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3,wasm}'],
			},
		}),
	],
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.ts'],
		setupFiles: ['./vitest-setup.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json-summary'],
			exclude: [
				'**/*.test.ts',
				'eslint.config.js',
				'svelte.config.js',
				'vite.config.ts',
				'vitest-setup.ts',
				'dist/**',
				'.svelte-kit/**',
			],
		},
	},
});
