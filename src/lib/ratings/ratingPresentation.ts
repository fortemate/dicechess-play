// Presentation of the public Glicko-2 contract (#124). Recorded intervals/order values win over
// documented legacy conversions; absent provenance stays unknown. This module never ranks rows
// or combines training, competitive, categories or epochs.
export interface RatingEstimateInput {
	rating: number;
	rd?: number | null;
	provisional?: boolean;
	ciLow?: number | null;
	ciHigh?: number | null;
	algorithm?: string | null;
	algorithmVersion?: string | null;
	epoch?: number | null;
	cutoff?: string | null;
	computedAt?: string | null;
}

const finite = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);

export function confidenceInterval(
	estimate: RatingEstimateInput,
): { low: number; high: number } | null {
	if (!finite(estimate.rating)) return null;
	if (estimate.ciLow != null || estimate.ciHigh != null) {
		return finite(estimate.ciLow) && finite(estimate.ciHigh) && estimate.ciLow <= estimate.ciHigh
			? { low: estimate.ciLow, high: estimate.ciHigh }
			: null;
	}
	if (estimate.algorithm && estimate.algorithm !== 'glicko2') return null;
	if (!finite(estimate.rd) || estimate.rd < 0) return null;
	return { low: estimate.rating - 1.96 * estimate.rd, high: estimate.rating + 1.96 * estimate.rd };
}

export function orderingScore(
	row: RatingEstimateInput & { orderingValue?: number | null; orderingRule?: string | null },
): number | null {
	if (finite(row.orderingValue)) return row.orderingValue;
	if (row.orderingRule && row.orderingRule !== 'conservative-rating') return null;
	if (row.algorithm && row.algorithm !== 'glicko2') return null;
	return finite(row.rating) && finite(row.rd) && row.rd >= 0 ? row.rating - 2 * row.rd : null;
}

export function knownEpoch(value: unknown): value is number {
	return finite(value) && Number.isInteger(value) && value > 0;
}

/** Compare ISO instants without Date's millisecond precision loss or formatting differences. */
export function sameRatingCutoff(left: string, right: string): boolean {
	const instant = (value: string): bigint | null => {
		const match = value.match(
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,9}))?(?:Z|[+-]\d{2}:\d{2})$/,
		);
		const millis = Date.parse(value);
		if (!match || !Number.isFinite(millis)) return null;
		return (
			BigInt(Math.floor(millis / 1000)) * 1_000_000_000n + BigInt((match[1] ?? '').padEnd(9, '0'))
		);
	};
	const a = instant(left);
	return a !== null && a === instant(right);
}

/** UTC is explicit so a saved cutoff names the same instant on every reader's device. */
export function ratingDate(value: string | null | undefined): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return null;
	const formatted = new Intl.DateTimeFormat('en-GB', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		timeZone: 'UTC',
	}).format(date);
	// Preserve the API's sub-millisecond cutoff identity; Date alone would collapse distinct snapshots.
	const fraction = value.match(/\.(\d{1,9})(?:Z|[+-]\d{2}:\d{2})$/)?.[1];
	return fraction ? `${formatted}.${fraction}` : formatted;
}
