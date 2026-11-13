import { expect, test, type Page } from '@playwright/test';

const APP_ORIGIN = 'http://127.0.0.1:4175';
const API_ORIGIN = 'http://127.0.0.1:8081';
const RULES_VERSION = '0.18.2';
const STANDARD_DFEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test.beforeEach(async ({ page }) => {
	// An artifact built with a different API origin must fail safely, never create real rooms.
	// Individual fixtures register their more-specific handlers after these deny-by-default routes.
	await page.route('**/*', async (route) => {
		if (new URL(route.request().url()).origin === APP_ORIGIN) await route.continue();
		else await route.abort('blockedbyclient');
	});
	await page.routeWebSocket('**/*', (route) => route.close());
});

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
	};
}

async function installMocks(page: Page) {
	let createCount = 0;
	let latestGameId = '';
	const records = new Map<
		string,
		{ creation: Record<string, unknown>; state: ReturnType<typeof stateFor> }
	>();
	const postBodies: Record<string, unknown>[] = [];
	const httpUrls: string[] = [];
	const websocketUrls: string[] = [];
	const seedFrames: Record<string, unknown>[] = [];
	const pageErrors: string[] = [];
	const consoleErrors: string[] = [];
	page.on('request', (request) => httpUrls.push(request.url()));
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') consoleErrors.push(message.text());
	});

	await page.route(`${API_ORIGIN}/**`, async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		httpUrls.push(request.url());
		if (request.method() === 'OPTIONS') {
			await route.fulfill({ status: 204, headers: corsHeaders });
			return;
		}
		if (request.method() === 'POST' && url.pathname === '/games') {
			const body = request.postDataJSON() as Record<string, unknown>;
			postBodies.push(body);
			createCount += 1;
			const suffix = String(createCount).padStart(12, '0');
			const gameId = `a12b3456-7890-4abc-def0-${suffix}`;
			latestGameId = gameId;
			const commit = `${String(createCount % 256).padStart(2, '0')}`.repeat(32);
			const creation = {
				gameId,
				commit,
				tokens: [
					{ seat: 'White', token: `white_dummy_${createCount}` },
					{ seat: 'Black', token: `black_dummy_${createCount}` },
				],
				variant: { id: 'choice-2x2d6', revision: 1 },
				labProtocolVersion: 1,
				provenance: {
					rulesVersion: RULES_VERSION,
					diceAlgorithm: 'choice-2x2d6-hmac-sha256-v1',
				},
			};
			const state = stateFor(commit, body.timeControl);
			records.set(gameId, { creation, state });
			await route.fulfill({ status: 201, headers: jsonHeaders, body: JSON.stringify(creation) });
			return;
		}
		if (request.method() === 'GET' && /^\/games\/[0-9a-f-]+$/i.test(url.pathname)) {
			const id = url.pathname.split('/')[2];
			const record = records.get(id);
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
		websocketUrls.push(route.url());
		route.onMessage((message) => {
			if (typeof message !== 'string') return;
			const frame = JSON.parse(message) as Record<string, unknown>;
			seedFrames.push(frame);
			if (!('SubmitSeed' in frame)) return;
			const state = records.get(latestGameId)?.state;
			if (state) route.send(JSON.stringify({ Snapshot: { v: state.version, state, history: [] } }));
		});
	});

	return { records, postBodies, httpUrls, websocketUrls, seedFrames, pageErrors, consoleErrors };
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

