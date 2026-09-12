<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { resolve } from '$app/paths';
	import type { PlayerGame } from '$lib/games/gamesApi';
	import { parseGameResultsTimeControl } from '$lib/live/timeControls';
	import { SEAT_LABELS } from '$lib/live/playerLabel';
	import { RESULT_CLASS, RESULT_LABEL, terminationLabel } from '$lib/gameOutcome';
	import { formatDate } from '../utils/formatters';
	import BotBadge from './BotBadge.svelte';

	interface Props {
		game: PlayerGame;
	}

	let { game }: Props = $props();

	const opponentName = $derived(game.opponent.name ?? 'Anonymous opponent');
	// A registered human opponent gets a profile link (#213); bots and anonymous guests don't — a
	// bot's `name` here is a combined team+name string with no per-game field to split it into the
	// team/name pair `/bots/[team]/[name]` needs, so bots stay unlinked rather than misrouted.
	const opponentHref = $derived(
		game.opponent.kind === 'Human' && game.opponent.name
			? resolve('/players/[nickname]', { nickname: game.opponent.name })
			: null,
	);
	const playedColor = $derived(SEAT_LABELS[game.seat]);
	const timeControl = $derived(parseGameResultsTimeControl(game.timeControl));
	// play-api's termination wire enum is mapped to display labels via terminationLabel()
	// ($lib/gameOutcome). Replaces the previous runtime regex humaniser which was incompatible
	// with i18n (#23): known values come from an explicit label table and unmapped values degrade
	// gracefully to the static label "Game ended".
	const termination = $derived(terminationLabel(game.termination));
</script>

<div
	class="group relative bg-surface/60 hover:bg-surface-hover/80 border border-border hover:border-primary/50 rounded-2xl p-5 flex flex-col gap-4 transition-all hover:-translate-y-0.5 hover:shadow-lg"
>
	<!-- Stretched link: the whole card navigates to the replay, but the opponent name (below) sits
	     in a higher stacking context so it remains independently clickable rather than nesting an
	     <a> inside this one, which HTML forbids. -->
	<a
		href={resolve('/replay/[id]', { id: game.gameId })}
		class="absolute inset-0 z-0 rounded-2xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
		title="Played online — recorded by the server. Click to watch the replay."
	></a>

	<div class="flex justify-between items-center gap-2">
		<span
			class="px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase bg-badge-accent/10 text-badge-accent border border-badge-accent/20"
		>
			Live
		</span>
		<span class="text-xs text-content-muted font-medium text-right">
			{formatDate(game.finishedAt)}
		</span>
	</div>

	<div class="flex items-center justify-between gap-3">
		<div class="flex flex-col gap-0.5 min-w-0">
			<span class="text-[11px] font-black uppercase tracking-widest text-content-muted/60">vs</span>
			<span class="flex min-w-0 items-center gap-1.5">
				{#if opponentHref}
					<!-- opponentHref is built with resolve() above; the rule can't trace it through a variable. -->
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						href={opponentHref}
						class="relative z-10 font-bold text-content text-lg truncate hover:text-primary hover:underline"
						title={opponentName}
					>
						{opponentName}
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{:else}
					<span class="font-bold text-content text-lg truncate" title={opponentName}
						>{opponentName}</span
					>
				{/if}
				{#if game.opponent.kind === 'Bot'}<BotBadge />{/if}
			</span>
			<span class="text-xs text-content-muted">You played {playedColor}</span>
		</div>
		<span
			class="shrink-0 px-3 py-1 rounded-lg text-sm font-black uppercase tracking-wider border {RESULT_CLASS[
				game.result
			]}"
		>
			{RESULT_LABEL[game.result]}
		</span>
	</div>

	<div
		class="flex justify-between items-center pt-3 border-t border-border-strong/40 text-xs font-semibold text-content-muted"
	>
		<span>{termination}</span>
		<span>{timeControl}</span>
	</div>
</div>
