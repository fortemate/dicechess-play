/**
 * Centralized logging utility for the Dice Chess Trainer frontend.
 *
 * This module provides a structured logging API that respects Vite's environment variables:
 * - `debug` and `info` messages are suppressed in production (`import.meta.env.DEV === false`)
 * - `warn` and `error` messages are always logged
 *
 * Usage:
 * ```typescript
 * import { logger } from '$lib/utils/logger';
 *
 * logger.debug('Loading game...', { gameId: '123' });
 * logger.info('User authenticated', userProfile);
 * logger.warn('Performance issue detected', { duration: 5000 });
 * logger.error('Failed to fetch games', error);
 * ```
 */

type LogPayload = string | number | boolean | null | undefined | object | Error;

/**
 * Logger class providing structured logging with environment-aware filtering.
 */
class Logger {
	/**
	 * Check if we're in development mode.
	 * This is extracted to a method to allow for testing/mocking.
	 */
	protected isDev(): boolean {
		return import.meta.env.DEV;
	}

	/**
	 * Log a debug message (suppressed in production).
	 * @param message - The log message
	 * @param payload - Optional context object, error, or primitive value
	 */
	debug(message: string, payload?: LogPayload): void {
		if (!this.isDev()) return;
		this.logDebug(message, payload);
	}

	/**
	 * Log an info message (suppressed in production).
	 * @param message - The log message
	 * @param payload - Optional context object, error, or primitive value
	 */
	info(message: string, payload?: LogPayload): void {
		if (!this.isDev()) return;
		this.logInfo(message, payload);
	}

	/**
	 * Log a warning message (always logged).
	 * @param message - The log message
	 * @param payload - Optional context object, error, or primitive value
	 */
	warn(message: string, payload?: LogPayload): void {
		this.logWarn(message, payload);
	}

	/**
	 * Log an error message (always logged).
	 * @param message - The log message
	 * @param payload - Optional context object, error, or primitive value
	 */
	error(message: string, payload?: LogPayload): void {
		this.logError(message, payload);
	}

	/**
	 * Internal method for debug logging.
	 */
	private logDebug(message: string, payload?: LogPayload): void {
		if (payload !== undefined) {
			console.debug(`[DEBUG] ${message}`, this.formatPayload(payload));
		} else {
			console.debug(`[DEBUG] ${message}`);
		}
	}

	/**
	 * Internal method for info logging.
	 */
	private logInfo(message: string, payload?: LogPayload): void {
		if (payload !== undefined) {
			console.info(`[INFO] ${message}`, this.formatPayload(payload));
		} else {
			console.info(`[INFO] ${message}`);
		}
	}

	/**
	 * Internal method for warning logging.
	 */
	private logWarn(message: string, payload?: LogPayload): void {
		if (payload !== undefined) {
			console.warn(`[WARN] ${message}`, this.formatPayload(payload));
		} else {
			console.warn(`[WARN] ${message}`);
		}
	}

	/**
	 * Internal method for error logging.
	 */
	private logError(message: string, payload?: LogPayload): void {
		if (payload !== undefined) {
			console.error(`[ERROR] ${message}`, this.formatPayload(payload));
		} else {
			console.error(`[ERROR] ${message}`);
		}
	}

	/**
	 * Format payload for consistent console output.
	 * Handles Error objects specially to preserve stack traces.
	 */
	private formatPayload(payload: LogPayload): LogPayload {
		if (payload instanceof Error) {
			return {
				name: payload.name,
				message: payload.message,
				stack: payload.stack,
			};
		}
		return payload;
	}
}

/**
 * Singleton logger instance.
 * Export this to use throughout the application.
 */
export const logger = new Logger();

export type { LogPayload };
export { Logger };
