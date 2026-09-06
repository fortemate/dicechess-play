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

		const acceptBtn = getByRole('button', { name: /accept the draw/i });
		const declineBtn = getByRole('button', { name: /decline & roll/i });

		// Declining is the cheap path, so it comes first in the DOM and holds focus on arrival.
		expect(declineBtn.compareDocumentPosition(acceptBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
		expect(document.activeElement).toBe(declineBtn);

		// Accepting ends the game, so one press only arms it.
		await fireEvent.click(acceptBtn);
		expect(onAccept).not.toHaveBeenCalled();
		await fireEvent.click(getByRole('button', { name: /press again to accept/i }));
		expect(onAccept).toHaveBeenCalledOnce();

		await fireEvent.click(declineBtn);
		expect(onDecline).toHaveBeenCalledOnce();
	});

	it('declines on Escape, and disarms an armed accept instead of ending the game', async () => {
		const onAccept = vi.fn();
		const onDecline = vi.fn();
		const { getByRole } = render(PreRollDrawGate, { isResponder: true, onAccept, onDecline });

		// Escape while an accept is armed backs out of it — a key press must never end the game.
		await fireEvent.click(getByRole('button', { name: /accept the draw/i }));
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(onAccept).not.toHaveBeenCalled();
		expect(onDecline).not.toHaveBeenCalled();
		expect(getByRole('button', { name: /accept the draw/i })).toBeTruthy();

		// A second Escape, with nothing armed, declines.
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(onDecline).toHaveBeenCalledOnce();
		expect(onAccept).not.toHaveBeenCalled();
	});

	it('ignores Escape for the offerer and the spectator', async () => {
		const onDecline = vi.fn();
		render(PreRollDrawGate, { isResponder: false, onDecline });

		await fireEvent.keyDown(window, { key: 'Escape' });

		expect(onDecline).not.toHaveBeenCalled();
	});

	it('renders waiting state without accept/decline buttons for offerer or spectator', () => {
		const { queryByRole, getByText } = render(PreRollDrawGate, {
			isResponder: false,
			offeredByName: 'Bob',
		});

		expect(getByText('Draw Offered')).toBeTruthy();
		expect(getByText(/Bob offered a draw — waiting for decision…/i)).toBeTruthy();

		expect(queryByRole('button', { name: /accept the draw/i })).toBeNull();
		expect(queryByRole('button', { name: /decline & roll/i })).toBeNull();
	});
});
