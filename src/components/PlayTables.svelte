<script lang="ts">
	// The open-table tab of Play (#258): the tables that wait for an opponent, and the setup of
	// the visitor's own table.
	//
	// Sitting down is the lobby's accept: the server draws the seats, and a rated table refuses a
	// visitor who is not signed in (play-api #279). The tab says that before the click, with "Sign
	// in to sit" in place of "Sit down", and still handles the refusal, because the list can be
	// older than the visitor's session.
	//
	// Opening a table posts a seek and hands the record to the page, which shows the wait on the
	// board (`OpenTableWaiting`). There is no colour to choose: the seats are drawn when someone
	// sits down. Only a signed-in visitor can open a rated table; `RatedChoice` owns that gate.
	//
	// `rated` on a seek is optional on the wire. Only an explicit `true` is called rated and only
	// an explicit `false` casual; a table whose server does not say gets no label.
	import { onDestroy, onMount } from 'svelte';
	import { authStore } from '#lib/authStore.svelte.js';
	import { getGuestUuid } from '#lib/ingest/guestIdentity.js';
	import { isLiveEnabled } from '#lib/live/liveApi.js';
	import type { Seek } from '#lib/live/liveTypes.js';
	import { acceptSeek, listSeeks, SeekAcceptError } from '#lib/live/lobbyApi.js';
	import { openTable, type OpenTable } from '#lib/live/openTable.js';
	import { seekOffer } from '#lib/live/playerLabel.js';
	import { RATING_CATEGORY_LABELS, ratingCategoryOf } from '#lib/live/ratingCategory.js';
	import { buildJoinUrl } from '#lib/live/seatLink.js';
	import { timeControlChoices, timeControlLabel } from '#lib/live/timeControls.js';
	import { m } from '#lib/paraglide/messages.js';
	import GameSetupPanel from './GameSetupPanel.svelte';
	import Spinner from './Spinner.svelte';
	import Button from './ui/Button.svelte';
	import Card from './ui/Card.svelte';
	import Chip from './ui/Chip.svelte';
	import Tag from './ui/Tag.svelte';

	interface Props {
		/** The visitor's own table is open: the page shows the wait on the board. */
		onopened: (table: OpenTable) => void;
	}

	let { onopened }: Props = $props();

	const LIST_POLL_MS = 3000;
	/** One missed poll is a blip; a run of them means the tables cannot be read. */
	const POLL_FAILURES_BEFORE_UNAVAILABLE = 2;

	let seeks = $state<Seek[]>([]);
	let loaded = $state(false);
	let unavailable = $state(false);
	let destroyed = false;
	onDestroy(() => {
		destroyed = true;
	});

	onMount(() => {
		if (!isLiveEnabled()) return;
		let failures = 0;
		const read = async () => {
			if (document.hidden) return;
			try {
				const next = await listSeeks();
				if (destroyed) return;
				seeks = next;
				loaded = true;
				failures = 0;
				unavailable = false;
			} catch {
				if (destroyed) return;
				failures += 1;
				if (failures >= POLL_FAILURES_BEFORE_UNAVAILABLE) unavailable = true;
			}
		};
		void read();
		const timer = setInterval(read, LIST_POLL_MS);
		return () => clearInterval(timer);
	});

	type TableFilter = 'all' | 'casual' | 'rated';
	const FILTERS: readonly TableFilter[] = ['all', 'casual', 'rated'];
	const FILTER_LABELS: Record<TableFilter, () => string> = {
		all: m.play_tables_filter_all,
		casual: m.play_tables_filter_casual,
		rated: m.play_tables_filter_rated,
	};
	let filter = $state<TableFilter>('all');
	const shown = $derived(
		seeks.filter(
			(seek) =>
				filter === 'all' || (filter === 'rated' ? seek.rated === true : seek.rated !== true),
		),
	);

	/** "Blitz 5 + 3": the speed the game counts as, then the clock. */
	const termsOf = (seek: Seek) => {
		const category = ratingCategoryOf(seek.timeControl);
		const clock = timeControlLabel(seek.timeControl);
		return category ? `${RATING_CATEGORY_LABELS[category]} ${clock}` : clock;
	};
	const signedIn = $derived(authStore.status === 'signed-in');

	// --- Sitting down ------------------------------------------------------------------------

	let accepting = $state<string | null>(null);
	let opening = $state(false);
	let listError = $state<string | null>(null);
	const busy = $derived(accepting !== null || opening);

	async function sit(seek: Seek) {
		if (busy) return;
		accepting = seek.id;
		listError = null;
		let left = false;
		try {
			const match = await acceptSeek(seek.id, getGuestUuid());
			if (destroyed) return;
			// Never assume a colour: the server draws the seats when the table is taken. Full
			// navigation: the board page connects fresh from the seat token in the address.
			left = true;
			window.location.href = buildJoinUrl(location.origin, match.gameId, match.token, match.seat);
		} catch (e) {
			if (destroyed) return;
			// A rated table refused a guest. It is still standing, so "just taken" would be wrong.
			if (e instanceof SeekAcceptError && e.status === 403) {
				listError = m.play_tables_refused();
				return;
			}
			listError = m.play_tables_taken();
			try {
				const next = await listSeeks();
				if (!destroyed) seeks = next;
			} catch {
				/* the next poll will catch up */
			}
		} finally {
			// Stays locked on success: the browser is on its way to the board.
			if (!destroyed && !left) accepting = null;
		}
	}

	// --- One's own table ---------------------------------------------------------------------

	let time = $state(0);
	// Casual unless the visitor is signed in AND asks for rated: `RatedChoice` owns that gate.
	let rated = $state(false);
	let openError = $state<string | null>(null);
	const timeGroups = $derived(timeControlChoices());

	async function open() {
		if (busy) return;
		opening = true;
		openError = null;
		try {
			const table = await openTable(time, rated);
			if (!destroyed) onopened(table);
		} catch {
			if (!destroyed) openError = m.play_tables_open_failed();
		} finally {
			if (!destroyed) opening = false;
		}
	}

	// A browser may bring this page back from its cache when the visitor returns from the board.
	function onPageShow(event: PageTransitionEvent) {
		if (event.persisted) accepting = null;
	}
