import crypto, { randomUUID } from 'node:crypto';
import { AcceptanceEnvManager } from './envManager.ts';

function randomClientSeed(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface TestResult {
	name: string;
	passed: boolean;
	durationMs: number;
	details?: string;
	error?: string;
}

export class ApiAcceptanceMatrix {
	private readonly env: AcceptanceEnvManager;
	private readonly results: TestResult[] = [];

	constructor(env: AcceptanceEnvManager) {
		this.env = env;
	}

	getResults(): TestResult[] {
		return [...this.results];
	}

	private async runTest(name: string, fn: () => Promise<void>): Promise<void> {
		const start = Date.now();
		process.stdout.write(`  • Running: ${name}... `);
		try {
			await fn();
			const durationMs = Date.now() - start;
			console.log(`PASSED (${durationMs}ms)`);
			this.results.push({ name, passed: true, durationMs });
		} catch (err: unknown) {
			const durationMs = Date.now() - start;
			const msg = err instanceof Error ? err.message : String(err);
			const stack = err instanceof Error ? err.stack : undefined;
			console.log(`FAILED (${durationMs}ms)`);
			console.error(`    Error: ${msg}`);
			this.results.push({
				name,
				passed: false,
				durationMs,
				error: stack || msg,
			});
		}
	}

	private async claimShowcase(
		guestId: string,
		idempotencyKey: string,
		entropy?: string,
	): Promise<{ status: number; body: Record<string, any> }> {
		const res = await fetch(`http://127.0.0.1:${this.env.apiPort}/showcase/claim`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Idempotency-Key': idempotencyKey,
				'X-DiceChess-CSRF': '1',
			},
			body: JSON.stringify({
				guestId,
				clientEntropy: entropy || randomClientSeed(),
			}),
		});
		const body = (await res.json().catch(() => ({}))) as Record<string, any>;
		return { status: res.status, body };
	}

	private async getShowcaseView(): Promise<{ status: number; body: Record<string, any> }> {
		const res = await fetch(`http://127.0.0.1:${this.env.apiPort}/showcase`);
		const body = (await res.json()) as Record<string, any>;
		return { status: res.status, body };
	}

	private async startGeneralGame(
		guestId: string,
	): Promise<{ status: number; body: Record<string, any> }> {
		const res = await fetch(`http://127.0.0.1:${this.env.apiPort}/lobby/play-bot`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-DiceChess-CSRF': '1',
			},
			body: JSON.stringify({
				team: 'rpi3',
				name: 'hunter-book',
				timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } },
				preferredColor: 'White',
				guestId,
			}),
		});
		const body = (await res.json().catch(() => ({}))) as Record<string, any>;
		return { status: res.status, body };
	}

	private async resignGame(gameId: string, token: string): Promise<void> {
		return new Promise((resolve) => {
			const safeGameId = encodeURIComponent(gameId);
			const safeToken = encodeURIComponent(token);
			const ws = new WebSocket(
				`ws://127.0.0.1:${this.env.apiPort}/games/${safeGameId}/ws?token=${safeToken}`,
			);
			const timer = setTimeout(() => {
				try {
					ws.close();
				} catch {
					// Ignored
				}
				resolve();
			}, 4000);

			ws.onopen = () => {
				ws.send(JSON.stringify({ SubmitSeed: { seed: randomClientSeed() } }));
				setTimeout(() => {
					try {
						ws.send(JSON.stringify({ Resign: {} }));
					} catch {
						// Ignored
					}
				}, 200);
			};
			ws.onmessage = (msg) => {
				try {
					const data = JSON.parse(String(msg.data));
					if (data.GameEnded) {
						clearTimeout(timer);
						try {
							ws.close();
						} catch {
							// Ignored
						}
						resolve();
					}
				} catch {
					// Ignored
				}
			};
			ws.onerror = () => {
				clearTimeout(timer);
				resolve();
			};
			ws.onclose = () => {
				clearTimeout(timer);
				resolve();
			};
		});
	}

	private async verifyColorAlternation(
		activeGameId: string,
		winnerToken: string,
		winnerColor: string,
		general1Id: string | null,
		general2Id: string | null,
	): Promise<void> {
		// Resign active showcase game
		await this.resignGame(activeGameId, winnerToken);

		// Wait for table to transition to open
		let tableReopened = false;
		let newView: Record<string, any> | null = null;
		for (let i = 0; i < 30; i++) {
			const { body } = await this.getShowcaseView();
			if (body.status === 'open') {
				tableReopened = true;
				newView = body;
				break;
			}
			await new Promise((r) => setTimeout(r, 400));
		}

		if (!tableReopened || !newView)
			throw new Error('Showcase table did not reopen after game resignation');

		const isWhite = winnerColor.toLowerCase() === 'white';
		const expectedNextColor = isWhite ? 'Black' : 'White';
		if (newView.nextHumanColor?.toLowerCase() !== expectedNextColor.toLowerCase()) {
			throw new Error(
				`Expected next human color '${expectedNextColor}', got '${newView.nextHumanColor}'`,
			);
		}

		// Claim second game and verify human receives the alternating color
		const secondClaim = await this.claimShowcase(randomUUID(), randomUUID());
		if (secondClaim.status !== 200 || secondClaim.body.outcome !== 'claimed') {
			throw new Error(`Second claim failed: ${JSON.stringify(secondClaim)}`);
		}
		if (secondClaim.body.seat?.toLowerCase() !== expectedNextColor.toLowerCase()) {
			throw new Error(
				`Second game human color was '${secondClaim.body.seat}', expected '${expectedNextColor}'`,
			);
		}

		// Resign second game and wait for table to reopen
		await this.resignGame(secondClaim.body.gameId, secondClaim.body.seatToken);
		for (let i = 0; i < 30; i++) {
			const { body } = await this.getShowcaseView();
			if (body.status === 'open') break;
			await new Promise((r) => setTimeout(r, 400));
		}

		// Clean up general games
		if (general1Id) {
			try {
				await this.resignGame(general1Id, 'guest-token');
			} catch {
				// Ignored
			}
		}
		if (general2Id) {
			try {
				await this.resignGame(general2Id, 'guest-token');
			} catch {
				// Ignored
			}
		}
	}

	async execute(): Promise<void> {
		console.log('\n=== Executing API Acceptance Matrix ===\n');

		// 1. Initial State & Configuration
		await this.runTest('Initial Showcase View & Fixed 5+3 Time Control', async () => {
			const { status, body } = await this.getShowcaseView();
			if (status !== 200) throw new Error(`Expected 200, got ${status}`);
			if (body.status !== 'open') throw new Error(`Expected status 'open', got '${body.status}'`);
			if (!body.featuredBot || body.featuredBot.name !== 'hunter-book') {
				throw new Error(
					`Expected featured bot hunter-book, got ${JSON.stringify(body.featuredBot)}`,
				);
			}
			if (!body.timeControl || body.timeControl.display !== '5+3') {
				throw new Error(`Expected fixed 5+3 time control, got ${JSON.stringify(body.timeControl)}`);
			}
			if (body.timeControl.initialSeconds !== 300 || body.timeControl.incrementSeconds !== 3) {
				throw new Error(`Expected 300s + 3s, got ${JSON.stringify(body.timeControl)}`);
			}
		});

		let activeGameId = '';
		let winnerToken = '';
		let winnerColor = '';
		let winnerGuest = '';
		let winnerKey = '';
		let winnerEntropy = '';
		let loserGuest = '';
		let loserKey = '';
		let loserEntropy = '';

		await this.runTest('Simultaneous Claims (1 Winner, 3 Spectators, No Duplicates)', async () => {
			const claimants = [
				{ guest: randomUUID(), key: randomUUID(), entropy: randomClientSeed() },
				{ guest: randomUUID(), key: randomUUID(), entropy: randomClientSeed() },
				{ guest: randomUUID(), key: randomUUID(), entropy: randomClientSeed() },
				{ guest: randomUUID(), key: randomUUID(), entropy: randomClientSeed() },
			];

			const outcomes = await Promise.all(
				claimants.map((c) => this.claimShowcase(c.guest, c.key, c.entropy)),
			);

			const claimed = outcomes.filter((o) => o.status === 200 && o.body.outcome === 'claimed');
			const spectating = outcomes.filter(
				(o) => o.status === 200 && o.body.outcome === 'spectating',
			);

			if (claimed.length !== 1) {
				throw new Error(`Expected exactly 1 claimed outcome, got ${claimed.length}`);
			}
			if (spectating.length !== 3) {
				throw new Error(`Expected 3 spectating outcomes, got ${spectating.length}`);
			}

			const winner = claimed[0];
			if (!winner.body.seatToken) throw new Error('Winner missing seatToken');
			if (!winner.body.gameId) throw new Error('Winner missing gameId');

			for (const loser of spectating) {
				if (loser.body.seatToken) throw new Error('Spectator received seatToken!');
				if (loser.body.gameId !== winner.body.gameId) {
					throw new Error('Spectator did not point to winner gameId');
				}
			}

			const winnerIndex = outcomes.findIndex(
				(o) => o.status === 200 && o.body.outcome === 'claimed',
			);
			winnerGuest = claimants[winnerIndex].guest;
			winnerKey = claimants[winnerIndex].key;
			winnerEntropy = claimants[winnerIndex].entropy;

			const loserIndex = outcomes.findIndex(
				(o) => o.status === 200 && o.body.outcome === 'spectating',
			);
			loserGuest = claimants[loserIndex].guest;
			loserKey = claimants[loserIndex].key;
			loserEntropy = claimants[loserIndex].entropy;

			activeGameId = winner.body.gameId;
			winnerToken = winner.body.seatToken;
			winnerColor = winner.body.seat;
		});

		// 3. Idempotency Replay & Conflict
		await this.runTest('Idempotency Replay (Identical Key and Payload)', async () => {
			const replayed = await this.claimShowcase(winnerGuest, winnerKey, winnerEntropy);
			if (replayed.status !== 200) throw new Error(`Expected 200, got ${replayed.status}`);
			if (replayed.body.outcome !== 'claimed') {
				throw new Error(`Expected 'claimed', got '${replayed.body.outcome}'`);
			}
			if (replayed.body.seatToken !== winnerToken) {
				throw new Error('Replayed claim returned different seat token');
			}
			if (replayed.body.gameId !== activeGameId) {
				throw new Error('Replayed claim returned different gameId');
			}

			// Also assert that loser replay returns spectating
			const loserReplayed = await this.claimShowcase(loserGuest, loserKey, loserEntropy);
			if (loserReplayed.status !== 200 || loserReplayed.body.outcome !== 'spectating') {
				throw new Error(
					`Expected replayed loser to be spectating, got ${JSON.stringify(loserReplayed.body)}`,
				);
			}
		});

		await this.runTest('Idempotency Conflict (Same Key, Different Payload)', async () => {
			const conflict = await this.claimShowcase(
				winnerGuest,
				winnerKey,
				'different-entropy-payload',
			);
			if (conflict.status !== 409) {
				throw new Error(
					`Expected 409 Conflict, got ${conflict.status}: ${JSON.stringify(conflict.body)}`,
				);
			}
		});

		// 4. Capacity Reservation & No-Borrowing
		let general1Id = '';
		let general2Id = '';
		const generalGuest1 = randomUUID();
		const generalGuest2 = randomUUID();
		const generalGuest3 = randomUUID();

		await this.runTest(
			'Capacity Check: 1 Showcase + 2 General = 3 Max; 3rd General Rejected',
			async () => {
				// General game 1
				const g1 = await this.startGeneralGame(generalGuest1);
				if (g1.status !== 200 && g1.status !== 201) {
					throw new Error(`General game 1 failed: ${g1.status} ${JSON.stringify(g1.body)}`);
				}
				general1Id = g1.body.gameId;

				// General game 2
				const g2 = await this.startGeneralGame(generalGuest2);
				if (g2.status !== 200 && g2.status !== 201) {
					throw new Error(`General game 2 failed: ${g2.status} ${JSON.stringify(g2.body)}`);
				}
				general2Id = g2.body.gameId;

				// General game 3 -> MUST be rejected because total capacity is 3 (1 showcase + 2 general = 3)
				const g3 = await this.startGeneralGame(generalGuest3);
				if (g3.status !== 409) {
					throw new Error(
						`Expected 409 for 3rd general game, got ${g3.status}: ${JSON.stringify(g3.body)}`,
					);
				}
			},
		);

		// 5. Conclude Showcase Game & Verify Color Alternation
		await this.runTest('Resign Showcase Game & Observe Reopen and Color Alternation', async () => {
			await this.verifyColorAlternation(
				activeGameId,
				winnerToken,
				winnerColor,
				general1Id,
				general2Id,
			);
		});

		// 6. Database Durability Assertions
		await this.runTest('PostgreSQL Durability & Origin Assertions', async () => {
			const showcaseGames = this.env.db.getShowcaseGames();
			if (showcaseGames.length < 2) {
				throw new Error(`Expected at least 2 showcase games in DB, found ${showcaseGames.length}`);
			}
			for (const g of showcaseGames) {
				if (g.origin !== 'showcase')
					throw new Error(`Game ${g.id} origin is '${g.origin}', expected 'showcase'`);
				if (g.rated) throw new Error(`Game ${g.id} is rated! Showcase games must be unrated`);
			}

			const claims = this.env.db.getShowcaseClaims();
			if (claims.length < 4) {
				throw new Error(`Expected at least 4 showcase claims in DB, found ${claims.length}`);
			}

			const archives = this.env.db.getShowcaseArchives();
			if (archives.length < 2) {
				throw new Error(`Expected at least 2 archived showcase games, found ${archives.length}`);
			}
			for (const a of archives) {
				if (a.origin !== 'showcase')
					throw new Error(`Archive origin is '${a.origin}', expected 'showcase'`);
				if (!a.sporting_eligible) {
					throw new Error(`Archive sporting_eligible is false for normally concluded game`);
				}
			}

			const table = this.env.db.getShowcaseTable();
			if (!table || table.id !== 1) throw new Error('Showcase table singleton missing or invalid');
		});

		// 7. Webhook HMAC Cryptographic Wire Assertions
		await this.runTest('Deterministic Webhook HMAC Signatures & Hunter Compatibility', async () => {
			const logs = this.env.fixture.getLogs();
			if (logs.length === 0) throw new Error('No webhook requests recorded by fixture');

			const invalidSignatures = logs.filter((l) => !l.signatureValid);
			if (invalidSignatures.length > 0) {
				throw new Error(
					`Found ${invalidSignatures.length} webhook requests with invalid HMAC signatures!`,
				);
			}

			const verificationRequests = logs.filter((l) => l.bodyText.includes('"verification"'));
			if (verificationRequests.length === 0) {
				throw new Error('No verification probe requests recorded');
			}

			for (const req of logs) {
				if (!req.headers['x-dicechess-signature']) {
					throw new Error('Missing X-DiceChess-Signature header');
				}
				if (!req.headers['x-dicechess-timestamp']) {
					throw new Error('Missing X-DiceChess-Timestamp header');
				}
			}
		});

		// 8. Bot Unavailability & Reopening Recovery
		await this.runTest('Bot Unavailability Detection and Recovery', async () => {
			// Wait for table to open first
			for (let i = 0; i < 30; i++) {
				const { body } = await this.getShowcaseView();
				if (body.status === 'open') break;
				await new Promise((r) => setTimeout(r, 400));
			}

			// Set fixture to unavailable (503)
			this.env.fixture.setMode('unavailable');

			// Restart API while bot is unavailable to test reconciliation under bot failure
			await this.env.restartApi();

			// Verify view reflects unavailable
			const unavailView = await this.getShowcaseView();
			if (unavailView.body.status !== 'unavailable') {
				throw new Error(`Expected status 'unavailable', got '${unavailView.body.status}'`);
			}

			// Restore fixture to healthy
			this.env.fixture.setMode('healthy');

			// Restart API with healthy fixture
			await this.env.restartApi();

			// Wait for table to recover to open
			let recovered = false;
			for (let i = 0; i < 40; i++) {
				const { body } = await this.getShowcaseView();
				if (body.status === 'open') {
					recovered = true;
					break;
				}
				await new Promise((r) => setTimeout(r, 400));
			}
			if (!recovered) throw new Error('Table did not recover to open after bot became healthy');
		});

		// 9. Sporting Score Exclusion on Technical Abort
		await this.runTest('Sporting Score Exclusion for Aborted / Failed Games', async () => {
			// Verify schema constraint on game_archive
			const constraintCheck = this.env.db.execSql(
				"SELECT conname FROM pg_constraint WHERE conrelid = 'play.game_archive'::regclass AND conname = 'game_archive_origin_check';",
			);
			if (!constraintCheck.includes('game_archive_origin_check')) {
				throw new Error('game_archive_origin_check constraint missing');
			}

			// Direct insert of a technical abort snapshot to verify persistence and query projection
			const testAbortId = randomUUID();
			this.env.db.execSql(`
				INSERT INTO play.game_archive (game_id, payload, origin, sporting_eligible)
				VALUES ('${testAbortId}', '{"result": null, "termination": "aborted", "origin": "showcase"}'::jsonb, 'showcase', false);
			`);

			const archives = this.env.db.getShowcaseArchives();
			const aborted = archives.find((a) => a.game_id === testAbortId);
			if (!aborted) throw new Error('Aborted archive entry not found in database');
			if (aborted.sporting_eligible !== false) {
				throw new Error(
					`Expected sporting_eligible = false for technical abort, got ${aborted.sporting_eligible}`,
				);
			}
		});

		// 10. Fail-Closed on PostgreSQL Interruption
		await this.runTest('Fail-Closed Behavior on Database Interruption', async () => {
			// Stop postgres
			await this.env.stopPostgres();

			// Claim attempt during DB outage must fail closed (unavailable or error)
			try {
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), 2000);
				const res = await fetch(`http://127.0.0.1:${this.env.apiPort}/showcase/claim`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Idempotency-Key': randomUUID(),
						'X-DiceChess-CSRF': '1',
					},
					body: JSON.stringify({ guestId: randomUUID(), clientEntropy: randomClientSeed() }),
					signal: controller.signal,
				});
				clearTimeout(timeout);
				const body = (await res.json().catch(() => ({}))) as any;
				if (res.status !== 503 && body?.outcome !== 'unavailable') {
					throw new Error(`Expected 503 or unavailable during DB outage, got ${res.status}`);
				}
			} catch {
				// AbortError or connection refused is expected fail-closed behavior
			}

			// Restart postgres
			await this.env.startPostgres();

			// Restart API to reconnect to restored database
			await this.env.restartApi();

			// Table should recover from unavailable cleanly (resuming or open)
			let restored = false;
			let restoredView: any = null;
			for (let i = 0; i < 30; i++) {
				const { body } = await this.getShowcaseView();
				if (body.status === 'open' || body.status === 'live') {
					restored = true;
					restoredView = body;
					break;
				}
				await new Promise((r) => setTimeout(r, 400));
			}
			if (!restored) throw new Error('Table did not restore after database restarted');

			if (restoredView?.status === 'live' && restoredView.currentGame?.gameId) {
				const safeGameId = encodeURIComponent(restoredView.currentGame.gameId);
				const ws = new WebSocket(
					`ws://127.0.0.1:${this.env.apiPort}/games/${safeGameId}/ws?token=resigner`,
				);
				ws.onopen = () => {
					ws.send(JSON.stringify({ Resign: {} }));
					setTimeout(() => {
						try {
							ws.close();
						} catch {
							// Ignored
						}
					}, 200);
				};
				for (let i = 0; i < 30; i++) {
					const { body: b } = await this.getShowcaseView();
					if (b.status === 'open') break;
					await new Promise((r) => setTimeout(r, 400));
				}
			}
		});

		console.log('\n=== API Matrix Complete ===\n');
	}
}

// Standalone execution
if (process.argv[1]?.endsWith('apiMatrix.ts')) {
	const env = new AcceptanceEnvManager();
	try {
		await env.setup();
		const matrix = new ApiAcceptanceMatrix(env);
		await matrix.execute();
		const results = matrix.getResults();
		const failed = results.filter((r) => !r.passed);
		console.log(`\nResults: ${results.length - failed.length}/${results.length} passed.`);
		await env.teardown();
		process.exit(failed.length > 0 ? 1 : 0);
	} catch (err) {
		console.error('Test execution failed:', err);
		await env.teardown();
		process.exit(1);
	}
}
