import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logger, Logger } from './logger';

/**
 * Test subclass that allows mocking the isDev() method for environment-dependent tests.
 */
class TestLogger extends Logger {
	private devMode: boolean = true;

	setDevMode(isDev: boolean): void {
		this.devMode = isDev;
	}

	protected isDev(): boolean {
		return this.devMode;
	}
}

describe('logger', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('debug', () => {
		it('should log debug message in development', () => {
			const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
			const testLogger = new TestLogger();
			testLogger.setDevMode(true);

			testLogger.debug('Test debug message');

			expect(spy).toHaveBeenCalledWith('[DEBUG] Test debug message');
			spy.mockRestore();
		});

		it('should suppress debug message in production', () => {
			const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
			const testLogger = new TestLogger();
			testLogger.setDevMode(false);

			testLogger.debug('Test debug message');

			expect(spy).not.toHaveBeenCalled();
			spy.mockRestore();
		});

		it('should include payload with debug message', () => {
			const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
			const testLogger = new TestLogger();
			testLogger.setDevMode(true);

			const payload = { userId: 123, action: 'login' };
			testLogger.debug('User action', payload);

			expect(spy).toHaveBeenCalledWith('[DEBUG] User action', payload);
			spy.mockRestore();
		});

		it('should handle Error objects in debug payload', () => {
			const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
			const testLogger = new TestLogger();
			testLogger.setDevMode(true);

			const error = new Error('Test error');
			testLogger.debug('Error occurred', error);

			const call = spy.mock.calls[0];
			expect(call[0]).toBe('[DEBUG] Error occurred');
			expect(call[1]).toHaveProperty('name', 'Error');
			expect(call[1]).toHaveProperty('message', 'Test error');
			expect(call[1]).toHaveProperty('stack');
			spy.mockRestore();
		});
	});

	describe('info', () => {
		it('should log info message in development', () => {
			const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
			const testLogger = new TestLogger();
			testLogger.setDevMode(true);

			testLogger.info('Test info message');

			expect(spy).toHaveBeenCalledWith('[INFO] Test info message');
			spy.mockRestore();
		});

		it('should suppress info message in production', () => {
			const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
			const testLogger = new TestLogger();
			testLogger.setDevMode(false);

			testLogger.info('Test info message');

			expect(spy).not.toHaveBeenCalled();
			spy.mockRestore();
		});

		it('should include payload with info message', () => {
			const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
			const testLogger = new TestLogger();
			testLogger.setDevMode(true);

			const payload = { gameId: 'abc123', status: 'loaded' };
			testLogger.info('Game loaded', payload);

			expect(spy).toHaveBeenCalledWith('[INFO] Game loaded', payload);
			spy.mockRestore();
		});

		it('should handle Error objects in info payload', () => {
			const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
			const testLogger = new TestLogger();
			testLogger.setDevMode(true);

			const error = new Error('Parsing failed');
			testLogger.info('Warning about error', error);

			const call = spy.mock.calls[0];
			expect(call[0]).toBe('[INFO] Warning about error');
			expect(call[1]).toHaveProperty('message', 'Parsing failed');
			spy.mockRestore();
		});
	});

	describe('warn', () => {
		it('should always log warn message', () => {
			const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const testLogger = new TestLogger();
			testLogger.setDevMode(false);

			testLogger.warn('Test warning');

			expect(spy).toHaveBeenCalledWith('[WARN] Test warning');
			spy.mockRestore();
		});

		it('should log warn message in development', () => {
			const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const testLogger = new TestLogger();
			testLogger.setDevMode(true);

			testLogger.warn('Test warning');

			expect(spy).toHaveBeenCalledWith('[WARN] Test warning');
			spy.mockRestore();
		});

		it('should include payload with warn message', () => {
			const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const testLogger = new TestLogger();

			const payload = { threshold: 1000, actual: 2500 };
			testLogger.warn('Performance degradation', payload);

			expect(spy).toHaveBeenCalledWith('[WARN] Performance degradation', payload);
			spy.mockRestore();
		});

		it('should handle Error objects in warn payload', () => {
			const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const testLogger = new TestLogger();

			const error = new Error('Retry needed');
			testLogger.warn('Operation failed', error);

			const call = spy.mock.calls[0];
			expect(call[0]).toBe('[WARN] Operation failed');
			expect(call[1]).toHaveProperty('message', 'Retry needed');
			spy.mockRestore();
		});
	});

	describe('error', () => {
		it('should always log error message', () => {
			const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const testLogger = new TestLogger();
			testLogger.setDevMode(false);

			testLogger.error('Test error');

			expect(spy).toHaveBeenCalledWith('[ERROR] Test error');
			spy.mockRestore();
		});

		it('should log error message in development', () => {
			const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const testLogger = new TestLogger();
			testLogger.setDevMode(true);

			testLogger.error('Test error');

			expect(spy).toHaveBeenCalledWith('[ERROR] Test error');
			spy.mockRestore();
		});

		it('should include payload with error message', () => {
			const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const testLogger = new TestLogger();

			const payload = { statusCode: 500, details: 'Internal server error' };
			testLogger.error('API request failed', payload);

			expect(spy).toHaveBeenCalledWith('[ERROR] API request failed', payload);
			spy.mockRestore();
		});

		it('should format Error objects with stack trace', () => {
			const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const testLogger = new TestLogger();

			const error = new Error('Network timeout');
			testLogger.error('Critical error', error);

			const call = spy.mock.calls[0];
			expect(call[0]).toBe('[ERROR] Critical error');
			expect(call[1]).toHaveProperty('name', 'Error');
			expect(call[1]).toHaveProperty('message', 'Network timeout');
			expect(call[1]).toHaveProperty('stack');
			spy.mockRestore();
		});

		it('should handle various payload types', () => {
			const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const testLogger = new TestLogger();

			testLogger.error('String payload', 'error details');
			expect(spy).toHaveBeenNthCalledWith(1, '[ERROR] String payload', 'error details');

			testLogger.error('Number payload', 404);
			expect(spy).toHaveBeenNthCalledWith(2, '[ERROR] Number payload', 404);

			testLogger.error('Boolean payload', true);
			expect(spy).toHaveBeenNthCalledWith(3, '[ERROR] Boolean payload', true);

			testLogger.error('Null payload', null);
			expect(spy).toHaveBeenNthCalledWith(4, '[ERROR] Null payload', null);

			spy.mockRestore();
		});
	});

	describe('payload handling', () => {
		it('should handle primitive string payloads', () => {
			const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const testLogger = new TestLogger();

			testLogger.warn('Warning', 'primitive string');

			expect(spy).toHaveBeenCalledWith('[WARN] Warning', 'primitive string');
			spy.mockRestore();
		});

		it('should handle primitive number payloads', () => {
			const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const testLogger = new TestLogger();

			testLogger.warn('Warning', 42);

			expect(spy).toHaveBeenCalledWith('[WARN] Warning', 42);
			spy.mockRestore();
		});

		it('should handle boolean payloads', () => {
			const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const testLogger = new TestLogger();

			testLogger.warn('Warning', false);

			expect(spy).toHaveBeenCalledWith('[WARN] Warning', false);
			spy.mockRestore();
		});

		it('should handle null payloads', () => {
			const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const testLogger = new TestLogger();

			testLogger.warn('Warning', null);

			expect(spy).toHaveBeenCalledWith('[WARN] Warning', null);
			spy.mockRestore();
		});

		it('should handle object payloads', () => {
			const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const testLogger = new TestLogger();

			const obj = { key: 'value', nested: { prop: 123 } };
			testLogger.warn('Warning', obj);

			expect(spy).toHaveBeenCalledWith('[WARN] Warning', obj);
			spy.mockRestore();
		});

		it('should handle custom Error subclasses', () => {
			const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const testLogger = new TestLogger();

			class CustomError extends Error {
				constructor(message: string) {
					super(message);
					this.name = 'CustomError';
				}
			}

			const error = new CustomError('Custom failure');
			testLogger.error('Error occurred', error);

			const call = spy.mock.calls[0];
			expect(call[1]).toHaveProperty('name', 'CustomError');
			expect(call[1]).toHaveProperty('message', 'Custom failure');
			spy.mockRestore();
		});
	});

	describe('message without payload', () => {
		it('debug without payload should only log message', () => {
			const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
			const testLogger = new TestLogger();
			testLogger.setDevMode(true);

			testLogger.debug('Just a message');

			expect(spy).toHaveBeenCalledWith('[DEBUG] Just a message');
			expect(spy).toHaveBeenCalledTimes(1);
			spy.mockRestore();
		});

		it('info without payload should only log message', () => {
			const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
			const testLogger = new TestLogger();
			testLogger.setDevMode(true);

			testLogger.info('Just a message');

			expect(spy).toHaveBeenCalledWith('[INFO] Just a message');
			expect(spy).toHaveBeenCalledTimes(1);
			spy.mockRestore();
		});

		it('warn without payload should only log message', () => {
			const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const testLogger = new TestLogger();

			testLogger.warn('Just a message');

			expect(spy).toHaveBeenCalledWith('[WARN] Just a message');
			expect(spy).toHaveBeenCalledTimes(1);
			spy.mockRestore();
		});

		it('error without payload should only log message', () => {
			const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const testLogger = new TestLogger();

			testLogger.error('Just a message');

			expect(spy).toHaveBeenCalledWith('[ERROR] Just a message');
			expect(spy).toHaveBeenCalledTimes(1);
			spy.mockRestore();
		});
	});

	describe('development environment filtering', () => {
		it('debug and info should be suppressed when DEV is false', () => {
			const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
			const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
			const testLogger = new TestLogger();
			testLogger.setDevMode(false);

			testLogger.debug('Debug message');
			testLogger.info('Info message');

			expect(debugSpy).not.toHaveBeenCalled();
			expect(infoSpy).not.toHaveBeenCalled();

			debugSpy.mockRestore();
			infoSpy.mockRestore();
		});

		it('warn and error should always be logged regardless of DEV', () => {
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const testLogger = new TestLogger();
			testLogger.setDevMode(false);

			testLogger.warn('Warning message');
			testLogger.error('Error message');

			expect(warnSpy).toHaveBeenCalledWith('[WARN] Warning message');
			expect(errorSpy).toHaveBeenCalledWith('[ERROR] Error message');

			warnSpy.mockRestore();
			errorSpy.mockRestore();
		});
	});

	describe('singleton instance behavior', () => {
		it('should respect actual DEV environment in production build', () => {
			// This test verifies that the actual logger uses import.meta.env.DEV
			// In a dev build, this will log; in production, it won't
			const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});

			logger.debug('Test with actual logger');

			// If we're running tests, import.meta.env.DEV should be true
			// So this should have been called
			if (import.meta.env.DEV) {
				expect(spy).toHaveBeenCalledWith('[DEBUG] Test with actual logger');
			}
			spy.mockRestore();
		});
	});
});
