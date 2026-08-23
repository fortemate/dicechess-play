import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/sveltekit';
import { dropSelfHealingChunkErrors, type SelfHealHost } from './sentryFilters';
import { RELOADED_AT_KEY } from './staleBundleRecovery';

const TIME_ORIGIN = 1_000_000;

function hostWithReloadAt(reloadedAt: string | null): SelfHealHost {
	return {
		sessionStorage: { getItem: (key) => (key === RELOADED_AT_KEY ? reloadedAt : null) },
		timeOrigin: TIME_ORIGIN,
	};
}

function chunkError(value: string): ErrorEvent {
	return { type: undefined, exception: { values: [{ type: 'TypeError', value }] } };
}

describe('dropSelfHealingChunkErrors', () => {
	it('drops a chunk failure while the recovery reload is still pending', () => {
		const event = chunkError('Failed to fetch dynamically imported module: https://x/_app/a.js');
		expect(
			dropSelfHealingChunkErrors(event, {}, hostWithReloadAt(`${TIME_ORIGIN + 5}`)),
		).toBeNull();
	});

	it.each([
		'error loading dynamically imported module',
		'Importing a module script failed.',
		'Unable to preload CSS for /_app/immutable/assets/x.css',
	])('recognises the same failure worded as %j', (message) => {
		const host = hostWithReloadAt(`${TIME_ORIGIN + 5}`);
		expect(dropSelfHealingChunkErrors(chunkError(message), {}, host)).toBeNull();
	});

	it('keeps a chunk failure that already survived a reload', () => {
		// Written by the previous document: the reload happened and the import broke again.
		const event = chunkError('Failed to fetch dynamically imported module: https://x/_app/a.js');
		expect(dropSelfHealingChunkErrors(event, {}, hostWithReloadAt(`${TIME_ORIGIN - 5}`))).toBe(
			event,
		);
	});

	it('keeps a chunk failure when no reload was ever attempted', () => {
		const event = chunkError('Failed to fetch dynamically imported module: https://x/_app/a.js');
		expect(dropSelfHealingChunkErrors(event, {}, hostWithReloadAt(null))).toBe(event);
	});

	it('keeps everything that is not a chunk failure', () => {
		const event = chunkError('Cannot read properties of undefined (reading "applyMove")');
		expect(dropSelfHealingChunkErrors(event, {}, hostWithReloadAt(`${TIME_ORIGIN + 5}`))).toBe(
			event,
		);
	});

	it('matches the message on an event that carries no exception', () => {
		const event: ErrorEvent = { type: undefined, message: 'Importing a module script failed.' };
		expect(
			dropSelfHealingChunkErrors(event, {}, hostWithReloadAt(`${TIME_ORIGIN + 5}`)),
		).toBeNull();
	});

	it('reports rather than swallows when sessionStorage is unreadable', () => {
		const event = chunkError('Failed to fetch dynamically imported module: https://x/_app/a.js');
		const host: SelfHealHost = {
			sessionStorage: {
				getItem: () => {
					throw new Error('SecurityError');
				},
			},
			timeOrigin: TIME_ORIGIN,
		};
		expect(dropSelfHealingChunkErrors(event, {}, host)).toBe(event);
	});
});
