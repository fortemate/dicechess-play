import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import BotChallengePanel from './BotChallengePanel.svelte';
import { PlayBotError } from '$lib/catalog/catalogApi';
import { preferencesStore } from '$lib/preferencesStore.svelte';

// wakeBot and playBot are faked — click→wake→panel and the start() config flow are the parts
// worth unit testing here. Asserting *where* window.location.href ends up isn't (no component in
// this codebase unit-tests navigation targets; the lobby's equivalent goToBoard has none either)
// — that path is verified in the browser instead, per the project's UI-flow-change convention.
// The unmount-guard test below only asserts navigation does NOT fire once destroyed, which needs
// no real navigation target.
const wakeBotMock = vi.fn();
const playBotMock = vi.fn();
vi.mock('$lib/catalog/catalogApi', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/catalog/catalogApi')>();
	return {
		...actual,
		wakeBot: (team: string, name: string) => wakeBotMock(team, name),
		playBot: (req: unknown) => playBotMock(req),
	};
});

// The nested RatedChoice reads the auth store to decide whether rated play may be offered at all.
// Defaulting the fake to 'loading' keeps every pre-#279 test in this file on exactly the path it
// used to take (no choice rendered, casual requested).
const auth = vi.hoisted(() => ({
	authStore: {
		status: 'loading' as 'loading' | 'signed-in' | 'signed-out' | 'unavailable',
		canSignIn: true,
		signIn: vi.fn(),
	},
}));
vi.mock('$lib/authStore.svelte', () => auth);

