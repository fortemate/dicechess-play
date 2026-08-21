import { test, expect, type Page, type Locator } from '@playwright/test';

// The one thing the site must be able to do: play a move. #185 shipped a build where it could not
// — rolldown miscompiled the Scala.js engine, `DiceChess.applyMove` returned undefined for every
// move, and both stores read that as "illegal move" and snapped the piece back. Every unit test
// passed, because none of them touch the bundle.
//
// So this runs a real turn against the built dist: pick a piece, play a legal move, assert the
// game's history counter advanced. It is deliberately blind to which colour, opponent or dice the
// game hands out — it hunts for a movable piece instead of assuming one.

/** Console errors that mean the engine itself refused to work — the #185 signature. */
const ENGINE_FAILURE = /Engine rejected|Failed to register opening-book/;

/** The `<current> / <max>` history counter under the board, keyed off its nav row. */
function moveCounter(page: Page): Locator {
	return page.locator('div:has(> button[aria-label="First move"]) > span');
}

/** A piece's identity on the board: `"white knight"` at chessground's `translate(...)` offset. */
async function piecesOnBoard(page: Page): Promise<string[]> {
	return page.locator('cg-board piece').evaluateAll((nodes) =>
		nodes.map((node) => {
			const el = node as HTMLElement;
			return `${el.className}@${el.style.transform}`;
		}),
	);
}

/**
 * Plays one move, and reports whether the engine accepted it.
 *
 * Select and move have to be one attempt, retried as a unit. Chessground only renders
 * `square.move-dest` once a movable piece is selected, so finding a movable piece means clicking
 * pieces until dests appear — but the bot moves on its own clock, and its re-render drops the
 * selection and leaves the dest squares behind as hidden nodes. Selecting in one step and moving in
 * a later one therefore races the bot: the dest resolves, then never becomes clickable.
 *
 * The turn may also belong to the bot, or the roll may have handed this seat nothing playable (the
 * store then auto-passes) — so a sweep that finds nothing is normal and just retries.
 */
async function tryPlayOneMove(page: Page): Promise<boolean> {
	const counterBefore = await moveCounter(page).innerText();

	for (const piece of await page.locator('cg-board piece').all()) {
		// Short per-click bound: against a remote target this sweep is up to 32 round trips, and one
		// unactionable piece must not eat the budget.
		await piece.click({ force: true, timeout: 2_000 }).catch(() => {});

		// `:visible` matters — a stale dest left over from a selection the bot's re-render dropped
		// still matches the class and would hang the click until the test timeout.
		const dest = page.locator('cg-board square.move-dest:visible').first();
		if (!(await dest.isVisible().catch(() => false))) continue;
		if (
			!(await dest.click({ timeout: 2_000 }).then(
				() => true,
				() => false,
			))
		)
			continue;

		// The move counter is the honest signal that the engine took it. Watching the piece is not:
		// on a rejected move the store leaves the FEN untouched, so nothing re-renders and
		// chessground keeps the piece on the square it was dropped on — a build that cannot move at
		// all still looks like a successful move until something else forces a render.
		const applied = await expect
			.poll(async () => moveCounter(page).innerText(), { timeout: 3_000 })
			.not.toEqual(counterBefore)
			.then(
				() => true,
				() => false,
			);
		if (applied) return true;
	}
	return false;
}

test('the built bundle can play a move', async ({ page }) => {
	const engineFailures: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' && ENGINE_FAILURE.test(message.text())) {
			engineFailures.push(message.text());
		}
	});

	await page.goto('/practice');
	await page.getByRole('button', { name: 'Start game' }).click();
	await expect(page.locator('cg-board')).toBeVisible();

	const before = await piecesOnBoard(page);
	const deadline = Date.now() + 60_000;
	let played = false;
	while (!played && Date.now() < deadline) {
		played = await tryPlayOneMove(page);
		if (!played) await page.waitForTimeout(500); // let the bot's turn and the next roll land
	}

	// On a bundle that cannot apply moves this is the assertion that fires, so it carries the
	// diagnosis: the console errors are the difference between "engine is broken" and "the test
	// never got a turn".
	expect(
		played,
		`no move was accepted in 60s; engine console errors: ${JSON.stringify(engineFailures)}`,
	).toBe(true);
	expect(await piecesOnBoard(page)).not.toEqual(before);
	expect(engineFailures, 'engine reported failures in the console').toEqual([]);
});

// `/me/bots` is session-gated, so this deploy guard covers its safe unauthenticated states without
// manufacturing a production cookie. This catches broken route chunks and proves neither a guest
// nor an auth-disabled build fires an owner API call; the authenticated list has a deterministic
// route test for its exact credentialed wire.
test('the built bundle opens My bots safely without owner authentication', async ({ page }) => {
	const errors: string[] = [];
	const ownerRequests: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('request', (request) => {
		if (
			request.resourceType() === 'fetch' &&
			new URL(request.url()).pathname.startsWith('/me/bots')
		)
			ownerRequests.push(request.url());
	});

	await page.goto('/me/bots');
	await expect(page.getByRole('heading', { name: 'My bots' })).toBeVisible();
	await expect(
		page.getByText(/Sign in to claim and manage your own bots.|Bot management is unavailable/),
	).toBeVisible();

	expect(errors).toEqual([]);
	expect(ownerRequests).toEqual([]);
});
