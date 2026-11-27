<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- test-only stand-in, never shipped to a visitor */
	// TEST-ONLY stand-in for the three tabs of Play and for the waiting board in page.test.ts. It
	// shows which props the page handed down, which is how the tests tell the four apart, and
	// offers the two callbacks as buttons.
	import type { OpenTable } from '#lib/live/openTable.js';

	interface Props {
		preselect?: string | null;
		onopened?: (table: OpenTable) => void;
		table?: OpenTable;
		onclose?: () => void;
	}

	let { preselect, onopened, table, onclose }: Props = $props();

	const handed = $derived(
		[
			preselect !== undefined && 'preselect',
			onopened && 'onopened',
			table && 'table',
			onclose && 'onclose',
		]
			.filter(Boolean)
			.join('+') || 'none',
	);
	const TABLE: OpenTable = { id: 'seek-1', secret: 's', label: '5 + 3', rated: false, clockMs: 1 };
</script>

<div data-testid="tab" data-props={handed} data-preselect={preselect ?? ''} data-table={table?.id}>
	{#if onopened}
		<button type="button" data-testid="open" onclick={() => onopened(TABLE)}>open</button>
	{/if}
	{#if onclose}
		<button type="button" data-testid="close" onclick={onclose}>close</button>
	{/if}
</div>
