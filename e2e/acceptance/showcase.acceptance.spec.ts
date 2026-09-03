import { test, expect } from '@playwright/test';
import * as path from 'node:path';

const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/acceptance/evidence');

test.describe('Showcase Acceptance: Browser Contention, Seating, Layout & Reopen', () => {
	test('Contention race, multi-browser seating, late convergence, and automatic reopen', async ({
		browser,
	}, testInfo) => {
		const isMobile = testInfo.project.name === 'mobile';
		const prefix = isMobile ? 'showcase-mobile' : 'showcase-desktop';

		// 1. Two separate browser contexts representing distinct visitors
		const context1 = await browser.newContext();
		const context2 = await browser.newContext();

		const page1 = await context1.newPage();
		const page2 = await context2.newPage();

		page1.on('console', (msg) => console.log(`[P1 CONSOLE] ${msg.text()}`));
		page2.on('console', (msg) => console.log(`[P2 CONSOLE] ${msg.text()}`));
		page1.on('requestfailed', (req) => console.log(`[P1 REQ FAILED] ${req.url()}: ${req.failure()?.errorText}`));
		page2.on('requestfailed', (req) => console.log(`[P2 REQ FAILED] ${req.url()}: ${req.failure()?.errorText}`));
		page1.on('response', (res) => {
			if (res.status() >= 400) console.log(`[P1 HTTP ${res.status()}] ${res.url()}`);
		});
		page2.on('response', (res) => {
			if (res.status() >= 400) console.log(`[P2 HTTP ${res.status()}] ${res.url()}`);
		});

		await page1.goto('/');
		await page2.goto('/');

		// Wait for both to show Open state
		const claimBtn1 = page1.locator('button:has-text("Claim White Seat"), button:has-text("Claim Black Seat")');
		const claimBtn2 = page2.locator('button:has-text("Claim White Seat"), button:has-text("Claim Black Seat")');

		await expect(claimBtn1).toBeVisible({ timeout: 15_000 });
		await expect(claimBtn2).toBeVisible({ timeout: 15_000 });

		// Geometry assertion in open state
		const board1 = page1.locator('[data-surface="showcase"] cg-board');
		await expect(board1).toBeVisible();
		const openBox = await board1.boundingBox();
		expect(openBox).not.toBeNull();
		if (openBox) {
			expect(openBox.width).toBeGreaterThan(150);
			expect(Math.abs(openBox.width - openBox.height)).toBeLessThan(3);
		}

		// Save screenshot of open state
		await page1.screenshot({ path: path.join(EVIDENCE_DIR, `${prefix}-open.png`) });

		// 2. Race: Both users attempt to claim the seat
		await Promise.all([claimBtn1.click(), claimBtn2.click()]);

		// Exactly one wins (Live player), one loses (Spectator)
		// Player view has "Resign Game" button
		// Spectator view has "In play" badge and alternative play link
		let playerPage = page1;
		let spectatorPage = page2;

		const p1IsPlayer = await Promise.race([
			page1.locator('button:has-text("Resign Game")').waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false),
			page2.locator('button:has-text("Resign Game")').waitFor({ state: 'visible', timeout: 8_000 }).then(() => false).catch(() => true),
		]);

		if (!p1IsPlayer) {
			playerPage = page2;
			spectatorPage = page1;
		}

		const resignBtn = playerPage.locator('button:has-text("Resign Game")');
		await expect(resignBtn).toBeVisible({ timeout: 10_000 });

		// Spectator view assertions
		const spectatorBadge = spectatorPage.locator('[data-surface="showcase"]').getByText('In play');
		await expect(spectatorBadge).toBeVisible({ timeout: 10_000 });
		await expect(spectatorPage.locator('button:has-text("Resign Game")')).toHaveCount(0);

		// Geometry stability in live player state (Zero-CLS check)
		const livePlayerBoard = playerPage.locator('[data-surface="showcase"] cg-board');
		const liveBox = await livePlayerBoard.boundingBox();
		expect(liveBox).not.toBeNull();
		if (openBox && liveBox) {
			// Board size must match openBox closely without layout shift
			expect(Math.abs(liveBox.width - openBox.width)).toBeLessThan(3);
			expect(Math.abs(liveBox.height - openBox.height)).toBeLessThan(3);
		}

		// Capture live player and spectator screenshots
		await playerPage.screenshot({ path: path.join(EVIDENCE_DIR, `${prefix}-live-player.png`) });
		await spectatorPage.screenshot({ path: path.join(EVIDENCE_DIR, `${prefix}-live-spectator.png`) });

		// History control check: Move history controls must never render on showcase
		await expect(playerPage.locator('[data-surface="showcase"] [data-testid="move-history"]')).toHaveCount(0);
		await expect(spectatorPage.locator('[data-surface="showcase"] [data-testid="move-history"]')).toHaveCount(0);

		// 3. Late visitor convergence: 3rd browser context arrives while game is live
		const context3 = await browser.newContext();
		const page3 = await context3.newPage();
		page3.on('console', (msg) => console.log(`[P3 CONSOLE] ${msg.text()}`));
		page3.on('requestfailed', (req) => console.log(`[P3 REQ FAILED] ${req.url()}: ${req.failure()?.errorText}`));
		page3.on('response', (res) => {
			if (res.status() >= 400) console.log(`[P3 HTTP ${res.status()}] ${res.url()}`);
		});
		await page3.goto('/');

		// Late visitor immediately converges into spectator mode
		await expect(page3.locator('[data-surface="showcase"]').getByText('In play')).toBeVisible({ timeout: 10_000 });
		await expect(page3.locator('button:has-text("Resign Game")')).toHaveCount(0);

		// 4. Conclude game and observe automatic transition across all clients
		await playerPage.waitForTimeout(1000);
		await resignBtn.click();

		// Save screenshot of concluded state
		await playerPage.screenshot({ path: path.join(EVIDENCE_DIR, `${prefix}-concluded.png`) });

		// Click "Reset table now" button if available to accelerate reopening
		const resetBtn = playerPage.locator('button:has-text("Reset table now")');
		try {
			await resetBtn.waitFor({ state: 'visible', timeout: 3000 });
			await resetBtn.click();
		} catch {}

		// 5. Automatic reopening without manual page reload across all clients
		const reopenedClaim1 = playerPage.locator('button:has-text("Claim White Seat"), button:has-text("Claim Black Seat")');
		const reopenedClaim2 = spectatorPage.locator('button:has-text("Claim White Seat"), button:has-text("Claim Black Seat")');
		const reopenedClaim3 = page3.locator('button:has-text("Claim White Seat"), button:has-text("Claim Black Seat")');

		await Promise.all([
			expect(reopenedClaim1).toBeVisible({ timeout: 35_000 }),
			expect(reopenedClaim2).toBeVisible({ timeout: 35_000 }),
			expect(reopenedClaim3).toBeVisible({ timeout: 35_000 }),
		]);

		// Cleanup
		await context1.close();
		await context2.close();
		await context3.close();
	});

	test('Surface Regressions: /play, /practice, /lobby, /licenses', async ({ page }) => {
		// 1. /play landing hub
		await page.goto('/play');
		await expect(page.getByRole('heading', { name: 'Play', level: 2 })).toBeVisible({ timeout: 15_000 });

		// 2. /practice board
		await page.goto('/practice');
		await expect(page.getByRole('heading', { name: 'Practice game', level: 2 })).toBeVisible({ timeout: 15_000 });
		await page.click('button:has-text("Start game")');
		await expect(page.locator('cg-board')).toBeVisible({ timeout: 15_000 });

		// 3. /lobby
		await page.goto('/lobby');
		await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });

		// 4. /licenses
		await page.goto('/licenses');
		await expect(page.getByRole('heading', { name: /License|Open source/i })).toBeVisible({ timeout: 15_000 });
	});
});
