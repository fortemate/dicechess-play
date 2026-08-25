<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { localGamesStore } from '$lib/stores/localGamesStore.svelte';
	import { myOpponentsStore, playerOpponentsStore } from '$lib/stores/playerOpponentsStore.svelte';
	import { getGuestId, setGuestId, resetGuestId } from '$lib/ingest/guestIdentity';
	import { isLiveEnabled } from '$lib/live/liveApi';
	import { toastStore } from '$lib/toastStore.svelte';
	import { buildPlayerRecord, totalGames, winRate } from '$lib/stats/playerRecord';
	import { aggregateOpponents, opponentLabel, opponentVsQuery } from '$lib/stats/lobbyRecord';
	import { vsParamValue } from '$lib/games/gamesFilters';
	import WdlBar from '../../components/WdlBar.svelte';
	import WdlCounts from '../../components/WdlCounts.svelte';
	import WdlSummaryCard from '../../components/WdlSummaryCard.svelte';
	import AccountPanel from '../../components/AccountPanel.svelte';
	import GuestLinkPanel from '../../components/GuestLinkPanel.svelte';
	import DeleteAccountPanel from '../../components/DeleteAccountPanel.svelte';
	import { authStore } from '$lib/authStore.svelte';

	let guestId = $state('');
	let restoreInput = $state('');
	let confirmingReset = $state(false);
	let copied = $state(false);
	let cancelButton = $state<HTMLButtonElement | null>(null);

	// Move focus to the safe Cancel action when the reset confirmation appears, so
	// keyboard / screen-reader focus isn't lost when "Start fresh" unmounts.
	$effect(() => {
		if (confirmingReset) cancelButton?.focus();
	});

	onMount(() => {
		guestId = getGuestId();
		void localGamesStore.load();
	});

	// Which online record this page shows (#226): the signed-in account's union — its own games
	// plus every guest id it has claimed, merged server-side — or this browser's guest record.
	// The session resolves asynchronously (the layout's refresh() may still be in flight when
	// this page mounts), so the fetch is an effect on the SETTLED status rather than an onMount
	// call: 'loading' keeps the skeleton up instead of flashing guest data at a signed-in
	// player, and a runtime sign-out flips the section back to the guest record by itself.
	const onlineStore = $derived(
		authStore.status === 'signed-in' ? myOpponentsStore : playerOpponentsStore,
	);

	$effect(() => {
		if (authStore.status === 'signed-in') void myOpponentsStore.load();
		else if (authStore.status !== 'loading') void playerOpponentsStore.load();
	});

	// The claim set is only needed on this page, so it is fetched here rather than at boot. Guarded on
	// `signed-in` because the session resolves asynchronously — the layout's `refresh()` may still be
	// in flight when this page mounts, and asking as a guest would just 401.
	$effect(() => {
		if (authStore.status === 'signed-in' && !authStore.guestsLoaded) void authStore.loadGuests();
	});

	const record = $derived(buildPlayerRecord(localGamesStore.games));
	const overallTotal = $derived(totalGames(record.overall));

	const lobbyOverall = $derived(aggregateOpponents(onlineStore.opponents));
	const lobbyTotal = $derived(totalGames(lobbyOverall));

	async function copyCode() {
		try {
			await navigator.clipboard.writeText(guestId);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			toastStore.error('Could not copy — select the code and copy it manually.');
		}
	}

	function restore() {
		if (setGuestId(restoreInput)) {
			guestId = getGuestId();
			restoreInput = '';
			toastStore.success('Player code restored.');
			playerOpponentsStore.reset();
			void playerOpponentsStore.load();
		} else {
			toastStore.error('That does not look like a valid player code.');
		}
	}

	function reset() {
		guestId = resetGuestId();
		confirmingReset = false;
		toastStore.info('Started a new identity.');
		playerOpponentsStore.reset();
		void playerOpponentsStore.load();
	}
</script>

