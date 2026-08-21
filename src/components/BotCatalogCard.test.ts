import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import BotCatalogCard from './BotCatalogCard.svelte';
import type { CatalogBot } from '$lib/catalog/catalogApi';

// Only wakeBot is faked — click→wake is enough to prove BotChallengePanel is wired with this
// card's team/name. The full phase-transition behavior (ready/dead states, config panel) is
// BotChallengePanel's own concern and is tested there instead of duplicated here.
const wakeBotMock = vi.fn();
vi.mock('$lib/catalog/catalogApi', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/catalog/catalogApi')>();
	return { ...actual, wakeBot: (team: string, name: string) => wakeBotMock(team, name) };
});

function bot(overrides: Partial<CatalogBot> = {}): CatalogBot {
	return {
		team: 'acme',
		name: 'alice',
		rating: 1720,
		rd: 85,
		provisional: false,
		description: 'aggressive + book',
		available: true,
		...overrides,
	};
}

describe('BotCatalogCard', () => {
	beforeEach(() => wakeBotMock.mockReset());
	afterEach(() => cleanup());

	it('renders the bot identity, rating, and description', () => {
		const { getByText } = render(BotCatalogCard, { bot: bot() });
		expect(getByText('acme alice')).toBeTruthy();
		expect(getByText('1,720')).toBeTruthy();
		expect(getByText('aggressive + book')).toBeTruthy();
	});

	it('flags a provisional rating without hiding the bot (opposite of the leaderboard policy)', () => {
		const { getByText } = render(BotCatalogCard, { bot: bot({ provisional: true }) });
		expect(getByText(/provisional/)).toBeTruthy();
	});

	it('shows no busy hint for an available bot', () => {
		const { queryByText } = render(BotCatalogCard, { bot: bot({ available: true }) });
		expect(queryByText(/playing now/)).toBeNull();
	});

	it('shows no busy hint when the server omits `available` entirely — undefined is unknown, not busy', () => {
		// The production regression this locks down: client and API release independently, so a client
		// build routinely runs against an API version that predates a field it reads. `!bot.available`
		// badged EVERY card as "playing now"; only an explicit `false` may.
		const { available: _omitted, ...withoutAvailable } = bot();
		const { queryByText } = render(BotCatalogCard, { bot: withoutAvailable as CatalogBot });
		expect(queryByText(/playing now/)).toBeNull();
	});

	it('flags a bot at its declared capacity as "playing now" (#224) — advisory, the card stays clickable', () => {
		const { getByText, getByRole } = render(BotCatalogCard, { bot: bot({ available: false }) });
		expect(getByText(/playing now/)).toBeTruthy();
		expect(getByRole('button', { name: 'Play →' })).toBeTruthy();
	});

	it('wires the challenge panel with this card team and name', async () => {
		wakeBotMock.mockResolvedValue({ alive: true });
		const { getByRole } = render(BotCatalogCard, { bot: bot({ team: 'gcp', name: 'oracle-3' }) });
		await fireEvent.click(getByRole('button', { name: 'Play →' }));
		expect(wakeBotMock).toHaveBeenCalledWith('gcp', 'oracle-3');
	});
});
