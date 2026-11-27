<script lang="ts">
	// "Open seats" on the Arena overview (#259): bots that wait at a table, each with "Take a
	// seat", which starts the game at once. They are the same bots that the bot list of Play
	// marks "Ready now" and the open-table tab lists; here only bots are shown, a few of them,
	// because the overview has a fixed size and a bot always answers.
	//
	// Sitting down is the lobby's accept (`sitDown.ts`). A rated table refuses a visitor who is
	// not signed in, so such a table offers "Sign in to sit" instead.
	import { onDestroy } from 'svelte';
	import { resolve } from '$app/paths';
	import { authStore } from '#lib/authStore.svelte.js';
	import type { Seek } from '#lib/live/liveTypes.js';
	import { sitDown } from '#lib/live/sitDown.js';
	import { timeControlTerms } from '#lib/live/timeControls.js';
	import { m } from '#lib/paraglide/messages.js';
	import Spinner from './Spinner.svelte';
	import Button from './ui/Button.svelte';
	import Card from './ui/Card.svelte';

	interface Props {
		/** Every open seek; the bots among them are shown. */
		seeks: readonly Seek[];
		/** Asked for after a seat turned out to be taken, so the list catches up at once. */
		onstale?: () => void;
	}

	let { seeks, onstale }: Props = $props();

	const SHOWN = 3;
	const seats = $derived(seeks.filter((seek) => seek.kind === 'Bot' && seek.name).slice(0, SHOWN));
	const signedIn = $derived(authStore.status === 'signed-in');
	// Only an explicit flag is stated: a table whose server does not say gets the plain terms.
	const termsOf = (seek: Seek) => {
		const terms = timeControlTerms(seek.timeControl);
		if (seek.rated === true) return m.arena_seats_rated({ terms });
		if (seek.rated === false) return m.arena_seats_casual({ terms });
		return terms;
	};

	let taking = $state<string | null>(null);
	let error = $state<string | null>(null);
	let destroyed = false;
	onDestroy(() => {
		destroyed = true;
	});

	async function take(seek: Seek) {
		if (taking !== null) return;
		taking = seek.id;
		error = null;
		const result = await sitDown(seek.id, location.origin);
		if (typeof result === 'object') {
			// Even if the visitor has left the page meanwhile: the seat is theirs, and this answer
			// is the only place that knows the way to the board. Stays locked on the way there.
			window.location.href = result.boardUrl;
			return;
		}
		if (destroyed) return;
		taking = null;
		error = result === 'refused' ? m.arena_seats_refused() : m.arena_seats_taken();
		if (result === 'taken') onstale?.();
	}

	// A browser may bring this page back from its cache when the visitor returns from the board.
	function onPageShow(event: PageTransitionEvent) {
		if (event.persisted) taking = null;
	}
</script>

<svelte:window onpageshow={onPageShow} />

<Card as="section" padding="lg" aria-labelledby="arena-seats-title" class="flex flex-col gap-1">
	<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
		<h2
			id="arena-seats-title"
			class="m-0 text-xs font-bold tracking-widest text-content-muted uppercase"
		>
			{m.arena_seats_title()}
		</h2>
		{#if seats.length > 0}
			<span class="text-xs text-content-muted">{m.arena_seats_hint()}</span>
		{/if}
	</div>

	{#if error}<p class="m-0 text-sm text-danger" role="alert">{error}</p>{/if}

	{#if seats.length === 0}
		<p class="m-0 py-2 text-sm text-content-muted">{m.arena_seats_none()}</p>
	{:else}
		<ul class="m-0 flex list-none flex-col divide-y divide-border p-0">
			{#each seats as seek (seek.id)}
				{@const name = seek.name ?? ''}
				{@const terms = timeControlTerms(seek.timeControl)}
				<li class="flex items-center justify-between gap-4 py-2.5">
					<span class="flex min-w-0 flex-col">
						<span class="truncate font-semibold text-content">{name}</span>
						<span class="text-xs text-content-muted">{termsOf(seek)}</span>
					</span>
					{#if seek.rated === true && !signedIn}
						<Button
							variant="secondary"
							class="shrink-0"
							disabled={!authStore.canSignIn}
							aria-label={m.arena_seats_sign_in_label({ name, terms })}
							onclick={() => authStore.signIn()}
						>
							{m.arena_seats_sign_in()}
						</Button>
					{:else}
						<Button
							variant="secondary"
							class="shrink-0"
							disabled={taking !== null}
							aria-busy={taking === seek.id}
							aria-label={m.arena_seats_take_label({ name, terms })}
							onclick={() => take(seek)}
						>
							{#if taking === seek.id}<Spinner />{/if}
							{m.arena_seats_take()}
						</Button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<!-- The path is resolved; the rule does not see through the query added to it. -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a
		href={`${resolve('/play')}?tab=table`}
		class="mt-1 w-fit rounded text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:focus-ring"
	>
		{m.arena_seats_more()}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</Card>
