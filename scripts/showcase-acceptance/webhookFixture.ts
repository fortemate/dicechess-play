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
	private readonly secret: string;
	private readonly port: number;

	constructor(
		secret: string = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
		port: number = 8089,
	) {
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

	setMode(mode: FixtureMode): void {
		this.mode = mode;
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

	private findFirstMovePath(node: unknown): string[] {
		if (!node || typeof node !== 'object') return [];
		const rec = node as Record<string, unknown>;
		const target = (rec.children ?? rec) as Record<string, unknown>;
		const keys = Object.keys(target);
		if (keys.length === 0) return [];
		keys.sort((a, b) => a.localeCompare(b));
		const firstKey = keys[0];
		return [firstKey, ...this.findFirstMovePath(target[firstKey])];
	}

	private handleControlEndpoints(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		bodyText: string,
	): boolean {
		if (req.url === '/fixture/control/mode' && req.method === 'POST') {
			try {
				const json = JSON.parse(bodyText);
				if (
					json.mode === 'healthy' ||
					json.mode === 'unavailable' ||
					json.mode === 'timeout' ||
					json.mode === 'malformed'
				) {
					this.mode = json.mode;
				}
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ ok: true, mode: this.mode }));
			} catch {
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'invalid_json_payload' }));
			}
			return true;
		}

		if (req.url === '/fixture/control/logs' && req.method === 'GET') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ logs: this.logs }));
			return true;
		}

		if (req.url === '/fixture/control/reset' && req.method === 'POST') {
			this.clearLogs();
			this.mode = 'healthy';
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ ok: true }));
			return true;
		}

		if (req.url === '/fixture/health' && req.method === 'GET') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ status: 'ok', mode: this.mode }));
			return true;
		}

		return false;
	}

	private async handleSimulatedModes(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		bodyText: string,
		isValid: boolean,
	): Promise<boolean> {
		if (this.mode === 'unavailable') {
			const responseBody = JSON.stringify({ error: 'bot_unavailable' });
			this.recordLog(req, bodyText, isValid, 503, responseBody);
			res.writeHead(503, { 'Content-Type': 'application/json' });
			res.end(responseBody);
			return true;
		}

		if (this.mode === 'timeout') {
			const SIMULATED_TIMEOUT_MS = 8000;
			await new Promise((r) => setTimeout(r, SIMULATED_TIMEOUT_MS));
			const responseBody = JSON.stringify({ moves: [] });
			this.recordLog(req, bodyText, isValid, 200, responseBody);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(responseBody);
			return true;
		}

		if (this.mode === 'malformed') {
			const responseBody = '{"not_valid_moves":true}';
			this.recordLog(req, bodyText, isValid, 200, responseBody);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(responseBody);
			return true;
		}

		return false;
	}

	private recordLog(
		req: http.IncomingMessage,
		bodyText: string,
		isValid: boolean,
		status: number,
		body: string,
	): void {
		this.logs.push({
			timestamp: Date.now(),
			method: req.method || 'POST',
			path: req.url || '/',
			headers: req.headers,
			bodyText,
			signatureValid: isValid,
			responseStatus: status,
			responseBody: body,
		});
	}

	private resolvePayload(bodyText: string): { status: number; body: string } {
		try {
			const payload = JSON.parse(bodyText);
			if (payload.type === 'verification') {
				return { status: 200, body: JSON.stringify({ nonce: payload.nonce }) };
			}
			if (payload.type === 'yourTurn') {
				const moves = this.findFirstMovePath(payload.state?.legalMoves);
				return { status: 200, body: JSON.stringify({ moves }) };
			}
			if (payload.type === 'drawDecision') {
				return { status: 200, body: JSON.stringify({ moves: [], acceptDraw: false }) };
			}
			return {
				status: 400,
				body: JSON.stringify({ error: `Unknown payload type: ${payload.type}` }),
			};
		} catch (err) {
			return { status: 400, body: JSON.stringify({ error: `JSON parse failed: ${String(err)}` }) };
		}
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

					if (this.handleControlEndpoints(req, res, bodyText)) return;

					const signatureHeader = req.headers['x-dicechess-signature'] as string | undefined;
					const timestampHeader = req.headers['x-dicechess-timestamp'] as string | undefined;
					const isValid =
						Boolean(signatureHeader) &&
						Boolean(timestampHeader) &&
						this.verifyHmac(timestampHeader!, rawBody, signatureHeader!);

					if (await this.handleSimulatedModes(req, res, bodyText, isValid)) return;

					const result = this.resolvePayload(bodyText);
					this.recordLog(req, bodyText, isValid, result.status, result.body);
					res.writeHead(result.status, { 'Content-Type': 'application/json' });
					res.end(result.body);
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
if (process.argv[1]?.endsWith('webhookFixture.ts')) {
	const port = Number.parseInt(process.env.FIXTURE_PORT || '8089', 10);
	const secret =
		process.env.FIXTURE_SECRET ||
		'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
	const fixture = new WebhookFixture(secret, port);
	try {
		await fixture.start();
		console.log(`[webhookFixture] Running at http://127.0.0.1:${port}/webhook`);
	} catch (err) {
		console.error('[webhookFixture] Failed to start:', err);
		process.exit(1);
	}
}
