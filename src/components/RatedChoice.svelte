<script lang="ts">
	import { authStore } from '$lib/authStore.svelte';

	// The Rated/Casual choice for a game about to be started, shared by the catalog-bot panel and the
	// lobby's open-a-table panel (play-api #279). Rated is the player's own call now, for any
	// registered opponent — there is no operator-curated roster of ratable bots to get onto.
	//
	// Only an account can play rated, and play-api enforces that on both halves: it silently degrades
	// the flag for an anonymous creator, and answers 403 when an anonymous visitor tries to ACCEPT a
	// rated seek. So offering the choice to someone who cannot deliver it would be a promise the
	// server quietly breaks — hence the sign-in gate, and the $effect that forces the flag back down
	// if the visitor turns out not to be signed in after all.
	//
	// `name` exists for the same reason BotTimeControlPicker's does: native radios group
	// document-wide, and the catalog page mounts one of these per bot card.
	interface Props {
		/** The chosen mode. Casual by default, matching the server — rated is always opt-in. */
		rated?: boolean;
		/** Disambiguates the radio group when several of these share a page. */
		name: string;
	}

	let { rated = $bindable(false), name }: Props = $props();

	const options: readonly { value: boolean; label: string }[] = [
		{ value: false, label: 'Casual' },
		{ value: true, label: 'Rated' },
	];

	// A visitor who signs out, or whose session turns out to be absent, must not leave a stale
	// `rated = true` behind in the parent's request state. Deliberately excludes `loading`: since
	// #212 a parent may seed `rated` from a stored preference before the very first `refresh()`
	// settles, and clobbering it during that split second would never let a returning signed-in
	// visitor see their own preference again — `loading` always resolves to one of the other three
	// statuses, so the gate still catches every visitor who turns out not to be signed in. Settles
	// in one pass: the condition is false immediately after the write.
	$effect(() => {
		if ((authStore.status === 'signed-out' || authStore.status === 'unavailable') && rated) {
			rated = false;
		}
	});
</script>

{#if authStore.status === 'signed-in'}
	<fieldset class="flex flex-col gap-1.5">
		<legend class="text-[10px] font-bold uppercase tracking-widest text-content-muted/80">
			Rating
		</legend>
		<div class="flex flex-wrap gap-2">
			{#each options as opt (opt.label)}
				<label
					class="cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors focus-within:ring-2 focus-within:ring-primary/50
						{rated === opt.value
						? 'border-primary bg-primary text-primary-content'
						: 'border-border bg-surface text-content-muted hover:text-content'}"
				>
					<input
						type="radio"
						name="rated-{name}"
						value={opt.value}
						bind:group={rated}
						class="sr-only"
					/>
					{opt.label}
				</label>
			{/each}
		</div>
	</fieldset>
{:else if authStore.status === 'signed-out' && authStore.canSignIn}
	<!-- Say what will happen and how to change it, rather than hiding the feature: a visitor should
	     learn rated play exists. While authStore is still 'loading' (or auth is unavailable) this
	     renders nothing — flashing a wrong default is the mistake AuthMenu documents. -->
	<p class="text-xs text-content-muted">
		Casual game —
		<button
			type="button"
			onclick={() => authStore.signIn()}
			class="font-bold text-primary underline underline-offset-2 hover:text-primary-hover"
		>
			sign in
		</button>
		to play rated.
	</p>
{/if}
