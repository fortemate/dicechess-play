<script lang="ts">
	// The head of every Arena page (#259, #260): the title, the way to a game of one's own, and
	// the row of sections with the number of live games. On a phone the "Play a game" button is
	// not in the head; `ArenaPlayBar` keeps it in reach at the bottom of the page instead.
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import Button from './ui/Button.svelte';
	import PageHeader from './ui/PageHeader.svelte';
	import TabNav from './ui/TabNav.svelte';

	interface Props {
		current: 'overview' | 'live';
		/** How many games are being played, once known. */
		total?: number;
	}

	let { current, total }: Props = $props();

	const tabs = $derived([
		{ href: resolve('/arena'), label: m.arena_tab_overview(), current: current === 'overview' },
		{
			href: resolve('/arena/live'),
			label: m.arena_tab_live(),
			short: m.arena_tab_live_short(),
			current: current === 'live',
			count: total,
		},
	]);
</script>

<PageHeader title={m.arena_title()} lead={m.arena_lead()}>
	{#snippet actions()}
		<span class="max-sm:hidden">
			<Button href={resolve('/play')} variant="primary" size="lg">
				{m.arena_play()}
				<span aria-hidden="true">→</span>
			</Button>
		</span>
	{/snippet}
</PageHeader>

<TabNav label={m.arena_tabs_label()} items={tabs} />
