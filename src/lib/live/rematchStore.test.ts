import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RematchStore } from './rematchStore.svelte';
import * as rematchApi from './rematchApi';
import type { PrivateRematch } from './rematchTypes';

const AVAILABLE_STATE: PrivateRematch = {
	sourceGameId: 'game-1',
	phase: 'available',
	serverNow: '2026-09-07T12:00:00Z',
	myConsent: false,
	allowedActions: ['propose'],
	settings: {
		timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } },
		rated: true,
		mode: 'classic',
	},
	deadlineAt: '2026-09-07T12:00:15Z',
};

const OFFERED_MINE: PrivateRematch = {
	...AVAILABLE_STATE,
	phase: 'offered',
	myConsent: true,
	allowedActions: ['cancel'],
	serverNow: '2026-09-07T12:00:02Z',
	deadlineAt: '2026-09-07T12:00:17Z',
};

const OFFERED_THEIRS: PrivateRematch = {
	...AVAILABLE_STATE,
	phase: 'offered',
	myConsent: false,
	allowedActions: ['accept', 'decline'],
	serverNow: '2026-09-07T12:00:03Z',
	deadlineAt: '2026-09-07T12:00:18Z',
};

const MATCHED_STATE: PrivateRematch = {
	...AVAILABLE_STATE,
	phase: 'matched',
	myConsent: true,
	allowedActions: [],
	nextGameId: 'game-next',
	joinDeadlineAt: '2026-09-07T12:00:30Z',
	join: {
		seat: 'White',
		token: 'token-new-game',
	},
};

const CLOSED_DECLINED: PrivateRematch = {
	...AVAILABLE_STATE,
	phase: 'closed',
	closedReason: 'declined',
	allowedActions: [],
};

