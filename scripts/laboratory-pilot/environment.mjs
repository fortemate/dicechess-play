/** Own one local Compose project; credentials live only in a disposable Linux directory. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import net from 'node:net';
import https from 'node:https';
import { qualification } from '../laboratory-acceptance/lifecycle.mjs';
import { API_ORIGIN, validateRehearsal } from './configuration.mjs';

const exec = promisify(execFile);
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export async function artifactDigest(directory) {
	const entries = [];
	async function visit(folder, prefix = '') {
		for (const item of (await readdir(folder, { withFileTypes: true })).sort((a, b) =>
			Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)),
		)) {
			const name = `${prefix}${item.name}`;
			if (item.isDirectory()) await visit(resolve(folder, item.name), `${name}/`);
			else {
				assert.ok(item.isFile(), 'Artifact must contain only regular files');
				entries.push(
					`${createHash('sha256')
						.update(await readFile(resolve(folder, item.name)))
						.digest('hex')}  ${name}\n`,
				);
			}
		}
	}
	await visit(directory);
	assert.ok(entries.length > 0);
	return createHash('sha256').update(entries.join('')).digest('hex');
}

export class PilotEnvironment {
	constructor() {
		this.project = `lab229-${randomBytes(8).toString('hex')}`;
		this.wsl =
			process.platform === 'win32'
				? ['-d', process.env.LAB_PILOT_WSL_DISTRO ?? 'Ubuntu', '--exec']
				: null;
		this.owned = false;
		this.cleaning = false;
	}
	async linux(command, args = [], options = {}) {
		if (!this.cleaning) qualification.throwIfStopped();
		try {
			const result = await (this.wsl
				? exec('wsl', [...this.wsl, command, ...args], {
						maxBuffer: 16 * 1024 * 1024,
						...options,
						shell: false,
					})
				: exec(command, args, { maxBuffer: 16 * 1024 * 1024, ...options, shell: false }));
			return result;
		} catch {
			if (qualification.stopped) qualification.throwIfStopped();
			// ChildProcess errors include full arguments, private paths and possibly response bodies.
			throw new Error(`Local ${command} operation failed; raw output withheld`);
		}
	}
	async docker(args) {
		return this.linux('docker', ['--host', 'unix:///var/run/docker.sock', ...args]);
	}
	async compose(args, { admission = false, join = 300 } = {}) {
		return this.linux('env', [
			'-i',
			'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
			'HOME=/tmp',
			`LAB_ADMISSION_OPEN=${admission}`,
			`LAB_JOIN_WINDOW_SECONDS=${join}`,
			'docker',
			'--host',
			'unix:///var/run/docker.sock',
			'compose',
			'--env-file',
			`${this.state}/operator.env`,
			'--project-name',
			this.project,
			'--file',
			`${this.ops}/compose.yaml`,
			...args,
		]);
	}
	async setup() {
		const literal = 'lab229 space ; $(printf altered) "quoted"';
		assert.equal(
			(await this.linux('printf', ['%s', literal])).stdout,
			literal,
			'Launcher must preserve arguments without shell expansion',
		);
		const localPath = async (path) =>
			this.wsl
				? (await this.linux('wslpath', ['-a', path.replaceAll('\\', '/')])).stdout.trim()
				: path;
		this.ops = await localPath(resolve(ROOT, 'ops/laboratory-pilot'));
		await this.linux('sh', [`${this.ops}/check-rehearsal-host.sh`]);
		assert.equal(
			(
				await this.linux('docker', [
					'context',
					'inspect',
					'--format',
					'{{(index .Endpoints "docker").Host}}',
				])
			).stdout.trim(),
			'unix:///var/run/docker.sock',
			'Only the local Docker socket is supported',
		);
		if (this.wsl)
			assert.equal((await this.linux('wslinfo', ['--networking-mode'])).stdout.trim(), 'nat');
		for (const port of [8443, 9443]) {
			const busy = await new Promise((done) => {
				const socket = net.connect(port, '127.0.0.1');
				socket.once('connect', () => {
					socket.destroy();
					done(true);
				});
				socket.once('error', () => done(false));
			});
			assert.equal(busy, false, 'A rehearsal port is occupied; refusing to reuse another service');
		}
		const artifact = await localPath(resolve(ROOT, 'dist-laboratory'));
		this.state = (
			await this.linux('mktemp', ['-d', '/tmp/dicechess-lab229.XXXXXXXX'])
		).stdout.trim();
		assert.match(this.state, /^\/tmp\/dicechess-lab229\.[A-Za-z0-9]+$/);
		await this.linux('sh', [`${this.ops}/prepare-rehearsal.sh`, this.state, artifact]);
		this.ca = (await this.linux('cat', [`${this.state}/tls.crt`])).stdout;
		validateRehearsal(
			JSON.parse((await this.compose(['config', '--format', 'json'])).stdout),
			this.project,
		);
		this.owned = true;
		await this.compose(['up', '-d', '--wait', '--wait-timeout', '180']);
	}
	async request(
		path,
		{ origin = API_ORIGIN, method = 'GET', headers = {}, body, trusted = true } = {},
	) {
		const url = new URL(path, origin);
		assert.ok(['https://localhost:8443', API_ORIGIN].includes(url.origin));
		return new Promise((done, reject) => {
			const request = https.request(
				url,
				{
					ca: trusted ? this.ca : undefined,
					method,
					headers,
					timeout: 10_000,
					family: 4,
				},
				(response) => {
					let text = '';
					response.setEncoding('utf8');
					response.on('data', (chunk) => {
						text += chunk;
					});
					response.on('end', () =>
						done({
							status: response.statusCode,
							headers: response.headers,
							text,
							json: () => JSON.parse(text),
						}),
					);
				},
			);
			request.on('error', (error) =>
				reject(new Error(`Local TLS request failed (${error.code ?? 'unknown'})`)),
			);
			request.on('timeout', () => request.destroy());
			request.end(body === undefined ? undefined : JSON.stringify(body));
		});
	}
	async sql(query, database = 'laboratory', role = 'postgres') {
		const id = (await this.compose(['ps', '-q', 'db'])).stdout.trim();
		assert.match(id, /^[a-f0-9]{64}$/);
		// Statements never contain passwords; only disposable fixture data and public IDs.
		return (
			await this.docker([
				'exec',
				id,
				'psql',
				'-X',
				'-v',
				'ON_ERROR_STOP=1',
				'-At',
				'-U',
				role,
				'-d',
				database,
				'-c',
				query,
			])
		).stdout.trim();
	}
	async restart(options = { admission: true }) {
		await this.compose(
			['up', '-d', '--force-recreate', '--no-deps', '--wait', '--wait-timeout', '150', 'api'],
			options,
		);
		assert.equal((await this.request('/health')).status, 200);
	}
	async rehearseBackup() {
		const id = (await this.compose(['ps', '-q', 'db'])).stdout.trim();
		assert.match(id, /^[a-f0-9]{64}$/);
		// The restricted dump never leaves the private temporary directory or enters output buffers.
		await this.linux('sh', [`${this.ops}/backup-rehearsal.sh`, id, this.state]);
		assert.equal(
			await this.sql('SELECT count(*) FROM laboratory.games', 'laboratory_restore'),
			await this.sql('SELECT count(*) FROM laboratory.games'),
		);
		assert.equal(
			await this.sql(
				"SELECT md5(string_agg(payload::text, '' ORDER BY game_id)) FROM laboratory.transcripts",
				'laboratory_restore',
			),
			await this.sql(
				"SELECT md5(string_agg(payload::text, '' ORDER BY game_id)) FROM laboratory.transcripts",
			),
		);
		await this.sql('DROP DATABASE laboratory_restore', 'postgres');
	}
	async downPreservingData() {
		await this.compose(['down', '--timeout', '20']);
		assert.equal(
			(
				await this.docker([
					'volume',
					'inspect',
					`${this.project}_laboratory-data`,
					'--format',
					'{{index .Labels "com.docker.compose.project"}}',
				])
			).stdout.trim(),
			this.project,
		);
	}
	async cleanup() {
		this.cleaning = true;
		if (this.owned) {
			await this.compose(['down', '--timeout', '20']);
			// This runner created the volume; never infer ownership merely from a user-provided name.
			const volume = `${this.project}_laboratory-data`;
			const existing = (
				await this.docker(['volume', 'ls', '--filter', `name=^${volume}$`, '--format', '{{.Name}}'])
			).stdout.trim();
			if (existing) {
				assert.equal(existing, volume);
				assert.equal(
					(
						await this.docker([
							'volume',
							'inspect',
							volume,
							'--format',
							'{{index .Labels "com.docker.compose.project"}}',
						])
					).stdout.trim(),
					this.project,
				);
				await this.docker(['volume', 'rm', volume]);
			}
			assert.equal(
				(
					await this.docker([
						'ps',
						'-aq',
						'--filter',
						`label=com.docker.compose.project=${this.project}`,
					])
				).stdout.trim(),
				'',
			);
		}
		if (this.state) {
			assert.match(this.state, /^\/tmp\/dicechess-lab229\.[A-Za-z0-9]+$/);
			await this.linux('rm', ['-rf', '--', this.state]);
		}
	}
}
