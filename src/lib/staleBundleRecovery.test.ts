import { afterEach, describe, expect, it, vi } from 'vitest';

import { attachStaleBundleRecovery } from './staleBundleRecovery';

function makeHost() {
	const target = new EventTarget();
	const store = new Map<string, string>();
	const reload = vi.fn();
	return {
		host: {
			addEventListener: target.addEventListener.bind(target),
			location: { reload },
			sessionStorage: {
				getItem: (key: string) => store.get(key) ?? null,
				setItem: (key: string, value: string) => {
					store.set(key, value);
				},
			},
		},
		reload,
		fire: () => {
			const event = new Event('vite:preloadError', { cancelable: true });
			target.dispatchEvent(event);
			return event;
		},
	};
}

afterEach(() => {
	vi.useRealTimers();
});

describe('attachStaleBundleRecovery', () => {
	it('reloads the page once and swallows the event when a chunk fails to load', () => {
		const { host, reload, fire } = makeHost();
		attachStaleBundleRecovery(host);

		const event = fire();

		expect(reload).toHaveBeenCalledTimes(1);
		expect(event.defaultPrevented).toBe(true);
	});

	it('does not reload again inside the retry window and lets the error surface', () => {
		const { host, reload, fire } = makeHost();
		attachStaleBundleRecovery(host);

		fire();
		const second = fire();

		expect(reload).toHaveBeenCalledTimes(1);
		expect(second.defaultPrevented).toBe(false);
	});

	it('recovers again once the retry window has passed (a later deploy in the same tab)', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-09T10:00:00Z'));
		const { host, reload, fire } = makeHost();
		attachStaleBundleRecovery(host);

		fire();
		vi.setSystemTime(new Date('2026-08-09T10:01:00Z'));
		fire();

		expect(reload).toHaveBeenCalledTimes(2);
	});

	it('never auto-reloads when sessionStorage is unusable — no loop guard, no reload', () => {
		const { host, reload, fire } = makeHost();
		host.sessionStorage.getItem = () => {
			throw new Error('storage disabled');
		};
		attachStaleBundleRecovery(host);

		const event = fire();

		expect(reload).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
	});
});
