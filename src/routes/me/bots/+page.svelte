<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	// The signed-in bot-author surface (#242). This route deliberately gates on the settled
	// `authStore` state BEFORE touching `myBotsStore`: a guest must not even attempt `/me/bots`.
	// Claim's pasted Bearer token is cleared before the request starts and goes only to ownerApi's
	// Authorization header; it never joins authStore, the URL, or browser storage.
	import { resolve } from '$app/paths';
	import OwnedBotCard from '../../../components/OwnedBotCard.svelte';
	import { claimBot } from '$lib/bots/ownerApi';
	import { myBotsStore } from '$lib/bots/myBotsStore.svelte';
	import { authStore } from '$lib/authStore.svelte';
	import { toastStore } from '$lib/toastStore.svelte';

	let claimOpen = $state(false);
	let tokenInput = $state('');
	let claiming = $state(false);
	let claimError = $state<string | null>(null);
	let tokenField = $state<HTMLInputElement | null>(null);

	// Keep keyboard focus with the claim panel. Its empty-state trigger occurs after the panel in
	// document order, so without this a forward tab skips the field that just appeared.
	$effect(() => {
		if (claimOpen) tokenField?.focus();
	});

	$effect(() => {
		if (authStore.status === 'signed-in' && authStore.account) {
			void myBotsStore.load(authStore.account.id);
		} else if (authStore.status !== 'loading') {
			myBotsStore.reset();
		}
	});

	async function refreshBots() {
		if (authStore.status !== 'signed-in' || !authStore.account) return;
		await myBotsStore.refresh(authStore.account.id);
	}

	function openClaim() {
		claimOpen = true;
		tokenInput = '';
		claimError = null;
	}

	function closeClaim() {
		claimOpen = false;
		tokenInput = '';
		claimError = null;
	}

	async function claim() {
		const token = tokenInput.trim();
		if (!token || !authStore.account) return;
		// Clear before the await, for failures as well as successes. From here `token` is only
		// an ephemeral function local passed to ownerApi's Authorization header.
		tokenInput = '';
		claimError = null;
		claiming = true;
		const ownerId = authStore.account.id;
		const result = await claimBot(token);
		claiming = false;
		// A completed request from a session which was replaced while it was in flight must not seed
		// a different account's store with the previous owner's list.
		if (authStore.status !== 'signed-in' || authStore.account?.id !== ownerId) return;
		switch (result.outcome) {
			case 'claimed':
				myBotsStore.replace(ownerId, result.bots);
				claimOpen = false;
				toastStore.success('Bot claimed. You can manage it here now.');
				break;
			case 'taken':
				claimError = 'That bot already belongs to another account.';
				break;
			case 'not-registered':
				claimError = 'Only a registered bot can be owned.';
				break;
			case 'bad-token':
				claimError = 'That token is not valid for a registered bot.';
				break;
			case 'signed-out':
				claimError = 'You are no longer signed in.';
				break;
			case 'unavailable':
				claimError = 'Could not reach the server. Try again.';
				break;
		}
	}
</script>

