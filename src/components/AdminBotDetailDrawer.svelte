<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	// Detail drawer for `/me/admin/bots` (#47).
	// Preserves all audited administrative actions (ladder, catalog, description, token recovery)
	// and adds audited capacity editing along with read-only webhook inspection.
	// Rotated token plaintext remains strictly component-local state and clears on close/unmount.

	import {
		closeAdminToHumans,
		openAdminToHumans,
		rotateAdminToken,
		setAdminCapacity,
		setAdminDescription,
		setAdminLadder,
		type AdminBot,
		type AdminBotFailure,
	} from '$lib/bots/adminApi';
	import { toastStore } from '$lib/toastStore.svelte';

	interface Props {
		bot: AdminBot | null;
		onClose: () => void;
		onChanged: () => void | Promise<void>;
	}

	let { bot, onClose, onChanged }: Props = $props();

	const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

	let description = $state('');
	let lastServerDescription = $state<string | null>(null);
	let capacityInput = $state('');
	let lastServerCapacity = $state<number | null>(null);

	let error = $state<string | null>(null);
	let pending = $state<string | null>(null);

	let rotateOpen = $state(false);
	let confirmInput = $state('');
	let revealedToken = $state<string | null>(null);
	let tokenCopied = $state(false);
	let webhookCopied = $state(false);

	let closeButton = $state<HTMLButtonElement | null>(null);
	let rotateCancelButton = $state<HTMLButtonElement | null>(null);

	const confirmsBotName = $derived(
		bot !== null && confirmInput.trim().toLowerCase() === bot.name.toLowerCase(),
	);

	let lastBotKey = $state<string | null>(null);
	let lastActiveElement = $state<HTMLElement | null>(null);

	// Synchronize local edit fields when a new bot is selected or after server refresh
	$effect(() => {
		const currentKey = bot ? `${bot.team}/${bot.name}` : null;
		if (currentKey !== lastBotKey) {
			lastBotKey = currentKey;
			revealedToken = null;
			tokenCopied = false;
			rotateOpen = false;
			confirmInput = '';
			error = null;

			if (bot) {
				if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
					lastActiveElement = document.activeElement;
				}
				description = bot.description ?? '';
				capacityInput = String(bot.maxConcurrentGames);
				lastServerDescription = bot.description;
				lastServerCapacity = bot.maxConcurrentGames;
				closeButton?.focus();
			} else {
				if (lastActiveElement) {
					lastActiveElement.focus();
					lastActiveElement = null;
				}
			}
		} else if (bot && pending === null) {
			if (bot.description !== lastServerDescription) {
				description = bot.description ?? '';
				lastServerDescription = bot.description;
			}
			if (bot.maxConcurrentGames !== lastServerCapacity) {
				capacityInput = String(bot.maxConcurrentGames);
				lastServerCapacity = bot.maxConcurrentGames;
			}
		}
	});

	$effect(() => {
		if (rotateOpen) {
			rotateCancelButton?.focus();
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
		if (result.outcome === 'forbidden') {
			return 'Administrator access denied by play-api (403).';
		}
		if (result.outcome === 'signed-out') {
			return 'Administrator session expired. Please sign in again.';
		}
		if (result.outcome === 'no-such-bot') {
			return 'Target bot was not found in the play-api registry.';
		}
		if (result.outcome === 'invalid' || result.outcome === 'mismatch') {
			return result.reason;
		}
		return 'Unable to reach play-api. Please check your network and retry.';
	}

	async function changed(message: string) {
		await onChanged();
		toastStore.success(message);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!bot) return;
		if (event.key === 'Escape') {
			if (rotateOpen) {
				closeRotation();
			} else {
				onClose();
			}
		}
	}

	async function toggleLadder() {
		if (!bot) return;
		beginAction();
		pending = 'ladder';
		try {
			const result = await setAdminLadder(bot.team, bot.name, !bot.onLadder);
			if (result.outcome === 'ok') {
				await changed(bot.onLadder ? 'Bot removed from the ladder.' : 'Bot added to the ladder.');
			} else {
				error = errorFor(result);
			}
		} finally {
			pending = null;
		}
	}

	async function saveDescription() {
		if (!bot) return;
		beginAction();
		const next = description.trim();
		if (!next) {
			error = 'Enter a catalog description before saving it.';
			return;
		}
		pending = 'description';
		try {
			const result = await setAdminDescription(bot.team, bot.name, next);
			if (result.outcome === 'ok') {
				await changed('Catalog description updated.');
			} else {
				error = errorFor(result);
			}
		} finally {
			pending = null;
		}
	}

	async function toggleCatalog() {
		if (!bot) return;
		beginAction();
		if (!bot.openToHumans) {
			const next = description.trim();
			if (!next) {
				error = 'Enter a catalog description before opening the bot to humans.';
				return;
			}
			pending = 'catalog';
			try {
				const result = await openAdminToHumans(bot.team, bot.name, next);
				if (result.outcome === 'ok') {
					await changed('Bot opened to humans.');
				} else {
					error = errorFor(result);
				}
			} finally {
				pending = null;
			}
		} else {
			pending = 'catalog';
			try {
				const result = await closeAdminToHumans(bot.team, bot.name);
				if (result.outcome === 'ok') {
					await changed('Bot closed to human games.');
				} else {
					error = errorFor(result);
				}
			} finally {
				pending = null;
			}
		}
	}

	async function saveCapacity() {
		if (!bot) return;
		beginAction();
		const games = Number(capacityInput);
		if (!Number.isInteger(games) || games < 1 || games > 32) {
			error = 'Enter a whole number of concurrent games between 1 and 32.';
			return;
		}
		pending = 'capacity';
		try {
			const result = await setAdminCapacity(bot.team, bot.name, games);
			if (result.outcome === 'ok') {
				capacityInput = String(result.capacity.maxConcurrentGames);
				lastServerCapacity = result.capacity.maxConcurrentGames;
				await changed('Bot capacity updated.');
			} else {
				error = errorFor(result);
			}
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
		if (!bot) return;
		clearRevealedToken();
		error = null;
		if (!confirmsBotName) {
			error = `Type ${bot.name} to confirm rotation.`;
			return;
		}
		pending = 'rotate';
		try {
			const result = await rotateAdminToken(bot.team, bot.name, confirmInput.trim());
			if (result.outcome === 'rotated') {
				revealedToken = result.token;
				rotateOpen = false;
				confirmInput = '';
				await changed('Rotated bot token.');
			} else {
				error = errorFor(result);
			}
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

	async function copyWebhookUrl() {
		if (!bot?.webhook?.url) return;
		try {
			await navigator.clipboard.writeText(bot.webhook.url);
			webhookCopied = true;
			setTimeout(() => {
				webhookCopied = false;
			}, 2000);
		} catch {
			error = 'Could not copy the webhook URL.';
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if bot}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity"
		onclick={onClose}
		role="presentation"
	></div>

	<!-- Drawer panel -->
	<div
		role="dialog"
		aria-modal="true"
		aria-label={`Details for ${bot.team} ${bot.name}`}
		class="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-surface shadow-2xl transition-transform duration-200"
	>
		<!-- Header -->
		<div
			class="flex items-start justify-between gap-4 border-b border-border bg-surface/80 p-5 backdrop-blur-md"
		>
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<h3 class="truncate text-xl font-bold text-content">{bot.team} {bot.name}</h3>
				</div>
				<p class="mt-1 font-mono text-xs tabular-nums text-content-muted">
					<b class="text-content">{wholeNumber.format(bot.rating)}</b> ±{wholeNumber.format(bot.rd)}
					{#if bot.provisional}
						<span
							class="ml-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-500"
						>
							Provisional
						</span>
					{/if}
				</p>
			</div>

			<button
				type="button"
				bind:this={closeButton}
				onclick={onClose}
				aria-label="Close detail drawer"
				class="rounded-xl border border-border p-2 text-content-muted transition-colors hover:border-content hover:text-content"
			>
				✕
			</button>
		</div>

		<!-- Scrollable content area -->
		<div class="flex-1 overflow-y-auto p-5 space-y-6">
			<!-- Status Badges Summary -->
			<div class="flex flex-wrap gap-2 text-xs font-bold">
				<span
					class={`rounded-full border px-2.5 py-1 ${
						bot.onLadder
							? 'border-primary/30 bg-primary/15 text-primary'
							: 'border-border text-content-muted'
					}`}
				>
					{bot.onLadder ? 'On ladder' : 'Off ladder'}
				</span>
				<span
					class={`rounded-full border px-2.5 py-1 ${
						bot.openToHumans
							? 'border-primary/30 bg-primary/15 text-primary'
							: 'border-border text-content-muted'
					}`}
				>
					{bot.openToHumans ? 'Open to humans' : 'Catalog closed'}
				</span>
				<span class="rounded-full border border-border px-2.5 py-1 text-content-muted">
					{bot.owned ? 'Owned' : 'Unclaimed'}
				</span>
				<span
					class={`rounded-full border px-2.5 py-1 ${
						bot.webhook
							? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-500'
							: 'border-border text-content-muted'
					}`}
				>
					{bot.webhook ? 'Webhook active' : 'No webhook'}
				</span>
			</div>

			{#if error}
				<div
					class="rounded-xl border border-danger/30 bg-danger/10 p-4 text-xs text-danger"
					role="alert"
				>
					{error}
				</div>
			{/if}

			<!-- Capacity & Concurrency Management -->
			<section class="flex flex-col gap-3 rounded-2xl border border-border bg-surface/50 p-4">
				<div class="flex items-center justify-between">
					<div>
						<h4 class="text-sm font-bold text-content">Capacity & Utilization</h4>
						<p class="text-xs text-content-muted">Active games and concurrency ceiling (1–32).</p>
					</div>
					<span
						class={`rounded-lg border px-2.5 py-1 text-xs font-mono font-bold ${
							bot.activeGames >= bot.maxConcurrentGames
								? 'border-amber-500/30 bg-amber-500/15 text-amber-500'
								: 'border-border bg-surface text-content'
						}`}
					>
						{bot.activeGames} / {bot.maxConcurrentGames} active
					</span>
				</div>

				<div class="text-xs text-content-muted">
					Ladder allowance: <b class="text-content font-mono">{bot.ladderAllowance}</b>
					{#if bot.openToHumans && bot.maxConcurrentGames > 1}
						(1 slot reserved for human players)
					{/if}
				</div>

				<div class="flex items-center gap-2 pt-1">
					<label
						for={`capacity-${bot.team}-${bot.name}`}
						class="text-xs font-semibold text-content-muted"
					>
						Max concurrent games:
					</label>
					<input
						id={`capacity-${bot.team}-${bot.name}`}
						type="number"
						min="1"
						max="32"
						bind:value={capacityInput}
						class="w-20 rounded-lg border border-border bg-surface px-2.5 py-1.5 font-mono text-sm text-content outline-none transition-colors focus:border-primary"
					/>
					<button
						type="button"
						onclick={() => void saveCapacity()}
						disabled={pending !== null ||
							String(capacityInput).trim() === '' ||
							Number(capacityInput) === bot.maxConcurrentGames}
						class="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-content transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
					>
						{pending === 'capacity' ? 'Saving…' : 'Save capacity'}
					</button>
				</div>
			</section>

			<!-- Rating Ladder Section -->
			<section class="flex flex-col gap-3 rounded-2xl border border-border bg-surface/50 p-4">
				<div class="flex items-center justify-between gap-3">
					<div>
						<h4 class="text-sm font-bold text-content">Rating Ladder</h4>
						<p class="text-xs text-content-muted">
							Change whether this registered bot is scheduled for automated ladder games.
						</p>
					</div>
					<button
						type="button"
						onclick={() => void toggleLadder()}
						disabled={pending !== null}
						class="shrink-0 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-bold text-content transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
					>
						{pending === 'ladder' ? 'Saving…' : bot.onLadder ? 'Leave ladder' : 'Join ladder'}
					</button>
				</div>
			</section>

			<!-- Human Catalog & Description Section -->
			<section class="flex flex-col gap-3 rounded-2xl border border-border bg-surface/50 p-4">
				<div class="flex items-center justify-between">
					<div>
						<h4 class="text-sm font-bold text-content">Human Catalog</h4>
						<p class="text-xs text-content-muted">
							Public catalog visibility and description blurb.
						</p>
					</div>
					<button
						type="button"
						onclick={() => void toggleCatalog()}
						disabled={pending !== null}
						class="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-bold text-content-muted transition-colors hover:text-content disabled:cursor-not-allowed disabled:opacity-40"
					>
						{pending === 'catalog'
							? 'Saving…'
							: bot.openToHumans
								? 'Close catalog'
								: 'Open to humans'}
					</button>
				</div>

				<div class="flex flex-col gap-1.5">
					<div class="flex justify-between items-center">
						<label
							for={`drawer-description-${bot.team}-${bot.name}`}
							class="text-xs font-semibold text-content-muted"
						>
							Catalog description
						</label>
						<span class="text-[10px] text-content-muted font-mono">{description.length}/200</span>
					</div>
					<textarea
						id={`drawer-description-${bot.team}-${bot.name}`}
						bind:value={description}
						maxlength="200"
						rows="2"
						placeholder="A sentence about how this bot plays"
						class="resize-y rounded-lg border border-border bg-surface px-3 py-2 text-xs text-content outline-none transition-colors focus:border-primary"
					></textarea>
					<div class="flex justify-end pt-1">
						<button
							type="button"
							onclick={() => void saveDescription()}
							disabled={pending !== null ||
								!description.trim() ||
								description.trim() === (bot.description ?? '')}
							class="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-content transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
						>
							{pending === 'description' ? 'Saving…' : 'Save description'}
						</button>
					</div>
				</div>
			</section>

			<!-- Webhook & Capabilities (Read-Only) -->
			<section class="flex flex-col gap-3 rounded-2xl border border-border bg-surface/50 p-4">
				<div class="flex items-center justify-between">
					<div>
						<h4 class="text-sm font-bold text-content">Webhook & Capabilities</h4>
						<p class="text-xs text-content-muted">
							Real-time move delivery configuration (read-only).
						</p>
					</div>
				</div>

				{#if bot.webhook}
					<div class="flex flex-col gap-2">
						<label
							for={`webhook-url-${bot.team}-${bot.name}`}
							class="text-xs font-semibold text-content-muted"
						>
							Callback URL:
						</label>
						<div class="flex items-center gap-2">
							<input
								id={`webhook-url-${bot.team}-${bot.name}`}
								type="text"
								readonly
								value={bot.webhook.url}
								class="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-xs text-content outline-none"
							/>
							<button
								type="button"
								onclick={() => void copyWebhookUrl()}
								class="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-content-muted transition-colors hover:text-content"
							>
								{webhookCopied ? 'Copied' : 'Copy'}
							</button>
						</div>

						<p class="text-[11px] text-content-muted">
							Verified at: <span class="font-mono text-content"
								>{new Date(bot.webhook.verifiedAt).toLocaleString()}</span
							>
						</p>

						<div class="flex flex-wrap items-center gap-1.5 pt-1">
							<span class="text-xs font-semibold text-content-muted">Capabilities:</span>
							{#if bot.webhook.capabilities.length > 0}
								{#each bot.webhook.capabilities as cap (cap)}
									<span
										class="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold text-primary"
									>
										{cap}
									</span>
								{/each}
							{:else}
								<span class="text-xs text-content-muted">None declared</span>
							{/if}
						</div>

						{#if bot.webhook.lastFailure}
							<div
								class="mt-1 rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-xs text-danger"
								role="alert"
							>
								<p class="font-bold">
									Last delivery failure ({new Date(bot.webhook.lastFailure.at).toLocaleString()}):
								</p>
								<p class="font-mono text-[11px] mt-0.5">{bot.webhook.lastFailure.reason}</p>
							</div>
						{/if}
					</div>
				{:else}
					<p class="text-xs text-content-muted">
						No webhook is registered for this bot. It plays exclusively through long-polling or seek
						commands.
					</p>
				{/if}
				<p class="text-[10px] text-content-muted italic">
					Webhook URLs and signing secrets are managed through the guarded webhook registration
					workflow.
				</p>
			</section>

			<!-- Ownership Section (Display-Only) -->
			<section class="flex flex-col gap-2 rounded-2xl border border-border bg-surface/50 p-4">
				<h4 class="text-sm font-bold text-content">Ownership</h4>
				<p class="text-xs text-content-muted">
					{bot.owned ? 'This bot is claimed by an account.' : 'No account has claimed this bot.'}
					Ownership is display-only here; administrator authority does not claim or release ownership.
				</p>
			</section>

			<!-- Token Recovery Section -->
			<section class="flex flex-col gap-3 rounded-2xl border border-border bg-surface/50 p-4">
				<div>
					<h4 class="text-sm font-bold text-content">Token Recovery</h4>
					<p class="text-xs text-content-muted">
						Rotation takes a running bot offline. Hand the new secret token to the author.
					</p>
				</div>

				<div>
					<button
						type="button"
						onclick={openRotation}
						disabled={pending !== null}
						class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-40"
					>
						Rotate token
					</button>
				</div>

				{#if rotateOpen}
					<div class="rounded-xl border border-danger/30 bg-danger/5 p-4">
						<p class="text-xs text-danger font-medium">
							Warning: Generating a new bot token revokes the previous token immediately.
						</p>
						<form
							onsubmit={(e) => {
								e.preventDefault();
								void rotate();
							}}
							class="mt-3 flex flex-col gap-2.5"
						>
							<label
								for={`drawer-rotate-confirm-${bot.team}-${bot.name}`}
								class="text-xs font-semibold text-content-muted"
							>
								Type <span class="font-mono font-bold text-content">{bot.name}</span> to proceed:
							</label>
							<div class="flex flex-wrap items-center gap-2">
								<input
									id={`drawer-rotate-confirm-${bot.team}-${bot.name}`}
									bind:value={confirmInput}
									spellcheck="false"
									autocomplete="off"
									placeholder={bot.name}
									class="min-w-40 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-xs text-content outline-none transition-colors focus:border-danger"
								/>
								<button
									type="submit"
									disabled={!confirmsBotName || pending !== null}
									class="rounded-lg bg-danger px-3.5 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
								>
									{pending === 'rotate' ? 'Rotating…' : 'Confirm rotation'}
								</button>
								<button
									type="button"
									bind:this={rotateCancelButton}
									onclick={closeRotation}
									class="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-content-muted transition-colors hover:text-content"
								>
									Cancel
								</button>
							</div>
						</form>
					</div>
				{/if}

				{#if revealedToken}
					<div
						role="status"
						aria-live="polite"
						class="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3.5"
					>
						<p class="text-xs font-bold text-content">
							Copy this token now — it will not be shown again.
						</p>
						<code
							class="break-all rounded-lg border border-primary/30 bg-surface px-3 py-2 font-mono text-xs text-content select-all"
						>
							{revealedToken}
						</code>
						<div>
							<button
								type="button"
								onclick={() => void copyToken()}
								class="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-content transition-colors hover:bg-primary-hover"
							>
								{tokenCopied ? 'Copied' : 'Copy token'}
							</button>
						</div>
					</div>
				{/if}
			</section>
		</div>
	</div>
{/if}
