/**
 * Public read client for play-api's cached strength report. The wire below mirrors
 * `StrengthRoutes.scala` verbatim: Bradley-Terry produces the pool ranking, while the
 * pairwise SPRT records remain available for future matchup-detail surfaces. This page
 * never recomputes either statistic in the browser.
 */
import { apiBase } from '../live/liveApi';
import type { RatingCategory } from '../live/ratingCategory';

export type SprtVerdict = 'AcceptH1' | 'AcceptH0' | 'Continue';

export interface PentanomialCounts {
	n0: number;
	n1: number;
	n2: number;
	n3: number;
	n4: number;
}

export interface TrinomialCounts {
	losses: number;
	draws: number;
	wins: number;
}

export interface SprtVerdictResult {
	llr: number;
	lower: number;
	upper: number;
	verdict: SprtVerdict;
	observations: number;
}

export interface PairwiseStrength {
	perspective: string;
	opponent: string;
	pairs: PentanomialCounts;
	singles: TrinomialCounts;
	result: SprtVerdictResult;
}

/** One Bradley-Terry row. Elo is relative to this report's pool (mean 0), and the
 * confidence bounds are independent bootstrap percentiles, so they need not be symmetric.
 * `losVsNext` is absent/null on the last row depending on the server JSON printer.
 */
export interface StrengthRank {
	player: string;
	elo: number;
	ciLow: number;
	ciHigh: number;
	losVsNext?: number | null;
}

export interface StrengthReport {
	/** The one rating category whose eligible bot-vs-bot games feed this report. */
	category: RatingCategory;
	pairwise: PairwiseStrength[];
	ranking: StrengthRank[];
	completePairs: number;
	singles: number;
	excludedRows: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);

const isCount = (value: unknown): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isRatingCategory = (value: unknown): value is RatingCategory =>
	value === 'bullet' || value === 'blitz' || value === 'rapid';

const isPentanomial = (value: unknown): value is PentanomialCounts =>
	isRecord(value) &&
	isCount(value.n0) &&
	isCount(value.n1) &&
	isCount(value.n2) &&
	isCount(value.n3) &&
	isCount(value.n4);

const isTrinomial = (value: unknown): value is TrinomialCounts =>
	isRecord(value) && isCount(value.losses) && isCount(value.draws) && isCount(value.wins);

const isSprtResult = (value: unknown): value is SprtVerdictResult =>
	isRecord(value) &&
	isFiniteNumber(value.llr) &&
	isFiniteNumber(value.lower) &&
	isFiniteNumber(value.upper) &&
	(value.verdict === 'AcceptH1' || value.verdict === 'AcceptH0' || value.verdict === 'Continue') &&
	isCount(value.observations);

const isPairwiseStrength = (value: unknown): value is PairwiseStrength =>
	isRecord(value) &&
	typeof value.perspective === 'string' &&
	value.perspective.length > 0 &&
	typeof value.opponent === 'string' &&
	value.opponent.length > 0 &&
	isPentanomial(value.pairs) &&
	isTrinomial(value.singles) &&
	isSprtResult(value.result);

const isStrengthRank = (value: unknown): value is StrengthRank =>
	isRecord(value) &&
	typeof value.player === 'string' &&
	value.player.length > 0 &&
	isFiniteNumber(value.elo) &&
	isFiniteNumber(value.ciLow) &&
	isFiniteNumber(value.ciHigh) &&
	value.ciLow <= value.elo &&
	value.elo <= value.ciHigh &&
	(value.losVsNext === undefined ||
		value.losVsNext === null ||
		(isFiniteNumber(value.losVsNext) && value.losVsNext >= 0 && value.losVsNext <= 1));

/** Validates the hand-mirrored public wire at its network boundary. The UI must not silently
 * publish `undefined`, NaN, or a future incompatible report as if it were a statistical result.
 */
export function parseStrengthReport(value: unknown): StrengthReport {
	if (
		!isRecord(value) ||
		!isRatingCategory(value.category) ||
		!Array.isArray(value.pairwise) ||
		!value.pairwise.every(isPairwiseStrength) ||
		!Array.isArray(value.ranking) ||
		!value.ranking.every(isStrengthRank) ||
		!isCount(value.completePairs) ||
		!isCount(value.singles) ||
		!isCount(value.excludedRows)
	) {
		throw new Error('fetchStrengthReport invalid response');
	}
	return value as unknown as StrengthReport;
}

/** Fetches the cached, public pool-strength report. A cold server answers 503; callers should
 * present that as temporarily unavailable rather than trying to rebuild the statistic locally.
 */
export async function fetchStrengthReport(): Promise<StrengthReport> {
	const res = await fetch(`${apiBase()}/strength`);
	if (!res.ok) throw new Error(`fetchStrengthReport failed: ${res.status}`);
	return parseStrengthReport(await res.json());
}
