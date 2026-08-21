<script lang="ts">
	// Linking anonymous history to an account (#236, ADR-0017).
	//
	// Nothing is rewritten by this: `game_results` keeps the `guest:` ids the games were played under,
	// and the owner's history becomes a union at read time. That is what makes it safe — immutable
	// records stay immutable, and the only new fact is a link row.
	//
	// The claim is TERMINAL and first-writer-wins: a guest identity belongs to at most one account,
	// forever. So `claimed-by-another` must not offer a retry, and the confirm step exists because this
	// is not undoable from the UI.
	//
	// Privacy note that shapes the copy: linking does NOT make the guest id public. The public profile
	// counts `user:` games only — otherwise signing up would retroactively deanonymise every anonymous
	// game that browser ever played.
	import { authStore } from '$lib/authStore.svelte';
	import { toastStore } from '$lib/toastStore.svelte';
	import { getGuestUuid } from '$lib/ingest/guestIdentity';
	import { myOpponentsStore } from '$lib/stores/playerOpponentsStore.svelte';

	// Read once: this is the identity of the browser the page is open in, and it does not change while
	// the page is mounted (resetting it happens further down the page and reloads the section).
	const currentGuest = getGuestUuid();

	let linking = $state(false);
	let confirming = $state(false);
	let terminalError = $state<string | null>(null);
	let cancelButton = $state<HTMLButtonElement | null>(null);

	// Move focus to the safe action when the confirmation appears, matching the reset flow on this page.
	$effect(() => {
		if (confirming) cancelButton?.focus();
	});

	async function link() {
		linking = true;
		const result = await authStore.claimCurrentGuest();
		linking = false;
		confirming = false;
		switch (result.outcome) {
			case 'linked':
				toastStore.success('This browser’s games are now part of your history.');
				// The account union just grew (#226) — this panel lives on /me, where the Online
				// section renders that union, so refetch or the toast's claim stays invisible.
				myOpponentsStore.reset();
				void myOpponentsStore.load();
				break;
			case 'claimed-by-another':
				// Final. One guest identity, one account, forever — a retry cannot succeed.
				terminalError = 'That anonymous identity already belongs to another account.';
				break;
			case 'invalid':
				terminalError = result.reason;
				break;
			case 'signed-out':
				toastStore.error('You are no longer signed in.');
				break;
			case 'unavailable':
				toastStore.error('Could not reach the server. Try again.');
				break;
		}
	}
</script>

{#if authStore.status === 'signed-in'}
	<div class="flex flex-col gap-3">
		<h3 class="text-sm font-bold uppercase tracking-wider text-content-muted">Anonymous history</h3>
		<p class="text-sm text-content-muted">
			Games you played before signing in stay under their anonymous identity. Linking one adds those
			games to your own history — it does not make them public, and it cannot be undone.
		</p>

		<div class="flex flex-col gap-4 rounded-2xl border border-border bg-surface/60 p-5">
			{#if !authStore.guestsLoaded}
				<div class="h-5 animate-pulse rounded bg-surface-hover/60"></div>
			{:else if authStore.guests.length === 0}
				<p class="text-sm text-content-muted">No anonymous identities linked yet.</p>
			{:else}
				<ul class="flex flex-col gap-1.5">
					{#each authStore.guests as guest (guest)}
						<li class="flex items-center gap-2">
							<code
								class="min-w-0 flex-1 truncate rounded-lg border border-border bg-background/50 px-3 py-1.5 font-mono text-xs text-content"
								title={guest}
							>
								guest:{guest}
							</code>
							{#if guest === currentGuest}
								<span class="shrink-0 text-xs font-bold text-content-muted">this browser</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#if terminalError}
				<p class="text-xs text-danger" role="alert">{terminalError}</p>
			{:else if authStore.guestsLoaded && !authStore.currentGuestLinked}
				{#if confirming}
					<div class="flex flex-col gap-2 border-t border-border pt-4">
						<p class="text-xs text-danger">
							This links this browser’s anonymous games to your account permanently. An anonymous
							identity can belong to only one account.
						</p>
						<div class="flex gap-2">
							<button
								type="button"
								onclick={() => void link()}
								disabled={linking}
								class="rounded-lg border border-primary/30 bg-primary/15 px-4 py-2 text-sm font-bold text-primary transition-colors hover:bg-primary/25 disabled:opacity-40"
							>
								{linking ? 'Linking' : 'Yes, link it'}
							</button>
							<button
								type="button"
								bind:this={cancelButton}
								onclick={() => (confirming = false)}
								class="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-bold text-content-muted transition-colors hover:text-content"
							>
								Cancel
							</button>
						</div>
					</div>
				{:else}
					<button
						type="button"
						onclick={() => (confirming = true)}
						class="w-fit border-t-0 text-sm text-content-muted underline transition-colors hover:text-content"
					>
						Link this browser’s games to my account
					</button>
				{/if}
			{/if}
		</div>
	</div>
{/if}
