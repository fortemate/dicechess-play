import { expect, test, type Page } from '@playwright/test';
import type { LaboratoryGameState } from '../../src/lib/laboratory/api';
import type { Action } from '../../src/lib/laboratory/protocol';

const APP_ORIGIN = 'http://127.0.0.1:4175';
const API_ORIGIN = 'http://127.0.0.1:8081';
const RULES_VERSION = '0.18.2';
const STANDARD_DFEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

type GameState = ReturnType<typeof stateFor>;
type Creation = Record<string, unknown> & {
	gameId: string;
	commit: string;
	tokens: Array<{ seat: 'White' | 'Black'; token: string }>;
};
type RoomRecord = {
	creation: Creation;
	state: GameState;
	ready: Set<string>;
	clients: Set<{ send(message: string): void }>;
};
type Fixture = {
	createCount: number;
	latestGameId: string;
	records: Map<string, RoomRecord>;
	postBodies: Record<string, unknown>[];
	httpUrls: string[];
	websocketUrls: string[];
	socketFrames: Record<string, unknown>[];
	pageErrors: string[];
	consoleErrors: string[];
};

function stateFor(commit: string, timeControl: unknown) {
	return {
		version: 1,
		dfen: STANDARD_DFEN,
		activeSeat: 'White',
		dicePending: false,
		status: { Active: {} },
		clocks: { white: 600_000, black: 600_000 },
		players: {
			white: { kind: 'Human', name: null },
			black: { kind: 'Human', name: null },
		},
		rated: false,
		ratingDomain: 'casual',
		timeControl,
		commit,
		lab: {
			variant: { id: 'choice-2x2d6', revision: 1 },
			protocolVersion: 1,
			provenance: { rulesVersion: RULES_VERSION, diceAlgorithm: 'choice-2x2d6-hmac-sha256-v1' },
			turn: { phase: 'AwaitingPlayers', offers: [], selectedPairIndex: null },
		},
	} as LaboratoryGameState;
}

function createFixture(): Fixture {
	return {
		createCount: 0,
		latestGameId: '',
		records: new Map(),
		postBodies: [],
		httpUrls: [],
		websocketUrls: [],
		socketFrames: [],
		pageErrors: [],
		consoleErrors: [],
	};
}

function installNetworkGuards(page: Page) {
	// Only the built app and intercepted fixture API are allowed to receive requests.
	page.route('**/*', async (route) => {
		if (new URL(route.request().url()).origin === APP_ORIGIN) await route.continue();
		else await route.abort('blockedbyclient');
	});
	page.routeWebSocket('**/*', (route) => route.close());
}

