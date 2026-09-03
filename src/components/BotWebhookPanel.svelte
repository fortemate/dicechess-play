<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	// The guarded webhook and capability surface for one bot (#48), mounted by BOTH the owner card
	// and the administrator drawer. One component on purpose: play-api serves the two roots from a
	// single handler whose only intentional difference is authorization, so a second copy of these
	// consequence warnings and confirmation gates would be free to drift out of step with it.
	//
	// The panel presents server state and never decides policy. In particular:
	//
	//  * Capability controls are rendered from the live registry, so the reserved `doubling` name
	//    appears as a read-only badge and NOT as a working toggle — there is no end-to-end remote-bot
	//    doubling protocol yet, and an enabled control would advertise gameplay that cannot happen.
	//    When play-api promotes it, this file needs no change.
	//  * A URL change is a staged edit-and-verify flow, never an ordinary text field: it mints a new
	//    signing secret, probes the candidate endpoint, and only then retires the old registration.
	//    Every screen in that flow states what has and has not changed yet.
	//  * The one-time secret is shown once, in one place, and cannot be recovered. It is never
	//    written to a log, a URL, analytics, Sentry, or browser storage, and the parent keys this
	//    component per bot so switching bots unmounts it and drops the secret by construction.
	//
	// Flow state, revision discipline, and secret scrubbing live in `BotWebhookController`; this
	// file owns only markup, local form input, and focus.
	import { untrack } from 'svelte';
	import { isAuthEnabled } from '$lib/auth/authApi';
	import { BotWebhookController } from '$lib/bots/webhookStore.svelte';
	import type { WebhookRoot } from '$lib/bots/webhookApi';

	interface Props {
		root: WebhookRoot;
		team: string;
		name: string;
		/** Refresh hook for the parent surface, called only after a change the server confirmed. */
		onChanged?: () => void | Promise<void>;
	}

	let { root, team, name, onChanged }: Props = $props();

	/**
	 * The bot identity collapsed into ONE primitive, and the controller's only dependency.
	 *
	 * A `$derived` that recomputes to an equal value does not invalidate its dependents, which is
	 * exactly the property needed here. `onChanged` makes the parent re-read its bot list and
	 * re-render with fresh bot objects, so `team` and `name` arrive again as equal strings; a
	 * controller derived from those props directly would be rebuilt on every successful action,
	 * silently discarding the confirmation it had just published, re-fetching the slot and the
	 * capability registry, and — if a flow were ever in progress — destroying a held one-time
	 * secret. Depending on the string instead makes a rebuild mean a genuinely different bot.
	 */
	const identity = $derived(JSON.stringify([root, team, name]));

	// One controller per bot identity, rebuilt when that identity changes rather than mutated. A
	// controller can hold an unrecoverable one-time secret, so it must never outlive the bot it was
	// created for: the teardown below drops that secret even if a caller reuses this component
	// instance for a different bot instead of keying it.
	const store = $derived.by(() => {
		const [nextRoot, nextTeam, nextName] = JSON.parse(identity) as [WebhookRoot, string, string];
		return new BotWebhookController(nextRoot, nextTeam, nextName);
	});

	const available = isAuthEnabled();
	const fieldId = $derived(`webhook-${root}-${team}-${name}`.replace(/[^a-zA-Z0-9_-]/g, '_'));

	type OpenForm = 'none' | 'create' | 'replace' | 'rotate' | 'delete';

	let openForm = $state<OpenForm>('none');
	let urlInput = $state('');
	let confirmInput = $state('');
	let replaceConsent = $state(false);
	let secretCopied = $state(false);
	let urlCopied = $state(false);
	let copyError = $state<string | null>(null);

	let secretHeading = $state<HTMLElement | null>(null);
	let confirmField = $state<HTMLInputElement | null>(null);

	const registration = $derived(store.slot?.registration ?? null);
	const busy = $derived(store.busy !== null);
	/** Staging is impossible without an outbound verification transport on the server. */
	const canStage = $derived(!busy && !store.verificationUnavailable && store.handoff === null);
	const confirmsName = $derived(confirmInput === name);

	// Lifecycle only, and it must depend on NOTHING but the bot identity. `load()` touches the
	// controller's own reactive fields synchronously before its first await, so tracking those reads
	// would make this effect re-run as soon as the load it started published a result — tearing down
	// and permanently disposing the very controller it just built. `untrack` keeps the dependency set
	// to `store` alone, so a teardown happens only on unmount or a genuine identity change.
	$effect(() => {
		const current = store;
		// Confirmation echoes and candidate URLs are per-bot too: carrying a typed bot name across
		// an identity change would pre-arm a destructive confirmation for the wrong bot.
		resetForms();
		untrack(() => void current.load());
		return () => current.dispose();
	});

	// Pull focus to the secret the moment it appears: it is the only unrecoverable value on the
	// page, and a screen-reader user who never learns it was shown cannot store it.
	$effect(() => {
		if (store.handoff !== null) secretHeading?.focus();
	});

	$effect(() => {
		if (openForm === 'rotate' || openForm === 'delete') confirmField?.focus();
	});

	function resetForms() {
		openForm = 'none';
		urlInput = '';
		confirmInput = '';
		replaceConsent = false;
	}

	/** Run an action, then refresh the parent only when the server confirmed a change. */
	async function run(action: () => Promise<void>) {
		copyError = null;
		await action();
		if (store.notice?.tone === 'success') await onChanged?.();
	}

	async function copy(value: string, target: 'secret' | 'url') {
		try {
			await navigator.clipboard.writeText(value);
			if (target === 'secret') {
				secretCopied = true;
				setTimeout(() => (secretCopied = false), 2000);
			} else {
				urlCopied = true;
				setTimeout(() => (urlCopied = false), 2000);
			}
		} catch {
			// Never echo the value itself into an error — the operator can still select it by hand.
			copyError = 'Could not reach the clipboard. Select the value and copy it manually.';
		}
	}

	function toggleCapability(capability: string, checked: boolean) {
		store.selection = checked
			? [...store.selection, capability]
			: store.selection.filter((entry) => entry !== capability);
	}

	async function stageCreate() {
		await run(() =>
			store.stage({ kind: 'create', url: urlInput.trim(), capabilities: [...store.selection] }),
		);
		if (store.handoff !== null) resetForms();
	}

	async function stageReplace() {
		await run(() =>
			store.stage({ kind: 'replaceUrl', url: urlInput.trim(), confirmSecretRotation: true }),
		);
		if (store.handoff !== null) resetForms();
	}

	async function stageRotate() {
		await run(() =>
			store.stage({ kind: 'rotateSecret', cutoverMode: 'dualKey', confirm: confirmInput }),
		);
		if (store.handoff !== null) resetForms();
	}

	async function remove() {
		await run(() => store.remove(confirmInput));
		if (store.slot?.registration === null) resetForms();
	}

	const noticeClass: Record<string, string> = {
		info: 'border-border bg-surface text-content-muted',
		success: 'border-success/30 bg-success/10 text-success',
		warning: 'border-primary/40 bg-primary/10 text-content',
		danger: 'border-danger/30 bg-danger/10 text-danger',
	};

	function stamp(value: string): string {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
	}
