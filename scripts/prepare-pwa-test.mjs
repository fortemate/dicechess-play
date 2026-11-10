// Build two real revisions for the same-origin service-worker upgrade smoke test.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve('.pwa-test');
rmSync(root, { recursive: true, force: true });
mkdirSync(root);
for (const revision of ['a', 'b']) {
	const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
		stdio: 'inherit',
		// These browser checks and their failure traces contain only local practice data.
		env: { ...process.env, VITE_PLAY_API_URL: '', SENTRY_AUTH_TOKEN: '', VITE_SENTRY_DSN: '' },
	});
	if (result.status !== 0) process.exit(result.status ?? 1);
	const verified = spawnSync(process.execPath, ['scripts/verify-bundle.mjs'], { stdio: 'inherit' });
	if (verified.status !== 0) process.exit(verified.status ?? 1);
	cpSync('dist', resolve(root, revision), { recursive: true });
}
