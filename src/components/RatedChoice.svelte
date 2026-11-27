<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { authStore } from '#lib/authStore.svelte.js';
	import { m } from '#lib/paraglide/messages.js';
	import ChoiceGroup from './ui/ChoiceGroup.svelte';

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
	// `name` exists for the reason every radio group needs one (see ChoiceGroup): native radios group
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
	<div class="flex flex-col gap-2">
		<ChoiceGroup legend="Rating" name="rated-{name}" {options} bind:value={rated} stretch />
		<p class="m-0 text-xs font-normal text-content-muted">{m.common_rating_choice_help()}</p>
	</div>
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
