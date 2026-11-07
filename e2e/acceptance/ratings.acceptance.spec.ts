/* Built-bundle ratings acceptance uses synthetic public contracts only. All external traffic is
 * blocked; the reserved staging origin is fulfilled locally, never contacted over the network. */
import { expect, test, type Page } from '@playwright/test';
import type { GameHistory } from '../../src/lib/live/historyApi';
import type { GameRatingChange } from '../../src/lib/live/ratingApi';
import type { Me } from '../../src/lib/auth/authApi';
import type {
	LeaderRow,
	Leaderboard,
	PlayerProfile,
	RatingSnapshot,
	RatingSnapshotSummary,
} from '../../src/lib/leaderboard/leaderboardApi';

const API_ORIGIN = 'https://ratings-staging.invalid';
const cutoff = '2026-01-02T03:04:05Z';
const computedAt = '2026-01-02T04:05:06Z';
const leaders: LeaderRow[] = [
	{
		rank: 1,
		kind: 'bot',
		team: 'Example',
		name: 'Steady',
		rating: 1700,
		rd: 25,
		onLadder: false,
		games: 12,
		wins: 7,
		draws: 2,
		losses: 3,
		algorithm: 'glicko2',
		domain: 'competitive',
		epoch: 9,
		orderingValue: 1650,
		orderingRule: 'rating-minus-2rd',
		ciLow: 1651,
		ciHigh: 1749,
	},
	{
		rank: 2,
		kind: 'player',
		team: null,
		name: 'ExamplePlayer',
		rating: 1800,
		rd: 100,
		onLadder: false,
		games: 10,
		wins: 4,
		draws: 2,
		losses: 4,
		algorithm: 'glicko2',
		domain: 'competitive',
		epoch: 9,
		orderingValue: 1600,
		orderingRule: 'rating-minus-2rd',
		ciLow: 1604,
		ciHigh: 1996,
	},
];
const current: Leaderboard = { category: 'blitz', epoch: 9, cutoff, computedAt, leaders };
const summary: RatingSnapshotSummary = {
	category: 'blitz',
	epoch: 7,
	anchorSetVersion: 'synthetic-v1',
	cutoff,
	computedAt,
	isCurrent: false,
	entryCount: 1,
};
const historical: RatingSnapshot = {
	...summary,
	leaders: [
		{
			...leaders[0],
			name: 'Archive',
			epoch: 7,
			rating: 1600,
			orderingValue: 1550,
			ciLow: 1551,
			ciHigh: 1649,
		},
	],
};
const player: PlayerProfile = {
	nickname: 'ExamplePlayer',
	rating: 1800,
	rd: 100,
	provisional: false,
	games: 10,
	wins: 4,
	draws: 2,
	losses: 4,
	totalGames: 13,
	ratings: [
		{
			category: 'blitz',
			rating: 1800,
			rd: 100,
			provisional: false,
			games: 10,
			wins: 4,
			draws: 2,
			losses: 4,
		},
	],
	training: [
		{
			category: 'bullet',
			rating: 1234,
			rd: 125,
			provisional: true,
			games: 3,
			wins: 2,
			draws: 0,
			losses: 1,
			ciLow: 1001,
			ciHigh: 1467,
			intervalCalculation: 'synthetic-interval',
			domain: 'training',
			algorithm: 'glicko2',
			algorithmVersion: 'synthetic-v2',
			epoch: 8,
			cutoff: null,
			computedAt: null,
		},
	],
	opponents: [],
	recent: [],
};

