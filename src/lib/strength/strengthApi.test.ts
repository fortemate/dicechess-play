import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchStrengthReport, parseStrengthReport } from './strengthApi';

describe('strengthApi', () => {
	beforeEach(() => vi.stubEnv('VITE_PLAY_API_URL', 'http://localhost:8080'));
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it('GETs the public cached report and preserves the wire shape', async () => {
		const report = {
			category: 'blitz',
			pairwise: [
				{
					perspective: 'acme/alice',
					opponent: 'acme/bob',
					pairs: { n0: 1, n1: 0, n2: 2, n3: 4, n4: 9 },
					singles: { losses: 0, draws: 1, wins: 2 },
					result: {
						llr: 1.8,
						lower: -2.89,
						upper: 2.89,
						verdict: 'Continue',
						observations: 19,
					},
				},
			],
			ranking: [{ player: 'acme/alice', elo: 42, ciLow: 10, ciHigh: 74, losVsNext: 0.91 }],
			completePairs: 16,
			singles: 3,
			excludedRows: 2,
		};
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => report });
		vi.stubGlobal('fetch', fetchMock);

		expect(await fetchStrengthReport()).toEqual(report);
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/strength');
	});

	it('throws with the status while the report cache is cold', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
		await expect(fetchStrengthReport()).rejects.toThrow('fetchStrengthReport failed: 503');
	});

	it('rejects malformed required fields instead of publishing a broken statistic', () => {
		expect(() =>
			parseStrengthReport({
				category: 'blitz',
				pairwise: [],
				ranking: [{ player: 'acme/alice', elo: Number.NaN, ciLow: 0, ciHigh: 1 }],
				completePairs: 0,
				singles: 0,
				excludedRows: 0,
			}),
		).toThrow('fetchStrengthReport invalid response');
		expect(() =>
			parseStrengthReport({
				category: 'unknown',
				pairwise: [],
				ranking: [],
				completePairs: 0,
				singles: 0,
				excludedRows: 0,
			}),
		).toThrow('fetchStrengthReport invalid response');
	});
});
