import { describe, expect, it } from 'vitest';
import {
	buildCapabilityView,
	declaredSelection,
	droppedByCapabilityPatch,
	selectionChanged,
	writableSelection,
} from './webhookCapabilities';
import type { WebhookCapabilityDescriptor } from './webhookApi';

/** The live registry as play-api serves it today: `draws` available, `doubling` reserved. */
const registry: WebhookCapabilityDescriptor[] = [
	{ name: 'draws', status: 'available', selectable: true },
	{ name: 'doubling', status: 'reserved', selectable: false },
];

describe('buildCapabilityView', () => {
	it('offers the available capability as editable and marks it declared', () => {
		const view = buildCapabilityView(registry, ['draws']);
		expect(view.selectable).toEqual([
			{ name: 'draws', availability: 'available', selectable: true, declared: true },
		]);
	});

	it('keeps a reserved capability out of the editable set entirely', () => {
		const view = buildCapabilityView(registry, ['draws']);
		expect(view.selectable.map((row) => row.name)).not.toContain('doubling');
		expect(view.reserved).toEqual([
			{ name: 'doubling', availability: 'reserved', selectable: false, declared: false },
		]);
	});

	it('activates a capability purely from the catalog, with no client release', () => {
		// The day play-api promotes `doubling` to available, the same code must offer it.
		const promoted: WebhookCapabilityDescriptor[] = [
			{ name: 'draws', status: 'available', selectable: true },
			{ name: 'doubling', status: 'available', selectable: true },
		];
		const view = buildCapabilityView(promoted, ['doubling']);
		expect(view.reserved).toEqual([]);
		expect(view.selectable.map((row) => row.name)).toEqual(['draws', 'doubling']);
		expect(writableSelection(view, ['doubling'])).toEqual(['doubling']);
	});

	it('surfaces an unknown legacy value as read-only rather than dropping it silently', () => {
		const view = buildCapabilityView(registry, ['draws', 'telepathy']);
		expect(view.unknown).toEqual([
			{ name: 'telepathy', availability: 'unknown', selectable: false, declared: true },
		]);
		expect(view.selectable.map((row) => row.name)).toEqual(['draws']);
	});

	it('preserves registry order for known rows regardless of declaration order', () => {
		const view = buildCapabilityView(registry, ['doubling', 'draws']);
		expect([...view.selectable, ...view.reserved].map((row) => row.name)).toEqual([
			'draws',
			'doubling',
		]);
	});

	it('de-duplicates repeated unknown values', () => {
		const view = buildCapabilityView(registry, ['ghost', 'ghost']);
		expect(view.unknown.map((row) => row.name)).toEqual(['ghost']);
	});

	it('matches names exactly — no aliases, case folding, or trimming', () => {
		const view = buildCapabilityView(registry, ['Draws', ' draws']);
		expect(declaredSelection(view)).toEqual([]);
		expect(view.unknown.map((row) => row.name)).toEqual(['Draws', ' draws']);
	});

	it('tolerates an empty catalog, treating every declared value as unknown', () => {
		const view = buildCapabilityView([], ['draws']);
		expect(view.selectable).toEqual([]);
		expect(view.unknown.map((row) => row.name)).toEqual(['draws']);
	});
});

describe('droppedByCapabilityPatch', () => {
	it('is empty when every declared value is writable', () => {
		expect(droppedByCapabilityPatch(buildCapabilityView(registry, ['draws']))).toEqual([]);
	});

	it('names unknown values, which a capability PATCH cannot write back', () => {
		expect(droppedByCapabilityPatch(buildCapabilityView(registry, ['telepathy']))).toEqual([
			'telepathy',
		]);
	});

	it('names a declared capability that the registry has since demoted to reserved', () => {
		expect(droppedByCapabilityPatch(buildCapabilityView(registry, ['doubling']))).toEqual([
			'doubling',
		]);
	});

	it('does not name a reserved capability the registration never declared', () => {
		expect(droppedByCapabilityPatch(buildCapabilityView(registry, []))).toEqual([]);
	});
});

describe('writableSelection', () => {
	it('drops a reserved name so the write cannot be lost to a 422', () => {
		const view = buildCapabilityView(registry, ['draws']);
		expect(writableSelection(view, ['draws', 'doubling'])).toEqual(['draws']);
	});

	it('drops an unknown name for the same reason', () => {
		const view = buildCapabilityView(registry, ['draws']);
		expect(writableSelection(view, ['draws', 'telepathy'])).toEqual(['draws']);
	});

	it('returns registry order, not selection order', () => {
		const promoted: WebhookCapabilityDescriptor[] = [
			{ name: 'draws', status: 'available', selectable: true },
			{ name: 'doubling', status: 'available', selectable: true },
		];
		const view = buildCapabilityView(promoted, []);
		expect(writableSelection(view, ['doubling', 'draws'])).toEqual(['draws', 'doubling']);
	});
});

describe('selectionChanged', () => {
	it('is false for the stored selection', () => {
		const view = buildCapabilityView(registry, ['draws']);
		expect(selectionChanged(view, ['draws'])).toBe(false);
	});

	it('is true when the operator clears a declared capability', () => {
		const view = buildCapabilityView(registry, ['draws']);
		expect(selectionChanged(view, [])).toBe(true);
	});

	it('is true when the operator adds one', () => {
		const view = buildCapabilityView(registry, []);
		expect(selectionChanged(view, ['draws'])).toBe(true);
	});

	it('ignores unwritable values, so a read-only badge never looks like an unsaved edit', () => {
		const view = buildCapabilityView(registry, ['draws', 'telepathy']);
		expect(selectionChanged(view, ['draws'])).toBe(false);
		expect(selectionChanged(view, ['draws', 'doubling'])).toBe(false);
	});
});