test('creates an isolated room, keeps only the opponent token in the invitation, and restores the private board', async ({
	page,
}, testInfo) => {
	const mocks = await installMocks(page);
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('/');
	const input = await createGame(page);
	const creation = [...mocks.records.values()][0].creation;
	const gameId = String(creation.gameId);
	const ownToken = 'white_dummy_1';
	const opponentToken = 'black_dummy_1';
	const body = mocks.postBodies[0];
	expect(body).toMatchObject({
		white: expect.stringMatching(/^[0-9a-f-]{36}$/i),
		black: expect.stringMatching(/^[0-9a-f-]{36}$/i),
		timeControl: { Fischer: { initialSeconds: 600, incrementSeconds: 10 } },
		variant: { id: 'choice-2x2d6', revision: 1 },
		labProtocolVersion: 1,
		rated: false,
	});
	expect(body.white).toBe(body.black);
	const invite = new URL(await input.inputValue());
	expect(invite.origin).toBe(APP_ORIGIN);
	expect(invite.pathname).toBe(`/invite/${gameId}`);
	expect(invite.search).toBe('');
	expect(invite.hash).toBe(`#token=${opponentToken}&as=black`);
	expect(invite.href).not.toContain(ownToken);
	expect(await page.evaluate(() => location.hash)).toBe('');
	const stored = await page.evaluate(
		(key) => sessionStorage.getItem(key),
		`dicechess-laboratory-room:${gameId}`,
	);
	expect(stored).toContain(ownToken);
	expect(stored).toContain(opponentToken);
	await expect(page.getByText('You · White')).toBeVisible();
	await expect(page.getByText('Friend · Black')).toBeVisible();
	await expect.poll(() => mocks.seedFrames.length).toBeGreaterThan(0);
	await expect.poll(() => mocks.websocketUrls.length).toBeGreaterThan(0);
	expect(
		mocks.seedFrames.every((frame) => Object.keys(frame).length === 1 && 'SubmitSeed' in frame),
	).toBe(true);
	const wsUrl = new URL(mocks.websocketUrls[0]);
	expect(wsUrl.pathname).toBe(`/games/${gameId}/ws`);
	expect(wsUrl.searchParams.get('token')).toBe(ownToken);
	expect(wsUrl.searchParams.get('guest')).toBe(body.white);
	expect(mocks.websocketUrls.join('\n')).not.toContain(opponentToken);

	await page.screenshot({ path: testInfo.outputPath('lab-desktop-invite-dark.png') });
	await page.reload();
	await expect(page.getByLabel('Invitation for your friend')).toHaveValue(invite.href);
	await expect(page.getByText('You · White')).toBeVisible();
	await page.getByRole('link', { name: 'Open my board' }).click();
	await expect(page).toHaveURL(new RegExp(`/game/${gameId}$`));
	await expect(page.getByRole('img', { name: 'Chessboard, White at the bottom' })).toBeVisible();
	await expect
		.poll(() =>
			page
				.getByLabel('Time for White')
				.evaluate((element) => element.getBoundingClientRect().bottom <= window.innerHeight),
		)
		.toBe(true);
	await expect(page.getByRole('button', { name: /roll|move/i })).toHaveCount(0);
	await page.screenshot({ path: testInfo.outputPath('lab-board.png') });
	const apiPaths = mocks.httpUrls
		.map((url) => new URL(url))
		.filter((url) => url.origin === API_ORIGIN)
		.map((url) => url.pathname);
	expect(apiPaths.every((path) => path === '/games' || path === `/games/${gameId}`)).toBe(true);
	expect(
		mocks.httpUrls.every((url) => [APP_ORIGIN, API_ORIGIN].includes(new URL(url).origin)),
	).toBe(true);
	expect(mocks.pageErrors).toEqual([]);
	expect(mocks.consoleErrors).toEqual([]);
});

test('shows the invitation settings but waits for Join before opening the opponent socket', async ({
	page,
}) => {
	const gameId = 'd12b3456-7890-4abc-def0-1234567890ab';
	const token = 'black_dummy_opponent';
	const state = stateFor('ab'.repeat(32), {
		Fischer: { initialSeconds: 600, incrementSeconds: 10 },
	});
	const websocketUrls: string[] = [];
	const seedFrames: Record<string, unknown>[] = [];
	const httpUrls: string[] = [];
	const pageErrors: string[] = [];
	const consoleErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') consoleErrors.push(message.text());
	});
	await page.route(`${API_ORIGIN}/**`, async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		httpUrls.push(request.url());
		if (request.method() === 'OPTIONS') {
			await route.fulfill({ status: 204, headers: corsHeaders });
		} else if (request.method() === 'GET' && url.pathname === `/games/${gameId}`) {
			await route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify(state) });
		} else {
			await route.fulfill({ status: 404, headers: jsonHeaders, body: '{}' });
		}
	});
	await page.routeWebSocket(`${API_ORIGIN.replace('http', 'ws')}/**`, (route) => {
		websocketUrls.push(route.url());
		route.onMessage((message) => {
			if (typeof message !== 'string') return;
			const frame = JSON.parse(message) as Record<string, unknown>;
			seedFrames.push(frame);
			if ('SubmitSeed' in frame)
				route.send(JSON.stringify({ Snapshot: { v: state.version, state } }));
		});
	});

	await page.goto(`/invite/${gameId}#token=${token}&as=black`);
	await expect(page.getByRole('heading', { name: 'A seat is waiting for you.' })).toBeVisible();
	await expect(page.getByText('Agreed game settings')).toBeVisible();
	expect(httpUrls.some((url) => url === `${API_ORIGIN}/games/${gameId}`)).toBe(true);
	expect(httpUrls.every((url) => !url.includes('token='))).toBe(true);
	expect(websocketUrls).toEqual([]);

	await page.getByRole('button', { name: 'Join as Black' }).click();
	await expect(page.getByRole('img', { name: 'Chessboard, Black at the bottom' })).toBeVisible();
	await expect.poll(() => websocketUrls.length).toBeGreaterThan(0);
	await expect.poll(() => seedFrames.length).toBeGreaterThan(0);
	const opponentSocket = new URL(websocketUrls[0]);
	expect(opponentSocket.pathname).toBe(`/games/${gameId}/ws`);
	expect(opponentSocket.searchParams.get('token')).toBe(token);
	expect(opponentSocket.searchParams.get('guest')).toMatch(/^[0-9a-f-]{36}$/i);
	expect(
		seedFrames.every((frame) => Object.keys(frame).length === 1 && 'SubmitSeed' in frame),
	).toBe(true);
	expect(httpUrls.every((url) => [APP_ORIGIN, API_ORIGIN].includes(new URL(url).origin))).toBe(
		true,
	);
	expect(pageErrors).toEqual([]);
	expect(consoleErrors).toEqual([]);
});

