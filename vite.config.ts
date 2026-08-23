/// <reference types="vitest/config" />
import { sentrySvelteKit } from '@sentry/sveltekit';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
	// Compiles Sentry's performance-tracing code out of the bundle: it is 20.5 kB gzip on the
	// critical path (measured) for data this site does not act on yet — errors are what the
	// integration is for. Deleting this line is all it takes to turn tracing back on, plus a
	// `tracesSampleRate` in hooks.client.ts.
	define: { __SENTRY_TRACING__: 'false' },
	plugins: [
		// Must be registered before sveltekit(). Everything it does is gated on an auth token:
		// without SENTRY_AUTH_TOKEN it adds no source-map generation and no upload step, so
		// `npm run dev`, CI and fork PR builds produce exactly the bundle they did before.
		sentrySvelteKit({
			autoUploadSourceMaps: Boolean(process.env.SENTRY_AUTH_TOKEN),
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