</script>

<svelte:window onpageshow={onPageShow} />

<div
	class="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_21.25rem] lg:items-start lg:gap-6"
>
	<Card as="section" padding="lg" aria-labelledby="play-tables-title" class="flex flex-col gap-4">
		<div
			role="group"
			aria-label={m.play_tables_filter_label()}
			class="-mx-1 flex gap-2 overflow-x-auto px-1 py-1"
		>
			{#each FILTERS as option (option)}
				<Chip pressed={filter === option} class="shrink-0" onclick={() => (filter = option)}>
					{FILTER_LABELS[option]()}
				</Chip>
			{/each}
		</div>

		<h2
			id="play-tables-title"
			class="m-0 text-xs font-bold tracking-widest text-content-muted uppercase"
		>
			{m.play_tables_title()}
		</h2>

		{#if listError}<p class="m-0 text-sm text-danger" role="alert">{listError}</p>{/if}

		{#if !isLiveEnabled()}
			<p class="m-0 text-sm text-content-muted">{m.play_live_off()}</p>
		{:else if unavailable}
			<p class="m-0 text-sm text-danger" role="alert">{m.play_tables_unavailable()}</p>
		{:else if !loaded}
			<p class="m-0 flex items-center gap-2 text-sm text-content-muted" role="status">
				<Spinner />
				{m.play_tables_loading()}
			</p>
		{:else if shown.length === 0}
			<p class="m-0 text-sm text-content-muted">
				{seeks.length === 0 ? m.play_tables_empty() : m.play_tables_empty_filter()}
			</p>
		{:else}
			<ul class="m-0 flex list-none flex-col divide-y divide-border border-y border-border p-0">
				{#each shown as seek (seek.id)}
					{@const offer = seekOffer(seek)}
					{@const terms = termsOf(seek)}
					{@const needsSignIn = seek.rated === true && !signedIn}
					<li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
						<!-- On a phone the name takes a line of its own, so every row breaks the same way. -->
						<span class="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-40">
							<span class="truncate font-semibold text-content">{offer.name}</span>
							<Tag tone={offer.bot ? 'neutral' : 'highlight'}>
								{offer.bot ? m.play_tables_bot() : m.play_tables_player()}
							</Tag>
						</span>
						<span class="flex items-center gap-3">
							<span class="text-sm whitespace-nowrap text-content tabular-nums">{terms}</span>
							{#if seek.rated === true}
								<Tag tone="accent">{m.play_tables_rated()}</Tag>
							{:else if seek.rated === false}
								<Tag>{m.play_tables_casual()}</Tag>
							{/if}
						</span>
						{#if needsSignIn}
							<Button
								variant="secondary"
								class="ms-auto"
								disabled={!authStore.canSignIn}
								aria-label={m.play_tables_sign_in_label({ name: offer.name, terms })}
								onclick={() => authStore.signIn()}
							>
								{m.play_tables_sign_in()}
							</Button>
						{:else}
							<Button
								variant="secondary"
								class="ms-auto"
								disabled={busy}
								aria-busy={accepting === seek.id}
								aria-label={m.play_tables_sit_label({ name: offer.name, terms })}
								onclick={() => sit(seek)}
							>
								{#if accepting === seek.id}<Spinner />{/if}
								{m.play_tables_sit()}
							</Button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<p class="m-0 text-xs text-content-muted">{m.play_tables_footnote()}</p>
	</Card>

	<Card
		as="section"
		raised
		padding="lg"
		aria-labelledby="play-tables-own-title"
		class="flex flex-col gap-4"
	>
		<div>
			<p class="m-0 text-xs font-bold tracking-widest text-content-muted uppercase">
				{m.play_tables_own_eyebrow()}
			</p>
			<h2 id="play-tables-own-title" class="m-0 text-2xl font-bold tracking-tight text-content">
				{m.play_tables_own_title()}
			</h2>
			<p class="m-0 text-sm text-content-muted">{m.play_tables_own_sub()}</p>
		</div>
		{#if isLiveEnabled()}
			<GameSetupPanel
				name="play-table"
				{timeGroups}
				bind:time
				rating="choice"
				bind:rated
				actionLabel={m.play_tables_open()}
				busyLabel={m.play_tables_opening()}
				busy={opening}
				onstart={open}
				error={openError}
			/>
			<p class="m-0 text-center text-xs text-content-muted">{m.play_tables_open_note()}</p>
		{:else}
			<p class="m-0 text-sm text-content-muted">{m.play_live_off()}</p>
		{/if}
	</Card>
</div>
