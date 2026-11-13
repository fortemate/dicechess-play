/**
 * Exercises the laboratory app's user-visible create, invite, join, appearance, and error flows.
 * HTTP uses the real API class with method spies; the room transport is mocked so no network opens.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';

const mocks = vi.hoisted(() => ({
	connections: [] as Array<{ close: ReturnType<typeof vi.fn> }>,
	open: vi.fn(),
	guest: vi.fn(() => 'b12b3456-7890-4abc-def0-1234567890ab'),
}));

const boardStub = vi.hoisted(() => async () => ({
	default: (await import('../routes/live/[id]/ChildStub.test.svelte')).default,
}));
vi.mock('./LaboratoryBoard.svelte', boardStub);

vi.mock('../lib/laboratory/connection', () => ({
	laboratoryGuest: mocks.guest,
	openRoomConnection: mocks.open,
}));

import LaboratoryApp from './LaboratoryApp.svelte';
import { LaboratoryApi, LaboratoryError, type LaboratoryGameState } from '../lib/laboratory/api';
import type { CreationResponse, PublicState } from '../lib/laboratory/protocol';
import type { TimeControl } from '../lib/live/liveTypes';

const rulesVersion = '0.18.2';
const gameId = 'a12b3456-7890-4abc-def0-1234567890ab';
const guestId = 'b12b3456-7890-4abc-def0-1234567890ab';
const commit = 'ab'.repeat(32);
const variant = { id: 'choice-2x2d6', revision: 1 } as const;
const provenance = { rulesVersion, diceAlgorithm: 'choice-2x2d6-hmac-sha256-v1' } as const;
const white = { gameId, seat: 'White' as const, token: 'white_dummy-token_1' };
const black = { gameId, seat: 'Black' as const, token: 'black_dummy-token_2' };
const defaultTimeControl: TimeControl = { Fischer: { initialSeconds: 600, incrementSeconds: 10 } };

const labState = (): PublicState => ({
	variant,
	protocolVersion: 1,
	provenance,
	turn: { phase: 'AwaitingPlayers', offers: [], selectedPairIndex: null },
});

const gameState = (timeControl: TimeControl = defaultTimeControl): LaboratoryGameState => ({
	version: 1,
	dfen: 'valid-dfen',
	activeSeat: 'White',
	dicePending: false,
	status: { Active: {} },
	clocks: { white: 600_000, black: 600_000 },
	players: { white: { kind: 'Human', name: null }, black: { kind: 'Human', name: null } },
	rated: false,
	ratingDomain: 'casual',
	timeControl,
	commit,
	lab: labState(),
});

const creation = (): CreationResponse => ({
	gameId,
	commit,
	tokens: [
		{ seat: 'White', token: white.token },
		{ seat: 'Black', token: black.token },
	],
	variant,
	labProtocolVersion: 1,
	provenance,
});

function apiFor(state = gameState()) {
	const api = new LaboratoryApi('https://lab.example', rulesVersion);
	const create = vi.spyOn(api, 'create').mockResolvedValue({ creation: creation(), state });
	const getState = vi.spyOn(api, 'state').mockResolvedValue(state);
	return { api, create, getState };
}

function setUrl(url: string) {
	history.replaceState(null, '', url);
}

describe('LaboratoryApp', () => {
	beforeEach(() => {
		setUrl('/');
		sessionStorage.clear();
		localStorage.clear();
		delete document.documentElement.dataset.labTheme;
		mocks.connections.length = 0;
		mocks.open.mockReset();
		mocks.guest.mockClear();
		mocks.open.mockImplementation(() => {
			const connection = { close: vi.fn() };
			mocks.connections.push(connection);
			return connection;
		});
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		Reflect.deleteProperty(navigator, 'clipboard');
		sessionStorage.clear();
		localStorage.clear();
		history.replaceState(null, '', '/');
	});

	it('shows six clock presets with 10+10 and random color selected, then submits no clock and Black once', async () => {
		const { api, create } = apiFor();
		let finishCreate!: (value: { creation: CreationResponse; state: LaboratoryGameState }) => void;
		create.mockImplementation(
			() =>
				new Promise((resolve) => {
					finishCreate = resolve;
				}),
		);
		render(LaboratoryApp, { props: { api } });

		const timeGroup = screen.getByRole('group', { name: /time control/i });
		const presets = within(timeGroup).getAllByRole('button');
		expect(presets).toHaveLength(6);
		expect(presets[3].getAttribute('aria-pressed')).toBe('true');
		const colorGroup = screen.getByRole('group', { name: /your color/i });
		const colors = within(colorGroup).getAllByRole('button');
		expect(colors).toHaveLength(3);
		expect(colors[0].getAttribute('aria-pressed')).toBe('true');

		await fireEvent.click(presets[5]);
		await fireEvent.click(colors[2]);
		expect(presets[5].getAttribute('aria-pressed')).toBe('true');
		expect(colors[2].getAttribute('aria-pressed')).toBe('true');
		const submit = screen.getByRole('button', { name: /create/i });
		await fireEvent.click(submit);
		await waitFor(() => expect(create).toHaveBeenCalledWith(guestId, { Unlimited: {} }));
		expect(create).toHaveBeenCalledTimes(1);
		expect(submit.matches(':disabled')).toBe(true);
		expect(timeGroup.matches(':disabled')).toBe(true);
		expect(presets[0].matches(':disabled')).toBe(true);
		finishCreate({ creation: creation(), state: gameState({ Unlimited: {} }) });
		await screen.findByLabelText(/invitation for your friend/i);
		expect(mocks.open).toHaveBeenCalledTimes(1);
	});

	it('offers a creator link with only the opponent token and supports copy plus manual fallback', async () => {
		const { api } = apiFor();
		render(LaboratoryApp, { props: { api } });
		const colorGroup = screen.getByRole('group', { name: /your color/i });
		await fireEvent.click(within(colorGroup).getByRole('button', { name: /white/i }));
		await fireEvent.click(screen.getByRole('button', { name: /create/i }));
		const input = (await screen.findByLabelText(/invitation for your friend/i)) as HTMLInputElement;
		expect(input.value).toContain(black.token);
		expect(input.value).not.toContain(white.token);

		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
		await fireEvent.click(screen.getByRole('button', { name: /copy/i }));
		await waitFor(() => expect(writeText).toHaveBeenCalledWith(input.value));

		const select = vi.spyOn(input, 'select');
		writeText.mockRejectedValueOnce(new Error('clipboard unavailable'));
		await fireEvent.click(screen.getByRole('button', { name: /copied|copy/i }));
		await waitFor(() => expect(select).toHaveBeenCalledOnce());
		expect(document.activeElement).toBe(input);
	});

	it('keeps the creator recovery address private and copies only the friend invitation with blocked storage', async () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('storage blocked');
		});
		const { api } = apiFor();
		render(LaboratoryApp, { props: { api } });
		const colors = screen.getByRole('group', { name: /your color/i });
		await fireEvent.click(within(colors).getByRole('button', { name: /white/i }));
		await fireEvent.click(screen.getByRole('button', { name: /create/i }));
		const input = (await screen.findByLabelText(/invitation for your friend/i)) as HTMLInputElement;
		expect(window.location.pathname).toBe(`/game/${gameId}`);
		expect(window.location.hash).toContain(white.token);
		expect(window.location.href).not.toContain(black.token);
		expect(input.value).toContain(black.token);
		expect(input.value).not.toContain(white.token);
		expect(await screen.findByText(/share only the invitation link/i)).toBeTruthy();
		const recovery = screen.getByRole('link', { name: /my private board link/i });
		expect(recovery.getAttribute('href')).toContain(white.token);
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
		await fireEvent.click(screen.getByRole('button', { name: /copy/i }));
		await waitFor(() => expect(writeText).toHaveBeenCalledWith(input.value));
	});

	it('changes the laboratory palette without touching the game theme, room link, or connection', async () => {
		localStorage.setItem('dicechess-theme', 'dark');
		const { api } = apiFor();
		render(LaboratoryApp, { props: { api } });
		await fireEvent.click(screen.getByRole('button', { name: /create/i }));
		const input = (await screen.findByLabelText(/invitation for your friend/i)) as HTMLInputElement;
		const invite = input.value;
		const connections = mocks.open.mock.calls.length;
		const preference = screen.getByRole('combobox', { name: /appearance/i });

		await fireEvent.change(preference, { target: { value: 'dark' } });
		expect(document.documentElement.dataset.labTheme).toBe('dark');
		await fireEvent.change(preference, { target: { value: 'light' } });
		expect(document.documentElement.dataset.labTheme).toBe('light');
		await fireEvent.change(preference, { target: { value: 'system' } });
		expect(localStorage.getItem('dicechess-laboratory-appearance')).toBe('system');
		expect(localStorage.getItem('dicechess-theme')).toBe('dark');
		expect(input.value).toBe(invite);
		expect(mocks.open).toHaveBeenCalledTimes(connections);
	});

	it('shows the invite server settings before Join and opens its seat only after an explicit join', async () => {
		const visitorUrl = `/invite/${gameId}#token=${black.token}&as=black`;
		setUrl(visitorUrl);
		const visitorState = gameState({ Fischer: { initialSeconds: 300, incrementSeconds: 3 } });
		const { api, getState } = apiFor(visitorState);
		render(LaboratoryApp, { props: { api } });
		const join = await screen.findByRole('button', { name: /join/i });
		expect(getState).toHaveBeenCalledWith(gameId);
		expect(document.querySelector('.lab-agreed')?.textContent).toMatch(/5.*3/s);
		expect(mocks.open).not.toHaveBeenCalled();
		await fireEvent.click(join);
		expect(mocks.open).toHaveBeenCalledTimes(1);
		expect(mocks.open.mock.calls[0][1]).toEqual(black);
	});

	it.each(['incompatible', 'expired'] as const)(
		'shows safe friendly copy for a %s server error',
		async (code) => {
			setUrl(`/invite/${gameId}#token=${black.token}&as=black`);
			const { api, getState } = apiFor();
			getState.mockRejectedValue(new LaboratoryError(code));
			render(LaboratoryApp, { props: { api } });
			const heading = await screen.findByRole('heading', { level: 1 });
			expect(heading.textContent?.trim()).not.toBe(code);
			expect(heading.textContent?.trim().length).toBeGreaterThan(0);
			expect(document.body.textContent).not.toContain(black.token);
			expect(screen.queryByLabelText(/invitation for your friend/i)).toBeNull();
			expect(getState).toHaveBeenCalledWith(gameId);
			expect(mocks.open).not.toHaveBeenCalled();
		},
	);
});
