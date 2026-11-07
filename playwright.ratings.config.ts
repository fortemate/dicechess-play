import { defineConfig } from '@playwright/test';

// Deterministic built-bundle acceptance: every API response is synthetic and intercepted.
// Build first with VITE_PLAY_API_URL=https://ratings-staging.invalid.
export default defineConfig({
	testDir: 'e2e/acceptance',
	testMatch: 'ratings.acceptance.spec.ts',
	outputDir: 'test-results/ratings',
	retries: 0,
	timeout: 30_000,
	forbidOnly: !!process.env.CI,
	reporter: [['list']],
	use: {
		baseURL: 'http://localhost:4175',
		browserName: 'chromium',
		serviceWorkers: 'block',
		trace: 'retain-on-failure',
	},
	projects: [
		{ name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
		{
			name: 'mobile',
			use: { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true },
		},
	],
	webServer: {
		command: 'npm run preview -- --port 4175 --strictPort',
		url: 'http://localhost:4175',
		reuseExistingServer: false,
		timeout: 60_000,
	},
});
