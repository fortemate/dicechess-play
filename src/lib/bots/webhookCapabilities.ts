// Capability presentation rules for the webhook control plane (#48). Pure and rune-free so the
// honesty guarantees below are unit-testable without a DOM.
//
// play-api's `WebhookCapability` registry is the single source of truth, fetched at runtime from
// the public `GET /bot/webhook/capabilities`. Each entry is either `available` (legal in a
// registration today) or `reserved` (a stable, discoverable name that registration still rejects).
// Today that means `draws` is available and `doubling` is reserved.
//
// Two consequences drive every function here:
//
//  * The UI must never present a reserved capability as a working control. `doubling` in particular
//    has no end-to-end remote-bot protocol yet, so an enabled toggle would advertise gameplay the
//    server cannot deliver. Selectability is therefore read from the CATALOG, never hardcoded —
//    when the server promotes `doubling` to available, the control activates on its own, and no
//    client release is needed to keep the two in step.
//  * A capability PATCH REPLACES the whole selection with values the server accepts, which is only
//    the available subset. Anything else already stored on a registration — an unknown name from an
//    older server, or a capability since demoted to reserved — cannot be written back and would
//    silently vanish. `droppedByCapabilityPatch` names those values so the UI can say so out loud
//    instead of quietly discarding them.

import type { WebhookCapabilityDescriptor } from './webhookApi';

export type CapabilityAvailability = 'available' | 'reserved' | 'unknown';

export interface CapabilityRow {
	name: string;
	availability: CapabilityAvailability;
	/** Whether the server would accept this name in a write. Only `available` rows are selectable. */
	selectable: boolean;
	/** Whether the live registration currently declares it. */
	declared: boolean;
}

export interface CapabilityView {
	/** Editable rows, in the registry's stable order. */
	selectable: CapabilityRow[];
	/** Known but not yet writable — rendered read-only, never as a working control. */
	reserved: CapabilityRow[];
	/** Declared by the registration yet absent from the registry. Read-only and never invented. */
	unknown: CapabilityRow[];
}

/**
 * Partition a registration's declared capabilities against the live registry.
 *
 * Registry order is preserved for known rows because it is play-api's canonical persisted order;
 * unknown rows keep the order the registration reported them in. A declared name is matched exactly
 * — the server accepts no aliases, case folding, or trimming, so neither may this.
 */
export function buildCapabilityView(
	catalog: readonly WebhookCapabilityDescriptor[],
	declared: readonly string[],
): CapabilityView {
	const declaredSet = new Set(declared);
	const view: CapabilityView = { selectable: [], reserved: [], unknown: [] };

	for (const descriptor of catalog) {
		const row: CapabilityRow = {
			name: descriptor.name,
			availability: descriptor.selectable ? 'available' : 'reserved',
			selectable: descriptor.selectable,
			declared: declaredSet.has(descriptor.name),
		};
		if (row.selectable) view.selectable.push(row);
		else view.reserved.push(row);
	}

	const known = new Set(catalog.map((descriptor) => descriptor.name));
	for (const name of declared) {
		if (known.has(name)) continue;
		if (view.unknown.some((row) => row.name === name)) continue;
		view.unknown.push({ name, availability: 'unknown', selectable: false, declared: true });
	}

	return view;
}

/**
 * The declared capabilities a capability PATCH cannot preserve: every unknown name, plus any
 * reserved one the registration still declares (possible only if the registry demoted it after
 * registration). Callers warn before writing; an empty array means the save is lossless.
 */
export function droppedByCapabilityPatch(view: CapabilityView): string[] {
	return [
		...view.reserved.filter((row) => row.declared).map((row) => row.name),
		...view.unknown.map((row) => row.name),
	];
}

/**
 * Narrow an arbitrary selection to what the server will accept, in registry order. Applied to every
 * write so a stale checkbox, a reserved name, or an unknown one can never reach the wire — the
 * server would answer `422 capability_rejected`, and losing the whole save to a value the user
 * never touched is a worse outcome than dropping it here and saying so.
 */
export function writableSelection(view: CapabilityView, selection: readonly string[]): string[] {
	const wanted = new Set(selection);
	return view.selectable.filter((row) => wanted.has(row.name)).map((row) => row.name);
}

/** The selection a freshly-read registration implies: its declared, still-writable capabilities. */
export function declaredSelection(view: CapabilityView): string[] {
	return view.selectable.filter((row) => row.declared).map((row) => row.name);
}

/** Whether a draft selection differs from what the server currently stores. */
export function selectionChanged(view: CapabilityView, selection: readonly string[]): boolean {
	const draft = writableSelection(view, selection);
	const stored = declaredSelection(view);
	return draft.length !== stored.length || draft.some((name, index) => name !== stored[index]);
}
