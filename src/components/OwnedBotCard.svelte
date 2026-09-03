<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	// One signed-in author's bot-management card (#242). The public catalog and the owner's settings
	// are intentionally separate: this card uses only `/me/bots`, whose server-side ownership gate
	// is authoritative. The plaintext returned by rotation is component-local `$state` — no store,
	// URL, browser storage, or console ever sees it — so unmounting the card clears it by construction.
	import { onMount } from 'svelte';
	import {
		closeToHumans,
		fetchCapacity,
		openToHumans,
		releaseBot,
		rotateToken,
		setCapacity,
		setLadder,
		type BotCapacity,
		type MyBot,
		type OwnerBotFailure,
	} from '$lib/bots/ownerApi';
	import { toastStore } from '$lib/toastStore.svelte';
	import { formatWholeNumber } from '../utils/formatters';
	import BotWebhookPanel from './BotWebhookPanel.svelte';

	let { bot, onChanged }: { bot: MyBot; onChanged: () => void | Promise<void> } = $props();
	let capacity = $state<BotCapacity | null>(null);
	let capacityInput = $state('');
	let description = $state('');
	let error = $state<string | null>(null);
	let pending = $state<string | null>(null);
	let rotateOpen = $state(false);
	let releaseOpen = $state(false);
	let confirmInput = $state('');
	let revealedToken = $state<string | null>(null);
	let tokenCopied = $state(false);
	let rotateCancelButton = $state<HTMLButtonElement | null>(null);
	let releaseCancelButton = $state<HTMLButtonElement | null>(null);

	const confirmsBotName = $derived(confirmInput.trim().toLowerCase() === bot.name.toLowerCase());

	$effect(() => {
		if (rotateOpen) rotateCancelButton?.focus();
		else if (releaseOpen) releaseCancelButton?.focus();
	});

	onMount(() => {
		void loadCapacity();
	});

	function clearRevealedToken() {
		revealedToken = null;
		tokenCopied = false;
	}

	/** Any new action invalidates the one-time token panel before it can coexist with another flow. */
	function beginAction() {
		clearRevealedToken();
		error = null;
	}

	function errorFor(result: OwnerBotFailure): string {
		switch (result.outcome) {
			case 'signed-out':
				return 'You are no longer signed in.';
			case 'not-yours':
				return 'That bot is not yours.';
			case 'no-such-bot':
				return 'No such bot exists.';
			case 'invalid':
			case 'mismatch':
				return result.reason ?? 'The server rejected that change.';
			case 'unavailable':
				return 'Could not reach the server. Try again.';
		}
		const unhandled: never = result;
		return unhandled;
	}

	async function changed(message: string) {
		await onChanged();
		toastStore.success(message);
	}

	async function loadCapacity() {
		const result = await fetchCapacity(bot.team, bot.name);
		if (result.outcome === 'ok') {
			capacity = result.capacity;
			capacityInput = String(result.capacity.maxConcurrentGames);
		} else {
			error = errorFor(result);
		}
	}

	async function toggleLadder() {
		beginAction();
		pending = 'ladder';
		const result = await setLadder(bot.team, bot.name, !bot.onLadder);
		pending = null;
		if (result.outcome === 'ok')
			await changed(bot.onLadder ? 'Left the ladder.' : 'Joined the ladder.');
		else error = errorFor(result);
	}

	async function saveCatalogDescription() {
		beginAction();
		pending = 'catalog';
		const result = await openToHumans(bot.team, bot.name, description);
		pending = null;
		if (result.outcome === 'ok') {
			description = '';
			await changed(bot.openToHumans ? 'Catalog description updated.' : 'Bot opened to humans.');
		} else {
			error = errorFor(result);
		}
	}

	async function leaveCatalog() {
		beginAction();
		pending = 'catalog';
		const result = await closeToHumans(bot.team, bot.name);
		pending = null;
		if (result.outcome === 'ok') await changed('Bot closed to human games.');
		else error = errorFor(result);
	}

	async function saveCapacity() {
		beginAction();
		const maxConcurrentGames = Number(capacityInput);
		if (!Number.isInteger(maxConcurrentGames) || maxConcurrentGames < 1) {
			error = 'Enter a whole number of concurrent games.';
			return;
		}
		pending = 'capacity';
		const result = await setCapacity(bot.team, bot.name, maxConcurrentGames);
		pending = null;
		if (result.outcome === 'ok') {
			capacity = result.capacity;
			capacityInput = String(result.capacity.maxConcurrentGames);
			await changed('Capacity updated.');
		} else {
			error = errorFor(result);
		}
	}

	function openRotation() {
		beginAction();
		rotateOpen = true;
		releaseOpen = false;
		confirmInput = '';
	}

	function openRelease() {
		beginAction();
		releaseOpen = true;
		rotateOpen = false;
		confirmInput = '';
	}

	function closeConfirmation() {
		rotateOpen = false;
		releaseOpen = false;
		confirmInput = '';
		error = null;
	}

	async function rotate() {
		clearRevealedToken();
		error = null;
		pending = 'rotate';
		const result = await rotateToken(bot.team, bot.name, confirmInput.trim());
		pending = null;
		if (result.outcome === 'rotated') {
			revealedToken = result.token;
			rotateOpen = false;
			confirmInput = '';
			await onChanged();
		} else {
			error = errorFor(result);
		}
	}

	async function release() {
		clearRevealedToken();
		error = null;
		pending = 'release';
		const result = await releaseBot(bot.team, bot.name);
		pending = null;
		if (result.outcome === 'released') {
			releaseOpen = false;
			confirmInput = '';
			await changed('Bot released.');
		} else {
			error = errorFor(result);
		}
	}

	async function copyToken() {
		if (!revealedToken) return;
		try {
			await navigator.clipboard.writeText(revealedToken);
			tokenCopied = true;
		} catch {
			error = 'Could not copy the token — select it and copy it manually.';
		}
	}
