import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ShowcaseShell from './ShowcaseShell.svelte';
import {
	allFixtures,
	fixtureOpenWhite,
	fixtureOpenBlack,
	fixtureClaiming,
	fixtureLivePlayerWhiteTurn,
	fixtureLivePlayerBlackTurn,
	fixtureLiveSpectator,
	fixtureReconnecting,
	fixtureFinishingMate,
	fixtureFinishingDraw,
	fixtureReset,
} from './fixtures';
import { m } from '$lib/paraglide/messages.js';

describe('ShowcaseShell', () => {
	it('renders open state with initial board, 5+3, bot opponent, and single accessible claim action (White)', () => {
		const onIntent = vi.fn();
		const { getByRole, getAllByText } = render(ShowcaseShell, {
			state: fixtureOpenWhite,
			onIntent,
		});

		// Status badge
		expect(getAllByText(m.home_status_open()).length).toBeGreaterThan(0);

		// Time control and title
		expect(getAllByText(m.home_time_control_blitz()).length).toBeGreaterThan(0);
		expect(getAllByText(m.home_showcase_title()).length).toBeGreaterThan(0);

		// Brand mark & name
		expect(getAllByText(m.home_brand_name()).length).toBeGreaterThan(0);

		// Featured bot & player
		expect(getAllByText('DeepDiceBot').length).toBeGreaterThan(0);
		expect(getAllByText('Open seat').length).toBeGreaterThan(0);
		expect(getAllByText('You (Guest)').length).toBeGreaterThan(0);

		// Clocks (formatted as 5:00)
		expect(getAllByText('5:00').length).toBeGreaterThan(0);

		// Single claim action for White
		const claimBtn = getByRole('button', { name: m.home_action_claim_white() });
		expect(claimBtn).toBeTruthy();

		// Click claim emits typed intent
		fireEvent.click(claimBtn);
		expect(onIntent).toHaveBeenCalledWith({ type: 'claim', color: 'w' });
	});

	it('renders open state with claim action for Black', () => {
		const onIntent = vi.fn();
		const { getByRole } = render(ShowcaseShell, {
			state: fixtureOpenBlack,
			onIntent,
		});

		const claimBtn = getByRole('button', { name: m.home_action_claim_black() });
		expect(claimBtn).toBeTruthy();

		fireEvent.click(claimBtn);
		expect(onIntent).toHaveBeenCalledWith({ type: 'claim', color: 'b' });
	});

	it('renders claiming state with accessible busy button and preserves focus', async () => {
		const { getAllByText, getByRole } = render(ShowcaseShell, {
			state: fixtureClaiming,
		});

		// Status badge
		expect(getAllByText(m.home_status_claiming()).length).toBeGreaterThan(0);

		// Accessible busy button
		const claimingBtn = getByRole('button', { name: /Claiming seat…/i });
		expect(claimingBtn.getAttribute('aria-disabled')).toBe('true');
		expect(claimingBtn.getAttribute('aria-busy')).toBe('true');

		// Keydown guard ignores Enter and Space (defaultPrevented is true, so fireEvent returns false)
		expect(await fireEvent.keyDown(claimingBtn, { key: 'Enter' })).toBe(false);
		expect(await fireEvent.keyDown(claimingBtn, { key: ' ' })).toBe(false);
	});

	it('renders live-player state with active dice, player clock, and resign action', () => {
		const onIntent = vi.fn();
		const { getAllByText, getByRole, getAllByLabelText } = render(ShowcaseShell, {
			state: fixtureLivePlayerWhiteTurn,
			onIntent,
		});

		// Status badge
		expect(getAllByText(m.home_status_live()).length).toBeGreaterThan(0);

		// Player names
		expect(getAllByText('DeepDiceBot').length).toBeGreaterThan(0);
		expect(getAllByText('You (White)').length).toBeGreaterThan(0);

		// Active dice region announced
		expect(getAllByLabelText(/Rolled:/i).length).toBeGreaterThan(0);

		// Resign action
		const resignBtn = getByRole('button', { name: m.home_action_resign() });
		expect(resignBtn).toBeTruthy();

		fireEvent.click(resignBtn);
		expect(onIntent).toHaveBeenCalledWith({ type: 'resign' });
	});

	it('renders live-player opponent thinking state', () => {
		const { getAllByText } = render(ShowcaseShell, {
			state: fixtureLivePlayerBlackTurn,
		});

		expect(getAllByText('Opponent thinking').length).toBeGreaterThan(0);
	});

	it('renders live-spectator state with no claim or queue controls', () => {
		const { getAllByText, queryByRole, getAllByRole } = render(ShowcaseShell, {
			state: fixtureLiveSpectator,
		});

		// Status badge
		expect(getAllByText(m.home_status_in_play()).length).toBeGreaterThan(0);

		// Spectator explanation body
		expect(getAllByText(m.home_spectator_body()).length).toBeGreaterThan(0);

		// No claim buttons
		expect(queryByRole('button', { name: m.home_action_claim_white() })).toBeNull();
		expect(queryByRole('button', { name: m.home_action_claim_black() })).toBeNull();
		expect(queryByRole('button', { name: /queue/i })).toBeNull();

		// Has Play on /play instead link
		const altLinks = getAllByRole('link', { name: m.home_action_play_alt() });
		expect(altLinks.length).toBeGreaterThan(0);
		expect(altLinks[0].getAttribute('href')).toBe('/play');
	});

	it('renders reconnecting state with paused clock and retry action', () => {
		const onIntent = vi.fn();
		const { getAllByText, getByRole } = render(ShowcaseShell, {
			state: fixtureReconnecting,
			onIntent,
		});

		// Status badge
		expect(getAllByText(m.home_status_offline()).length).toBeGreaterThan(0);

		// Reconnecting message
		const expectedMsg = m.home_reconnecting_body({ attempt: 2, maxAttempts: 5 });
		expect(getAllByText(expectedMsg).length).toBeGreaterThan(0);

		// Retry action
		const retryBtn = getByRole('button', { name: m.home_action_retry() });
		expect(retryBtn).toBeTruthy();

		fireEvent.click(retryBtn);
		expect(onIntent).toHaveBeenCalledWith({ type: 'retry' });
	});

	it('renders finishing state with outcome message, frozen clock, and reset action', () => {
		const onIntent = vi.fn();
		const { getAllByText, getByRole } = render(ShowcaseShell, {
			state: fixtureFinishingMate,
			onIntent,
		});

		// Status badge
		expect(getAllByText(m.home_status_finished()).length).toBeGreaterThan(0);

		// Outcome message
		const expectedOutcome = m.home_outcome_winner({ winner: 'Black', reason: 'mate' });
		expect(getAllByText(expectedOutcome).length).toBeGreaterThan(0);

		// Reset table now button
		const resetBtn = getByRole('button', { name: /Reset table now/i });
		expect(resetBtn).toBeTruthy();

		fireEvent.click(resetBtn);
		expect(onIntent).toHaveBeenCalledWith({ type: 'reset-now' });
	});

	it('renders finishing state for draw', () => {
		const { getAllByText } = render(ShowcaseShell, {
			state: fixtureFinishingDraw,
		});

		const expectedDraw = m.home_outcome_draw({ reason: 'draw' });
		expect(getAllByText(expectedDraw).length).toBeGreaterThan(0);
	});

	it('renders reset state with countdown and disabled opening soon action', () => {
		const { getAllByText, getByRole } = render(ShowcaseShell, {
			state: fixtureReset,
		});

		// Status badge
		expect(getAllByText(m.home_status_resetting()).length).toBeGreaterThan(0);

		// Reset countdown message
		const expectedCountdown = m.home_resetting_countdown({ seconds: 5 });
		expect(getAllByText(expectedCountdown).length).toBeGreaterThan(0);

		// Opening soon action
		const openingBtn = getByRole('button', { name: m.home_action_opening_soon() });
		expect(openingBtn.getAttribute('aria-disabled')).toBe('true');
	});

	it('ensures no move-history or game list is rendered across all states, and dice are absent outside live play', () => {
		for (const [key, fixture] of Object.entries(allFixtures)) {
			const { container, queryByLabelText, unmount } = render(ShowcaseShell, {
				state: fixture,
			});

			expect(
				container.querySelector('#move-history-panel'),
				`#move-history-panel found in ${key}`,
			).toBeNull();
			expect(container.querySelector('.move-history'), `.move-history found in ${key}`).toBeNull();
			expect(container.querySelector('.game-list'), `.game-list found in ${key}`).toBeNull();

			if (fixture.kind !== 'live-player' && fixture.kind !== 'live-spectator') {
				expect(
					queryByLabelText(/Rolled:/i),
					`live dice region found in non-live fixture ${key}`,
				).toBeNull();
			}

			unmount();
		}
	});

	it('always provides the alternative link to /play', () => {
		const { getAllByRole } = render(ShowcaseShell, {
			state: fixtureOpenWhite,
		});

		const playLinks = getAllByRole('link', { name: /Play Bots & Friends/i });
		expect(playLinks.length).toBeGreaterThan(0);
		expect(playLinks.some((l) => l.getAttribute('href') === '/play')).toBe(true);
	});

	it('uses approved Fortemate brand mark instead of game dice emoji', () => {
		const { getByRole } = render(ShowcaseShell, {
			state: fixtureOpenWhite,
		});

		const markImg = getByRole('img', { name: m.home_brand_mark_label() });
		expect(markImg).toBeTruthy();
		expect(markImg.tagName.toLowerCase()).toBe('svg');
		expect(markImg.getAttribute('viewBox')).toBe('0 0 14 14');
	});

	it('has accessible status region with role="status" and aria-live="polite"', () => {
		const { getAllByRole } = render(ShowcaseShell, {
			state: fixtureOpenWhite,
		});

		const statusRegions = getAllByRole('status');
		expect(statusRegions.length).toBeGreaterThan(0);
		expect(statusRegions[0].getAttribute('aria-live')).toBe('polite');
	});
});
