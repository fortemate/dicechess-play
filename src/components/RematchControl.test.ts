import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import RematchControl from './RematchControl.svelte';
import type { RematchStore } from '$lib/live/rematchStore.svelte';

vi.mock('$app/paths', () => ({
	resolve: (p: string) => p,
}));

function mockStore(overrides: Partial<RematchStore> = {}): RematchStore {
	return {
		phase: 'available',
		myConsent: false,
		allowedActions: ['propose'],
		settings: {
			timeControl: { Fischer: { initialSeconds: 300, incrementSeconds: 3 } },
			rated: true,
			mode: 'classic',
		},
		deadlineAt: '2026-09-07T12:00:15Z',
		nextGameId: null,
		join: null,
		joinDeadlineAt: null,
		closedReason: null,
		error: null,
		isSubmitting: false,
		secondsRemaining: 15,
		init: vi.fn(),
		propose: vi.fn(),
		accept: vi.fn(),
		decline: vi.fn(),
		cancel: vi.fn(),
		retry: vi.fn(),
		pollOnce: vi.fn(),
		dispose: vi.fn(),
		...overrides,
	} as unknown as RematchStore;
}

describe('RematchControl', () => {
	it('renders loading status in idle state', () => {
		const store = mockStore({ phase: 'idle' });
		const { getByText } = render(RematchControl, { store });

		expect(getByText(/checking rematch availability…/i)).toBeDefined();
	});

	it('renders rematch button and settings in available state', async () => {
		const store = mockStore({ phase: 'available', secondsRemaining: 14 });
		const { getByRole, getByText } = render(RematchControl, { store });

		const btn = getByRole('button', { name: /rematch \(14s\) →/i });
		expect(btn).toBeDefined();
		expect(getByText(/5 \+ 3 · Rated · Random colours/i)).toBeDefined();

		await fireEvent.click(btn);
		expect(store.propose).toHaveBeenCalled();
	});

	it('renders waiting state with cancel button when caller proposed', async () => {
		const store = mockStore({
			phase: 'offered',
			myConsent: true,
			allowedActions: ['cancel'],
			secondsRemaining: 10,
		});
		const { getByRole, getByText } = render(RematchControl, { store });

		expect(getByText(/waiting for opponent…/i)).toBeDefined();
		expect(getByText(/\(10s\)/)).toBeDefined();
		const cancelBtn = getByRole('button', { name: /cancel rematch/i });

		await fireEvent.click(cancelBtn);
		expect(store.cancel).toHaveBeenCalled();
	});

	it('renders accept and decline buttons when opponent proposed', async () => {
		const store = mockStore({
			phase: 'offered',
			myConsent: false,
			allowedActions: ['accept', 'decline'],
			secondsRemaining: 9,
		});
		const { getByRole, getByText } = render(RematchControl, { store });

		expect(getByText(/opponent offered a rematch!/i)).toBeDefined();
		const acceptBtn = getByRole('button', { name: /accept/i });
		const declineBtn = getByRole('button', { name: /decline/i });

		await fireEvent.click(acceptBtn);
		expect(store.accept).toHaveBeenCalled();

		await fireEvent.click(declineBtn);
		expect(store.decline).toHaveBeenCalled();
	});

	it('renders closed explanation and lobby link when declined', () => {
		const store = mockStore({
			phase: 'closed',
			closedReason: 'declined',
		});
		const { getByText, getByRole } = render(RematchControl, { store });

		expect(getByText('Rematch declined by opponent.')).toBeDefined();
		expect(getByRole('link', { name: /find another game →/i })).toBeDefined();
	});

	it('renders closed explanation when expired', () => {
		const store = mockStore({
			phase: 'closed',
			closedReason: 'expired',
		});
		const { getByText } = render(RematchControl, { store });

		expect(getByText('Rematch offer expired.')).toBeDefined();
	});

	it('renders error message and retry button when error is set', async () => {
		const store = mockStore({
			error: 'Something went wrong',
		});
		const { getByRole, getByText } = render(RematchControl, { store });

		expect(getByText('Something went wrong')).toBeDefined();
		const retryBtn = getByRole('button', { name: /retry/i });
		await fireEvent.click(retryBtn);
		expect(store.retry).toHaveBeenCalled();
	});
});
