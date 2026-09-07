<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import type { SpectatorFollowStore } from '$lib/live/spectatorFollowStore.svelte';

	// The spectator's side of a rematch (play-api ADR 007 / rematch-v1): what the follower is
	// doing, and the two decisions the viewer owns — stop being carried along, or ask to be
	// carried to wherever the chain has got to. Nothing here is a game control: a spectator has no
	// seat to act with, and this panel never offers one.

	let {
		store,
		compact = false,
	}: {
		store: SpectatorFollowStore;
		compact?: boolean;
	} = $props();

	const waitingText = $derived(
		store.secondsRemaining > 0
			? `Waiting for a rematch… (${store.secondsRemaining}s)`
			: 'Waiting for a rematch…',
	);
</script>

<div class="flex w-full flex-col items-center gap-2 {compact ? 'py-1' : 'py-2'}">
	{#if store.error}
		<div class="flex flex-col items-center gap-1">
			<p class="text-center text-xs text-danger" role="alert">{store.error}</p>
			<button
				type="button"
				onclick={() => store.retry()}
				class="text-xs font-semibold text-primary underline hover:text-primary-hover"
			>
				Retry
			</button>
		</div>
	{/if}

	{#if store.following}
		{#if store.status === 'matched'}
			<p class="text-center text-sm font-bold text-primary" role="status">
				Rematch started — following…
			</p>
		{:else if store.status === 'closed'}
			<p class="text-center text-sm text-content-muted" role="status">No rematch was played.</p>
		{:else}
			<p class="text-center text-sm font-semibold text-content" role="status">
				{waitingText}
			</p>
			<button
				type="button"
				onclick={() => store.stayHere()}
				class="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-content-muted transition-colors hover:border-border-strong hover:text-content"
			>
				Stay on this game
			</button>
		{/if}
	{:else}
		<p class="text-center text-sm text-content-muted" role="status">
			{store.status === 'matched'
				? 'The players started a rematch.'
				: 'Staying on this game — following is off.'}
		</p>
		<button
			type="button"
			onclick={() => store.resumeFollowing()}
			disabled={store.resolving}
			class="rounded-lg border border-primary bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/20 disabled:opacity-60"
		>
			{store.status === 'matched' ? 'Watch the current game →' : 'Follow the rematch'}
		</button>
	{/if}
</div>
