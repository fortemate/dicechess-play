import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';

import GameWaitingCard from './GameWaitingCard.svelte';

// The waiting states of the rail (#256): a table that waits for an opponent, and a game by link
// with the link to send. The card knows nothing about who came; these tests pin what it offers:
// the link in a field, copying it, sharing it only where the device can, and the page's way out.

const LINK = 'https://play.test/live/game-1?seat=friend-token&as=black';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function stubNavigator(overrides: Record<string, unknown>) {
	vi.stubGlobal('navigator', { ...overrides });
}

describe('GameWaitingCard', () => {
	it('is a named region that says what is being waited for', () => {
		const { getByRole, getByText } = render(GameWaitingCard, {
			title: 'Waiting for an opponent',
			text: 'Your table is on the list.',
		});
		expect(getByRole('region', { name: 'Waiting' })).toBeTruthy();
		expect(getByRole('heading', { name: 'Waiting for an opponent' })).toBeTruthy();
		expect(getByText('Your table is on the list.')).toBeTruthy();
	});

	it('offers nothing to copy or share when there is no link', () => {
		const { queryByRole } = render(GameWaitingCard, { title: 'Waiting', text: 'Soon.' });
		expect(queryByRole('textbox')).toBeNull();
		expect(queryByRole('button')).toBeNull();
	});

	describe('with a link', () => {
		it('shows it in a labelled field that cannot be edited', () => {
			const { getByRole } = render(GameWaitingCard, {
				title: 'Invite',
				text: 'Send it.',
				link: LINK,
			});
			const field = getByRole('textbox', { name: 'Invitation link' }) as HTMLInputElement;
			expect(field.value).toBe(LINK);
			expect(field.readOnly).toBe(true);
			expect(field.className).toContain('min-h-11');
		});

		it('copies the link and says so, then offers to copy again', async () => {
			vi.useFakeTimers();
			const writeText = vi.fn().mockResolvedValue(undefined);
			stubNavigator({ clipboard: { writeText } });
			const { getByRole } = render(GameWaitingCard, {
				title: 'Invite',
				text: 'Send it.',
				link: LINK,
			});

			await fireEvent.click(getByRole('button', { name: 'Copy link' }));
			await vi.waitFor(() => expect(getByRole('button', { name: 'Copied' })).toBeTruthy());
			expect(writeText).toHaveBeenCalledExactlyOnceWith(LINK);

			await vi.advanceTimersByTimeAsync(1600);
			expect(getByRole('button', { name: 'Copy link' })).toBeTruthy();
		});

		it('leaves the link in the field when the clipboard refuses', async () => {
			const writeText = vi.fn().mockRejectedValue(new Error('denied'));
			stubNavigator({ clipboard: { writeText } });
			const { getByRole, queryByRole } = render(GameWaitingCard, {
				title: 'Invite',
				text: 'Send it.',
				link: LINK,
			});
			await fireEvent.click(getByRole('button', { name: 'Copy link' }));
			await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
			expect(queryByRole('button', { name: 'Copied' })).toBeNull();
			expect((getByRole('textbox') as HTMLInputElement).value).toBe(LINK);
		});

		it('offers "Share" only on a device that has a share sheet, and shares the link', async () => {
			const share = vi.fn().mockResolvedValue(undefined);
			stubNavigator({ share, clipboard: { writeText: vi.fn() } });
			const withShare = render(GameWaitingCard, { title: 'Invite', text: 'Send it.', link: LINK });
			await fireEvent.click(withShare.getByRole('button', { name: 'Share' }));
			expect(share).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: LINK }));
			withShare.unmount();

			stubNavigator({ clipboard: { writeText: vi.fn() } });
			const without = render(GameWaitingCard, { title: 'Invite', text: 'Send it.', link: LINK });
			expect(without.queryByRole('button', { name: 'Share' })).toBeNull();
		});

		it('is not troubled by a visitor who closes the share sheet', async () => {
			const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
			stubNavigator({ share });
			const { getByRole } = render(GameWaitingCard, {
				title: 'Invite',
				text: 'Send it.',
				link: LINK,
			});
			await fireEvent.click(getByRole('button', { name: 'Share' }));
			await vi.waitFor(() => expect(share).toHaveBeenCalled());
			expect(getByRole('button', { name: 'Share' })).toBeTruthy();
		});
	});

	it('offers the way out of the page, in the words of the page', async () => {
		const onclose = vi.fn();
		const { getByRole } = render(GameWaitingCard, {
			title: 'Waiting for an opponent',
			text: 'Your table is on the list.',
			closeLabel: 'Close the table',
			onclose,
		});
		const button = getByRole('button', { name: 'Close the table' });
		expect(button.className).toContain('min-h-11');
		await fireEvent.click(button);
		expect(onclose).toHaveBeenCalledTimes(1);
	});
});
