/** Rehearse the reviewed pilot locally. Never installs trust or calls public lab infrastructure. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { PilotEnvironment, ROOT, artifactDigest } from './environment.mjs';
import { SERVER_REVISION, IMAGES, APP_ORIGIN, API_ORIGIN } from './configuration.mjs';
import { runBrowserAcceptance } from '../laboratory-acceptance/browser.mjs';
import { verifyTranscript } from '../laboratory-acceptance/oracle.mjs';
import { qualification } from '../laboratory-acceptance/lifecycle.mjs';

const exec = promisify(execFile);
const output = resolve(ROOT, 'test-results/laboratory-pilot', `run-${Date.now()}`);
const env = new PilotEnvironment();
const findings = [];
const startedAtUtc = new Date().toISOString();
let browser;
let result;
const removeHandlers = qualification.install(process, () => {
	void browser?.close().catch(() => {});
});
const pass = (scenario) => {
	qualification.throwIfStopped();
	findings.push({ scenario, status: 'PASS' });
	process.stdout.write(`PASS ${scenario}\n`);
};
const gameRequest = () => ({
	white: randomUUID(),
	black: randomUUID(),
	timeControl: { Unlimited: {} },
	variant: { id: 'choice-2x2d6', revision: 1 },
	labProtocolVersion: 1,
	rated: false,
});
async function state(id) {
	assert.match(id, /^[0-9a-f-]{36}$/);
	return (await env.request(`/games/${id}`)).json();
}
async function incompleteFixture() {
	await env.restart({ admission: true, join: 2 });
	const response = await env.request('/games', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: gameRequest(),
	});
	assert.equal(response.status, 201);
	const room = response.json();
	const context = await browser.newContext({ ignoreHTTPSErrors: true });
	try {
		const page = await context.newPage();
		await page.goto(APP_ORIGIN);
		await page.evaluate(
			async ({ room, api }) => {
				await new Promise((done, reject) => {
					const url = new URL(`/games/${room.gameId}/ws`, api);
					url.protocol = 'wss:';
					const socket = new WebSocket(url);
					const timer = setTimeout(() => {
						socket.close();
						reject(new Error('Incomplete fixture timed out'));
					}, 12000);
					socket.onopen = () =>
						socket.send(
							JSON.stringify({
								LabAuthenticate: {
									token: room.tokens.find((t) => t.seat === 'White').token,
									guest: crypto.randomUUID(),
								},
							}),
						);
					socket.onmessage = (message) => {
						const event = JSON.parse(message.data);
						if (event.LabAuthenticated)
							socket.send(JSON.stringify({ SubmitSeed: { seed: 'pilot-incomplete-white' } }));
						if (event.GameEnded) {
							clearTimeout(timer);
							socket.close();
							done();
						}
					};
				});
			},
			{ room, api: API_ORIGIN },
		);
	} finally {
		await context.close();
	}
	const record = (await env.request(`/games/${room.gameId}/transcript`)).json();
	assert.equal(record.completeness, 'incomplete');
	assert.equal(record.fairness, null);
	await env.restart({ admission: true });
	return room;
}

try {
	await mkdir(output, { recursive: true });
	await exec(
		process.execPath,
		[
			resolve(ROOT, 'node_modules/vite/bin/vite.js'),
			'build',
			'--config',
			'vite.laboratory.config.ts',
		],
		{
			cwd: ROOT,
			env: { ...process.env, VITE_LAB_API_URL: API_ORIGIN },
			maxBuffer: 8 * 1024 * 1024,
		},
	);
	await exec(process.execPath, [resolve(ROOT, 'scripts/verify-laboratory-bundle.mjs')], {
		cwd: ROOT,
		maxBuffer: 8 * 1024 * 1024,
	});
	pass('standalone-build-and-module-boundary');
	await env.setup();
	pass('closed-loopback-compose-startup');
	const imageRevision = (
		await env.docker([
			'image',
			'inspect',
			IMAGES.api,
			'--format',
			'{{index .Config.Labels "org.opencontainers.image.revision"}}',
		])
	).stdout.trim();
	assert.equal(imageRevision, SERVER_REVISION);
	const health = (await env.request('/health')).json();
	assert.equal(health.rulesVersion, '0.18.2');
	await assert.rejects(() => env.request('/health', { trusted: false }), /TLS request failed/);
	for (const route of [
		'/',
		'/invite/00000000-0000-0000-0000-000000000000',
		'/game/00000000-0000-0000-0000-000000000000',
	]) {
		const response = await env.request(route, { origin: APP_ORIGIN });
		assert.equal(response.status, 200);
		assert.equal(response.headers['referrer-policy'], 'no-referrer');
		assert.match(response.headers['x-robots-tag'], /noindex/);
	}
	assert.equal((await env.request('/assets/missing-file.js', { origin: APP_ORIGIN })).status, 404);
	pass('tls-trust-origin-deep-links-and-security-headers');
	const closed = await env.request('/games', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: gameRequest(),
	});
	assert.ok([400, 503].includes(closed.status));
	assert.equal(await env.sql('SELECT count(*) FROM laboratory.games'), '0');
	const allowed = await env.request('/health', { headers: { Origin: APP_ORIGIN } });
	assert.equal(allowed.headers['access-control-allow-origin'], APP_ORIGIN);
	const denied = await env.request('/health', {
		headers: { Origin: 'https://unapproved.example' },
	});
	assert.equal(denied.headers['access-control-allow-origin'], undefined);
	assert.equal(denied.status, 403);
	for (const route of [
		'/lobby/seeks',
		'/leaderboard',
		'/bots',
		'/ingest/games',
		'/training',
		'/me',
	])
		assert.equal((await env.request(route)).status, 404);
	assert.equal(
		await env.sql(
			"SELECT has_database_privilege('laboratory_app','postgres','CONNECT')",
			'postgres',
		),
		'f',
	);
	assert.equal(await env.sql("SELECT count(*) FROM pg_tables WHERE schemaname='play'"), '0');
	pass('closed-admission-exact-cors-routes-and-database-role');
	const containers = JSON.parse(
		(await env.docker(['inspect', ...(await env.compose(['ps', '-q'])).stdout.trim().split(/\s+/)]))
			.stdout,
	);
	for (const container of containers) {
		assert.equal(container.HostConfig.ReadonlyRootfs, true);
		assert.ok(['10001:10001', '70:70'].includes(container.Config.User));
		assert.ok(container.HostConfig.SecurityOpt.includes('no-new-privileges:true'));
		for (const binding of Object.values(container.HostConfig.PortBindings ?? {}).flat())
			assert.equal(binding.HostIp, '127.0.0.1');
		for (const network of Object.keys(container.NetworkSettings.Networks))
			assert.equal(
				(
					await env.docker(['network', 'inspect', network, '--format', '{{.Internal}}'])
				).stdout.trim(),
				network.endsWith('_ingress') ? 'false' : 'true',
			);
	}
	pass('runtime-nonroot-readonly-internal-networks');
	browser = await chromium.launch({ headless: true });
	const incompleteRoom = await incompleteFixture();
	assert.equal((await env.request(`/games/${incompleteRoom.gameId}/ws?token=invalid`)).status, 400);
	pass('wss-missing-participant-and-url-auth-refusal');
	// Only these disposable contexts bypass the generated leaf's trust error. Node requests above
	// independently verify the certificate and hostname, and reject it without the explicit CA.
	const browserEvidence = await runBrowserAcceptance({
		browser: {
			newContext: (options) => browser.newContext({ ...options, ignoreHTTPSErrors: true }),
		},
		appOrigin: APP_ORIGIN,
		apiOrigin: API_ORIGIN,
		incompleteRoom,
		outputDir: output,
		disconnect: () => env.compose(['stop', '--timeout', '20', 'api']),
		restart: async (id) => {
			const saved = JSON.parse(
				await env.sql(`SELECT snapshot FROM laboratory.games WHERE game_id='${id}'::uuid`),
			);
			const waiting = saved.lab.turn.phase === 'AwaitingPlayers';
			await env.restart({ admission: !waiting });
			if (waiting) {
				assert.ok(
					[400, 503].includes(
						(
							await env.request('/games', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: gameRequest(),
							})
						).status,
					),
				);
			}
			const restored = await state(id);
			const bank = { white: saved.remainingMs.White, black: saved.remainingMs.Black };
			for (const side of ['white', 'black']) {
				assert.ok(restored.clocks[side] <= bank[side]);
				assert.ok(
					restored.clocks[side] >= bank[side] - 10_000,
					'Recovery must start from committed clock bank',
				);
			}
			return {
				savedClocks: bank,
				restoredClocks: restored.clocks,
				sampledAt: performance.now(),
				activeSeat: restored.activeSeat,
			};
		},
	});
	findings.push(...browserEvidence.findings);
	assert.ok(
		findings.every((finding) => finding.status === 'PASS'),
		'HTTPS browser rehearsal failed; see redacted findings',
	);
	assert.equal(verifyTranscript(browserEvidence.terminalRecord).status, 'verified');
	pass('independent-export-verification');
	pass('existing-invitation-survives-closed-room-admission');
	await env.restart({ admission: false });
	const count = await env.sql('SELECT count(*) FROM laboratory.games');
	assert.ok(
		[400, 503].includes(
			(
				await env.request('/games', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: gameRequest(),
				})
			).status,
		),
	);
	const exports = await env.sql(
		"SELECT jsonb_build_object('exportSchemaVersion',1,'gameId',t.game_id,'transcript',t.payload)::text FROM laboratory.transcripts t JOIN laboratory.games g USING(game_id) WHERE g.expires_at > clock_timestamp() ORDER BY t.game_id",
	);
	const records = exports.split('\n').map((line) => JSON.parse(line));
	assert.ok(records.some((record) => verifyTranscript(record.transcript).status === 'verified'));
	for (const record of records)
		assert.doesNotMatch(
			JSON.stringify(record),
			/"(?:seatTokens|generatedOffers|frozenClientSeeds|receipts)"/,
		);
	await writeFile(resolve(output, 'public-records.jsonl'), exports + '\n');
	await env.rehearseBackup();
	pass('restricted-backup-and-new-database-restore');
	const capabilities = JSON.parse(
		await env.sql(
			"SELECT coalesce(jsonb_agg(snapshot->'seatTokens'),'[]'::jsonb) FROM laboratory.games",
		),
	);
	const logs = await env.compose(['logs', '--no-color']);
	for (const tokens of capabilities)
		for (const token of Object.values(tokens)) {
			assert.equal(
				(logs.stdout + logs.stderr).includes(token),
				false,
				'Seat capabilities must be absent from container logs',
			);
			assert.equal(
				exports.includes(token),
				false,
				'Seat capabilities must be absent from public exports',
			);
		}
	pass('seat-capabilities-absent-from-logs-and-exports');
	await env.downPreservingData();
	await env.compose(['up', '-d', '--wait', '--wait-timeout', '180']);
	assert.equal(await env.sql('SELECT count(*) FROM laboratory.games'), count);
	const after = await env.sql(
		"SELECT jsonb_build_object('exportSchemaVersion',1,'gameId',t.game_id,'transcript',t.payload)::text FROM laboratory.transcripts t JOIN laboratory.games g USING(game_id) WHERE g.expires_at > clock_timestamp() ORDER BY t.game_id",
	);
	assert.equal(after, exports);
	pass('closed-admission-export-and-preserved-volume-recovery');
	result = {
		schemaVersion: 1,
		status: 'PASS',
		publicDeployment: false,
		clientSourceRevision: (await exec('git', ['rev-parse', 'HEAD'], { cwd: ROOT })).stdout.trim(),
		clientArtifactSha256: await artifactDigest(resolve(ROOT, 'dist-laboratory')),
		serverRevision: SERVER_REVISION,
		images: IMAGES,
		rulesVersion: health.rulesVersion,
		postgres: await env.sql('SHOW server_version'),
		databaseMigrations: JSON.parse(
			await env.sql(
				"SELECT json_agg(json_build_object('version',version,'script',script,'checksum',checksum) ORDER BY installed_rank) FROM laboratory.flyway_schema_history WHERE success AND version IS NOT NULL",
			),
		),
		chromium: browser.version(),
		scenarios: findings,
	};
} catch (error) {
	result = {
		schemaVersion: 1,
		status: qualification.stopped ? 'INTERRUPTED' : 'FAIL',
		failure: String(error.message)
			.replace(/https?:\/\/[^\s)]+/g, '[url]')
			.replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
			.slice(0, 300),
		scenarios: findings,
	};
	process.exitCode = qualification.exitCode ?? 1;
} finally {
	try {
		await qualification.shutdown(async () => {
			try {
				await browser?.close();
			} finally {
				await env.cleanup();
			}
		});
		result.cleanup = 'PASS';
	} catch {
		result.status = 'FAIL';
		result.cleanup = 'FAIL';
		process.exitCode = 1;
	}
	removeHandlers();
	result.startedAtUtc = startedAtUtc;
	result.completedAtUtc = new Date().toISOString();
	if (qualification.stopped) {
		result.status = 'INTERRUPTED';
		process.exitCode = qualification.exitCode;
	}
	await writeFile(resolve(output, 'results.json'), JSON.stringify(result, null, 2) + '\n');
	process.stdout.write(
		`Pilot rehearsal ${result.status}; report: ${resolve(output, 'results.json')}\n`,
	);
}