test('keeps create and invite layouts usable across viewport sizes and appearance preferences', async ({
	page,
}, testInfo) => {
	const mocks = await installMocks(page);
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('/');
	await expect.poll(() => page.locator('html').getAttribute('data-lab-theme')).toBe('dark');
	const appearance = page.getByLabel('Appearance');
	await appearance.selectOption('system');
	await page.emulateMedia({ colorScheme: 'light' });
	await expect.poll(() => page.locator('html').getAttribute('data-lab-theme')).toBe('light');

	for (const width of [320, 390, 640, 1024, 1440]) {
		await page.setViewportSize({ width, height: width < 700 ? 900 : 960 });
		if (width === 320) await appearance.selectOption('light');
		if (width === 390) await appearance.selectOption('light');
		if (width === 640) await appearance.selectOption('system');
		if (width === 1440) await appearance.selectOption('light');
		await expectNoHorizontalOverflow(page);
		const createButton = page.getByRole('button', { name: 'Create a game' });
		await expect(createButton).toBeVisible();
		const createBox = await createButton.boundingBox();
		expect(createBox?.height).toBeGreaterThanOrEqual(44);
		if (width === 320)
			await page.screenshot({ path: testInfo.outputPath('lab-phone-create.png'), fullPage: true });
		if (width === 1440)
			await page.screenshot({ path: testInfo.outputPath('lab-desktop-create.png') });

		const invitation = await createGame(page);
		if (width === 1440) await appearance.selectOption('dark');
		await expectNoHorizontalOverflow(page);
		const copyButton = page.getByRole('button', { name: 'Copy invitation' });
		const inviteBox = await copyButton.boundingBox();
		expect(inviteBox?.height).toBeGreaterThanOrEqual(44);
		if (width === 320)
			await page.screenshot({ path: testInfo.outputPath('lab-phone-invite.png'), fullPage: true });
		if (width === 1440)
			await page.screenshot({ path: testInfo.outputPath('lab-desktop-invite-dark.png') });
		expect(await invitation.inputValue()).toContain('#token=black_dummy_');
		if (width !== 1440) {
			await page.locator('.lab-brand').click();
			await expect(page.getByRole('button', { name: 'Create a game' })).toBeVisible();
		}
	}
	expect(mocks.postBodies).toHaveLength(5);
	expect(mocks.pageErrors).toEqual([]);
	expect(mocks.consoleErrors).toEqual([]);
});

test('shows safe errors for incompatible creation and expired invitations without opening sockets', async ({
	page,
}) => {
	const websocketUrls: string[] = [];
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	await page.routeWebSocket(`${API_ORIGIN.replace('http', 'ws')}/**`, (route) => {
		websocketUrls.push(route.url());
		route.onMessage(() => {});
	});
	const requests: Array<{ url: string; method: string }> = [];
	page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
	await page.route(`${API_ORIGIN}/**`, async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (request.method() === 'OPTIONS') {
			await route.fulfill({ status: 204, headers: corsHeaders });
		} else if (request.method() === 'POST' && url.pathname === '/games') {
			await route.fulfill({
				status: 201,
				headers: jsonHeaders,
				body: JSON.stringify({
					gameId: 'c12b3456-7890-4abc-def0-1234567890ab',
					commit: 'cd'.repeat(32),
					tokens: [
						{ seat: 'White', token: 'unsafe_white_dummy' },
						{ seat: 'Black', token: 'unsafe_black_dummy' },
					],
					variant: { id: 'classic-3d6', revision: 1 },
					labProtocolVersion: 1,
					provenance: { rulesVersion: RULES_VERSION, diceAlgorithm: 'choice-2x2d6-hmac-sha256-v1' },
				}),
			});
		} else if (request.method() === 'GET') {
			await route.fulfill({ status: 404, headers: jsonHeaders, body: '{}' });
		} else {
			await route.fulfill({ status: 404, headers: jsonHeaders, body: '{}' });
		}
	});
	await page.goto('/');
	await page.getByRole('button', { name: 'Create a game' }).click();
	await expect(page.getByRole('alert')).toContainText("These rules aren't available here.");
	await expect(page.getByLabel('Invitation for your friend')).toHaveCount(0);
	expect(
		requests.filter(({ url, method }) => new URL(url).pathname === '/games' && method === 'POST'),
	).toHaveLength(1);
	expect(websocketUrls).toEqual([]);

	await page.goto('/invite/d12b3456-7890-4abc-def0-1234567890ab#token=expired_dummy&as=white');
	await expect(page.getByRole('heading', { name: 'This game is closed.' })).toBeVisible();
	expect(websocketUrls).toEqual([]);
	expect(requests.every(({ url }) => !new URL(url).pathname.endsWith('/ws'))).toBe(true);
	expect(requests.every(({ url }) => [APP_ORIGIN, API_ORIGIN].includes(new URL(url).origin))).toBe(
		true,
	);
	expect(pageErrors).toEqual([]);
});
