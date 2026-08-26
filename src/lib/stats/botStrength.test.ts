import { describe, expect, it } from 'vitest';
import type { LeaderRow } from '../leaderboard/leaderboardApi';
import type { StrengthRank } from '../strength/strengthApi';
import { buildBotStrengthRows, formatRelativeElo, parseBotIdentity } from './botStrength';

const strength = (player: string, elo: number): StrengthRank => ({
	player,
	elo,
	ciLow: elo - 20,
	ciHigh: elo + 35,
});

const ladder = (team: string, name: string): LeaderRow => ({
	rank: 7,
	kind: 'bot',
	team,
	name,
	rating: 1720,
	rd: 85,
	onLadder: true,
	games: 42,
	wins: 30,
	draws: 2,
	losses: 10,
});

describe('botStrength stats', () => {
	it('keeps Bradley-Terry order and every strength row when leaderboard coverage differs', () => {
		const ranking = [strength('acme/alice', 42), strength('lab/orphan', -9)];
		const rows = buildBotStrengthRows(ranking, [ladder('acme', 'alice'), ladder('extra', 'bot')]);

		expect(rows.map((row) => [row.rank, row.player])).toEqual([
			[1, 'acme/alice'],
			[2, 'lab/orphan'],
		]);
		expect(rows[0].ladder?.rating).toBe(1720);
		expect(rows[1].ladder).toBeNull();
	});

	it('never joins a person row that happens to resemble a bot identity', () => {
		const person = { ...ladder('acme', 'alice'), kind: 'player' as const };
		expect(buildBotStrengthRows([strength('acme/alice', 1)], [person])[0].ladder).toBeNull();
	});

	it('keeps strength order when a Dexus-style higher Glicko rating disagrees with Hunter', () => {
		const hunter = { ...ladder('azure', 'hunter-book'), rating: 1660 };
		const dexus = { ...ladder('dexus', 'kcp-one-ply-1'), rating: 1740 };
		const rows = buildBotStrengthRows(
			[strength('azure/hunter-book', 121), strength('dexus/kcp-one-ply-1', 88)],
			[dexus, hunter],
		);

		expect(rows.map((row) => row.player)).toEqual(['azure/hunter-book', 'dexus/kcp-one-ply-1']);
		expect(rows[0].ladder?.rating).toBeLessThan(rows[1].ladder?.rating ?? 0);
	});

	it('parses documented identities but preserves malformed values through a null identity', () => {
		expect(parseBotIdentity('acme/alice')).toEqual({ team: 'acme', name: 'alice' });
		expect(parseBotIdentity('future-wire-value')).toBeNull();
		expect(parseBotIdentity('a/b/c')).toBeNull();
	});

	it('formats relative Elo with an explicit positive sign and stable rounding', () => {
		expect(formatRelativeElo(42.4)).toBe('+42');
		expect(formatRelativeElo(-9.6)).toBe('-10');
		expect(formatRelativeElo(0.2)).toBe('0');
	});
});