const archivedGame: GameHistory = {
	gameId: 'training-example',
	players: {
		white: { kind: 'Human', name: 'ExamplePlayer' },
		black: { kind: 'Bot', name: 'Example Bot' },
	},
	rated: false,
	timeControl: { SuddenDeath: { initialSeconds: 600 } },
	result: 1,
	termination: 'resign',
	finishedAt: '2026-01-02T03:04:05Z',
	initialDfen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 -',
	turns: [],
	fairness: { commit: 'synthetic-public-commit', seed: null, clientSeeds: null },
};
const trainingResult: GameRatingChange = {
	gameId: archivedGame.gameId,
	applied: true,
	outcome: 'applied',
	ratingDomain: 'training',
	white: { before: 1234, after: 1246 },
	black: null,
	trainingReference: {
		source: 'anchor',
		anchorSetVersion: 'synthetic-anchor-v3',
		epoch: 6,
		rating: 1375,
		rd: 40,
	},
};
const casualResult: GameRatingChange = {
	gameId: 'casual-example',
	applied: false,
	outcome: 'casual',
	ratingDomain: 'casual',
	white: null,
	black: null,
};

const account: Me = {
	id: '00000000-0000-4000-8000-000000000001',
	nickname: 'ExamplePlayer',
	rating: 1500,
	rd: 350,
	provisional: true,
	games: 0,
	admin: false,
	ratings: [
		{
			category: 'bullet',
			rating: 1400,
			rd: 50,
			provisional: false,
			games: 12,
			wins: 7,
			draws: 1,
			losses: 4,
		},
	],
};

async function stubApi(page: Page, historyStatuses: number[] = [], signedIn = false) {
	const requests: string[] = [];
	await page.route('**/*', async (route) => {
		const url = new URL(route.request().url());
		if (url.origin === 'http://localhost:4175') return route.continue();
		if (url.origin !== API_ORIGIN) return route.abort('blockedbyclient');
		requests.push(url.pathname + url.search);
		let status = 200;
		let body: unknown;
		if (url.pathname === '/leaderboard') body = current;
		else if (url.pathname === '/leaderboard/snapshots') {
			status = historyStatuses.shift() ?? 200;
			body = [summary];
		} else if (url.pathname.startsWith('/leaderboard/snapshots/blitz/7/')) body = historical;
		else if (url.pathname === '/players/by-nickname/ExamplePlayer') body = player;
		else if (signedIn && url.pathname === '/auth/me') body = account;
		else if (signedIn && url.pathname === '/auth/me/guests') body = { guests: [] };
		else if (signedIn && url.pathname === '/me/opponents') body = { opponents: [] };
		else if (/^\/games\/(training-example|casual-example)\/history$/.test(url.pathname))
			body = { ...archivedGame, gameId: url.pathname.split('/')[2] };
		else if (url.pathname === '/games/training-example/rating') body = trainingResult;
		else if (url.pathname === '/games/casual-example/rating') body = casualResult;
		else if (/^\/games\/(training-example|casual-example)\/continuation$/.test(url.pathname))
			body = { sourceGameId: url.pathname.split('/')[2], serverNow: computedAt, phase: 'waiting' };
		else {
			status = 401;
			body = {};
		}
		await route.fulfill({
			status,
			contentType: 'application/json',
			body: JSON.stringify(body),
			headers: {
				'access-control-allow-origin': 'http://localhost:4175',
				'access-control-allow-credentials': 'true',
			},
		});
	});
	return requests;
}

async function expectNoPageOverflow(page: Page) {
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true,
	);
}

