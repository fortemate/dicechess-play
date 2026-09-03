import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { WebhookFixture } from './webhookFixture.ts';
import { DbAssertions } from './dbAssertions.ts';

export interface AcceptanceEnvConfig {
	pgPort?: number;
	pgContainer?: string;
	apiPort?: number;
	clientPort?: number;
	fixturePort?: number;
}

export class AcceptanceEnvManager {
	readonly pgPort: number;
	readonly pgContainer: string;
	readonly apiPort: number;
	readonly clientPort: number;
	readonly fixturePort: number;

	readonly fixture: WebhookFixture;
	readonly db: DbAssertions;

	private apiProcess: ChildProcess | null = null;
	private previewProcess: ChildProcess | null = null;

	constructor(config?: AcceptanceEnvConfig) {
		this.pgPort = config?.pgPort || 54329;
		this.pgContainer = config?.pgContainer || 'dicechess-acceptance-postgres';
		this.apiPort = config?.apiPort || 8088;
		this.clientPort = config?.clientPort || 4174;
		this.fixturePort = config?.fixturePort || 8089;

		this.fixture = new WebhookFixture(undefined, this.fixturePort);
		this.db = new DbAssertions({
			containerName: this.pgContainer,
			user: 'play',
			db: 'test',
		});
	}

	async setup(): Promise<void> {
		console.log('[AcceptanceEnv] Setting up isolated acceptance environment...');

		// 1. Build client bundle FIRST before starting background services
		console.log(`[AcceptanceEnv] Building client bundle pointing to port ${this.apiPort}...`);
		execSync(`VITE_PLAY_API_URL=http://127.0.0.1:${this.apiPort} npm run build`, {
			cwd: '/Users/jegors/Fortemate/dicechess-play',
			stdio: 'inherit',
		});

		// 2. Ensure Postgres container is running
		await this.ensurePostgres();
		this.cleanDatabase();

		// 3. Start Webhook Fixture
		console.log(`[AcceptanceEnv] Starting Webhook Fixture on port ${this.fixturePort}...`);
		await this.fixture.start();

		// 4. Start Play API (Flyway runs on boot)
		await this.startApi();

		// 5. Seed featured bot
		console.log('[AcceptanceEnv] Seeding featured bot rpi3/hunter-book...');
		this.db.seedFeaturedBot(
			'rpi3',
			'hunter-book',
			'test-hunter-token',
			3,
			this.fixture.getUrl(),
			this.fixture.getSecret(),
		);

		// 6. Restart Play API so boot reconciliation discovers the seeded bot and probes its webhook
		console.log('[AcceptanceEnv] Restarting Play API with seeded database...');
		await this.restartApi();

		// 7. Wait for showcase table to open
		console.log('[AcceptanceEnv] Waiting for showcase table to open...');
		let tableOpen = false;
		for (let i = 0; i < 30; i++) {
			try {
				const res = await fetch(`http://127.0.0.1:${this.apiPort}/showcase`);
				if (res.ok) {
					const json = (await res.json()) as any;
					if (json.status === 'open') {
						tableOpen = true;
						break;
					}
				}
			} catch {}
			await new Promise((r) => setTimeout(r, 400));
		}
		if (!tableOpen) throw new Error('Showcase table did not transition to open state');

		// 8. Start built client preview
		await this.startPreview();

		console.log('[AcceptanceEnv] All services healthy and ready!');
	}

	async ensurePostgres(): Promise<void> {
		try {
			const status = execSync(`docker inspect -f '{{.State.Running}}' ${this.pgContainer} 2>/dev/null`, {
				encoding: 'utf8',
			}).trim();
			if (status === 'true') {
				console.log(`[AcceptanceEnv] Postgres container ${this.pgContainer} is already running.`);
				return;
			}
		} catch {
			// not running
		}

		console.log(`[AcceptanceEnv] Launching Postgres container ${this.pgContainer} on port ${this.pgPort}...`);
		execSync(`docker rm -f ${this.pgContainer} 2>/dev/null || true`, { stdio: 'ignore' });
		execSync(
			`docker run --name ${this.pgContainer} -d -e POSTGRES_PASSWORD=testpassword -e POSTGRES_USER=play -e POSTGRES_DB=test -p ${this.pgPort}:5432 postgres:18-alpine`,
			{ stdio: 'ignore' },
		);

		// Wait for postgres ready
		let ready = false;
		for (let i = 0; i < 30; i++) {
			try {
				execSync(
					`docker exec ${this.pgContainer} psql -U play -d test -c "SELECT 1;" 2>/dev/null`,
					{ stdio: 'ignore' },
				);
				ready = true;
				break;
			} catch {
				await new Promise((r) => setTimeout(r, 500));
			}
		}
		if (!ready) throw new Error('Postgres container did not become ready in time');
	}

	async stopPostgres(): Promise<void> {
		console.log('[AcceptanceEnv] Stopping Postgres container...');
		execSync(`docker stop ${this.pgContainer}`, { stdio: 'ignore' });
	}

	async startPostgres(): Promise<void> {
		console.log('[AcceptanceEnv] Starting Postgres container...');
		try {
			execSync(`docker start ${this.pgContainer}`, { stdio: 'ignore' });
		} catch {
			await this.ensurePostgres();
		}
		let ready = false;
		for (let i = 0; i < 30; i++) {
			try {
				execSync(
					`docker exec ${this.pgContainer} psql -U play -d test -c "SELECT 1;" 2>/dev/null`,
					{ stdio: 'ignore' },
				);
				ready = true;
				break;
			} catch {
				await new Promise((r) => setTimeout(r, 400));
			}
		}
		if (!ready) throw new Error('Postgres container did not resume in time');
	}

