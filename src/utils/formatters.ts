/**
 * Locale constants. These constants serve as the single seam a future locale switch hooks into (i18n epic #8).
 */
export const RATING_LOCALE = 'en-US';
export const DATE_LOCALE = 'en-GB';

const wholeNumberFormatter = new Intl.NumberFormat(RATING_LOCALE, { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
});

/**
 * Formats a number as a whole number using the rating locale.
 * @param value - The number to format.
 * @returns Formatted number string.
 */
export function formatWholeNumber(value: number): string {
	return wholeNumberFormatter.format(value);
}

/**
 * Formats a date string to a human-readable format using the date locale.
 * @param dateString - The date string to format (ISO 8601 or similar).
 * @returns Formatted date string or "Unknown Date" if parsing fails.
 */
export function formatDate(dateString?: string | null): string {
	if (!dateString) return 'Unknown Date';
	try {
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return 'Unknown Date';

		return dateFormatter.format(date);
	} catch {
		return 'Unknown Date';
	}
}

export type GameResult = -1 | 0 | 1;

/**
 * Formats a completed game's result into a standard chess result string.
 * @param result - Backend result value where 1 is white win, -1 is black win, 0 is draw.
 * @returns Human-readable result text or an empty string when a result is absent/invalid.
 */
export function formatGameResult(result?: number | null): string {
	switch (result) {
		case 1:
			return '1-0 • White wins';
		case -1:
			return '0-1 • Black wins';
		case 0:
			return '½-½ • Draw';
		default:
			return '';
	}
}