test('current ordering and exact earlier-epoch history remain distinct', async ({ page }, info) => {
	const requests = await stubApi(page);
	await page.goto('/leaderboard');
	const rows = page.locator('tbody tr');
	await expect(rows).toHaveCount(2);
	await expect(rows.nth(0)).toContainText('Example Steady');
	await expect(rows.nth(0)).toContainText('1,650');
	await expect(rows.nth(1)).toContainText('1,800');
	await expect(rows.nth(1)).toContainText('1,600');
	await expect(rows.nth(0)).toContainText('Not in automatic ladder');
	await expect(rows.nth(0)).not.toContainText(/frozen/i);
	await expectNoPageOverflow(page);
	await page.screenshot({
		path: info.outputPath(`ratings-${info.project.name}-current.png`),
		fullPage: true,
	});

	const historyButton = page.getByRole('button', { name: 'Published history', exact: true });
	await historyButton.focus();
	await expect(historyButton).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(historyButton).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText('Historical snapshot · Epoch 7', { exact: true })).toBeVisible();
	await expect(page.getByText('Earlier epoch', { exact: true })).toBeVisible();
	await expect(page.getByText('Example Archive', { exact: true })).toBeVisible();
	await expect(page.getByText('Example Steady', { exact: true })).toHaveCount(0);
	const link = page.getByRole('link', { name: 'Link to this snapshot' });
	const href = await link.getAttribute('href');
	expect(href).not.toBeNull();
	const target = new URL(href!, 'http://localhost:4175');
	expect(Object.fromEntries(target.searchParams)).toEqual({
		view: 'history',
		category: 'blitz',
		epoch: '7',
		cutoff,
	});
	await expectNoPageOverflow(page);
	await page.screenshot({
		path: info.outputPath(`ratings-${info.project.name}-history.png`),
		fullPage: true,
	});
	await page.goto(target.pathname + target.search);
	await expect(page.getByText('Historical snapshot · Epoch 7', { exact: true })).toBeVisible();
	await expect(page.getByText('Earlier epoch', { exact: true })).toBeVisible();
	expect(
		requests.filter(
			(request) => request === `/leaderboard/snapshots/blitz/7/${encodeURIComponent(cutoff)}`,
		).length,
	).toBeGreaterThanOrEqual(2);
});

test('profile integrates sparse training estimates separately from competitive ratings', async ({
	page,
}, info) => {
	await stubApi(page);
	await page.goto('/players/ExamplePlayer');
	await expect(page.getByRole('heading', { name: 'ExamplePlayer', exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Training vs bots', exact: true })).toBeVisible();
	const training = page.getByRole('list', { name: 'Training vs bots' });
	const rows = training.getByRole('listitem');
	await expect(rows).toHaveCount(3);
	await expect(rows.nth(0)).toContainText('Bullet');
	await expect(rows.nth(0)).toContainText('1,234');
	for (const [index, speed] of [
		[1, 'Blitz'],
		[2, 'Rapid'],
	] as const) {
		await expect(rows.nth(index)).toContainText(speed);
		await expect(rows.nth(index)).toContainText('No training estimate at this speed.');
		await expect(rows.nth(index)).not.toContainText('1,234');
		await expect(rows.nth(index)).not.toContainText('1,500');
	}
	await expect(page.getByText('1,800', { exact: true })).toBeVisible();
	await expect(training).not.toContainText('1,800');
	await expect(
		page.getByText(/Training estimates and records are separate from competitive standings/),
	).toBeVisible();
	await expectNoPageOverflow(page);
	await page.screenshot({
		path: info.outputPath(`ratings-${info.project.name}-profile.png`),
		fullPage: true,
	});
	await training.locator('..').scrollIntoViewIfNeeded();
	await page.screenshot({
		path: info.outputPath(`ratings-${info.project.name}-training-detail.png`),
	});
});

test('history distinguishes unsupported server from a retryable failure', async ({
	page,
}, info) => {
	await stubApi(page, [404, 503, 200]);
	await page.goto('/leaderboard?view=history&category=blitz');
	await expect(
		page.getByText('Published history is not available on this server yet.'),
	).toBeVisible();
	await expect(page.getByText('No published snapshots for this speed yet.')).toHaveCount(0);
	await page.reload();
	await expect(page.getByRole('alert')).toContainText(
		'Published history is unavailable right now. Try again.',
	);
	await page.screenshot({
		path: info.outputPath(`ratings-${info.project.name}-history-error.png`),
		fullPage: true,
	});
	await page.getByRole('button', { name: 'Retry', exact: true }).click();
	await expect(page.getByText('Historical snapshot · Epoch 7', { exact: true })).toBeVisible();
	await expect(page.getByRole('alert')).toHaveCount(0);
});

test('public replay shows the training delta and captured reference at its recorded speed', async ({
	page,
}, info) => {
	await stubApi(page);
	await page.goto('/replay/training-example');
	await expect(page.getByText('Training', { exact: true })).toBeVisible();
	await expect(page.getByText('Rapid', { exact: true })).toBeVisible();
	const result = page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: 'Game ratings', exact: true }) })
		.last();
	await expect(result.getByText('Training rating', { exact: true })).toBeVisible();
	await expect(result).toContainText('1234 → 1246');
	await expect(result).toContainText('(+12)');
	await expect(result).toContainText(
		'Training rating is separate from competitive rating and uses the bot reference recorded for this game.',
	);
	await expect(result).toContainText('Captured anchor reference: rating 1,375, RD 40.');
	await expect(result).toContainText('Anchor set: synthetic-anchor-v3.');
	await expect(result).toContainText('Reference epoch: 6.');
	await expect(result.getByText('Competitive rating', { exact: true })).toHaveCount(0);
	await expect(result.getByText('Rating updating…', { exact: true })).toHaveCount(0);
	await expectNoPageOverflow(page);
	await result.scrollIntoViewIfNeeded();
	await page.screenshot({
		path: info.outputPath(`ratings-${info.project.name}-replay-training.png`),
	});
});

