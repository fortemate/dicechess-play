/** Opt-in Linux signal integration: interrupt real setup, then prove its owned database is gone. */
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { until } from './environment.mjs';

assert.notEqual(
	process.platform,
	'win32',
	'Run this signal check in Linux/WSL; Windows does not deliver POSIX signals',
);
const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'lab225-interruptions-'));
for (const [signal, expectedCode] of [
	['SIGINT', 130],
	['SIGTERM', 143],
]) {
	const child = spawn(process.execPath, [join(here, 'run.mjs')], {
		cwd: join(here, '../..'),
		env: { ...process.env, LAB_ACCEPTANCE_OUTPUT: join(output, signal) },
		stdio: 'ignore',
	});
	const exited = new Promise((resolve, reject) => {
		child.once('error', reject);
		child.once('exit', (code, exitSignal) => resolve({ code, exitSignal }));
	});
	const containers = async () =>
		(
			await exec('docker', [
				'ps',
				'-a',
				'--filter',
				'label=fortemate.acceptance=lab225',
				'--filter',
				`name=dicechess-lab225-${child.pid}-`,
				'--format',
				'{{.Names}}',
			])
		).stdout.trim();
	try {
		await until(
			async () => (await containers()).length > 0,
			'owned container creation before interruption',
			200,
		);
		child.kill(signal);
		const result = await Promise.race([
			exited,
			new Promise((_, reject) => {
				const timer = setTimeout(
					() => reject(new Error('Interrupted runner did not await cleanup and exit')),
					45000,
				);
				timer.unref();
			}),
		]);
		assert.deepEqual(result, { code: expectedCode, exitSignal: null });
		assert.equal(await containers(), '', 'Interrupted run left its database container behind');
		const [run] = await readdir(join(output, signal));
		const record = JSON.parse(
			await readFile(join(output, signal, run, 'acceptance-results.json'), 'utf8'),
		);
		assert.equal(record.status, 'INTERRUPTED');
		assert.ok(record.scenarios.every((item) => item.status === 'PASS'));
		process.stdout.write(
			`PASS ${signal}: interrupted status, exit ${expectedCode}, owned container removed\n`,
		);
	} finally {
		// A failed check still requests cooperative termination; never stop unrelated containers.
		if (child.exitCode === null) {
			child.kill('SIGTERM');
			await exited;
		}
	}
}
