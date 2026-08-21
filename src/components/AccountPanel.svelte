<script lang="ts">
	// The signed-in identity block on /me (ADR-0017): nickname, rating, sign out.
	//
	// Nickname validation is deliberately NOT duplicated here. play-api's `Nicknames.validate` owns the
	// rules — length, allowed characters, and a reserved-word list — and it answers 400 with a
	// human-readable reason that this form shows verbatim. Re-implementing the list client-side would
	// drift the moment either side changes, and the server has to check anyway. What IS mirrored is the
	// cheap stuff the browser can enforce for free (`minlength`/`maxlength`), because a form that only
	// fails after a round-trip feels broken.
	import { resolve } from '$app/paths';
	import { authStore } from '$lib/authStore.svelte';
	import { RATING_CATEGORY_LABELS } from '$lib/live/ratingCategory';
	import { toastStore } from '$lib/toastStore.svelte';

	// The speeds OTHER than the headline (blitz) the account has actually played — absent wire
	// entries are unplayed speeds and stay invisible here (the compact block earns no dash rows;
	// `?` marks a still-provisional number). Defaults to [] against a play-api promoted later than
	// this page's deploy, same posture as the profiles.
	const otherSpeeds = $derived(
		(authStore.account?.ratings ?? []).filter((r) => r.category !== 'blitz'),
	);

	let editing = $state(false);
	let draft = $state('');
	let error = $state<string | null>(null);
	let saving = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	// Focus the field when the editor opens, so the rename is usable from the keyboard alone.
	$effect(() => {
		if (editing) input?.focus();
	});

	function startEditing() {
		draft = authStore.nickname ?? '';
		error = null;
		editing = true;
	}

	function cancel() {
		editing = false;
		error = null;
	}

	async function save() {
		const next = draft.trim();
		if (next === '' || next === authStore.nickname) {
			cancel();
			return;
		}
		saving = true;
		error = null;
		const result = await authStore.rename(next);
		saving = false;
		switch (result.outcome) {
			case 'updated':
				editing = false;
				toastStore.success('Nickname updated.');
				break;
			case 'taken':
				error = 'That nickname is already taken.';
				break;
			case 'invalid':
				// play-api's own wording — it knows which rule was broken.
				error = result.reason;
				break;
			case 'signed-out':
				toastStore.error('You are no longer signed in.');
				break;
			case 'unavailable':
				error = 'Could not reach the server. Try again.';
				break;
		}
	}
</script>

{#if authStore.account}
	<div class="flex flex-col gap-3">
		<h3 class="text-sm font-bold uppercase tracking-wider text-content-muted">Your account</h3>

		<div class="flex flex-col gap-5 rounded-2xl border border-border bg-surface/60 p-5">
			<div class="flex items-start justify-between gap-3">
				<div class="flex min-w-0 items-center gap-3">
					<span
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-content"
						aria-hidden="true"
					>
						{authStore.initial}
					</span>
					<div class="flex min-w-0 flex-col">
						{#if editing}
							<form
								onsubmit={(e) => {
									e.preventDefault();
									void save();
								}}
								class="flex items-center gap-2"
							>
								<input
									bind:this={input}
									bind:value={draft}
									aria-label="Nickname"
									minlength="3"
									maxlength="24"
									spellcheck="false"
									autocomplete="off"
									class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-content outline-none transition-colors focus:border-primary"
								/>
								<button
									type="submit"
									disabled={saving}
									class="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-primary-content transition-colors hover:bg-primary-hover disabled:opacity-40"
								>
									{saving ? 'Saving' : 'Save'}
								</button>
								<button
									type="button"
									onclick={cancel}
									class="shrink-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-bold text-content-muted transition-colors hover:text-content"
								>
									Cancel
								</button>
							</form>
						{:else}
							<div class="flex items-center gap-2">
								<span class="truncate font-bold text-content">{authStore.nickname}</span>
								<button
									type="button"
									onclick={startEditing}
									class="shrink-0 text-xs font-bold text-content-muted underline transition-colors hover:text-content"
								>
									Rename
								</button>
							</div>
						{/if}
						<span class="text-xs text-content-muted">Signed in with Google</span>
					</div>
				</div>

				<button
					type="button"
					onclick={() => void authStore.signOut()}
					class="shrink-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-bold text-content-muted transition-colors hover:text-content"
				>
					Sign out
				</button>
			</div>

			{#if error}
				<p class="text-xs text-danger" role="alert">{error}</p>
			{/if}

			<!-- Ratings are per speed since play-api #280; this panel is a compact identity block, so it
			     leads with the default category (blitz — the ladder's speed and the leaderboard's default
			     board) instead of three numbers, and lists the other PLAYED speeds in one small line.
			     The full per-speed view lives on the public profile, one click away. -->
			<div class="flex items-baseline gap-3 border-t border-border pt-4">
				<span class="text-xs font-bold uppercase tracking-wider text-content-muted">
					Blitz rating
				</span>
				<span class="font-mono text-lg font-bold tabular-nums text-content">
					{Math.round(authStore.account.rating)}
				</span>
				{#if authStore.account.provisional}
					<!-- The public board hides provisional accounts. Saying so here is the difference between
					     "my rating is missing" and "my rating is still settling". -->
					<span class="text-xs text-content-muted">
						provisional — not listed publicly until it settles
					</span>
				{/if}
			</div>
			{#if otherSpeeds.length > 0}
				<p class="font-mono text-xs tabular-nums text-content-muted">
					{#each otherSpeeds as r, i (r.category)}
						{i > 0 ? ' · ' : ''}{RATING_CATEGORY_LABELS[r.category]}
						{Math.round(r.rating)}{r.provisional ? '?' : ''}
					{/each}
				</p>
			{/if}
		</div>

		<a
			href={resolve('/players/[nickname]', { nickname: authStore.nickname ?? '' })}
			class="text-xs font-bold text-content-muted underline transition-colors hover:text-content"
		>
			View public profile
		</a>
	</div>
{/if}
