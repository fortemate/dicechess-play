<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- test-only harness, never shipped to a visitor */
	// TEST-ONLY harness for GameFrame.test.ts — not part of any page, and nothing in src/ imports
	// it. The frame is made of snippets, which a test cannot pass as plain props, so this fills
	// every slot with a marker and exposes what the frame hands back to the page.
	import GameFrame from './GameFrame.svelte';

	interface Props {
		leaveHref?: string;
		onleave?: () => void;
		soundEnabled?: boolean;
		onsound?: () => void;
		gameKey?: string;
		withStatus?: boolean;
		withActions?: boolean;
	}

	let {
		leaveHref,
		onleave,
		soundEnabled = true,
		onsound = () => {},
		gameKey,
		withStatus = false,
		withActions = true,
	}: Props = $props();
</script>

{#snippet status()}<span data-testid="status">Reconnecting…</span>{/snippet}
{#snippet actions(control: { open: boolean; controls: string; toggle: () => void })}
	<button
		type="button"
		data-testid="toggle"
		aria-controls={control.controls}
		onclick={control.toggle}
	>
		{control.open ? 'open' : 'closed'}
	</button>
{/snippet}

<GameFrame
	title="Greedy · level 3"
	{leaveHref}
	{onleave}
	sound={{ enabled: soundEnabled, toggle: onsound }}
	{gameKey}
	status={withStatus ? status : undefined}
	actions={withActions ? actions : undefined}
>
	{#snippet top()}<div data-testid="top">top strip</div>{/snippet}
	{#snippet board()}<div data-testid="board">board</div>{/snippet}
	{#snippet underBoard()}<div data-testid="under">steps</div>{/snippet}
	{#snippet bottom()}<div data-testid="bottom">bottom strip</div>{/snippet}
	{#snippet card()}<div data-testid="card">turn card</div>{/snippet}
	{#snippet extra()}<div data-testid="extra">extra</div>{/snippet}
	{#snippet moves(close)}
		<button type="button" data-testid="close" onclick={close}>close the list</button>
	{/snippet}
</GameFrame>
