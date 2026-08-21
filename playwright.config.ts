import { defineConfig, devices } from '@playwright/test';

// End-to-end smoke tests, deliberately pointed at `vite preview` — the BUILT `dist/`, minified
// exactly as it deploys. That is the whole point: vitest imports the Scala.js engine straight from
// node_modules and never bundles it, so a bundler that miscompiles the engine passes every other
// gate (see #185, and `scripts/verify-bundle.mjs` for the narrower engine-only guard).
//
// `npm run build` must have run first — the web server here only serves dist/, it does not build.
//
// Set SMOKE_BASE_URL to run the same suite against an already-deployed site instead — a PR preview
// or production — which is how you confirm a deploy is playable without clicking through it:
//   SMOKE_BASE_URL=https://<branch>.dicechess-play.pages.dev npm run test:e2e
const PORT = 4173;
// Normalised to undefined when blank: an empty SMOKE_BASE_URL would otherwise be taken as a remote
// target, skipping the preview server while leaving baseURL empty — every navigation then fails.
const REMOTE_TARGET = process.env.SMOKE_BASE_URL?.trim() || undefined;

export default defineConfig({
	testDir: 'e2e',
	// A red smoke means the shipped bundle cannot play a game; never let a retry paper over that.
	// Flakiness here is a bug in the test, to be fixed rather than absorbed.
	retries: 0,
	// Comfortably above the spec's own 60s hunt for a movable piece — the default 30s cut that
	// budget short, which looked like a failing site when it was only a slow (remote) target.
	timeout: 120_000,
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI ? [['github'], ['list']] : [['list']],
	use: {
		baseURL: REMOTE_TARGET ?? `http://localhost:${PORT}`,
		trace: 'retain-on-failure',
	},
	// Chromium alone: this suite guards the build pipeline, not browser compatibility.
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	// Serve dist/ ourselves only when testing locally; a remote target is already served.
	webServer: REMOTE_TARGET
		? undefined
		: {
				command: `npm run preview -- --port ${PORT} --strictPort`,
				url: `http://localhost:${PORT}`,
				reuseExistingServer: !process.env.CI,
				timeout: 60_000,
			},
});
