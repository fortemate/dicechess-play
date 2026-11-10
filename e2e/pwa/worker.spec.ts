import { test, expect, type Page } from '@playwright/test';

async function controlled(page: Page, route: string) {
	await page.goto(route);
	await expect
		.poll(() =>
			page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active),
		)
		.toBe(true);
	await page.reload();
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
	expect(
		await page.evaluate(() => new URL(navigator.serviceWorker.controller!.scriptURL).pathname),
	).toBe('/sw.js');
	expect(
		await page.evaluate(
			async () => new URL((await navigator.serviceWorker.getRegistration())!.scope).pathname,
		),
	).toBe('/');
}

for (const route of ['/', '/players/example', '/live/example', '/replay/example']) {
	test(`production worker controls direct route ${route} and serves its offline shell`, async ({
		page,
		context,
	}) => {
		await controlled(page, route);
		await context.setOffline(true);
		await page.reload();
		await expect(page.locator('body')).not.toBeEmpty();
		expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
	});
}

test('fetch data is not cached as navigation and recovers online', async ({ page, context }) => {
	await controlled(page, '/me');
	const read = () => page.evaluate(async () => (await fetch('/__pwa_test__/volatile')).json());
	const first = await read();
	await context.setOffline(true);
	expect(
		await read().then(
			() => false,
			() => true,
		),
	).toBe(true);
	await context.setOffline(false);
	expect((await read()).value).toBeGreaterThan(first.value);
});

test('a new production build waits until the active practice game ends', async ({
	page,
	request,
}) => {
	await controlled(page, '/practice');
	await page.getByRole('button', { name: 'Start game', exact: true }).click();
	await expect(page.locator('cg-board')).toBeVisible();
	await page.evaluate(() => {
		sessionStorage.setItem('pwa-reload-count', '0');
		window.addEventListener('beforeunload', () =>
			sessionStorage.setItem(
				'pwa-reload-count',
				String(Number(sessionStorage.getItem('pwa-reload-count')) + 1),
			),
		);
	});
	await request.post('/__pwa_test__/publish');
	await page.evaluate(async () => {
		await (await navigator.serviceWorker.getRegistration())!.update();
	});
	await expect
		.poll(() =>
			page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting),
		)
		.toBe(true);
	await page.waitForTimeout(1500);
	expect(await page.evaluate(() => sessionStorage.getItem('pwa-reload-count'))).toBe('0');
	await page.getByRole('button', { name: 'Resign', exact: true }).click();
	await page
		.getByRole('button', { name: 'Click again to confirm resignation', exact: true })
		.click();
	await expect
		.poll(() => page.evaluate(() => sessionStorage.getItem('pwa-reload-count')).catch(() => null))
		.toBe('1');
	await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeVisible();
	await expect
		.poll(() =>
			page
				.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)
				.catch(() => true),
		)
		.toBe(false);
});