test('explicit casual replay is terminal even when applied is false', async ({ page }, info) => {
	await page.clock.install();
	const requests = await stubApi(page);
	await page.goto('/replay/casual-example');
	await expect(page.getByText('Casual game', { exact: true })).toBeVisible();
	await expect(
		page.getByText('Casual games do not change competitive or training ratings.', { exact: true }),
	).toBeVisible();
	await expect(page.getByText('Rating unchanged.', { exact: true })).toHaveCount(2);
	await expect(page.getByText('Rating updating…', { exact: true })).toHaveCount(0);
	await page.clock.fastForward(6_000);
	expect(requests.filter((request) => request === '/games/casual-example/rating')).toHaveLength(1);
	const result = page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: 'Game ratings', exact: true }) })
		.last();
	await result.scrollIntoViewIfNeeded();
	await page.screenshot({
		path: info.outputPath(`ratings-${info.project.name}-replay-casual.png`),
	});
});

test('signed-in account preserves sparse competitive speeds without a default rating', async ({
	page,
}, info) => {
	await stubApi(page, [], true);
	await page.goto('/me');
	const onboarding = page.getByRole('dialog', { name: 'You’re signed in' });
	await expect(onboarding).toBeVisible();
	await onboarding.getByRole('button', { name: 'Later', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(
		page.getByRole('heading', { name: 'Competitive ratings', exact: true }),
	).toBeVisible();
	const link = page.getByRole('link', { name: 'View public profile', exact: true });
	await expect(link).toHaveAttribute('href', '/players/ExamplePlayer');
	const ratings = page.getByRole('list').filter({ has: page.getByText('1,400', { exact: true }) });
	const rows = ratings.getByRole('listitem');
	await expect(rows).toHaveCount(3);
	await expect(rows.nth(0)).toContainText('Bullet');
	await expect(rows.nth(0)).toContainText('95% interval 1,302–1,498');
	await expect(rows.nth(0).getByText('provisional', { exact: true })).toHaveCount(0);
	for (const [index, speed] of [
		[1, 'Blitz'],
		[2, 'Rapid'],
	] as const) {
		await expect(rows.nth(index)).toContainText(speed);
		await expect(rows.nth(index).getByLabel('Unrated at this speed')).toBeVisible();
		await expect(rows.nth(index)).toContainText('no rated games at this speed');
	}
	await expect(page.getByText(/^1,?500$/)).toHaveCount(0);
	await expectNoPageOverflow(page);
	await ratings.scrollIntoViewIfNeeded();
	await page.screenshot({ path: info.outputPath(`ratings-${info.project.name}-account.png`) });
});