<section class="flex flex-col gap-8">
	<div class="flex flex-col gap-1">
		<h2 class="text-2xl font-bold text-content">Your profile</h2>
		<p class="text-sm text-content-muted">Your record against bots and lobby opponents.</p>
	</div>

	<AccountPanel />

	{#if authStore.status === 'signed-in'}
		<a
			href={resolve('/me/bots')}
			class="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface/60 p-5 transition-colors hover:border-primary/50 hover:bg-surface-hover/60"
		>
			<span class="flex flex-col gap-1">
				<span class="font-bold text-content">My bots</span>
				<span class="text-sm text-content-muted">Claim and manage the bots you own.</span>
			</span>
			<span class="shrink-0 font-bold text-primary" aria-hidden="true">→</span>
		</a>

		{#if authStore.account?.admin === true}
			<!-- Visibility is a courtesy only. `/me/admin/bots` still asks play-api on every write. -->
			<a
				href={resolve('/me/admin/bots')}
				class="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-5 transition-colors hover:border-primary hover:bg-primary/15"
			>
				<span class="flex flex-col gap-1">
					<span class="font-bold text-content">Administer bots</span>
					<span class="text-sm text-content-muted">View and recover every registered bot.</span>
				</span>
				<span class="shrink-0 font-bold text-primary" aria-hidden="true">→</span>
			</a>
		{/if}
	{/if}

	{#if authStore.status === 'signed-out' && authStore.canSignIn}
		<!-- A CTA, not a gate: everything below this works exactly the same without an account. The
		     offer names what signing in adds, so it reads as an option rather than a nag. -->
		<div
			class="flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface/40 p-5 sm:flex-row sm:items-center sm:justify-between"
		>
			<p class="text-sm text-content-muted">
				Sign in to get a rating and a place on the leaderboard, keep your history across devices,
				and manage your own bots. Playing stays free either way — no account required.
			</p>
			<button
				type="button"
				onclick={() => authStore.signIn()}
				class="shrink-0 rounded-xl bg-primary px-5 py-2.5 font-bold text-primary-content shadow-lg shadow-primary/30 transition-colors hover:bg-primary-hover"
			>
				Sign in with Google
			</button>
		</div>
	{/if}

	<h3 class="text-sm font-bold uppercase tracking-wider text-content-muted">On this device</h3>

	{#if !localGamesStore.loaded && !localGamesStore.error}
		<div class="h-32 rounded-2xl bg-surface/40 border border-border animate-pulse"></div>
	{:else if localGamesStore.error && overallTotal === 0}
		<div class="rounded-2xl border border-danger/30 bg-danger/10 p-6 text-center text-danger">
			Couldn't load your record: {localGamesStore.error}
		</div>
	{:else if overallTotal === 0}
		<div
			class="rounded-2xl border border-border bg-surface/40 p-6 flex flex-col items-center gap-3 text-center"
		>
			<p class="text-content-muted">You haven't played any games yet.</p>
			<a
				href={resolve('/play')}
				class="px-5 py-2.5 rounded-xl bg-primary text-primary-content font-bold shadow-lg shadow-primary/30 hover:bg-primary-hover transition-colors"
			>
				Play your first game →
			</a>
		</div>
	{:else}
		<WdlSummaryCard counts={record.overall} />

		<div class="flex flex-col gap-2">
			<h3 class="text-sm font-bold uppercase tracking-wider text-content-muted">By opponent</h3>
			{#each record.perBot as bot (bot.algorithm)}
				<a
					href={resolve(
						`/games?vs=${encodeURIComponent(vsParamValue({ kind: 'local', algorithm: bot.algorithm }))}`,
					)}
					class="rounded-xl border border-border bg-surface/40 hover:bg-surface-hover/60 hover:border-primary/50 p-4 flex flex-col gap-2 transition-colors"
				>
					<div class="flex items-center justify-between gap-3">
						<span class="font-bold text-content truncate min-w-0">{bot.label}</span>
						<div class="flex items-center gap-3 shrink-0">
							<WdlCounts counts={bot} />
							<span class="font-mono text-sm font-bold text-content tabular-nums w-12 text-right">
								{Math.round(winRate(bot) * 100)}%
							</span>
						</div>
					</div>
					<WdlBar counts={bot} />
				</a>
			{/each}
		</div>
	{/if}

	<h3 class="text-sm font-bold uppercase tracking-wider text-content-muted">Online</h3>

	{#if !isLiveEnabled()}
		<div class="rounded-2xl border border-border bg-surface p-6 text-center text-content-muted">
			Online games need a configured play server (<code class="font-mono text-xs"
				>VITE_PLAY_API_URL</code
			>) — not available in this build.
		</div>
	{:else}
		{#if onlineStore.error}
			<div
				class="rounded-xl border border-danger/30 bg-danger/10 p-3 text-center text-xs text-danger"
			>
				{onlineStore.error}
			</div>
		{/if}

		{#if !onlineStore.loaded && !onlineStore.error}
			<div class="h-32 rounded-2xl bg-surface/40 border border-border animate-pulse"></div>
		{:else if onlineStore.error}
			<!-- The error banner above already says everything — a failed fetch must never also claim
			     "you haven't played any lobby games", which could be flatly false for this guest. -->
		{:else if lobbyTotal === 0}
			<div
				class="rounded-2xl border border-border bg-surface/40 p-6 flex flex-col items-center gap-3 text-center"
			>
				<p class="text-content-muted">You haven't played any lobby games yet.</p>
				<a
					href={resolve('/lobby')}
					class="px-5 py-2.5 rounded-xl bg-primary text-primary-content font-bold shadow-lg shadow-primary/30 hover:bg-primary-hover transition-colors"
				>
					Visit the lobby →
				</a>
			</div>
		{:else}
			<WdlSummaryCard counts={lobbyOverall} />

			<div class="flex flex-col gap-2">
				<h4 class="text-sm font-bold uppercase tracking-wider text-content-muted">By opponent</h4>
				{#each onlineStore.opponents as opp (opponentVsQuery(opp))}
					<!-- Linking a union row is valid again since #229: /games reads the same identity
					     as this section, so the filtered list matches what the row claims. -->
					<a
						href={resolve(`/games?vs=${encodeURIComponent(opponentVsQuery(opp))}`)}
						class="rounded-xl border border-border bg-surface/40 hover:bg-surface-hover/60 hover:border-primary/50 p-4 flex flex-col gap-2 transition-colors"
					>
						<div class="flex items-center justify-between gap-3">
							<span class="font-bold text-content truncate min-w-0">{opponentLabel(opp)}</span>
							<div class="flex items-center gap-3 shrink-0">
								<WdlCounts counts={opp} />
								<span class="font-mono text-sm font-bold text-content tabular-nums w-12 text-right">
									{Math.round(winRate(opp) * 100)}%
								</span>
							</div>
						</div>
						<WdlBar counts={opp} />
					</a>
				{/each}
			</div>
		{/if}
	{/if}

	<GuestLinkPanel />

	<div class="flex flex-col gap-3">
		<h3 class="text-sm font-bold uppercase tracking-wider text-content-muted">Your player code</h3>
		<p class="text-sm text-content-muted">
			This anonymous code is your identity. Save it to keep the same identity — and your lobby
			record — if you switch browser or device. Only the "on this device" history above stays local
			to this browser.
		</p>

		<div class="rounded-2xl border border-border bg-surface/60 p-5 flex flex-col gap-5">
			<div class="flex items-center gap-2">
				<code
					class="flex-1 min-w-0 truncate font-mono text-sm bg-background/50 border border-border rounded-lg px-3 py-2 text-content"
					title={guestId}
				>
					{guestId}
				</code>
				<button
					type="button"
					onclick={copyCode}
					class="shrink-0 px-4 py-2 rounded-lg bg-primary text-primary-content font-bold text-sm hover:bg-primary-hover transition-colors"
				>
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>

			<div class="flex flex-col gap-2 pt-1">
				<label for="restore-code" class="text-xs font-bold text-content-muted">
					Use a code from another device
				</label>
				<form
					onsubmit={(e) => {
						e.preventDefault();
						restore();
					}}
					class="flex items-center gap-2"
				>
					<input
						id="restore-code"
						bind:value={restoreInput}
						placeholder="guest:…"
						spellcheck="false"
						autocomplete="off"
						class="flex-1 min-w-0 font-mono text-sm bg-surface border border-border rounded-lg px-3 py-2 text-content outline-none focus:border-primary transition-colors"
					/>
					<button
						type="submit"
						disabled={!restoreInput.trim()}
						class="shrink-0 px-4 py-2 rounded-lg bg-surface border border-border text-content font-bold text-sm hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
					>
						Restore
					</button>
				</form>
			</div>

			<div class="pt-1 border-t border-border">
				{#if confirmingReset}
					<div class="flex flex-col gap-2 pt-3">
						<p class="text-xs text-danger">
							Save your current code first — this starts a brand-new identity. Your games on this
							device stay.
						</p>
						<div class="flex gap-2">
							<button
								type="button"
								onclick={reset}
								class="px-4 py-2 rounded-lg bg-danger/15 text-danger border border-danger/30 font-bold text-sm hover:bg-danger/25 transition-colors"
							>
								Yes, start fresh
							</button>
							<button
								type="button"
								bind:this={cancelButton}
								onclick={() => (confirmingReset = false)}
								class="px-4 py-2 rounded-lg bg-surface border border-border text-content-muted font-bold text-sm hover:text-content transition-colors"
							>
								Cancel
							</button>
						</div>
					</div>
				{:else}
					<button
						type="button"
						onclick={() => (confirmingReset = true)}
						class="pt-3 text-sm text-content-muted hover:text-content underline w-fit"
					>
						Start fresh as a new player
					</button>
				{/if}
			</div>
		</div>
	</div>

	<DeleteAccountPanel />
</section>