async function installMocks(page: Page, fixture = createFixture()) {
	installNetworkGuards(page);
	page.on('request', (request) => fixture.httpUrls.push(request.url()));
	page.on('pageerror', (error) => fixture.pageErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') fixture.consoleErrors.push(message.text());
	});

	await page.route(`${API_ORIGIN}/**`, async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		fixture.httpUrls.push(request.url());
		if (request.method() === 'OPTIONS') {
			await route.fulfill({ status: 204, headers: corsHeaders });
			return;
		}
		if (request.method() === 'POST' && url.pathname === '/games') {
			const body = request.postDataJSON() as Record<string, unknown>;
			fixture.postBodies.push(body);
			fixture.createCount += 1;
			const suffix = String(fixture.createCount).padStart(12, '0');
			const gameId = `a12b3456-7890-4abc-def0-${suffix}`;
			fixture.latestGameId = gameId;
			const commit = `${String(fixture.createCount % 256).padStart(2, '0')}`.repeat(32);
			const creation: Creation = {
				gameId,
				commit,
				tokens: [
					{ seat: 'White', token: `white_dummy_${fixture.createCount}` },
					{ seat: 'Black', token: `black_dummy_${fixture.createCount}` },
				],
				variant: { id: 'choice-2x2d6', revision: 1 },
				labProtocolVersion: 1,
				provenance: {
					rulesVersion: RULES_VERSION,
					diceAlgorithm: 'choice-2x2d6-hmac-sha256-v1',
				},
			};
			const state = stateFor(commit, body.timeControl);
			fixture.records.set(gameId, { creation, state, ready: new Set(), clients: new Set() });
			await route.fulfill({ status: 201, headers: jsonHeaders, body: JSON.stringify(creation) });
			return;
		}
		if (request.method() === 'GET' && /^\/games\/[0-9a-f-]+$/i.test(url.pathname)) {
			const id = url.pathname.split('/')[2];
			const record = fixture.records.get(id);
			if (!record) {
				await route.fulfill({
					status: 404,
					headers: jsonHeaders,
					body: JSON.stringify({ message: 'not found' }),
				});
				return;
			}
			await route.fulfill({
				status: 200,
				headers: jsonHeaders,
				body: JSON.stringify(record.state),
			});
			return;
		}
		await route.fulfill({
			status: 404,
			headers: jsonHeaders,
			body: JSON.stringify({ message: 'not mocked' }),
		});
	});

	await page.routeWebSocket(`${API_ORIGIN.replace('http', 'ws')}/**`, (route) => {
		fixture.websocketUrls.push(route.url());
		let authenticatedGameId = '';
		let authenticatedSeat = '';
		route.onMessage((message) => {
			if (typeof message !== 'string') return;
			const frame = JSON.parse(message) as Record<string, unknown>;
			fixture.socketFrames.push(frame);
			if ('LabAuthenticate' in frame) {
				const auth = frame.LabAuthenticate as { token?: string };
				const record = [...fixture.records.entries()].find(([, value]) =>
					value.creation.tokens.some((seatToken) => seatToken.token === auth.token),
				);
				if (!record) return;
				const [gameId, room] = record;
				const seat = room.creation.tokens.find((seatToken) => seatToken.token === auth.token)?.seat;
				if (!seat) return;
				authenticatedGameId = gameId;
				authenticatedSeat = seat;
				room.clients.add(route);
				route.send(JSON.stringify({ LabAuthenticated: { seat } }));
				return;
			}
			if (!authenticatedGameId) return;
			const room = fixture.records.get(authenticatedGameId)!;
			const state = room.state;
			if ('SubmitSeed' in frame) {
				room.ready.add(authenticatedSeat);
				if (room.ready.size === 2 && state.lab.turn.phase === 'AwaitingPlayers') {
					state.lab.turn = { phase: 'AwaitingFirstRoll', offers: [], selectedPairIndex: null };
					state.version++;
				}
			} else if ('LabCommand' in frame) {
				const command = frame.LabCommand as {
					commandId: string;
					expectedVersion: number;
					action: Action;
				};
				if (command.expectedVersion !== state.version || authenticatedSeat !== state.activeSeat)
					return;
				const action = command.action;
				if ('RollFirst' in action)
					state.lab.turn = {
						phase: 'AwaitingSecondRoll',
						offers: [[1, 2]],
						selectedPairIndex: null,
					};
				else if ('RollSecond' in action)
					state.lab.turn = {
						phase: 'AwaitingPairChoice',
						offers: [
							[1, 2],
							[1, 3],
						],
						selectedPairIndex: null,
					};
				else if ('ChoosePair' in action && action.ChoosePair.pairIndex === 0) {
					state.lab.turn = {
						phase: 'PlayingSelectedPair',
						offers: [
							[1, 2],
							[1, 3],
						],
						selectedPairIndex: 0,
					};
					state.dfen = `${STANDARD_DFEN} PN`;
					state.dicePending = true;
					state.legalMoves = { e2e4: { b1c3: {} } };
				} else if ('SubmitTurn' in action && action.SubmitTurn.moves.join() === 'e2e4,b1c3') {
					state.dfen = 'rnbqkbnr/pppppppp/8/8/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 0 1';
					state.activeSeat = 'Black';
					state.dicePending = false;
					state.legalMoves = null;
					state.lab.turn = { phase: 'AwaitingFirstRoll', offers: [], selectedPairIndex: null };
				} else return;
				state.version++;
				route.send(
					JSON.stringify({
						LabCommandApplied: { commandId: command.commandId, appliedVersion: state.version },
					}),
				);
			} else return;
			for (const client of room.clients)
				client.send(JSON.stringify({ Snapshot: { v: state.version, state, history: [] } }));
		});
	});

	return fixture;
}

const corsHeaders = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, POST, OPTIONS',
	'access-control-allow-headers': 'content-type',
};
const jsonHeaders = { ...corsHeaders, 'content-type': 'application/json' };

async function createGame(page: Page) {
	await page.getByRole('button', { name: 'White', exact: true }).click();
	await page.getByRole('button', { name: 'Create a game' }).click();
	await expect(page.getByRole('heading', { name: 'Just invite a friend.' })).toBeVisible();
	const input = page.getByLabel('Invitation for your friend');
	await expect(input).toBeVisible();
	return input;
}

async function expectNoHorizontalOverflow(page: Page) {
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
		.toBe(true);
}

async function expectMinimumTarget(page: Page, locator: ReturnType<Page['getByRole']>) {
	const box = await locator.boundingBox();
	expect(box?.height).toBeGreaterThanOrEqual(44);
}

