<script lang="ts">
	// Play (#257): the place where a game starts. Three ways to start one, as three tabs. The
	// bot tab is built here; the other two still live on their own pages (`/live` sets up a game
	// with a friend, `/lobby` has the open tables) and move in with #258, so for now their tabs
	// are links.
	//
	// A link can preselect a bot: `/play?bot=greedy`, `/play?bot=<team>/<name>`.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import PlayBots from '../../components/PlayBots.svelte';
	import PageHeader from '../../components/ui/PageHeader.svelte';

	const preselect = $derived(page.url.searchParams.get('bot'));

	const tabs = $derived([
		{ route: '/play', label: m.play_tab_bot(), short: m.play_tab_bot(), current: true },
		{
			route: '/live',
			label: m.play_tab_friend(),
			short: m.play_tab_friend_short(),
			current: false,
		},
		{
			route: '/lobby',
			label: m.play_tab_table(),
			short: m.play_tab_table_short(),
			current: false,
		},
	] as const);
</script>

<svelte:head>
	<title>{m.play_meta_title()}</title>
	<meta name="description" content={m.play_meta_description()} />
</svelte:head>

<div class="flex flex-col gap-5">
	<PageHeader title={m.play_title()} lead={m.play_lead()} />

	<!-- A track of three on a phone, a row of underlined tabs from the `sm` breakpoint. They are
	     links, so this is navigation, and the current one says so. -->
	<nav
		aria-label={m.play_tabs_label()}
		class="flex gap-1 rounded-xl bg-surface-hover p-1 sm:gap-6 sm:rounded-none sm:border-b sm:border-border sm:bg-transparent sm:p-0"
	>
		{#each tabs as tab (tab.route)}
			<a
				href={resolve(tab.route)}
				aria-current={tab.current ? 'page' : undefined}
				class="flex min-h-11 flex-1 items-center justify-center rounded-[0.5rem] px-2 text-center text-sm font-semibold transition-colors focus-visible:focus-ring sm:-mb-px sm:flex-none sm:rounded-none sm:border-b-2 sm:px-1 sm:text-base
					{tab.current
					? 'bg-surface text-content sm:border-primary sm:bg-transparent'
					: 'text-content-muted hover:text-content sm:border-transparent'}"
			>
				<span class="sm:hidden">{tab.short}</span>
				<span class="max-sm:hidden">{tab.label}</span>
			</a>
		{/each}
	</nav>

	<PlayBots {preselect} />
</div>
