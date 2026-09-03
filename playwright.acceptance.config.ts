import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e/acceptance',
	retries: 0,
	timeout: 60_000,
	workers: 1,
	fullyParallel: false,
	reporter: [['list']],
	use: {
		baseURL: 'http://127.0.0.1:4174',
		trace: 'retain-on-failure',
	},
	projects: [
		{
			name: 'desktop',
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1280, height: 800 },
			},
		},
		{
			name: 'mobile',
			use: {
				viewport: { width: 375, height: 667 },
				isMobile: true,
				hasTouch: true,
			},
		},
	],
});