</script>

<section
	class="flex flex-col gap-3 rounded-2xl border border-border bg-surface/50 p-4"
	aria-labelledby={`${fieldId}-heading`}
	aria-busy={busy}
>
	<div>
		<h4 id={`${fieldId}-heading`} class="text-sm font-bold text-content">
			Webhook &amp; capabilities
		</h4>
		<p class="text-xs text-content-muted">
			Real-time move delivery. Changing the URL verifies the new endpoint and issues a new signing
			secret; changing capabilities does not.
		</p>
	</div>

	{#if !available}
		<p class="text-xs text-content-muted">
			Webhook management needs a configured play-api connection and is unavailable in this build.
		</p>
	{:else if store.access.state === 'loading'}
		<p class="text-xs text-content-muted" aria-live="polite">Reading webhook configuration…</p>
	{:else if store.access.state === 'gated'}
		<p class="text-xs text-content-muted">
			Webhook management is switched off on this play-api instance, so there is nothing to configure
			here.
		</p>
	{:else if store.access.state === 'signed-out'}
		<p class="text-xs text-danger" role="alert">
			Your session has expired. Sign in again to manage this webhook.
		</p>
	{:else if store.access.state === 'denied'}
		<p class="text-xs text-danger" role="alert">
			play-api refused access to this bot's webhook configuration. Nothing has been changed.
		</p>
	{:else if store.access.state === 'missing'}
		<p class="text-xs text-danger" role="alert">This bot is no longer in the play-api registry.</p>
	{:else if store.access.state === 'unavailable'}
		<div class="flex flex-wrap items-center gap-2">
			<p class="text-xs text-danger" role="alert">
				Could not read the webhook configuration. Nothing has been changed.
			</p>
			<button
				type="button"
				onclick={() => void store.load()}
				disabled={busy}
				class="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-content-muted transition-colors hover:text-content disabled:cursor-not-allowed disabled:opacity-40"
			>
				Retry
			</button>
		</div>
	{:else}
		{#if store.notice}
			<div
				class={`rounded-lg border p-2.5 text-xs ${noticeClass[store.notice.tone]}`}
				role={store.notice.tone === 'danger' ? 'alert' : 'status'}
				aria-live={store.notice.tone === 'danger' ? 'assertive' : 'polite'}
			>
				{store.notice.text}
			</div>
		{/if}

		{#if copyError}
			<p class="text-xs text-danger" role="alert">{copyError}</p>
		{/if}

		<!-- Authoritative registration state. The signing secret is absent from this read entirely. -->
		{#if registration}
			<div class="flex flex-col gap-2">
				<label for={`${fieldId}-url`} class="text-xs font-semibold text-content-muted">
					Callback URL
				</label>
				<div class="flex flex-wrap items-center gap-2">
					<input
						id={`${fieldId}-url`}
						type="text"
						readonly
						value={registration.url}
						class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-xs text-content outline-none"
					/>
					<button
						type="button"
						onclick={() => void copy(registration.url, 'url')}
						class="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-content-muted transition-colors hover:text-content"
					>
						{urlCopied ? 'Copied' : 'Copy'}
					</button>
				</div>
				<dl class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-content-muted">
					<div class="flex gap-1">
						<dt>Verified:</dt>
						<dd class="font-mono text-content">{stamp(registration.verifiedAt)}</dd>
					</div>
					<div class="flex gap-1">
						<dt>Registration:</dt>
						<dd class="font-mono text-content">{registration.registrationId}</dd>
					</div>
				</dl>
				<p class="text-[11px] text-content-muted">
					The signing secret is never readable after registration, here or anywhere else.
				</p>

				{#if registration.lastFailure}
					<div
						class="rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-xs text-danger"
						role="alert"
					>
						<p class="font-bold">
							Last delivery failure ({stamp(registration.lastFailure.at)}):
						</p>
						<p class="mt-0.5 font-mono text-[11px]">{registration.lastFailure.reason}</p>
					</div>
				{:else}
					<p class="text-[11px] text-content-muted">No delivery failures recorded.</p>
				{/if}
			</div>
		{:else if store.handoff === null && !store.orphanedSetup}
			<p class="text-xs text-content-muted">
				No webhook is registered. This bot plays through long-polling or seek commands only.
			</p>
		{/if}

		<!-- The one-time secret. Shown once, recoverable never. -->
		{#if store.handoff}
			{@const handoff = store.handoff}
			<div class="flex flex-col gap-2 rounded-xl border border-danger/40 bg-danger/5 p-3">
				<h5
					bind:this={secretHeading}
					tabindex="-1"
					class="text-xs font-bold text-danger outline-none"
				>
					Store this signing secret now — it is shown once
				</h5>
				<p class="text-[11px] text-content">
					There is no way to retrieve it later. If you lose it, the only remedy is to cancel this
					candidate and start again. The current registration keeps serving traffic until activation
					succeeds.
				</p>
				<div class="flex flex-wrap items-center gap-2">
					<label class="sr-only" for={`${fieldId}-secret`}>Candidate signing secret</label>
					<input
						id={`${fieldId}-secret`}
						type="text"
						readonly
						autocomplete="off"
						spellcheck="false"
						value={handoff.secret}
						class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-xs text-content outline-none"
					/>
					<button
						type="button"
						onclick={() => void copy(handoff.secret, 'secret')}
						class="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-content-muted transition-colors hover:text-content"
					>
						{secretCopied ? 'Copied' : 'Copy'}
					</button>
				</div>
				<p class="text-[11px] text-content-muted">
					Candidate: <span class="font-mono text-content">{handoff.candidateUrl}</span> · expires
					<span class="font-mono text-content">{stamp(handoff.expiresAt)}</span>
					{#if handoff.kind !== 'create'}
						· keep accepting deliveries signed with the current secret until an authoritative read
						shows the new registration
					{/if}
				</p>

				<label class="flex items-start gap-2 text-[11px] text-content">
					<input
						type="checkbox"
						checked={store.secretAcknowledged}
						disabled={busy}
						onchange={(event) => store.acknowledgeSecret(event.currentTarget.checked)}
						class="mt-0.5"
					/>
					<span>I have stored this secret in the bot's configuration.</span>
				</label>

				{#if store.busy === 'activate'}
					<div class="flex flex-wrap items-center gap-2" aria-live="polite">
						<p class="text-[11px] text-content">
							Verifying the candidate endpoint… play-api is waiting for a signed proof from it.
						</p>
						<button
							type="button"
							onclick={() => store.cancelActivationWatch()}
							class="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-content-muted transition-colors hover:text-content"
						>
							Stop waiting
						</button>
					</div>
				{:else}
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							onclick={() => void run(() => store.activate())}
							disabled={!store.canActivate}
							class="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-content transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
						>
							Verify and activate
						</button>
						<button
							type="button"
							onclick={() => void run(() => store.cancelSetup())}
							disabled={busy}
							class="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-content-muted transition-colors hover:text-content disabled:cursor-not-allowed disabled:opacity-40"
						>
							{store.busy === 'cancel' ? 'Cancelling…' : 'Discard candidate'}
						</button>
					</div>
				{/if}
			</div>
		{/if}

		<!-- A candidate exists server-side but its secret is not in memory: unrecoverable by design. -->
		{#if store.orphanedSetup && store.slot?.pendingSetup}
			{@const pending = store.slot.pendingSetup}
			<div class="flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary/10 p-3">
				<h5 class="text-xs font-bold text-content">
					A candidate setup is waiting, without its secret
				</h5>
				<p class="text-[11px] text-content">
					A <span class="font-mono">{pending.kind}</span> candidate for
					<span class="font-mono">{pending.candidateUrl}</span> was staged at
					<span class="font-mono">{stamp(pending.createdAt)}</span> and expires
					<span class="font-mono">{stamp(pending.expiresAt)}</span>. Its signing secret was shown
					only when it was created and cannot be retrieved — play-api has no recovery endpoint. If
					you did not store it, cancel this candidate and stage a new one. Your existing
					registration is unaffected either way.
				</p>
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						onclick={() => void run(() => store.cancelSetup())}
						disabled={busy}
						class="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-content-muted transition-colors hover:text-content disabled:cursor-not-allowed disabled:opacity-40"
					>
						{store.busy === 'cancel' ? 'Cancelling…' : 'Cancel candidate'}
					</button>
					<button
						type="button"
						onclick={() => void store.load()}
						disabled={busy}
						class="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-content-muted transition-colors hover:text-content disabled:cursor-not-allowed disabled:opacity-40"
					>
						Re-read state
					</button>
				</div>
			</div>
		{/if}

		<!-- Capabilities: editable rows come from the registry, everything else is read-only. -->
		<fieldset class="flex flex-col gap-2 rounded-xl border border-border p-3" disabled={busy}>
			<legend class="px-1 text-xs font-semibold text-content-muted">Capabilities</legend>

			{#if store.catalog === null}
				<p class="text-[11px] text-content-muted">
					The capability registry could not be read, so no capability controls are offered.
				</p>
			{:else}
				{#each store.view.selectable as row (row.name)}
					<label class="flex items-start gap-2 text-xs text-content">
						<input
							type="checkbox"
							checked={store.selection.includes(row.name)}
							onchange={(event) => toggleCapability(row.name, event.currentTarget.checked)}
							class="mt-0.5"
						/>
						<span class="font-mono">{row.name}</span>
					</label>
				{/each}

				{#if store.view.reserved.length > 0}
					<div class="flex flex-col gap-1">
						<p class="text-[11px] text-content-muted">
							Reserved by play-api and not selectable yet. These names are published so clients can
							discover them; registration rejects them until the protocol ships.
						</p>
						<div class="flex flex-wrap items-center gap-1.5">
							{#each store.view.reserved as row (row.name)}
								<span
									class="rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-[10px] font-bold text-content-muted"
								>
									{row.name} · reserved{row.declared ? ' · declared' : ''}
								</span>
							{/each}
						</div>
					</div>
				{/if}

				{#if store.view.unknown.length > 0}
					<div class="flex flex-col gap-1">
						<p class="text-[11px] text-content-muted">
							Declared by this registration but absent from the registry. Shown read-only rather
							than dropped silently.
						</p>
						<div class="flex flex-wrap items-center gap-1.5">
							{#each store.view.unknown as row (row.name)}
								<span
									class="rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-[10px] font-bold text-content-muted"
								>
									{row.name} · unrecognised
								</span>
							{/each}
						</div>
					</div>
				{/if}

				{#if registration}
					{#if store.droppedByPatch.length > 0}
						<p class="text-[11px] text-danger" role="alert">
							Saving capabilities will drop
							<span class="font-mono">{store.droppedByPatch.join(', ')}</span>, because play-api
							accepts only currently available capabilities in a write.
						</p>
					{/if}
					<div class="flex flex-wrap items-center gap-2">
						<button
							type="button"
							onclick={() => void run(() => store.saveCapabilities())}
							disabled={busy || !store.selectionDirty}
							class="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-content transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
						>
							{store.busy === 'capabilities' ? 'Saving…' : 'Save capabilities'}
						</button>
						<p class="text-[11px] text-content-muted">
							Capability changes leave the URL, signing secret, and registration untouched.
						</p>
					</div>
				{:else}
					<p class="text-[11px] text-content-muted">
						These are the capabilities the new registration will declare.
					</p>
				{/if}
			{/if}
		</fieldset>

		{#if store.verificationUnavailable}
			<p class="text-xs text-danger" role="alert">
				Webhook verification is unavailable on this play-api instance, so no URL can be registered
				or replaced right now.
			</p>
		{/if}

		<!-- Staged URL flows. Each names its consequence before it can be started. -->
		{#if store.handoff === null && !store.orphanedSetup}
			{#if registration === null}
				{#if openForm === 'create'}
					<div class="flex flex-col gap-2 rounded-xl border border-border p-3">
						<label for={`${fieldId}-create-url`} class="text-xs font-semibold text-content">
							Callback URL to register
						</label>
						<input
							id={`${fieldId}-create-url`}
							type="url"
							bind:value={urlInput}
							placeholder="https://bot.example.com/turn"
							autocomplete="off"
							spellcheck="false"
							class="rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-xs text-content outline-none"
						/>
						<p class="text-[11px] text-content-muted">
							play-api will issue a signing secret, then POST a verification challenge to this URL.
							It must be a public HTTPS address and must answer with a signed proof.
						</p>
						<div class="flex flex-wrap gap-2">
							<button
								type="button"
								onclick={() => void stageCreate()}
								disabled={!canStage || urlInput.trim() === ''}
								class="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-content transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
							>
								{store.busy === 'stage' ? 'Staging…' : 'Issue secret and continue'}
							</button>
							<button
								type="button"
								onclick={resetForms}
								disabled={busy}
								class="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-content-muted transition-colors hover:text-content disabled:cursor-not-allowed disabled:opacity-40"
							>
								Cancel
							</button>
						</div>
					</div>
				{:else}
					<div>
						<button
							type="button"
							onclick={() => (openForm = 'create')}
							disabled={!canStage}
							class="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-content transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
						>
							Register a webhook
						</button>
					</div>
				{/if}
			{:else}
				<div class="flex flex-col gap-2">
					{#if openForm === 'replace'}
						<div class="flex flex-col gap-2 rounded-xl border border-border p-3">
							<label for={`${fieldId}-replace-url`} class="text-xs font-semibold text-content">
								New callback URL
							</label>
							<input
								id={`${fieldId}-replace-url`}
								type="url"
								bind:value={urlInput}
								placeholder="https://bot-v2.example.com/turn"
								autocomplete="off"
								spellcheck="false"
								class="rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-xs text-content outline-none"
							/>
							<p class="text-[11px] text-content-muted">
								It must differ from the current URL. To keep the same URL and only change the
								secret, rotate the secret instead.
							</p>
							<label class="flex items-start gap-2 text-[11px] text-content">
								<input type="checkbox" bind:checked={replaceConsent} class="mt-0.5" />
								<span>
									I understand this issues a new signing secret, and that the current registration
									keeps running until the new endpoint passes verification.
								</span>
							</label>
							<div class="flex flex-wrap gap-2">
								<button
									type="button"
									onclick={() => void stageReplace()}
									disabled={!canStage || !replaceConsent || urlInput.trim() === ''}
									class="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-content transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
								>
									{store.busy === 'stage' ? 'Staging…' : 'Issue secret and continue'}
								</button>
								<button
									type="button"
									onclick={resetForms}
									disabled={busy}
									class="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-content-muted transition-colors hover:text-content disabled:cursor-not-allowed disabled:opacity-40"
								>
									Cancel
								</button>
							</div>
						</div>
					{:else if openForm === 'rotate'}
						<div class="flex flex-col gap-2 rounded-xl border border-danger/40 bg-danger/5 p-3">
							<label for={`${fieldId}-rotate-confirm`} class="text-xs font-semibold text-content">
								Rotate the signing secret — type <span class="font-mono">{name}</span> to confirm
							</label>
							<input
								bind:this={confirmField}
								id={`${fieldId}-rotate-confirm`}
								type="text"
								bind:value={confirmInput}
								autocomplete="off"
								spellcheck="false"
								class="rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-xs text-content outline-none"
							/>
							<p class="text-[11px] text-content-muted">
								The URL does not change. Your endpoint must accept both the current and the new
								secret until an authoritative read shows the new registration; only then retire the
								old one.
							</p>
							<div class="flex flex-wrap gap-2">
								<button
									type="button"
									onclick={() => void stageRotate()}
									disabled={!canStage || !confirmsName}
									class="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-content transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
								>
									{store.busy === 'stage' ? 'Staging…' : 'Issue new secret'}
								</button>
								<button
									type="button"
									onclick={resetForms}
									disabled={busy}
									class="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-content-muted transition-colors hover:text-content disabled:cursor-not-allowed disabled:opacity-40"
								>
									Cancel
								</button>
							</div>
						</div>
					{:else if openForm === 'delete'}
						<div class="flex flex-col gap-2 rounded-xl border border-danger/40 bg-danger/5 p-3">
							<label for={`${fieldId}-delete-confirm`} class="text-xs font-semibold text-danger">
								Delete the webhook — type <span class="font-mono">{name}</span> to confirm
							</label>
							<input
								bind:this={confirmField}
								id={`${fieldId}-delete-confirm`}
								type="text"
								bind:value={confirmInput}
								autocomplete="off"
								spellcheck="false"
								class="rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-xs text-content outline-none"
							/>
							<p class="text-[11px] text-content-muted">
								This destroys the active and candidate credentials and stops all deliveries. It is
								not a URL or capability edit, and it cannot be undone — the bot must register again
								from scratch. Delivery history is retained.
							</p>
							<div class="flex flex-wrap gap-2">
								<button
									type="button"
									onclick={() => void remove()}
									disabled={busy || !confirmsName}
									class="rounded-lg border border-danger bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-40"
								>
									{store.busy === 'delete' ? 'Deleting…' : 'Delete webhook'}
								</button>
								<button
									type="button"
									onclick={resetForms}
									disabled={busy}
									class="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-content-muted transition-colors hover:text-content disabled:cursor-not-allowed disabled:opacity-40"
								>
									Cancel
								</button>
							</div>
						</div>
					{:else}
						<div class="flex flex-wrap gap-2">
							<button
								type="button"
								onclick={() => {
									resetForms();
									openForm = 'replace';
								}}
								disabled={!canStage}
								class="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-content transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
							>
								Replace URL…
							</button>
							<button
								type="button"
								onclick={() => {
									resetForms();
									openForm = 'rotate';
								}}
								disabled={!canStage}
								class="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-content transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
							>
								Rotate secret…
							</button>
							<button
								type="button"
								onclick={() => {
									resetForms();
									openForm = 'delete';
								}}
								disabled={busy}
								class="rounded-lg border border-danger/40 bg-surface px-2.5 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
							>
								Delete webhook…
							</button>
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	{/if}
</section>
