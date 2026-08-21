/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
	plugins: [
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
