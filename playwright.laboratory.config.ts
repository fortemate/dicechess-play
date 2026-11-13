/** Exercises only the standalone laboratory artifact, with all game transport supplied by fixtures. */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4175;
const LAB_API_ORIGIN = process.env.VITE_LAB_API_URL?.trim() || 'http://127.0.0.1:8081';

export default defineConfig({
	testDir: 'e2e/laboratory',
	retries: 0,
	timeout: 60_000,
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI ? [['github'], ['list']] : [['list']],
	use: {
		baseURL: `http://127.0.0.1:${PORT}`,
		trace: 'retain-on-failure',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: `npm run preview:laboratory`,
		url: `http://127.0.0.1:${PORT}`,
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
		env: { VITE_LAB_API_URL: LAB_API_ORIGIN },
	},
});