	cleanDatabase(): void {
		console.log('[AcceptanceEnv] Resetting test database schema...');
		try {
			execSync(
				`docker exec ${this.pgContainer} psql -U play -d test -c "DROP SCHEMA IF EXISTS play CASCADE;"`,
				{ stdio: 'ignore' },
			);
		} catch {}
	}

	async startApi(): Promise<void> {
		console.log(`[AcceptanceEnv] Starting Play API on port ${this.apiPort}...`);
		const apiBinary =
			'/Users/jegors/Fortemate/dicechess-play-api/target/out/jvm/scala-3.9.0/dicechess-play-api/universal/stage/bin/dicechess-play-api';

		const env = {
			...process.env,
			PORT: String(this.apiPort),
			PLAY_DB_URL: `jdbc:postgresql://localhost:${this.pgPort}/test`,
			PLAY_DB_USER: 'play',
			PLAY_DB_PASSWORD: 'testpassword',
			SHOWCASE_ENABLED: 'true',
			SHOWCASE_BOT_TEAM: 'rpi3',
			SHOWCASE_BOT_NAME: 'hunter-book',
			SHOWCASE_RESERVED_SEATS: '1',
			SHOWCASE_TICK_SECONDS: '2',
			SHOWCASE_PROBE_TIMEOUT_SECONDS: '4',
			WEBHOOK_TIMEOUT_SECONDS: '4',
			WEBHOOK_ALLOW_LOOPBACK: 'true',
			PLAY_BOT_TOKENS: 'rpi3|hunter-book|test-hunter-token',
			PLAY_CORS_ORIGINS: `http://localhost:${this.clientPort},http://127.0.0.1:${this.clientPort}`,
		};

		this.apiProcess = spawn(apiBinary, [], {
			cwd: '/Users/jegors/Fortemate/dicechess-play-api',
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		this.apiProcess.stdout?.on('data', (d) => {
			const line = d.toString();
			if (line.includes('[play]') || line.includes('ALERT') || line.includes('bound to address')) {
				process.stdout.write(`[API STDOUT] ${line}`);
			}
		});

		this.apiProcess.stderr?.on('data', (d) => {
			const line = d.toString();
			if (!line.includes('Unsafe') && !line.includes('deprecated')) {
				process.stderr.write(`[API STDERR] ${line}`);
			}
		});

		// Wait for /health
		let ready = false;
		for (let i = 0; i < 40; i++) {
			try {
				const res = await fetch(`http://127.0.0.1:${this.apiPort}/health`);
				if (res.ok) {
					ready = true;
					break;
				}
			} catch {
				await new Promise((r) => setTimeout(r, 500));
			}
		}
		if (!ready) throw new Error('Play API did not become healthy in time');
		console.log('[AcceptanceEnv] Play API healthy!');
	}

	async stopApi(): Promise<void> {
		if (this.apiProcess) {
			console.log('[AcceptanceEnv] Stopping Play API...');
			const proc = this.apiProcess;
			this.apiProcess = null;
			await new Promise<void>((resolve) => {
				proc.on('exit', () => resolve());
				proc.kill('SIGKILL');
				setTimeout(resolve, 2000);
			});
			await new Promise((r) => setTimeout(r, 600));
		}
	}

	async restartApi(): Promise<void> {
		console.log('[AcceptanceEnv] Restarting Play API...');
		await this.stopApi();
		await this.startApi();
	}

	async startPreview(): Promise<void> {
		await this.stopPreview();
		console.log(`[AcceptanceEnv] Starting client preview on port ${this.clientPort}...`);
		this.previewProcess = spawn(
			'npx',
			['vite', 'preview', '--host', '127.0.0.1', '--port', String(this.clientPort), '--strictPort'],
			{
				cwd: '/Users/jegors/Fortemate/dicechess-play',
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);

		this.previewProcess.stdout?.on('data', (d) => {
			const line = d.toString().trim();
			if (line.includes('Local:')) {
				console.log(`[Preview STDOUT] ${line}`);
			}
		});

		this.previewProcess.stderr?.on('data', (d) => {
			console.error(`[Preview STDERR] ${d.toString().trim()}`);
		});

		let ready = false;
		for (let i = 0; i < 30; i++) {
			try {
				const res = await fetch(`http://127.0.0.1:${this.clientPort}`);
				if (res.ok) {
					ready = true;
					break;
				}
			} catch {
				await new Promise((r) => setTimeout(r, 300));
			}
		}
		if (!ready) throw new Error('Preview server did not become ready in time');
		console.log('[AcceptanceEnv] Preview server ready!');
	}

	async stopPreview(): Promise<void> {
		if (this.previewProcess) {
			console.log('[AcceptanceEnv] Stopping preview server...');
			const proc = this.previewProcess;
			this.previewProcess = null;
			await new Promise<void>((resolve) => {
				proc.on('exit', () => resolve());
				proc.kill('SIGKILL');
				setTimeout(resolve, 2000);
			});
			await new Promise((r) => setTimeout(r, 500));
		}
		try {
			execSync(`lsof -ti :${this.clientPort} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
		} catch {}
	}

	async teardown(): Promise<void> {
		console.log('[AcceptanceEnv] Tearing down acceptance environment...');
		await this.stopPreview();
		await this.stopApi();
		await this.fixture.stop();
		try {
			execSync(`docker rm -f ${this.pgContainer} 2>/dev/null || true`, { stdio: 'ignore' });
		} catch {}
		console.log('[AcceptanceEnv] Teardown complete.');
	}
}
