/** Creates and owns disposable local processes/databases; no existing service is stopped or reused. */
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import assert from 'node:assert/strict';
const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
export const APP_ORIGIN = 'http://127.0.0.1:4175';
export const API_ORIGIN = 'http://127.0.0.1:8081';
export const CLASSIC_ORIGIN = 'http://127.0.0.1:8082';
export async function until(predicate, label, attempts = 100) {
	for (let index = 0; index < attempts; index++) {
		if (await predicate()) return;
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error(`Acceptance timed out: ${label}`);
}
export class AcceptanceEnvironment {
	constructor() {
		this.wsl =
			process.platform === 'win32'
				? ['-d', process.env.LAB_ACCEPTANCE_WSL_DISTRO ?? 'Ubuntu', '--']
				: null;
		this.stage = process.env.LAB_ACCEPTANCE_STAGE_DIR;
		this.java = process.env.LAB_ACCEPTANCE_JAVA_HOME;
		assert.ok(
			this.stage && this.java,
			'Provide LAB_ACCEPTANCE_STAGE_DIR and LAB_ACCEPTANCE_JAVA_HOME (Linux paths under WSL).',
		);
		this.container = `dicechess-lab225-${process.pid}-${Date.now()}`;
		this.bridges = [];
		this.labSockets = new Set();
		this.children = [];
		this.started = false;
		this.owned = false;
	}
	async linux(command, args = [], options = {}) {
		return this.wsl
			? exec('wsl', [...this.wsl, command, ...args], options)
			: exec(command, args, options);
	}
	async docker(args, input) {
		if (input === undefined) return this.linux('docker', args, { maxBuffer: 16 * 1024 * 1024 });
		const prefix = this.wsl ? ['wsl', [...this.wsl, 'docker', ...args]] : ['docker', args];
		return new Promise((resolvePromise, reject) => {
			const child = spawn(...prefix, { stdio: ['pipe', 'pipe', 'pipe'] });
			let stdout = '';
			let stderr = '';
			child.stdout.on('data', (chunk) => (stdout += chunk));
			child.stderr.on('data', (chunk) => (stderr += chunk));
			child.on('error', reject);
			child.on('exit', (code) =>
				code === 0
					? resolvePromise({ stdout, stderr })
					: reject(
							new Error(
								`Disposable database command failed: ${stderr.split('\n')[0].replace(/"[^"]*"|'[^']*'/g, '<value>')}`,
							),
						),
			);
			child.stdin.end(input);
		});
	}
	async sql(database, sql) {
		assert.ok(['lab225_lab', 'lab225_classic', 'postgres'].includes(database));
		const { stdout } = await this.docker(
			[
				'exec',
				'-i',
				this.container,
				'psql',
				'-h',
				'127.0.0.1',
				'-X',
				'-v',
				'ON_ERROR_STOP=1',
				'-At',
				'-U',
				'postgres',
				'-d',
				database,
			],
			sql,
		);
		return stdout.trim();
	}
	async process(action, mode = 'laboratory', { join = 300, admission = true } = {}) {
		return this.linux(
			'bash',
			[
				this.script,
				action,
				this.stage,
				this.java,
				this.state,
				mode === 'classic' ? '18082' : '18081',
				'25433',
				APP_ORIGIN,
				mode,
				String(join),
				String(admission),
			],
			{ maxBuffer: 1024 * 1024 },
		);
	}
	async health(origin) {
		try {
			return (await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1000) })).ok;
		} catch {
			return false;
		}
	}
	async start(mode = 'laboratory', options) {
		const { join = 300, admission = true } = options ?? {};
		const args = [
			'bash',
			this.script,
			'serve',
			this.stage,
			this.java,
			this.state,
			mode === 'classic' ? '18082' : '18081',
			'25433',
			APP_ORIGIN,
			mode,
			String(join),
			String(admission),
		];
		const child = this.wsl
			? spawn('wsl', [...this.wsl, ...args], { stdio: 'ignore', windowsHide: true })
			: spawn(args[0], args.slice(1), { stdio: 'ignore' });
		this.children.push(child);
		await until(
			() => this.health(mode === 'classic' ? CLASSIC_ORIGIN : API_ORIGIN),
			`${mode} startup`,
			200,
		);
	}
	async restart(options = {}) {
		await this.process(options.crash ? 'crash' : 'stop');
		await this.start('laboratory', options);
	}
	async setup(outputDir) {
		await mkdir(outputDir, { recursive: true });
		if (this.wsl) {
			const networking = (await this.linux('wslinfo', ['--networking-mode'])).stdout.trim();
			assert.equal(networking, 'nat', 'Windows acceptance requires an isolated WSL NAT network');
		}
		// Refuse remote Docker overrides: even a disposable container belongs on this local host.
		await this.linux('sh', ['-c', 'test -z "${DOCKER_HOST:-}" && test -z "${DOCKER_CONTEXT:-}"']);
		const endpoint = (
			await this.docker(['context', 'inspect', '--format', '{{(index .Endpoints "docker").Host}}'])
		).stdout.trim();
		assert.ok(
			endpoint.startsWith('unix://'),
			'Acceptance requires a local Unix-socket Docker context',
		);
		for (const port of [4175, 8081, 8082, 18081, 18082, 25433]) {
			const busy = await new Promise((r) => {
				const socket = net.connect(port, '127.0.0.1');
				socket.once('connect', () => {
					socket.destroy();
					r(true);
				});
				socket.once('error', () => r(false));
			});
			assert.equal(busy, false, `Port ${port} is occupied; refusing to reuse an existing service.`);
		}
		this.state = (await this.linux('mktemp', ['-d', '/tmp/dicechess-lab225.XXXXXX'])).stdout.trim();
		this.script = this.wsl
			? (
					await this.linux('wslpath', ['-a', resolve(here, 'process.sh').replaceAll('\\', '/')])
				).stdout.trim()
			: resolve(here, 'process.sh');
		await this.docker([
			'run',
			'-d',
			'--rm',
			'--name',
			this.container,
			'--label',
			'fortemate.acceptance=lab225',
			'-e',
			'POSTGRES_HOST_AUTH_METHOD=trust',
			'-p',
			'127.0.0.1:25433:5432',
			'postgres:18-alpine',
		]);
		this.owned = true;
		await until(async () => {
			try {
				await this.docker([
					'exec',
					this.container,
					'pg_isready',
					'-h',
					'127.0.0.1',
					'-U',
					'postgres',
				]);
				return true;
			} catch {
				return false;
			}
		}, 'disposable PostgreSQL');
		await this.sql(
			'postgres',
			`CREATE ROLE lab225_lab LOGIN; CREATE ROLE lab225_classic LOGIN;
CREATE DATABASE lab225_lab OWNER lab225_lab; CREATE DATABASE lab225_classic OWNER lab225_classic;
REVOKE CONNECT ON DATABASE lab225_classic FROM PUBLIC; GRANT CONNECT ON DATABASE lab225_classic TO lab225_classic;
REVOKE CONNECT ON DATABASE lab225_lab FROM PUBLIC; GRANT CONNECT ON DATABASE lab225_lab TO lab225_lab;`,
		);
		// Owned loopback proxies allow deterministic socket drops without an API restart.
		for (const port of [8081, 8082]) {
			const server = net.createServer((socket) => {
				const upstream = net.connect(port + 10000, this.wsl ? '::1' : '127.0.0.1');
				if (port === 8081) this.labSockets.add(socket);
				socket.pipe(upstream);
				upstream.pipe(socket);
				socket.on('error', () => upstream.destroy());
				upstream.on('error', () => socket.destroy());
				socket.on('close', () => {
					upstream.destroy();
					this.labSockets.delete(socket);
				});
				upstream.on('close', () => socket.destroy());
			});
			await new Promise((res, rej) => {
				server.once('error', rej);
				server.listen(port, '127.0.0.1', res);
			});
			this.bridges.push(server);
		}
		await this.start('classic');
		await this.start();
		const root = resolve(here, '../..');
		const preview = spawn(
			process.execPath,
			[
				resolve(root, 'node_modules/vite/bin/vite.js'),
				'preview',
				'--config',
				'vite.laboratory.config.ts',
				'--host',
				'127.0.0.1',
				'--port',
				'4175',
				'--strictPort',
			],
			{ cwd: root, env: { ...process.env, VITE_LAB_API_URL: API_ORIGIN }, stdio: 'ignore' },
		);
		this.children.push(preview);
		await until(() => this.healthApp(), 'built client startup');
		this.started = true;
	}
	async healthApp() {
		try {
			return (await fetch(APP_ORIGIN)).ok;
		} catch {
			return false;
		}
	}
	dropConnections() {
		for (const socket of this.labSockets) socket.destroy();
	}
	async cleanup() {
		for (const child of this.children) child.kill();
		if (this.state && this.script)
			for (const mode of ['laboratory', 'classic'])
				await this.process('stop', mode).catch(() => {});
		for (const bridge of this.bridges) bridge.close();
		if (this.owned) await this.docker(['stop', this.container]).catch(() => {});
	}
}
