<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	// The signed-in identity block on /me (ADR-0017): nickname, rating, sign out.
	//
	// Nickname validation is deliberately NOT duplicated here. play-api's `Nicknames.validate` owns the
	// rules — length, allowed characters, and a reserved-word list — and it answers 400 with a
	// human-readable reason that this form shows verbatim. Re-implementing the list client-side would
	// drift the moment either side changes, and the server has to check anyway. What IS mirrored is the
	// cheap stuff the browser can enforce for free (`minlength`/`maxlength`), because a form that only
	// fails after a round-trip feels broken.
	import { resolve } from '$app/paths';
	import { authStore } from '#lib/authStore.svelte.js';
	import CategoryRatings from './CategoryRatings.svelte';
	import { toastStore } from '#lib/toastStore.svelte.js';
	import { m } from '#lib/paraglide/messages.js';

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
				toastStore.success(m.profile_toast_nickname_updated());
				break;
			case 'taken':
				error = 'That nickname is already taken.';
				break;
			case 'invalid':
				// play-api's own wording — it knows which rule was broken.
				error = result.reason;
				break;
			case 'signed-out':
				toastStore.error(m.profile_toast_signed_out());
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

			<!-- Sparse per-speed entries are the measured competitive ratings. The legacy scalar can
			     be an unplayed default, so this account view uses the same honest rows as profiles. -->
			<div class="space-y-3 border-t border-border pt-4">
				<h4 class="text-xs font-bold uppercase tracking-wider text-content-muted">
					{m.common_rating_competitive()}
				</h4>
				<CategoryRatings ratings={authStore.account.ratings ?? []} />
			</div>
		</div>

		<a
			href={resolve('/players/[nickname]', { nickname: authStore.nickname ?? '' })}
			class="text-xs font-bold text-content-muted underline transition-colors hover:text-content"
		>
			View public profile
		</a>
	</div>
{/if}
