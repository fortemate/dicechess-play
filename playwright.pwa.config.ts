import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e/pwa',
	workers: 1,
	retries: 0,
	timeout: 60_000,
	use: { baseURL: 'http://localhost:4176', serviceWorkers: 'allow', trace: 'off' },
	webServer: {
		command: 'node scripts/pwa-test-server.mjs',
		url: 'http://localhost:4176',
		reuseExistingServer: false,
	},
});
