import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import PreRollDrawGate from './PreRollDrawGate.svelte';

describe('PreRollDrawGate component (play-api #327, this repo #253)', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders decision actions for the responder and invokes callbacks', async () => {
		const onAccept = vi.fn();
		const onDecline = vi.fn();

		const { getByRole, getByText } = render(PreRollDrawGate, {
			isResponder: true,
			offeredByName: 'Alice',
			onAccept,
			onDecline,
		});

		expect(getByText('Draw Offered')).toBeTruthy();
		expect(getByText(/Alice offered a draw/i)).toBeTruthy();

		const acceptBtn = getByRole('button', { name: /accept draw/i });
		const declineBtn = getByRole('button', { name: /roll dice/i });

		expect(acceptBtn).toBeTruthy();
		expect(declineBtn).toBeTruthy();

		await fireEvent.click(acceptBtn);
		expect(onAccept).toHaveBeenCalledOnce();

		await fireEvent.click(declineBtn);
		expect(onDecline).toHaveBeenCalledOnce();
	});

	it('renders waiting state without accept/decline buttons for offerer or spectator', () => {
		const { queryByRole, getByText } = render(PreRollDrawGate, {
			isResponder: false,
			offeredByName: 'Bob',
		});

		expect(getByText('Draw Offered')).toBeTruthy();
		expect(getByText(/Bob offered a draw — waiting for decision…/i)).toBeTruthy();

		expect(queryByRole('button', { name: /accept draw/i })).toBeNull();
		expect(queryByRole('button', { name: /roll dice/i })).toBeNull();
	});
});
