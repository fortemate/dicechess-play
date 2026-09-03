import http from 'node:http';
import crypto from 'node:crypto';

export interface WebhookLogEntry {
	timestamp: number;
	method: string;
	path: string;
	headers: Record<string, string | string[] | undefined>;
	bodyText: string;
	signatureValid: boolean;
	responseStatus: number;
	responseBody: string;
}

export type FixtureMode = 'healthy' | 'unavailable' | 'timeout' | 'malformed';

export class WebhookFixture {
	private server: http.Server | null = null;
	private logs: WebhookLogEntry[] = [];
	private mode: FixtureMode = 'healthy';
	private timeoutDelayMs = 8000;
	private readonly secret: string;
	private readonly port: number;

	constructor(secret: string = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', port: number = 8089) {
		this.secret = secret;
		this.port = port;
	}

	getSecret(): string {
		return this.secret;
	}

	getPort(): number {
		return this.port;
	}

	getUrl(): string {
		return `http://127.0.0.1:${this.port}/webhook`;
	}

	getLogs(): WebhookLogEntry[] {
		return [...this.logs];
	}

	clearLogs(): void {
		this.logs = [];
	}

	setMode(mode: FixtureMode, timeoutDelayMs: number = 8000): void {
		this.mode = mode;
		this.timeoutDelayMs = timeoutDelayMs;
	}

	getMode(): FixtureMode {
		return this.mode;
	}

	private verifyHmac(timestamp: string, rawBody: Buffer, signature: string): boolean {
		try {
			const hmac = crypto.createHmac('sha256', this.secret);
			hmac.update(`${timestamp}.`);
			hmac.update(rawBody);
			const expected = hmac.digest('hex');
			if (expected.length !== signature.length) return false;
			return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'));
		} catch {
			return false;
		}
	}

	private findFirstMovePath(node: any): string[] {
		if (!node || typeof node !== 'object') return [];
		const target = node.children ?? node;
		const keys = Object.keys(target);
		if (keys.length === 0) return [];
		keys.sort();
		const firstKey = keys[0];
		return [firstKey, ...this.findFirstMovePath(target[firstKey])];
	}

	async start(): Promise<void> {
		if (this.server) return;

		return new Promise((resolve, reject) => {
			this.server = http.createServer(async (req, res) => {
				const chunks: Buffer[] = [];
				req.on('data', (chunk) => chunks.push(chunk));
				req.on('end', async () => {
					const rawBody = Buffer.concat(chunks);
					const bodyText = rawBody.toString('utf8');

					// Control endpoints
					if (req.url === '/fixture/control/mode' && req.method === 'POST') {
						try {
							const json = JSON.parse(bodyText);
							if (json.mode) this.mode = json.mode;
							if (json.timeoutDelayMs) this.timeoutDelayMs = json.timeoutDelayMs;
							res.writeHead(200, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ ok: true, mode: this.mode }));
						} catch (e) {
							res.writeHead(400, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: String(e) }));
						}
						return;
					}

					if (req.url === '/fixture/control/logs' && req.method === 'GET') {
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ logs: this.logs }));
						return;
					}

					if (req.url === '/fixture/control/reset' && req.method === 'POST') {
						this.clearLogs();
						this.mode = 'healthy';
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ ok: true }));
						return;
					}

					if (req.url === '/fixture/health' && req.method === 'GET') {
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ status: 'ok', mode: this.mode }));
						return;
					}

					// Webhook endpoint
					const signatureHeader = req.headers['x-dicechess-signature'] as string | undefined;
					const timestampHeader = req.headers['x-dicechess-timestamp'] as string | undefined;
					const isValid =
						Boolean(signatureHeader) &&
						Boolean(timestampHeader) &&
						this.verifyHmac(timestampHeader!, rawBody, signatureHeader!);

					// Handle simulated failures
					if (this.mode === 'unavailable') {
						const responseBody = JSON.stringify({ error: 'bot_unavailable' });
						this.logs.push({
							timestamp: Date.now(),
							method: req.method || 'POST',
							path: req.url || '/',
							headers: req.headers,
							bodyText,
							signatureValid: isValid,
							responseStatus: 503,
							responseBody,
						});
						res.writeHead(503, { 'Content-Type': 'application/json' });
						res.end(responseBody);
						return;
					}

					if (this.mode === 'timeout') {
						await new Promise((r) => setTimeout(r, this.timeoutDelayMs));
						const responseBody = JSON.stringify({ moves: [] });
						this.logs.push({
							timestamp: Date.now(),
							method: req.method || 'POST',
							path: req.url || '/',
							headers: req.headers,
							bodyText,
							signatureValid: isValid,
							responseStatus: 200,
							responseBody,
						});
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(responseBody);
						return;
					}

					if (this.mode === 'malformed') {
						const responseBody = '{"not_valid_moves":true}';
						this.logs.push({
							timestamp: Date.now(),
							method: req.method || 'POST',
							path: req.url || '/',
							headers: req.headers,
							bodyText,
							signatureValid: isValid,
							responseStatus: 200,
							responseBody,
						});
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(responseBody);
						return;
					}

					// Healthy handling
					let responseStatus = 200;
					let responseBody = '';

					try {
						const payload = JSON.parse(bodyText);
						if (payload.type === 'verification') {
							// Echo back nonce
							responseBody = JSON.stringify({ nonce: payload.nonce });
						} else if (payload.type === 'yourTurn') {
							const legalMovesTree = payload.state?.legalMoves;
							const moves = this.findFirstMovePath(legalMovesTree);
							responseBody = JSON.stringify({ moves });
						} else if (payload.type === 'drawDecision') {
							responseBody = JSON.stringify({ moves: [], acceptDraw: false });
						} else {
							responseStatus = 400;
							responseBody = JSON.stringify({ error: `Unknown payload type: ${payload.type}` });
						}
					} catch (err) {
						responseStatus = 400;
						responseBody = JSON.stringify({ error: `JSON parse failed: ${String(err)}` });
					}

					this.logs.push({
						timestamp: Date.now(),
						method: req.method || 'POST',
						path: req.url || '/',
						headers: req.headers,
						bodyText,
						signatureValid: isValid,
						responseStatus,
						responseBody,
					});

					res.writeHead(responseStatus, { 'Content-Type': 'application/json' });
					res.end(responseBody);
				});
			});

			this.server.listen(this.port, '127.0.0.1', () => {
				resolve();
			});
			this.server.on('error', reject);
		});
	}

	async stop(): Promise<void> {
		if (!this.server) return;
		return new Promise((resolve, reject) => {
			this.server!.close((err) => {
				this.server = null;
				if (err) reject(err);
				else resolve();
			});
		});
	}
}

// Standalone CLI execution
if (process.argv[1] && process.argv[1].endsWith('webhookFixture.ts')) {
	const port = parseInt(process.env.FIXTURE_PORT || '8089', 10);
	const secret = process.env.FIXTURE_SECRET || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
	const fixture = new WebhookFixture(secret, port);
	fixture
		.start()
		.then(() => {
			console.log(`[webhookFixture] Running at http://127.0.0.1:${port}/webhook`);
		})
		.catch((err) => {
			console.error('[webhookFixture] Failed to start:', err);
			process.exit(1);
		});
}
