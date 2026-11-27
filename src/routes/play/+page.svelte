<script lang="ts">
	// Play (#257, #258): the place where a game starts. Three ways to start one, as three tabs:
	// a bot, a friend by link, anyone at an open table.
	//
	// The tab is part of the address (`/play`, `/play?tab=friend`, `/play?tab=table`), so each
	// way to play can be linked to and the Back button moves between them. The tabs are links,
	// which makes this navigation: the current one says so.
	//
	// A link can also preselect a bot: `/play?bot=greedy`, `/play?bot=<team>/<name>`.
	//
	// Opening one's own table turns the page into the waiting board: no game exists yet, so there
	// is no other page to go to. Closing the table brings the tab back.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { OpenTable } from '#lib/live/openTable.js';
	import { m } from '#lib/paraglide/messages.js';
	import OpenTableWaiting from '../../components/OpenTableWaiting.svelte';
	import PlayBots from '../../components/PlayBots.svelte';
	import PlayFriend from '../../components/PlayFriend.svelte';
	import PlayTables from '../../components/PlayTables.svelte';
	import PageHeader from '../../components/ui/PageHeader.svelte';

	type Tab = 'bot' | 'friend' | 'table';
	const tab = $derived.by<Tab>(() => {
		const asked = page.url.searchParams.get('tab');
		return asked === 'friend' || asked === 'table' ? asked : 'bot';
	});
	const preselect = $derived(page.url.searchParams.get('bot'));

	const tabs = $derived([
		{ id: 'bot', query: '', label: m.play_tab_bot(), short: m.play_tab_bot() },
		{
			id: 'friend',
			query: '?tab=friend',
			label: m.play_tab_friend(),
			short: m.play_tab_friend_short(),
		},
		{
			id: 'table',
			query: '?tab=table',
			label: m.play_tab_table(),
			short: m.play_tab_table_short(),
		},
	] as const);

	const lead = $derived(
		tab === 'friend' ? m.play_lead_friend() : tab === 'table' ? m.play_lead_table() : m.play_lead(),
	);
	const title = $derived(
		tab === 'friend'
			? m.play_meta_title_friend()
			: tab === 'table'
				? m.play_meta_title_table()
				: m.play_meta_title(),
	);

	let waiting = $state<OpenTable | null>(null);
	// The wait belongs to the table tab. The tabs are addresses, so the Back button can leave the
	// tab while this page stays mounted: the board must then give way to the tab that was asked
	// for. Leaving also closes the table (`OpenTableWaiting` does that when it goes away).
	const waitingShown = $derived(waiting !== null && tab === 'table');
	$effect(() => {
		if (tab !== 'table') waiting = null;
	});
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={m.play_meta_description()} />
</svelte:head>

{#if waiting && waitingShown}
	<OpenTableWaiting table={waiting} onclose={() => (waiting = null)} />
{:else}
	<div class="flex flex-col gap-5">
		<PageHeader title={m.play_title()} {lead} />

		<!-- A track of three on a phone, a row of underlined tabs from the `sm` breakpoint. -->
		<nav
			aria-label={m.play_tabs_label()}
			class="flex gap-1 rounded-xl bg-surface-hover p-1 sm:gap-6 sm:rounded-none sm:border-b sm:border-border sm:bg-transparent sm:p-0"
		>
			{#each tabs as item (item.id)}
				<!-- The path is resolved; the rule does not see through the query added to it. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={`${resolve('/play')}${item.query}`}
					aria-current={item.id === tab ? 'page' : undefined}
					class="flex min-h-11 flex-1 items-center justify-center rounded-[0.5rem] px-2 text-center text-sm font-semibold transition-colors focus-visible:focus-ring sm:-mb-px sm:flex-none sm:rounded-none sm:border-b-2 sm:px-1 sm:text-base
						{item.id === tab
						? 'bg-surface text-content sm:border-primary sm:bg-transparent'
						: 'text-content-muted hover:text-content sm:border-transparent'}"
				>
					<span class="sm:hidden">{item.short}</span>
					<span class="max-sm:hidden">{item.label}</span>
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/each}
		</nav>

		{#if tab === 'friend'}
			<PlayFriend />
		{:else if tab === 'table'}
			<PlayTables onopened={(table) => (waiting = table)} />
		{:else}
			<PlayBots {preselect} />
		{/if}
	</div>
{/if}
