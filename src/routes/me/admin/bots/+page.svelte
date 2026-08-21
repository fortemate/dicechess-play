<script lang="ts">
	// Operator-only view for the full registered-bot inventory (#243). The `admin` bit is a courtesy
	// for navigation and direct-route UX, sourced solely from `/auth/me`; play-api remains the only
	// authorization boundary and its 403 is rendered explicitly below.
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import AdminBotCard from '../../../../components/AdminBotCard.svelte';
	import { authStore } from '$lib/authStore.svelte';
	import { adminBotsStore } from '$lib/bots/adminBotsStore.svelte';

	$effect(() => {
		if (authStore.status === 'signed-in' && authStore.account?.admin === true) {
			// `load` reads and writes its own rune fields. Keeping those reads untracked makes this effect
			// depend only on the session gate, not on a failed request resetting `loading` to false.
			untrack(() => void adminBotsStore.load());
		} else if (authStore.status !== 'loading') {
			adminBotsStore.reset();
		}
	});

	async function refreshBots() {
		if (authStore.status !== 'signed-in' || authStore.account?.admin !== true) return;
		await adminBotsStore.refresh();
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
		<h2 class="text-2xl font-bold text-content">Admin bot management</h2>
		<p class="max-w-2xl text-sm text-content-muted">
			Manage every registered bot, including ones absent from the public catalog and rating ladder.
		</p>
	</div>

	{#if authStore.status === 'loading'}
		<div class="h-40 animate-pulse rounded-2xl border border-border bg-surface/40"></div>
	{:else if authStore.status === 'unavailable'}
		<div class="rounded-2xl border border-border bg-surface/60 p-6 text-content-muted">
			Administrator tools are unavailable because account sign-in is not configured here.
		</div>
	{:else if authStore.status !== 'signed-in' || !authStore.account}
		<div class="flex flex-col items-start gap-4 rounded-2xl border border-border bg-surface/60 p-6">
			<p class="text-content-muted">
				Sign in with an administrator account to manage registered bots.
			</p>
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
	{:else if authStore.account.admin !== true}
		<div class="rounded-2xl border border-danger/30 bg-danger/10 p-6 text-content" role="alert">
			<p class="font-bold">403 — Administrator access required</p>
			<p class="mt-1 text-sm text-content-muted">
				This signed-in account is not an administrator. Access is enforced again by play-api.
			</p>
		</div>
	{:else if adminBotsStore.sessionExpired}
		<div class="rounded-2xl border border-danger/30 bg-danger/10 p-6 text-content" role="alert">
			Your session has expired. Refresh the page and sign in again.
		</div>
	{:else if adminBotsStore.forbidden}
		<div class="rounded-2xl border border-danger/30 bg-danger/10 p-6 text-content" role="alert">
			<p class="font-bold">403 — Administrator access denied by the server</p>
			<p class="mt-1 text-sm text-content-muted">
				The current session reports administrator access, but play-api denied the inventory request.
			</p>
		</div>
	{:else}
		<div class="rounded-2xl border border-primary/30 bg-primary/10 p-5 text-sm text-content-muted">
			Every change on this page is recorded in the administrator audit log with your account.
		</div>

		{#if adminBotsStore.loading && !adminBotsStore.loaded}
			<div class="h-56 animate-pulse rounded-2xl border border-border bg-surface/40"></div>
		{:else if adminBotsStore.error}
			<div class="rounded-2xl border border-danger/30 bg-danger/10 p-6 text-danger" role="alert">
				{adminBotsStore.error}
			</div>
		{:else if adminBotsStore.loaded && adminBotsStore.bots.length === 0}
			<div class="rounded-2xl border border-border bg-surface/60 p-6 text-content-muted">
				No registered bots were returned by play-api.
			</div>
		{:else}
			<div class="grid gap-5">
				{#each adminBotsStore.bots as bot (`${bot.team}/${bot.name}`)}
					<AdminBotCard {bot} onChanged={refreshBots} />
				{/each}
			</div>
		{/if}
	{/if}
</section>