</script>

<article class="flex flex-col gap-5 rounded-2xl border border-border bg-surface/60 p-5">
	<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
		<div class="min-w-0">
			<h3 class="truncate font-semibold text-content">{bot.team} {bot.name}</h3>
			<p class="font-mono text-xs tabular-nums text-content-muted">
				<b class="text-content">{formatWholeNumber(bot.rating)}</b> ±{formatWholeNumber(bot.rd)}
			</p>
		</div>
		<div class="flex flex-wrap gap-2 text-xs font-bold">
			<span
				class={`rounded-full border px-2.5 py-1 ${bot.onLadder ? 'border-primary/30 bg-primary/15 text-primary' : 'border-border text-content-muted'}`}
			>
				{bot.onLadder ? 'On ladder' : 'Off ladder'}
			</span>
			<span
				class={`rounded-full border px-2.5 py-1 ${bot.openToHumans ? 'border-primary/30 bg-primary/15 text-primary' : 'border-border text-content-muted'}`}
			>
				{bot.openToHumans ? 'Open to humans' : 'Catalog closed'}
			</span>
		</div>
	</div>

	<div class="grid gap-5 border-t border-border pt-5 md:grid-cols-2">
		<div class="flex flex-col gap-3">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h4 class="text-sm font-bold text-content">Rating ladder</h4>
					<p class="text-xs text-content-muted">Pairs your bot with other opted-in bots.</p>
				</div>
				<button
					type="button"
					onclick={() => void toggleLadder()}
					disabled={pending !== null}
					class="shrink-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-bold text-content transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
				>
					{pending === 'ladder' ? 'Saving' : bot.onLadder ? 'Leave ladder' : 'Join ladder'}
				</button>
			</div>
		</div>

		<div class="flex flex-col gap-3">
			<h4 class="text-sm font-bold text-content">Human catalog</h4>
			<p class="text-xs text-content-muted">
				{bot.openToHumans
					? 'Your bot is visible to people looking for an opponent.'
					: 'Open it when it can accept games from people.'}
			</p>
			<label
				for={`description-${bot.team}-${bot.name}`}
				class="text-xs font-bold text-content-muted"
			>
				{bot.openToHumans ? 'Replace catalog description' : 'Catalog description (optional)'}
			</label>
			<textarea
				id={`description-${bot.team}-${bot.name}`}
				bind:value={description}
				maxlength="200"
				rows="2"
				placeholder="A sentence about how this bot plays"
				class="resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-content outline-none transition-colors focus:border-primary"
			></textarea>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					onclick={() => void saveCatalogDescription()}
					disabled={pending !== null || (bot.openToHumans && !description.trim())}
					class="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-content transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
				>
					{pending === 'catalog'
						? 'Saving'
						: bot.openToHumans
							? 'Save description'
							: 'Open to humans'}
				</button>
				{#if bot.openToHumans}
					<button
						type="button"
						onclick={() => void leaveCatalog()}
						disabled={pending !== null}
						class="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-bold text-content-muted transition-colors hover:text-content disabled:cursor-not-allowed disabled:opacity-40"
					>
						Close catalog
					</button>
				{/if}
			</div>
		</div>

		<div class="flex flex-col gap-3">
			<h4 class="text-sm font-bold text-content">Concurrent games</h4>
			{#if capacity}
				<p class="text-xs text-content-muted">
					{capacity.activeGames} active · ladder may use {capacity.ladderAllowance}
				</p>
			{:else}
				<p class="text-xs text-content-muted">Loading current capacity…</p>
			{/if}
			<form
				onsubmit={(event) => {
					event.preventDefault();
					void saveCapacity();
				}}
				class="flex items-center gap-2"
			>
				<label for={`capacity-${bot.team}-${bot.name}`} class="sr-only"
					>Maximum concurrent games</label
				>
				<input
					id={`capacity-${bot.team}-${bot.name}`}
					type="number"
					min="1"
					max="32"
					step="1"
					bind:value={capacityInput}
					class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-content outline-none transition-colors focus:border-primary"
				/>
				<button
					type="submit"
					disabled={pending !== null || capacity === null}
					class="shrink-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-bold text-content transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
				>
					{pending === 'capacity' ? 'Saving' : 'Save capacity'}
				</button>
			</form>
		</div>

		<!--
			Webhook and capabilities (#48). Keyed by bot identity for the same reason the rotated token
			above is component-local: a staged setup can hold a one-time signing secret, and it must
			not survive a switch to a different bot.
		-->
		{#key `${bot.team}/${bot.name}`}
			<BotWebhookPanel root="owner" team={bot.team} name={bot.name} {onChanged} />
		{/key}

		<div class="flex flex-col gap-3">
			<h4 class="text-sm font-bold text-content">Token and ownership</h4>
			<p class="text-xs text-content-muted">
				Rotating a token takes a running bot offline until you deploy the new one. Releasing makes
				it claimable by anyone holding its token.
			</p>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					onclick={openRotation}
					disabled={pending !== null}
					class="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-bold text-content transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
				>
					Rotate token
				</button>
				<button
					type="button"
					onclick={openRelease}
					disabled={pending !== null}
					class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-bold text-danger transition-colors hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-40"
				>
					Release bot
				</button>
			</div>
		</div>
	</div>

	{#if rotateOpen}
		<div class="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
			<p class="text-sm text-content">
				This invalidates the token your running bot uses. Deploy the new token immediately.
			</p>
			<label
				for={`rotate-confirm-${bot.team}-${bot.name}`}
				class="text-xs font-bold text-content-muted"
			>
				Type <span class="font-mono text-content">{bot.name}</span> to confirm
			</label>
			<form
				onsubmit={(event) => {
					event.preventDefault();
					void rotate();
				}}
				class="flex flex-wrap items-center gap-2"
			>
				<input
					id={`rotate-confirm-${bot.team}-${bot.name}`}
					bind:value={confirmInput}
					spellcheck="false"
					autocomplete="off"
					class="min-w-40 flex-1 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-content outline-none transition-colors focus:border-primary"
				/>
				<button
					type="submit"
					disabled={!confirmsBotName || pending !== null}
					class="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-content transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
				>
					{pending === 'rotate' ? 'Rotating' : 'Confirm rotation'}
				</button>
				<button
					type="button"
					bind:this={rotateCancelButton}
					onclick={closeConfirmation}
					class="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-bold text-content-muted transition-colors hover:text-content"
				>
					Cancel
				</button>
			</form>
		</div>
	{/if}

	{#if releaseOpen}
		<div class="flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4">
			<p class="text-sm text-content">
				This releases ownership. Anyone holding this bot’s token can claim it afterwards.
			</p>
			<label
				for={`release-confirm-${bot.team}-${bot.name}`}
				class="text-xs font-bold text-content-muted"
			>
				Type <span class="font-mono text-content">{bot.name}</span> to confirm
			</label>
			<form
				onsubmit={(event) => {
					event.preventDefault();
					void release();
				}}
				class="flex flex-wrap items-center gap-2"
			>
				<input
					id={`release-confirm-${bot.team}-${bot.name}`}
					bind:value={confirmInput}
					spellcheck="false"
					autocomplete="off"
					class="min-w-40 flex-1 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-content outline-none transition-colors focus:border-danger"
				/>
				<button
					type="submit"
					disabled={!confirmsBotName || pending !== null}
					class="rounded-lg border border-danger/30 bg-danger/15 px-3 py-2 text-sm font-bold text-danger transition-colors hover:bg-danger/25 disabled:cursor-not-allowed disabled:opacity-40"
				>
					{pending === 'release' ? 'Releasing' : 'Confirm release'}
				</button>
				<button
					type="button"
					bind:this={releaseCancelButton}
					onclick={closeConfirmation}
					class="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-bold text-content-muted transition-colors hover:text-content"
				>
					Cancel
				</button>
			</form>
		</div>
	{/if}

	{#if revealedToken}
		<div class="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/10 p-4">
			<p class="font-bold text-content">Copy this token now — it will not be shown again.</p>
			<!-- One text node only: duplicating this in title/ARIA text would leave a second DOM copy. -->
			<code
				class="break-all rounded-lg border border-primary/30 bg-surface px-3 py-2 font-mono text-sm text-content"
				>{revealedToken}</code
			>
			<div>
				<button
					type="button"
					onclick={() => void copyToken()}
					class="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-content transition-colors hover:bg-primary-hover"
				>
					{tokenCopied ? 'Copied' : 'Copy token'}
				</button>
			</div>
		</div>
	{/if}

	{#if error}
		<p class="text-xs text-danger" role="alert">{error}</p>
	{/if}
</article>
