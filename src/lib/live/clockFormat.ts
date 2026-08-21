// Render a remaining-time clock. Under ten seconds shows tenths (the part that matters in a scramble);
// otherwise m:ss. Negative input clamps to zero.

const LOW_TIME_MS = 10_000;

export function formatClock(ms: number): string {
	const total = Math.max(0, ms);
	// Floor to tenths (not round) so a value just under ten seconds never renders as "10.0".
	if (total < LOW_TIME_MS) return (Math.floor(total / 100) / 10).toFixed(1);
	const seconds = Math.floor(total / 1000);
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Whether a clock is in the "low time" band that warrants a warning style. */
export function isLowTime(ms: number): boolean {
	return ms <= LOW_TIME_MS;
}