describe('BotChallengePanel', () => {
	beforeEach(() => {
		wakeBotMock.mockReset();
		playBotMock.mockReset();
		auth.authStore.status = 'loading';
		// preferencesStore is a real module-level singleton, so a value one test persists
		// (#212) would otherwise leak into every test that runs after it in this file.
		preferencesStore.setBotChallengeRated(false);
		preferencesStore.setBotChallengeTimeControl('5 + 5');
		preferencesStore.setBotChallengeColor('random');
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('starts idle with a Play button', () => {
		const { getByRole } = render(BotChallengePanel, { team: 'acme', name: 'alice' });
		expect(getByRole('button', { name: 'Play →' })).toBeTruthy();
	});

	it('clicking Play wakes the bot and shows the config panel once it answers', async () => {
		wakeBotMock.mockResolvedValue({ alive: true, busy: false });
		const { getByRole, findByRole } = render(BotChallengePanel, { team: 'acme', name: 'alice' });
		await fireEvent.click(getByRole('button', { name: 'Play →' }));
		expect(wakeBotMock).toHaveBeenCalledWith('acme', 'alice');
		expect(await findByRole('button', { name: 'Start game' })).toBeTruthy();
	});

	// #279 made rated the player's choice. The two tests below pin both halves of that: a visitor who
	// cannot play rated never asks for it, and one who can gets what they picked all the way into the
	// request — the gap this PR closed was a server that accepted `rated` and a client that never sent it.
	it('asks for a casual game when the visitor is not signed in, offering no choice', async () => {
		auth.authStore.status = 'signed-out';
		wakeBotMock.mockResolvedValue({ alive: true, busy: false });
		playBotMock.mockResolvedValue({ gameId: 'g1', token: 't1', seat: 'White' });
		vi.stubGlobal('location', { href: 'about:blank', origin: window.location.origin });
		const { getByRole, findByRole, queryByRole } = render(BotChallengePanel, {
			team: 'acme',
			name: 'alice',
		});
		await fireEvent.click(getByRole('button', { name: 'Play →' }));
		await fireEvent.click(await findByRole('button', { name: 'Start game' }));
		expect(queryByRole('radio', { name: 'Rated' })).toBeNull();
		expect(playBotMock).toHaveBeenCalledWith(expect.objectContaining({ rated: false }));
	});

	it('sends rated: true once a signed-in account picks Rated', async () => {
		auth.authStore.status = 'signed-in';
		wakeBotMock.mockResolvedValue({ alive: true, busy: false });
		playBotMock.mockResolvedValue({ gameId: 'g1', token: 't1', seat: 'White' });
		vi.stubGlobal('location', { href: 'about:blank', origin: window.location.origin });
		const { getByRole, findByRole } = render(BotChallengePanel, { team: 'acme', name: 'alice' });
		await fireEvent.click(getByRole('button', { name: 'Play →' }));
		await fireEvent.click(await findByRole('radio', { name: 'Rated' }));
		await fireEvent.click(getByRole('button', { name: 'Start game' }));
		expect(playBotMock).toHaveBeenCalledWith(expect.objectContaining({ rated: true }));
	});

	// #219: the wake handshake takes seconds against a scaled-to-zero bot, and the card used to
	// replace the button with a line of prose for the whole wait — it read as a dead click. The
	// progress now lives ON the button, which stays put and stays disabled.
	it('shows wake progress on the button itself instead of removing it', async () => {
		let answerWake!: (result: { alive: boolean; busy: boolean }) => void;
		wakeBotMock.mockReturnValue(
			new Promise((resolve) => {
				answerWake = resolve;
			}),
		);
		const { getByRole, findByRole } = render(BotChallengePanel, { team: 'acme', name: 'alice' });
		await fireEvent.click(getByRole('button', { name: 'Play →' }));

		const waking = await findByRole('button', { name: 'Waking the bot…' });
		expect((waking as HTMLButtonElement).disabled).toBe(true);
		expect(waking.getAttribute('aria-busy')).toBe('true');

		answerWake({ alive: true, busy: false });
		expect(await findByRole('button', { name: 'Start game' })).toBeTruthy();
	});

	// A duplicate wake would let a late first answer overwrite a later one. `disabled` alone does not
	// close that: the two clicks below are dispatched back-to-back WITHOUT awaiting in between, so
	// the second one reaches the handler before Svelte has flushed the disabled attribute — exactly
	// what an impatient double-click does. Only the in-handler phase guard stops it.
	it('ignores a second click that lands before the button is flushed as disabled', async () => {
		let answerWake!: (result: { alive: boolean; busy: boolean }) => void;
		wakeBotMock.mockReturnValue(
			new Promise((resolve) => {
				answerWake = resolve;
			}),
		);
		const { getByRole, findByRole } = render(BotChallengePanel, { team: 'acme', name: 'alice' });
		const button = getByRole('button', { name: 'Play →' });
		fireEvent.click(button);
		fireEvent.click(button);
		await Promise.resolve();

		expect(wakeBotMock).toHaveBeenCalledTimes(1);

		answerWake({ alive: true, busy: false });
		expect(await findByRole('button', { name: 'Start game' })).toBeTruthy();
	});

	it('shows a retry state when the bot does not answer', async () => {
		// Covers both wakeBot outcomes the component treats identically: a resolved alive:false
		// and a rejected call both fall into the same one-line `catch { phase = 'dead' }` — proving
		// the resolved path renders the retry state also proves the (trivially identical) catch
		// branch does, without a second, promise-rejection-timing-sensitive test for zero extra
		// coverage.
		wakeBotMock.mockResolvedValue({ alive: false, busy: false });
		const { getByRole, findByText } = render(BotChallengePanel, { team: 'acme', name: 'alice' });
		await fireEvent.click(getByRole('button', { name: 'Play →' }));
		expect(await findByText("This bot isn't answering right now.")).toBeTruthy();
		expect(getByRole('button', { name: 'Try again' })).toBeTruthy();
	});

	it('shows a distinct busy state — not "isn\'t answering" — for a bot at its declared limit (#189)', async () => {
		wakeBotMock.mockResolvedValue({ alive: false, busy: true });
		const { getByRole, findByText, findByRole, queryByText } = render(BotChallengePanel, {
			team: 'acme',
			name: 'alice',
		});
		await fireEvent.click(getByRole('button', { name: 'Play →' }));
		expect(
			await findByText('This bot is playing right now — try again in a few minutes.'),
		).toBeTruthy();
		expect(queryByText("This bot isn't answering right now.")).toBeNull();

		// The retry button must actually re-wake the bot and reflect its NEXT answer, not just render inert.
		wakeBotMock.mockResolvedValue({ alive: true, busy: false });
		await fireEvent.click(await findByRole('button', { name: 'Try again' }));
		expect(wakeBotMock).toHaveBeenCalledTimes(2);
		expect(await findByRole('button', { name: 'Start game' })).toBeTruthy();
	});

	it('does not navigate if the panel unmounts before playBot resolves', async () => {
		wakeBotMock.mockResolvedValue({ alive: true, busy: false });
		let resolvePlayBot!: (match: { gameId: string; token: string; seat: 'White' }) => void;
		playBotMock.mockReturnValue(
			new Promise((resolve) => {
				resolvePlayBot = resolve;
			}),
		);
		// Replace location wholesale so the (skipped, once destroyed) href assignment can be
		// asserted against without hitting jsdom's unimplemented real navigation.
		vi.stubGlobal('location', { href: 'about:blank', origin: window.location.origin });

		const { getByRole, findByRole, unmount } = render(BotChallengePanel, {
			team: 'acme',
			name: 'alice',
		});
		await fireEvent.click(getByRole('button', { name: 'Play →' }));
		await fireEvent.click(await findByRole('button', { name: 'Start game' }));

		unmount();
		resolvePlayBot({ gameId: 'g1', token: 't1', seat: 'White' });
		await Promise.resolve();
		await Promise.resolve();

		expect(window.location.href).toBe('about:blank');
	});

	// The bug this fixes: every 409 used to render the SAME hardcoded "you already have a game in
	// progress" text, which became wrong the moment play-api gained a second 409 cause (#189) — a
	// visitor with no game of their own would be told they had one. The two tests below drive both
	// causes through the real 409 status and assert the panel shows the CORRECT, distinct message for
	// each — not just "some message changed".
	it('shows the server’s own message for a bot at its concurrent-game limit, not the stale "already have a game" text', async () => {
		wakeBotMock.mockResolvedValue({ alive: true, busy: false });
		playBotMock.mockRejectedValue(
			new PlayBotError(
				409,
				'that bot is busy — it is at its concurrent-game limit; try another or retry soon',
			),
		);
		const { getByRole, findByRole, findByText, queryByText } = render(BotChallengePanel, {
			team: 'acme',
			name: 'alice',
		});
		await fireEvent.click(getByRole('button', { name: 'Play →' }));
		await fireEvent.click(await findByRole('button', { name: 'Start game' }));

		expect(
			await findByText(
				'That bot is busy — it is at its concurrent-game limit; try another or retry soon.',
			),
		).toBeTruthy();
		expect(queryByText(/already have a game in progress/i)).toBeNull();
	});

	it('shows the server’s own message when the visitor already has an unfinished catalog game', async () => {
		wakeBotMock.mockResolvedValue({ alive: true, busy: false });
		playBotMock.mockRejectedValue(
			new PlayBotError(409, 'you already have an active game — finish it before starting another'),
		);
		const { getByRole, findByRole, findByText, queryByText } = render(BotChallengePanel, {
			team: 'acme',
			name: 'alice',
		});
		await fireEvent.click(getByRole('button', { name: 'Play →' }));
		await fireEvent.click(await findByRole('button', { name: 'Start game' }));

		expect(
			await findByText('You already have an active game — finish it before starting another.'),
		).toBeTruthy();
		expect(queryByText(/concurrent-game limit/i)).toBeNull();
	});

	it('falls back to the generic message when a 409 body is empty or whitespace-only', async () => {
		// Never expected in practice (play-api always writes a reason) — a thrown response is not a promise
		// about its own body, so presentableConflictMessage must not render an empty/blank paragraph.
		wakeBotMock.mockResolvedValue({ alive: true, busy: false });
		playBotMock.mockRejectedValue(new PlayBotError(409, '   '));
		const { getByRole, findByRole, findByText } = render(BotChallengePanel, {
			team: 'acme',
			name: 'alice',
		});
		await fireEvent.click(getByRole('button', { name: 'Play →' }));
		await fireEvent.click(await findByRole('button', { name: 'Start game' }));

		expect(
			await findByText('Could not start the game right now — try again in a minute.'),
		).toBeTruthy();
	});

	it('falls back to the generic message for a non-409 failure, unchanged from before', async () => {
		wakeBotMock.mockResolvedValue({ alive: true, busy: false });
		playBotMock.mockRejectedValue(new Error('network exploded'));
		const { getByRole, findByRole, findByText } = render(BotChallengePanel, {
			team: 'acme',
			name: 'alice',
		});
		await fireEvent.click(getByRole('button', { name: 'Play →' }));
		await fireEvent.click(await findByRole('button', { name: 'Start game' }));

		expect(
			await findByText('Could not start the game right now — try again in a minute.'),
		).toBeTruthy();
	});

	// #212: a player who always plays the same way shouldn't re-pick it on every bot's page.
	describe('remembering the setup', () => {
		it('seeds the panel from a stored preference', async () => {
			auth.authStore.status = 'signed-in';
			preferencesStore.setBotChallengeColor('Black');
			preferencesStore.setBotChallengeTimeControl('3 + 3');
			preferencesStore.setBotChallengeRated(true);
			wakeBotMock.mockResolvedValue({ alive: true, busy: false });

			const { getByRole, findByRole } = render(BotChallengePanel, { team: 'acme', name: 'alice' });
			await fireEvent.click(getByRole('button', { name: 'Play →' }));
			await findByRole('button', { name: 'Start game' });

			expect((getByRole('radio', { name: 'Black' }) as HTMLInputElement).checked).toBe(true);
			expect((getByRole('radio', { name: '3 + 3' }) as HTMLInputElement).checked).toBe(true);
			expect((getByRole('radio', { name: 'Rated' }) as HTMLInputElement).checked).toBe(true);
		});

		it('persists the color, time control, and rated choice once a signed-in account starts', async () => {
			auth.authStore.status = 'signed-in';
			wakeBotMock.mockResolvedValue({ alive: true, busy: false });
			playBotMock.mockResolvedValue({ gameId: 'g1', token: 't1', seat: 'White' });
			vi.stubGlobal('location', { href: 'about:blank', origin: window.location.origin });

			const { getByRole, findByRole } = render(BotChallengePanel, { team: 'acme', name: 'alice' });
			await fireEvent.click(getByRole('button', { name: 'Play →' }));
			await fireEvent.click(await findByRole('radio', { name: 'Black' }));
			await fireEvent.click(getByRole('radio', { name: '3 + 3' }));
			await fireEvent.click(getByRole('radio', { name: 'Rated' }));
			await fireEvent.click(getByRole('button', { name: 'Start game' }));

			expect(preferencesStore.botChallengeColor).toBe('Black');
			expect(preferencesStore.botChallengeTimeControl).toBe('3 + 3');
			expect(preferencesStore.botChallengeRated).toBe(true);
		});

		// The subtle half of #212: RatedChoice's signed-in gate forces THIS visitor's rated request
		// to false, but that forced value must never overwrite a `true` stored by an earlier,
		// actually-signed-in visit — otherwise every signed-out visit silently wipes the preference
		// and it can never be restored by signing back in.
		it('does not overwrite a stored rated preference when starting while signed out', async () => {
			preferencesStore.setBotChallengeRated(true);
			auth.authStore.status = 'signed-out';
			wakeBotMock.mockResolvedValue({ alive: true, busy: false });
			playBotMock.mockResolvedValue({ gameId: 'g1', token: 't1', seat: 'White' });
			vi.stubGlobal('location', { href: 'about:blank', origin: window.location.origin });

			const { getByRole, findByRole } = render(BotChallengePanel, { team: 'acme', name: 'alice' });
			await fireEvent.click(getByRole('button', { name: 'Play →' }));
			await fireEvent.click(await findByRole('button', { name: 'Start game' }));

			expect(playBotMock).toHaveBeenCalledWith(expect.objectContaining({ rated: false }));
			expect(preferencesStore.botChallengeRated).toBe(true);
		});
	});
});
