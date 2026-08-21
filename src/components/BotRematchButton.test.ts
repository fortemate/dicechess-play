import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import BotRematchButton from './BotRematchButton.svelte';
import { PlayBotError } from '$lib/catalog/catalogApi';
import type { BotGameSetup } from '$lib/catalog/lastBotGame';

// wakeBot/playBot are faked, matching BotChallengePanel.test.ts: the wake→start handshake and what
// lands in the request are what matter here. Navigation targets are verified in the browser, per
// the project's UI-flow-change convention, not asserted from a component test.
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

const SETUP: BotGameSetup = {
	gameId: 'finished-game',
	team: 'acme',
	name: 'alice',
	timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } },
	preferredColor: 'White',
	rated: true,
};

/** The single action button, whatever phase it is currently labelled for. */
const rematchButton = (getByRole: (role: string, options?: object) => unknown): HTMLElement =>
	getByRole('button', { name: /rematch|waking|starting|try again/i }) as HTMLElement;

// Node 26 shadows jsdom's localStorage unless started with --localstorage-file, so tests here stub
// it explicitly — the same pattern guestIdentity.test.ts uses.
function fakeStorage() {
	const map = new Map<string, string>();
	return {
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
		removeItem: (k: string) => void map.delete(k),
		clear: () => map.clear(),
	} as unknown as Storage;
}

describe('BotRematchButton', () => {
	beforeEach(() => {
		wakeBotMock.mockReset();
		playBotMock.mockReset();
		playBotMock.mockResolvedValue({ gameId: 'new-game', token: 'tok', seat: 'Black' });
		vi.stubGlobal('localStorage', fakeStorage());
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('wakes the same bot and starts a game in one click', async () => {
		wakeBotMock.mockResolvedValue({ alive: true, busy: false });
		const { getByRole } = render(BotRematchButton, { setup: SETUP });

		await fireEvent.click(getByRole('button', { name: 'Rematch →' }));

		expect(wakeBotMock).toHaveBeenCalledWith('acme', 'alice');
		await waitFor(() => expect(playBotMock).toHaveBeenCalled());
	});

	it('replays the finished game’s settings, with the colour swapped', async () => {
		wakeBotMock.mockResolvedValue({ alive: true, busy: false });
		const { getByRole } = render(BotRematchButton, { setup: SETUP });

		await fireEvent.click(getByRole('button', { name: 'Rematch →' }));

		await waitFor(() => expect(playBotMock).toHaveBeenCalled());
		expect(playBotMock.mock.calls[0][0]).toMatchObject({
			team: 'acme',
			name: 'alice',
			timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } },
			rated: true,
			preferredColor: 'Black',
		});
	});

	it('omits preferredColor entirely when the player had asked for a random seat', async () => {
		wakeBotMock.mockResolvedValue({ alive: true, busy: false });
		const { getByRole } = render(BotRematchButton, {
			setup: { ...SETUP, preferredColor: 'random' },
		});

		await fireEvent.click(getByRole('button', { name: 'Rematch →' }));

		await waitFor(() => expect(playBotMock).toHaveBeenCalled());
		expect(playBotMock.mock.calls[0][0]).not.toHaveProperty('preferredColor');
	});

	it('records the NEW game, so a rematch of a rematch still has settings to replay', async () => {
		wakeBotMock.mockResolvedValue({ alive: true, busy: false });
		const { getByRole } = render(BotRematchButton, { setup: SETUP });

		await fireEvent.click(getByRole('button', { name: 'Rematch →' }));

		await waitFor(() => {
			const stored = localStorage.getItem('dicechess-play-last-bot-game');
			expect(stored && JSON.parse(stored)).toMatchObject({
				gameId: 'new-game',
				preferredColor: 'Black',
			});
		});
	});

	it('never starts a game when the bot fails to wake', async () => {
		wakeBotMock.mockResolvedValue({ alive: false, busy: false });
		const { getByRole, findByRole } = render(BotRematchButton, { setup: SETUP });

		await fireEvent.click(getByRole('button', { name: 'Rematch →' }));

		expect((await findByRole('alert')).textContent).toMatch(/isn't answering/i);
		expect(playBotMock).not.toHaveBeenCalled();
		expect(rematchButton(getByRole).textContent?.trim()).toBe('Try again');
	});

	it('shows the distinct busy state for a bot at its concurrent-game limit (#189)', async () => {
		wakeBotMock.mockResolvedValue({ alive: false, busy: true });
		const { getByRole, findByRole } = render(BotRematchButton, { setup: SETUP });

		await fireEvent.click(getByRole('button', { name: 'Rematch →' }));

		expect((await findByRole('status')).textContent).toMatch(/playing right now/i);
		expect(playBotMock).not.toHaveBeenCalled();
	});

	it("surfaces the server's own 409 text and stays clickable for a retry", async () => {
		wakeBotMock.mockResolvedValue({ alive: true, busy: false });
		playBotMock.mockRejectedValue(new PlayBotError(409, 'that bot is busy right now'));
		const { getByRole, findByRole } = render(BotRematchButton, { setup: SETUP });

		await fireEvent.click(getByRole('button', { name: 'Rematch →' }));

		expect((await findByRole('alert')).textContent).toContain('That bot is busy right now.');
		expect(getByRole('button', { name: 'Rematch →' }).hasAttribute('disabled')).toBe(false);
	});

	it('ignores a second click while the first is still in flight', async () => {
		let resolveWake: (value: unknown) => void = () => {};
		wakeBotMock.mockReturnValue(new Promise((resolve) => (resolveWake = resolve)));
		const { getByRole } = render(BotRematchButton, { setup: SETUP });

		await fireEvent.click(getByRole('button', { name: 'Rematch →' }));
		await fireEvent.click(rematchButton(getByRole));
		resolveWake({ alive: true, busy: false });

		await waitFor(() => expect(playBotMock).toHaveBeenCalledTimes(1));
		expect(wakeBotMock).toHaveBeenCalledTimes(1);
	});
});
