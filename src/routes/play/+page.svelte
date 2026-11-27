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
	import TabNav from '../../components/ui/TabNav.svelte';

	type Tab = 'bot' | 'friend' | 'table';
	const tab = $derived.by<Tab>(() => {
		const asked = page.url.searchParams.get('tab');
		return asked === 'friend' || asked === 'table' ? asked : 'bot';
	});
	const preselect = $derived(page.url.searchParams.get('bot'));

	const tabs = $derived(
		[
			{ id: 'bot', query: '', label: m.play_tab_bot(), short: undefined },
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
		].map((item) => ({
			href: `${resolve('/play')}${item.query}`,
			label: item.label,
			short: item.short,
			current: item.id === tab,
		})),
	);

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

		<TabNav label={m.play_tabs_label()} items={tabs} />

		{#if tab === 'friend'}
			<PlayFriend />
		{:else if tab === 'table'}
			<PlayTables onopened={(table) => (waiting = table)} />
		{:else}
			<PlayBots {preselect} />
		{/if}
	</div>
{/if}