test('creates and joins one room across independent browser contexts', async ({
	page,
	browser,
}, testInfo) => {
	const fixture = await installMocks(page);
	await page.goto('/');
	const input = await createGame(page);
	const creation = [...fixture.records.values()][0].creation;
	const gameId = creation.gameId;
	const invite = new URL(await input.inputValue());
	await expect.poll(() => fixture.socketFrames.some((frame) => 'SubmitSeed' in frame)).toBe(true);
	await expect.poll(() => fixture.websocketUrls.length).toBeGreaterThan(0);
	const creatorFrames = fixture.socketFrames.slice(0, 2);
	expect(creatorFrames.map((frame) => Object.keys(frame)[0])).toEqual([
		'LabAuthenticate',
		'SubmitSeed',
	]);

	const friendContext = await browser.newContext();
	try {
		const friendPage = await friendContext.newPage();
		await installMocks(friendPage, fixture);
		await friendPage.goto(`${invite.pathname}${invite.hash}`);
		await expect(
			friendPage.getByRole('heading', { name: 'A seat is waiting for you.' }),
		).toBeVisible();
		await expect(friendPage.getByText('Agreed game settings')).toBeVisible();
		await friendPage.getByRole('button', { name: 'Join as Black' }).click();
		await expect(friendPage.getByRole('grid', { name: 'Black board' })).toBeVisible();
		await expect.poll(() => fixture.websocketUrls.length).toBe(2);
		await expect
			.poll(() => fixture.socketFrames.filter((frame) => 'SubmitSeed' in frame).length)
			.toBe(2);
		const friendFrames = fixture.socketFrames.slice(2, 4);
		expect(friendFrames.map((frame) => Object.keys(frame)[0])).toEqual([
			'LabAuthenticate',
			'SubmitSeed',
		]);
		await page.getByRole('link', { name: 'Open my board' }).first().click();
		await page.getByRole('button', { name: 'Roll dice' }).click();
		await expect(page.locator('.lab-pair-card')).toHaveCount(2);
		await expect(friendPage.locator('.lab-pair-card')).toHaveCount(2);
		expect(fixture.socketFrames.filter((frame) => 'LabCommand' in frame)).toHaveLength(2);
		expect(fixture.records.get(gameId)!.state.lab.turn.selectedPairIndex).toBeNull();
		await page.screenshot({
			path: testInfo.outputPath('lab-desktop-pair-choice.png'),
			fullPage: true,
		});
		for (const width of [320, 390, 430]) {
			await page.setViewportSize({ width, height: 844 });
			for (const colorScheme of ['light', 'dark'] as const) {
				await page.emulateMedia({ colorScheme });
				await expectNoHorizontalOverflow(page);
				const available = (await page.locator('.lab-game-grid').boundingBox())!.width;
				const board = (await page.getByRole('grid').boundingBox())!.width;
				expect(board).toBeGreaterThanOrEqual(available - 2);
				for (const card of await page.locator('.lab-pair-card').all()) {
					const box = (await card.boundingBox())!;
					expect(box.height).toBeGreaterThanOrEqual(44);
					expect(box.height).toBeLessThanOrEqual(84);
				}
				await page.screenshot({
					path: testInfo.outputPath(`lab-phone-${width}-pairs-${colorScheme}.png`),
					fullPage: true,
				});
			}
		}
		await page.setViewportSize({ width: 390, height: 844 });
		await page.getByRole('button', { name: /^Pair 1:/ }).click();
		await page.getByRole('button', { name: 'Confirm pair 1' }).click();
		await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Submit turn', exact: true })).toHaveCount(0);
		for (const square of ['e2', 'e4'])
			await page.getByRole('gridcell', { name: new RegExp(`^${square},`) }).click();
		expect(fixture.socketFrames.filter((frame) => 'LabCommand' in frame)).toHaveLength(3);
		await page.screenshot({
			path: testInfo.outputPath('lab-phone-390-playing.png'),
			fullPage: true,
		});
		await page.getByRole('gridcell', { name: /^b1,/ }).click();
		await expect(page.getByRole('gridcell', { name: /^b1,/ })).toHaveAttribute(
			'aria-selected',
			'true',
		);
		await page.getByRole('gridcell', { name: /^c3,.*legal destination/ }).click();
		await expect
			.poll(() => fixture.socketFrames.filter((frame) => 'LabCommand' in frame))
			.toHaveLength(4);
		await expect(friendPage.getByRole('button', { name: 'Roll dice' })).toBeEnabled();
		const commands = fixture.socketFrames.filter((frame) => 'LabCommand' in frame);
		expect(commands).toHaveLength(4);
		expect(commands.at(-1)).toMatchObject({
			LabCommand: { action: { SubmitTurn: { moves: ['e2e4', 'b1c3'] } } },
		});
		expect(fixture.records.get(gameId)!.state.dfen).toContain('/2N5/PPPP1PPP/R1BQKBNR b');
		expect(
			fixture.websocketUrls.every((url) => new URL(url).pathname === `/games/${gameId}/ws`),
		).toBe(true);
		expect(
			fixture.websocketUrls.every((url) => !url.includes('token=') && !url.includes('#')),
		).toBe(true);
		expect(
			fixture.httpUrls.every((url) => [APP_ORIGIN, API_ORIGIN].includes(new URL(url).origin)),
		).toBe(true);
		expect(fixture.pageErrors).toEqual([]);
		expect(fixture.consoleErrors).toEqual([]);
	} finally {
		await friendContext.close();
	}
});

