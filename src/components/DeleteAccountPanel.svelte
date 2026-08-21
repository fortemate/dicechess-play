<script lang="ts">
	// Self-service account deletion (#237, ADR-0017) — the only irreversible action on this page.
	//
	// play-api requires the body to echo the account's own nickname. That is NOT CSRF protection
	// (`SameSite=Lax` plus a non-simple method already covers that) but a guard against a mis-wired
	// client deleting the wrong account, which is why this form makes the person type it rather than
	// sending it for them.
	//
	// What deletion does and does not do, because the copy has to be honest about it: identities and
	// guest links cascade away, so the `user:<uuid>` left in past games stops resolving to anyone —
	// history is anonymised, not rewritten. The nickname becomes reusable, and signing in again with
	// the same Google account mints a FRESH account with no history.
	import { authStore } from '$lib/authStore.svelte';
	import { toastStore } from '$lib/toastStore.svelte';

	let open = $state(false);
	let confirmInput = $state('');
	let deleting = $state(false);
	let error = $state<string | null>(null);
	let cancelButton = $state<HTMLButtonElement | null>(null);

	// Focus the safe action when the panel opens — the destructive button must not be what a keyboard
	// lands on first.
	$effect(() => {
		if (open) cancelButton?.focus();
	});

	// Case-INSENSITIVE on purpose, and it must stay that way: play-api compares with
	// `equalsIgnoreCase` (`AuthRoutes.scala`, pinned by a test that creates "DelNick" and deletes with
	// "delnick"). Display casing belongs to the player, so an exact echo would fail a deliberate action
	// for a reason nobody can see. Tightening this to `===` would make the button refuse input the
	// server accepts — stricter is not safer here, it is just a dead end.
	const matches = $derived(confirmInput.trim().toLowerCase() === authStore.nickname?.toLowerCase());

	function close() {
		open = false;
		confirmInput = '';
		error = null;
	}

	async function remove() {
		deleting = true;
		error = null;
		const result = await authStore.remove(confirmInput.trim());
		deleting = false;
		switch (result.outcome) {
			case 'deleted':
				close();
				toastStore.info('Your account was deleted. You are a guest again.');
				break;
			case 'invalid':
				error = result.reason;
				break;
			case 'signed-out':
				close();
				toastStore.error('You are no longer signed in.');
				break;
			case 'unavailable':
				error = 'Could not reach the server. Try again.';
				break;
		}
	}
</script>

{#if authStore.status === 'signed-in'}
	<div class="flex flex-col gap-3">
		<h3 class="text-sm font-bold uppercase tracking-wider text-content-muted">Delete account</h3>

		{#if open}
			<div class="flex flex-col gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-5">
				<p class="text-sm text-content">
					This cannot be undone. Your past games stay in the record but stop being attributed to
					anyone, your nickname becomes free for someone else, and your rating is gone. Signing in
					again with the same Google account creates a brand-new account.
				</p>
				<label for="delete-confirm" class="text-xs font-bold text-content-muted">
					Type <span class="font-mono text-content">{authStore.nickname}</span> to confirm
				</label>
				<form
					onsubmit={(e) => {
						e.preventDefault();
						void remove();
					}}
					class="flex items-center gap-2"
				>
					<input
						id="delete-confirm"
						bind:value={confirmInput}
						spellcheck="false"
						autocomplete="off"
						class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-content outline-none transition-colors focus:border-danger"
					/>
					<button
						type="submit"
						disabled={!matches || deleting}
						class="shrink-0 rounded-lg border border-danger/30 bg-danger/15 px-4 py-2 text-sm font-bold text-danger transition-colors hover:bg-danger/25 disabled:cursor-not-allowed disabled:opacity-30"
					>
						{deleting ? 'Deleting' : 'Delete my account'}
					</button>
					<button
						type="button"
						bind:this={cancelButton}
						onclick={close}
						class="shrink-0 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-bold text-content-muted transition-colors hover:text-content"
					>
						Cancel
					</button>
				</form>
				{#if error}
					<p class="text-xs text-danger" role="alert">{error}</p>
				{/if}
			</div>
		{:else}
			<button
				type="button"
				onclick={() => (open = true)}
				class="w-fit text-sm text-content-muted underline transition-colors hover:text-danger"
			>
				Delete my account
			</button>
		{/if}
	</div>
{/if}
