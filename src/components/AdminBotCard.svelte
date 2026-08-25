<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	// One operator card from the full `/admin/bots` inventory (#243). Unlike the owner surface this
	// card never exposes ownership transfer: it can repair discoverability and a lost credential,
	// but an administrator never becomes the bot's owner. A rotated plaintext token lives only in
	// this component's local state, so unmount/reload clears it by construction.
	import {
		closeAdminToHumans,
		openAdminToHumans,
		rotateAdminToken,
		setAdminDescription,
		setAdminLadder,
		type AdminBot,
		type AdminBotFailure,
	} from '$lib/bots/adminApi';
	import { toastStore } from '$lib/toastStore.svelte';
	import { formatWholeNumber } from '../utils/formatters';

	let { bot, onChanged }: { bot: AdminBot; onChanged: () => void | Promise<void> } = $props();
	let description = $state('');
	let lastServerDescription = $state<string | null>(null);
	let error = $state<string | null>(null);
	let pending = $state<string | null>(null);
	let rotateOpen = $state(false);
	let confirmInput = $state('');
	let revealedToken = $state<string | null>(null);
	let tokenCopied = $state(false);
	let cancelButton = $state<HTMLButtonElement | null>(null);

	const confirmsBotName = $derived(confirmInput.trim().toLowerCase() === bot.name.toLowerCase());

	$effect(() => {
		if (rotateOpen) cancelButton?.focus();
	});

	// Refreshes replace the parent row. Do not overwrite an in-progress edit, but do adopt the
	// server value after an action (or a concurrent operator's refresh).
	$effect(() => {
		if (pending === null && bot.description !== lastServerDescription) {
			description = bot.description ?? '';
			lastServerDescription = bot.description;
		}
	});

	function clearRevealedToken() {
		revealedToken = null;
		tokenCopied = false;
	}

	function beginAction() {
		clearRevealedToken();
		error = null;
	}

	function errorFor(result: AdminBotFailure | { outcome: 'mismatch'; reason: string }): string {
		switch (result.outcome) {
			case 'signed-out':
				return 'You are no longer signed in.';
			case 'forbidden':
				return 'The server denied administrator access (403).';
			case 'no-such-bot':
				return 'No such registered bot exists.';
			case 'invalid':
			case 'mismatch':
				return result.reason;
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

	async function toggleLadder() {
		beginAction();
		pending = 'ladder';
		const result = await setAdminLadder(bot.team, bot.name, !bot.onLadder);
		try {
			if (result.outcome === 'ok')
				await changed(bot.onLadder ? 'Bot removed from the ladder.' : 'Bot added to the ladder.');
			else error = errorFor(result);
		} finally {
			pending = null;
		}
	}

	async function saveDescription() {
		beginAction();
		const next = description.trim();
		if (!next) {
			error = 'Enter a catalog description before saving it.';
			return;
		}
		pending = 'description';
		const result = await setAdminDescription(bot.team, bot.name, next);
		try {
			if (result.outcome === 'ok') await changed('Catalog description updated.');
			else error = errorFor(result);
		} finally {
			pending = null;
		}
	}

	async function toggleCatalog() {
		beginAction();
		pending = 'catalog';
		const result = bot.openToHumans
			? await closeAdminToHumans(bot.team, bot.name)
			: await openAdminToHumans(bot.team, bot.name, description);
		try {
			if (result.outcome === 'ok')
				await changed(bot.openToHumans ? 'Bot closed to human games.' : 'Bot opened to humans.');
			else error = errorFor(result);
		} finally {
			pending = null;
		}
	}

	function openRotation() {
		beginAction();
		rotateOpen = true;
		confirmInput = '';
	}

	function closeRotation() {
		rotateOpen = false;
		confirmInput = '';
		error = null;
	}

	async function rotate() {
		clearRevealedToken();
		error = null;
		pending = 'rotate';
		const result = await rotateAdminToken(bot.team, bot.name, confirmInput.trim());
		try {
			if (result.outcome === 'rotated') {
				revealedToken = result.token;
				rotateOpen = false;
				confirmInput = '';
				await onChanged();
			} else error = errorFor(result);
		} finally {
			pending = null;
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
				{#if bot.provisional}
					· provisional{/if}
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
			<span class="rounded-full border border-border px-2.5 py-1 text-content-muted">
				{bot.owned ? 'Owned' : 'Unclaimed'}
			</span>
		</div>
	</div>

	<div class="grid gap-5 border-t border-border pt-5 md:grid-cols-2">
		<div class="flex flex-col gap-3">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h4 class="text-sm font-bold text-content">Rating ladder</h4>
					<p class="text-xs text-content-muted">
						Change whether this registered bot receives ladder games.
					</p>
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
				Description edits are available even while the catalog is closed.
			</p>
			<label
				for={`description-${bot.team}-${bot.name}`}
				class="text-xs font-bold text-content-muted"
			>
				Catalog description
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
					onclick={() => void saveDescription()}
					disabled={pending !== null || !description.trim()}
					class="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-content transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
				>
					{pending === 'description' ? 'Saving' : 'Save description'}
				</button>
				<button
					type="button"
					onclick={() => void toggleCatalog()}
					disabled={pending !== null}
					class="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-bold text-content-muted transition-colors hover:text-content disabled:cursor-not-allowed disabled:opacity-40"
				>
					{pending === 'catalog' ? 'Saving' : bot.openToHumans ? 'Close catalog' : 'Open to humans'}
				</button>
			</div>
		</div>

		<div class="flex flex-col gap-3">
			<h4 class="text-sm font-bold text-content">Ownership</h4>
			<p class="text-xs text-content-muted">
				{bot.owned ? 'This bot is claimed by an account.' : 'No account has claimed this bot.'} Ownership
				is display-only here; administrators cannot claim or release it.
			</p>
		</div>

		<div class="flex flex-col gap-3">
			<h4 class="text-sm font-bold text-content">Token recovery</h4>
			<p class="text-xs text-content-muted">
				Rotation takes a running bot offline. Give the new token to its author; this does not make
				you the owner.
			</p>
			<div>
				<button
					type="button"
					onclick={openRotation}
					disabled={pending !== null}
					class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-bold text-danger transition-colors hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-40"
				>
					Rotate token
				</button>
			</div>
		</div>
	</div>

	{#if rotateOpen}
		<div class="flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4">
			<p class="text-sm text-content">
				This takes the running bot offline. The author must claim the new token themselves; you
				never become its owner.
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
					class="min-w-40 flex-1 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-content outline-none transition-colors focus:border-danger"
				/>
				<button
					type="submit"
					disabled={!confirmsBotName || pending !== null}
					class="rounded-lg border border-danger/30 bg-danger/15 px-3 py-2 text-sm font-bold text-danger transition-colors hover:bg-danger/25 disabled:cursor-not-allowed disabled:opacity-40"
				>
					{pending === 'rotate' ? 'Rotating' : 'Confirm rotation'}
				</button>
				<button
					type="button"
					bind:this={cancelButton}
					onclick={closeRotation}
					class="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-bold text-content-muted transition-colors hover:text-content"
				>
					Cancel
				</button>
			</form>
		</div>
	{/if}

	{#if revealedToken}
		<div
			role="status"
			aria-live="polite"
			class="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/10 p-4"
		>
			<p class="font-bold text-content">Copy this token now — it will not be shown again.</p>
			<!-- One text node only: title/ARIA duplication would leave a second DOM copy of the secret. -->
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