test('captures desktop and phone creation, invitation, and light/dark waiting boards', async ({
	page,
}, testInfo) => {
	const fixture = await installMocks(page);
	await page.emulateMedia({ colorScheme: 'light' });
	await page.setViewportSize({ width: 1440, height: 960 });
	await page.goto('/');
	await expectNoHorizontalOverflow(page);
	const createButton = page.getByRole('button', { name: 'Create a game' });
	await expect(createButton).toBeVisible();
	await expectMinimumTarget(page, createButton);
	await page.screenshot({ path: testInfo.outputPath('lab-desktop-create.png') });

	await page.setViewportSize({ width: 320, height: 900 });
	await expectNoHorizontalOverflow(page);
	await expectMinimumTarget(page, createButton);
	await page.screenshot({ path: testInfo.outputPath('lab-phone-create.png'), fullPage: true });

	await page.setViewportSize({ width: 1440, height: 960 });
	const invitation = await createGame(page);
	await page.emulateMedia({ colorScheme: 'dark' });
	await expectMinimumTarget(page, page.getByRole('button', { name: 'Copy invitation' }));
	await expectNoHorizontalOverflow(page);
	await page.screenshot({ path: testInfo.outputPath('lab-desktop-invite-dark.png') });

	await page.setViewportSize({ width: 320, height: 900 });
	await expectMinimumTarget(page, page.getByRole('button', { name: 'Copy invitation' }));
	await expectNoHorizontalOverflow(page);
	await page.screenshot({ path: testInfo.outputPath('lab-phone-invite.png'), fullPage: true });
	const inviteUrl = new URL(await invitation.inputValue());

	await page.setViewportSize({ width: 1440, height: 960 });
	await page.emulateMedia({ colorScheme: 'light' });
	await page.getByRole('link', { name: 'Open my board' }).click();
	await expect(page.getByRole('img', { name: 'Chessboard, White at the bottom' })).toBeVisible();
	await expectNoHorizontalOverflow(page);
	await page.screenshot({ path: testInfo.outputPath('lab-board.png') });
	await page.emulateMedia({ colorScheme: 'dark' });
	await expectNoHorizontalOverflow(page);
	await page.screenshot({ path: testInfo.outputPath('lab-board-dark.png') });

	const room = fixture.records.get(fixture.latestGameId)!;
	room.state.version++;
	room.state.lab.turn = {
		phase: 'AwaitingPairChoice',
		offers: [
			[1, 3],
			[1, 4],
		],
		selectedPairIndex: null,
	};
	await page.reload();
	await expect(page.getByRole('button', { name: /^Pair 1:/ })).toBeEnabled();
	for (const [width, height] of [
		[1440, 960],
		[390, 844],
		[320, 900],
		[844, 390],
	]) {
		await page.setViewportSize({ width, height });
		for (const theme of ['light', 'dark'] as const) {
			await page.getByRole('combobox', { name: 'Appearance' }).selectOption(theme);
			await expectNoHorizontalOverflow(page);
			await expectMinimumTarget(page, page.getByRole('button', { name: 'Confirm one whole pair' }));
			// Catch collapsed nested board rows as well as overflow in the shipped CSS.
			const cell = await page.getByRole('gridcell', { name: 'a8, Black rook' }).boundingBox();
			expect(cell!.height).toBeGreaterThan(25);
			expect(Math.abs(cell!.height - cell!.width)).toBeLessThan(2);
			if (width === 390) {
				const confirm = await page
					.getByRole('button', { name: 'Confirm one whole pair' })
					.boundingBox();
				expect(confirm!.y + confirm!.height).toBeLessThanOrEqual(height);
			}
			await page.screenshot({
				path: testInfo.outputPath(`lab-choice-${width}-${theme}.png`),
				fullPage: height < 500,
			});
		}
	}

	expect(inviteUrl.pathname).toMatch(/^\/invite\//);
	expect(fixture.postBodies).toHaveLength(1);
	expect(fixture.pageErrors).toEqual([]);
	expect(fixture.consoleErrors).toEqual([]);
});
