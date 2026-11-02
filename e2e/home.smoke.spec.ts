import { expect, test } from '@playwright/test';

test('the TV storefront shows a real move, links to its store listing and opens Play', async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 700 });
	await page.goto('/');
	await expect(
		page.getByRole('heading', { name: 'Dice Chess for Fire TV', level: 1 }),
	).toBeVisible();
	const screenshot = page.getByRole('figure').getByRole('img');
	await expect(screenshot).toBeVisible();
	await expect
		.poll(() => screenshot.evaluate((img: HTMLImageElement) => img.naturalWidth))
		.toBeGreaterThan(0);
	await expect(page.locator('figcaption')).toContainText('On the board Black');
	for (const link of await page.getByRole('link', { name: 'Get it on Amazon Appstore' }).all()) {
		await expect(link).toHaveAttribute('href', 'https://www.amazon.com/dp/B0HL6K9N47/');
	}
	await expect(page.getByRole('link', { name: 'Get it on Amazon Appstore' }).first()).toBeVisible();
	await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
	await page.getByRole('link', { name: 'Play in browser' }).click();
	await expect(page).toHaveURL(/\/play$/);
	await expect(page.getByRole('heading', { name: 'Play', exact: true })).toBeVisible();
	await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
});

test('an installed game using the old launch URL starts at the Play hub', async ({ page }) => {
	// Headless Chromium ignores display-mode in CDP media emulation. Supply just that
	// installed-window signal and let the built app perform the navigation itself.
	await page.addInitScript(() => {
		const matchMedia = window.matchMedia.bind(window);
		window.matchMedia = (query) =>
			matchMedia(query === '(display-mode: standalone)' ? 'all' : query);
	});
	await page.goto('/');
	await expect(page).toHaveURL(/\/play$/);
	await expect(page.getByRole('heading', { name: 'Play', exact: true })).toBeVisible();
	await page.getByRole('link', { name: 'Fortemate', exact: true }).click();
	await expect(
		page.getByRole('heading', { name: 'Dice Chess for Fire TV', level: 1 }),
	).toBeVisible();
});
