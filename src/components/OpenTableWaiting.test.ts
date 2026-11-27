import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';

// The wait at one's own table (#256), as a component of its own since Play shows it too (#258).
const lobby = vi.hoisted(() => ({ seekStatus: vi.fn(), cancelSeek: vi.fn() }));
vi.mock('#lib/live/lobbyApi.js', () => lobby);
vi.mock('./MiniBoard.svelte', async () => ({
	default: (await import('../routes/live/[id]/ChildStub.test.svelte')).default,
}));

import { chromeStore } from '#lib/stores/chromeStore.svelte.js';
import OpenTableWaiting from './OpenTableWaiting.svelte';

const TABLE = { id: 'seek-1', secret: 'secret-1', label: '5 + 3', rated: false, clockMs: 300_000 };

describe('OpenTableWaiting', () => {
	const onclose = vi.fn();
	beforeEach(() => {
		lobby.seekStatus.mockReset().mockResolvedValue({ matched: false });
		lobby.cancelSeek.mockReset().mockResolvedValue(undefined);
		onclose.mockReset();
		vi.stubGlobal('location', { href: 'about:blank', origin: 'https://play.example' });
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('is a board that waits: the time control in its title, the site header out of the way', () => {
		const { getByRole } = render(OpenTableWaiting, { table: TABLE, onclose });
		expect(getByRole('heading', { level: 1 }).textContent).toContain('Open table · 5 + 3');
		expect(getByRole('region', { name: 'Waiting' })).toBeTruthy();
		expect(chromeStore.zen).toBe(true);
		cleanup();
		expect(chromeStore.zen).toBe(false);
	});

	it('goes to the board on the seat the server drew, once someone sits down', async () => {
		lobby.seekStatus.mockResolvedValue({ matched: true, gameId: 'g1', token: 't1', seat: 'Black' });
		render(OpenTableWaiting, { table: TABLE, onclose });
		await waitFor(() =>
			expect(location.href).toBe('https://play.example/live/g1?seat=t1&as=black'),
		);
		expect(lobby.seekStatus).toHaveBeenCalledWith('seek-1', 'secret-1');
		expect(lobby.cancelSeek).not.toHaveBeenCalled();
	});

	it('closes the table: tells the caller at once and the server after', async () => {
		const { getByRole } = render(OpenTableWaiting, { table: TABLE, onclose });
		await fireEvent.click(getByRole('button', { name: 'Close the table' }));
		expect(onclose).toHaveBeenCalledOnce();
		expect(lobby.cancelSeek).toHaveBeenCalledExactlyOnceWith('seek-1', 'secret-1');
	});

	it('closes for the caller even when the server cannot be told', async () => {
		lobby.cancelSeek.mockRejectedValue(new Error('offline'));
		const { getByRole } = render(OpenTableWaiting, { table: TABLE, onclose });
		await fireEvent.click(getByRole('button', { name: 'Close the table' }));
		expect(onclose).toHaveBeenCalledOnce();
	});

	it('closes the table when the board goes away without a game', () => {
		// The Back button, another page of the site: nobody waits at the table any more.
		const { unmount } = render(OpenTableWaiting, { table: TABLE, onclose });
		unmount();
		expect(lobby.cancelSeek).toHaveBeenCalledExactlyOnceWith('seek-1', 'secret-1');
		expect(onclose).not.toHaveBeenCalled();
	});

	it('tells the server once, however the board goes away after the button', async () => {
		const { getByRole, unmount } = render(OpenTableWaiting, { table: TABLE, onclose });
		await fireEvent.click(getByRole('button', { name: 'Close the table' }));
		unmount();
		expect(lobby.cancelSeek).toHaveBeenCalledOnce();
	});
});