<section class="flex flex-col gap-8">
	<div class="flex flex-col gap-2">
		<a
			href={resolve('/me')}
			class="w-fit text-xs font-bold text-content-muted underline transition-colors hover:text-content"
		>
			← Back to profile
		</a>
		<h2 class="text-2xl font-bold text-content">My bots</h2>
		<p class="max-w-2xl text-sm text-content-muted">
			Claim and manage the bots registered to your account. Your bot token is needed only when
			claiming a bot or after you rotate one.
		</p>
	</div>

	{#if authStore.status === 'loading'}
		<div class="h-40 animate-pulse rounded-2xl border border-border bg-surface/40"></div>
	{:else if authStore.status === 'unavailable'}
		<div class="rounded-2xl border border-border bg-surface/60 p-6 text-content-muted">
			Bot management is unavailable because account sign-in is not configured here.
		</div>
	{:else if authStore.status !== 'signed-in' || !authStore.account}
		<div class="flex flex-col items-start gap-4 rounded-2xl border border-border bg-surface/60 p-6">
			<p class="text-content-muted">Sign in to claim and manage your own bots.</p>
			{#if authStore.status === 'signed-out' && authStore.canSignIn}
				<button
					type="button"
					onclick={() => authStore.signIn()}
					class="rounded-xl bg-primary px-5 py-2.5 font-bold text-primary-content shadow-lg shadow-primary/30 transition-colors hover:bg-primary-hover"
				>
					Sign in with Google
				</button>
			{/if}
		</div>
	{:else if myBotsStore.sessionExpired}
		<div class="rounded-2xl border border-danger/30 bg-danger/10 p-6 text-content">
			Your session has expired. Refresh the page and sign in again.
		</div>
	{:else}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h3 class="text-sm font-bold uppercase tracking-wider text-content-muted">
				Your registered bots
			</h3>
			<button
				type="button"
				onclick={openClaim}
				class="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-content transition-colors hover:bg-primary-hover"
			>
				Claim a bot
			</button>
		</div>

		{#if claimOpen}
			<div class="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/10 p-5">
				<div class="flex flex-col gap-1">
					<h3 class="font-bold text-content">Claim a registered bot</h3>
					<p class="text-sm text-content-muted">
						Paste the token printed when you registered the bot. It proves control of exactly that
						bot and is sent once in the Authorization header; it is never saved here.
					</p>
				</div>
				<form
					onsubmit={(event) => {
						event.preventDefault();
						void claim();
					}}
					class="flex flex-col gap-3 sm:flex-row sm:items-end"
				>
					<label
						for="bot-token"
						class="flex min-w-0 flex-1 flex-col gap-1 text-xs font-bold text-content-muted"
					>
						Bot token
						<input
							id="bot-token"
							bind:this={tokenField}
							bind:value={tokenInput}
							spellcheck="false"
							autocomplete="off"
							placeholder="Paste the token once"
							class="min-w-0 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm font-normal text-content outline-none transition-colors focus:border-primary"
						/>
					</label>
					<div class="flex shrink-0 gap-2">
						<button
							type="submit"
							disabled={!tokenInput.trim() || claiming}
							class="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-content transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
						>
							{claiming ? 'Claiming' : 'Claim bot'}
						</button>
						<button
							type="button"
							onclick={closeClaim}
							class="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-bold text-content-muted transition-colors hover:text-content"
						>
							Cancel
						</button>
					</div>
				</form>
				{#if claimError}
					<p class="text-xs text-danger" role="alert">{claimError}</p>
				{/if}
			</div>
		{/if}

		{#if myBotsStore.loading && !myBotsStore.loaded}
			<div class="h-56 animate-pulse rounded-2xl border border-border bg-surface/40"></div>
		{:else if myBotsStore.error}
			<div class="rounded-2xl border border-danger/30 bg-danger/10 p-6 text-danger" role="alert">
				{myBotsStore.error}
			</div>
		{:else if myBotsStore.loaded && myBotsStore.bots.length === 0}
			<div
				class="flex flex-col items-start gap-4 rounded-2xl border border-border bg-surface/60 p-6"
			>
				<p class="text-content-muted">
					You do not own any bots yet. Register a bot with the Bot API, then paste the token it
					printed here to claim it for your account.
				</p>
				<button
					type="button"
					onclick={openClaim}
					class="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-content transition-colors hover:bg-primary-hover"
				>
					Claim a bot
				</button>
			</div>
		{:else}
			<div class="grid gap-5">
				{#each myBotsStore.bots as bot (`${bot.team}/${bot.name}`)}
					<OwnedBotCard {bot} onChanged={refreshBots} />
				{/each}
			</div>
		{/if}
	{/if}
</section>
