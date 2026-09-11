<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { resolve } from '$app/paths';
	import type { RematchStore } from '$lib/live/rematchStore.svelte';
	import { timeControlLabel } from '$lib/live/timeControls';

	let {
		store,
		compact = false,
	}: {
		store: RematchStore;
		compact?: boolean;
	} = $props();

	const conditionsText = $derived.by(() => {
		if (!store.settings) return null;
		const tc = timeControlLabel(store.settings.timeControl);
		const rated = store.settings.rated ? 'Rated' : 'Casual';
		return `${tc} · ${rated} · Random colours`;
	});

	const closedMessage = $derived.by(() => {
		switch (store.closedReason) {
			case 'declined':
				// myConsent records whether this client agreed; when the session closed as
				// 'declined', myConsent===false means THIS client was the one who declined
				// the opponent's offer — show their own action, not the opponent's.
				return store.myConsent ? 'Rematch declined by opponent.' : 'You declined the rematch.';
			case 'cancelled':
				return 'Rematch cancelled.';
			case 'expired':
				return 'Rematch offer expired.';
			case 'technical_failure':
				return 'Rematch could not be started.';
			case 'restart':
				return 'Server restarted — rematch closed.';
			default:
				return 'Rematch is no longer available.';
		}
	});
</script>

<div class="flex w-full flex-col gap-2.5 {compact ? 'py-1' : 'py-2'}">
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

	{#if store.phase === 'idle'}
		<p class="text-center text-sm text-content-muted" role="status">
			Checking rematch availability…
		</p>
	{:else if store.phase === 'available'}
		<div class="flex w-full flex-col items-center gap-1.5">
			<button
				type="button"
				onclick={() => store.propose()}
				disabled={store.isSubmitting || store.secondsRemaining <= 0}
				aria-live="polite"
				class="w-full rounded-xl bg-primary py-2.5 text-center font-bold text-primary-content shadow-md transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
			>
				{store.isSubmitting
					? 'Offering…'
					: store.secondsRemaining > 0
						? `Rematch (${store.secondsRemaining}s) →`
						: 'Rematch →'}
			</button>
			{#if conditionsText}
				<p class="text-center text-xs text-content-muted">
					{conditionsText}
				</p>
			{/if}
		</div>
	{:else if store.phase === 'offered' && store.myConsent}
		<!-- We proposed; waiting for opponent to accept or decline -->
		<div
			class="flex w-full flex-col items-center gap-2 rounded-xl border border-border bg-surface-hover/30 p-3"
		>
			<p class="text-center text-sm font-semibold text-content" role="status">
				Waiting for opponent…
				{#if store.secondsRemaining > 0}
					<span class="font-mono font-bold text-primary">({store.secondsRemaining}s)</span>
				{/if}
			</p>
			{#if conditionsText}
				<p class="text-center text-xs text-content-muted">
					{conditionsText}
				</p>
			{/if}
			<button
				type="button"
				onclick={() => store.cancel()}
				disabled={store.isSubmitting}
				class="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-content-muted transition-colors hover:border-border-strong hover:text-content disabled:opacity-60"
			>
				Cancel rematch
			</button>
		</div>
	{:else if store.phase === 'offered' && !store.myConsent}
		<!-- Opponent proposed; we can accept or decline -->
		<div
			class="flex w-full flex-col items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3"
		>
			<p class="text-center text-sm font-bold text-content" role="status">
				Opponent offered a rematch!
				{#if store.secondsRemaining > 0}
					<span class="font-mono text-primary">({store.secondsRemaining}s)</span>
				{/if}
			</p>
			{#if conditionsText}
				<p class="text-center text-xs text-content-muted">
					{conditionsText}
				</p>
			{/if}
			<div class="flex w-full items-center gap-2">
				<button
					type="button"
					onclick={() => store.accept()}
					disabled={store.isSubmitting || store.secondsRemaining <= 0}
					class="flex-1 rounded-xl bg-primary py-2 text-center text-sm font-bold text-primary-content shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-60"
				>
					{store.isSubmitting ? 'Accepting…' : 'Accept'}
				</button>
				<button
					type="button"
					onclick={() => store.decline()}
					disabled={store.isSubmitting}
					class="rounded-xl border border-border bg-surface px-3 py-2 text-center text-sm font-bold text-content-muted transition-colors hover:border-border-strong hover:text-content disabled:opacity-60"
				>
					Decline
				</button>
			</div>
		</div>
	{:else if store.phase === 'starting'}
		<div class="flex w-full flex-col items-center gap-1.5 py-2">
			<p class="text-center text-sm font-semibold text-content" role="status">Starting rematch…</p>
			<p class="text-center text-xs text-content-muted">
				Drawing random colours and setting up the board.
			</p>
		</div>
	{:else if store.phase === 'matched'}
		<div class="flex w-full flex-col items-center gap-1.5 py-2">
			<p class="text-center text-sm font-bold text-primary" role="status">
				Rematch matched! Connecting…
			</p>
		</div>
	{:else if store.phase === 'closed'}
		<div class="flex w-full flex-col items-center gap-2">
			<p class="text-center text-sm text-content-muted" role="status">
				{closedMessage}
			</p>
			<a
				href={resolve('/lobby')}
				class="w-full rounded-xl bg-primary py-2.5 text-center font-bold text-primary-content shadow-md transition-colors hover:bg-primary-hover"
			>
				Find another game →
			</a>
		</div>
	{/if}
</div>