describe('RematchStore', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('initializes and polls initial state and computes countdown', async () => {
		const getSpy = vi.spyOn(rematchApi, 'getRematch').mockResolvedValueOnce(AVAILABLE_STATE);

		const store = new RematchStore();
		store.init('game-1', 'tok-1');

		expect(getSpy).toHaveBeenCalledWith('game-1', 'tok-1');
		await vi.advanceTimersByTimeAsync(0);

		expect(store.phase).toBe('available');
		expect(store.allowedActions).toEqual(['propose']);
		expect(store.secondsRemaining).toBe(15);

		store.dispose();
	});

	it('propose sends mutation and transitions to offered with cancel', async () => {
		vi.spyOn(rematchApi, 'getRematch').mockResolvedValue(AVAILABLE_STATE);
		const postSpy = vi.spyOn(rematchApi, 'postRematch').mockResolvedValueOnce(OFFERED_MINE);

		const store = new RematchStore();
		store.init('game-1', 'tok-1');
		await vi.advanceTimersByTimeAsync(0);

		await store.propose();

		expect(postSpy).toHaveBeenCalledWith('game-1', 'propose', expect.any(String), 'tok-1');
		expect(store.phase).toBe('offered');
		expect(store.myConsent).toBe(true);
		expect(store.allowedActions).toEqual(['cancel']);
		expect(store.secondsRemaining).toBe(15);

		store.dispose();
	});

	it('cancel sends mutation and transitions to closed', async () => {
		vi.spyOn(rematchApi, 'getRematch').mockResolvedValue(OFFERED_MINE);
		const postSpy = vi.spyOn(rematchApi, 'postRematch').mockResolvedValueOnce({
			...OFFERED_MINE,
			phase: 'closed',
			closedReason: 'cancelled',
			allowedActions: [],
		});

		const store = new RematchStore();
		store.init('game-1', 'tok-1');
		await vi.advanceTimersByTimeAsync(0);

		await store.cancel();

		expect(postSpy).toHaveBeenCalledWith('game-1', 'cancel', expect.any(String), 'tok-1');
		expect(store.phase).toBe('closed');
		expect(store.closedReason).toBe('cancelled');

		store.dispose();
	});

	it('accept transitions to matched and notifies onMatched', async () => {
		vi.spyOn(rematchApi, 'getRematch').mockResolvedValue(OFFERED_THEIRS);
		vi.spyOn(rematchApi, 'postRematch').mockResolvedValueOnce(MATCHED_STATE);

		const store = new RematchStore();
		const matchedHandler = vi.fn();
		store.onMatched = matchedHandler;

		store.init('game-1', 'tok-1');
		await vi.advanceTimersByTimeAsync(0);

		await store.accept();

		expect(store.phase).toBe('matched');
		expect(store.nextGameId).toBe('game-next');
		expect(matchedHandler).toHaveBeenCalledWith(
			'game-next',
			{ seat: 'White', token: 'token-new-game' },
			'2026-09-07T12:00:30Z',
		);

		store.dispose();
	});

	it('decline transitions to closed with reason declined', async () => {
		vi.spyOn(rematchApi, 'getRematch').mockResolvedValue(OFFERED_THEIRS);
		vi.spyOn(rematchApi, 'postRematch').mockResolvedValueOnce(CLOSED_DECLINED);

		const store = new RematchStore();
		store.init('game-1', 'tok-1');
		await vi.advanceTimersByTimeAsync(0);

		await store.decline();

		expect(store.phase).toBe('closed');
		expect(store.closedReason).toBe('declined');

		store.dispose();
	});

	it('handles crossed clicks: propose when already offered adopts matched state', async () => {
		vi.spyOn(rematchApi, 'getRematch').mockResolvedValue(AVAILABLE_STATE);
		vi.spyOn(rematchApi, 'postRematch').mockResolvedValueOnce(MATCHED_STATE);

		const store = new RematchStore();
		const matchedHandler = vi.fn();
		store.onMatched = matchedHandler;

		store.init('game-1', 'tok-1');
		await vi.advanceTimersByTimeAsync(0);

		await store.propose();

		expect(store.phase).toBe('matched');
		expect(matchedHandler).toHaveBeenCalledWith(
			'game-next',
			{ seat: 'White', token: 'token-new-game' },
			'2026-09-07T12:00:30Z',
		);

		store.dispose();
	});

	it('recovers from commit-response loss via subsequent poll readback', async () => {
		vi.spyOn(rematchApi, 'getRematch')
			.mockResolvedValueOnce(AVAILABLE_STATE)
			.mockResolvedValueOnce(MATCHED_STATE);

		vi.spyOn(rematchApi, 'postRematch').mockRejectedValueOnce(
			new Error('Network connection lost after commit'),
		);

		const store = new RematchStore();
		const matchedHandler = vi.fn();
		store.onMatched = matchedHandler;

		store.init('game-1', 'tok-1');
		await vi.advanceTimersByTimeAsync(0);

		await store.propose();
		expect(store.error).toBe('Unable to complete rematch action. Please try again.');

		// Advance timer for next background poll (1s)
		vi.advanceTimersByTime(1000);
		await vi.advanceTimersByTimeAsync(0);

		expect(store.phase).toBe('matched');
		expect(matchedHandler).toHaveBeenCalledWith(
			'game-next',
			{ seat: 'White', token: 'token-new-game' },
			'2026-09-07T12:00:30Z',
		);

		store.dispose();
	});

	it('adopts canonical state on 409 conflict with state', async () => {
		vi.spyOn(rematchApi, 'getRematch').mockResolvedValue(AVAILABLE_STATE);
		vi.spyOn(rematchApi, 'postRematch').mockRejectedValueOnce(
			new rematchApi.RematchApiError(409, 'request_id_conflict', OFFERED_MINE),
		);

		const store = new RematchStore();
		store.init('game-1', 'tok-1');
		await vi.advanceTimersByTimeAsync(0);

		await store.propose();

		expect(store.phase).toBe('offered');
		expect(store.allowedActions).toEqual(['cancel']);

		store.dispose();
	});

	it('closes without a reason on a bare 410: the server has not said why (#109)', async () => {
		vi.spyOn(rematchApi, 'getRematch').mockResolvedValue(AVAILABLE_STATE);
		vi.spyOn(rematchApi, 'postRematch').mockRejectedValueOnce(
			new rematchApi.RematchApiError(410, 'rematch_closed'),
		);

		const store = new RematchStore();
		store.init('game-1', 'tok-1');
		await vi.advanceTimersByTimeAsync(0);

		await store.propose();

		expect(store.phase).toBe('closed');
		// Not 'expired': a 410 also answers for a session that was never eligible — the control says
		// the neutral "no longer available" rather than naming an expiry that may not have happened.
		expect(store.closedReason).toBeNull();

		store.dispose();
	});

	it('reuses requestId on retry after a failed mutation', async () => {
		vi.spyOn(rematchApi, 'getRematch').mockResolvedValue(AVAILABLE_STATE);
		const postSpy = vi
			.spyOn(rematchApi, 'postRematch')
			.mockRejectedValueOnce(new Error('Network error'))
			.mockResolvedValueOnce(OFFERED_MINE);

		const store = new RematchStore();
		store.init('game-1', 'tok-1');
		await vi.advanceTimersByTimeAsync(0);

		await store.propose();
		expect(store.error).toBeTruthy();
		const firstReqId = postSpy.mock.calls[0][2];

		await store.propose();
		const secondReqId = postSpy.mock.calls[1][2];

		expect(firstReqId).toBe(secondReqId);
		expect(store.phase).toBe('offered');

		store.dispose();
	});

	it('resets isSubmitting on re-init', () => {
		const store = new RematchStore();
		store.isSubmitting = true;
		store.init('game-1', 'tok-1');

		expect(store.isSubmitting).toBe(false);

		store.dispose();
	});

	it('safely handles invalid deadline and serverNow timestamps', async () => {
		vi.spyOn(rematchApi, 'getRematch').mockResolvedValueOnce({
			...AVAILABLE_STATE,
			serverNow: 'invalid-date',
			deadlineAt: 'not-a-timestamp',
		});

		const store = new RematchStore();
		store.init('game-1', 'tok-1');
		await vi.advanceTimersByTimeAsync(0);

		expect(store.secondsRemaining).toBe(0);
		expect(Number.isNaN(store.secondsRemaining)).toBe(false);

		store.dispose();
	});

	it('continues polling when matched phase is missing join credentials', async () => {
		const incompleteMatched: PrivateRematch = {
			...AVAILABLE_STATE,
			phase: 'matched',
			nextGameId: null,
			join: null,
		};

		const getSpy = vi
			.spyOn(rematchApi, 'getRematch')
			.mockResolvedValueOnce(AVAILABLE_STATE)
			.mockResolvedValueOnce(incompleteMatched)
			.mockResolvedValueOnce(MATCHED_STATE);

		const store = new RematchStore();
		const matchedHandler = vi.fn();
		store.onMatched = matchedHandler;

		store.init('game-1', 'tok-1');
		await vi.advanceTimersByTimeAsync(0);

		// Advance for incomplete matched poll
		vi.advanceTimersByTime(1000);
		await vi.advanceTimersByTimeAsync(0);

		expect(store.phase).toBe('matched');
		expect(matchedHandler).not.toHaveBeenCalled();

		// Advance for complete matched poll
		vi.advanceTimersByTime(1000);
		await vi.advanceTimersByTimeAsync(0);

		expect(matchedHandler).toHaveBeenCalledWith(
			'game-next',
			{ seat: 'White', token: 'token-new-game' },
			'2026-09-07T12:00:30Z',
		);
		expect(getSpy).toHaveBeenCalledTimes(3);

		store.dispose();
	});
});
