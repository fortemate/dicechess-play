<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import type { ProfileRecentGame } from '$lib/leaderboard/leaderboardApi';
	import { formatDate } from '../utils/formatters';
	import BotBadge from './BotBadge.svelte';

	// One recent game on a public profile — a bot's or a person's (#207). Named for the surface, not
	// the subject: play-api shapes both profiles' `recent` identically, so one card serves both.
	//
	// A near-twin of LiveGameHistoryCard, deliberately not reused: that component's copy assumes
	// the viewer IS the participant ("You played White"), which is right on /games (a visitor's own
	// history) but wrong here — a public profile is a THIRD PARTY looking at someone's record.
	// ProfileRecentGame also has no `timeControl` field (play-api's profile wire, #152 Tier 1),
	// so there's nothing to show in that footer slot. The rated/casual pill fills the header slot
	// LiveGameHistoryCard spends on a "Live" badge that would be redundant here — every game on a
	// profile is server-recorded by construction, so it carries no distinguishing information.
	interface Props {
		game: ProfileRecentGame;
	}

	let { game }: Props = $props();

	const opponentName = $derived(game.opponent.name ?? 'Anonymous opponent');
	const playedColor = $derived(game.seat === 'White' ? 'White' : 'Black');
	// play-api's termination is a snake_case wire enum ('king_captured', 'draw_agreement', ...) — a
	// generic humaniser rather than an exhaustive label table, matching LiveGameHistoryCard's stance.
	const termination = $derived(
		game.termination.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
	);

	const RESULT_LABEL: Record<ProfileRecentGame['result'], string> = {
		win: 'Won',
		loss: 'Lost',
		draw: 'Draw',
		unknown: 'Unknown',
	};
	const RESULT_CLASS: Record<ProfileRecentGame['result'], string> = {
		win: 'bg-primary/15 text-primary border-primary/30',
		loss: 'bg-danger/15 text-danger border-danger/30',
		draw: 'bg-surface text-content-muted border-border',
		unknown: 'bg-surface text-content-muted border-border',
	};
</script>

<div class="bg-surface/60 border border-border rounded-2xl p-5 flex flex-col gap-4">
	<div class="flex justify-between items-center gap-2">
		<span
			class="px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase border {game.rated
				? 'bg-badge-accent/10 text-badge-accent border-badge-accent/20'
				: 'bg-surface text-content-muted border-border'}"
		>
			{game.rated ? 'Rated' : 'Casual'}
		</span>
		<span class="text-xs text-content-muted font-medium text-right">
			{formatDate(game.finishedAt)}
		</span>
	</div>

	<div class="flex items-center justify-between gap-3">
		<div class="flex flex-col gap-0.5 min-w-0">
			<span class="text-[11px] font-black uppercase tracking-widest text-content-muted/60">vs</span>
			<span class="flex min-w-0 items-center gap-1.5">
				<span class="font-bold text-content text-lg truncate" title={opponentName}
					>{opponentName}</span
				>
				{#if game.opponent.kind === 'Bot'}<BotBadge />{/if}
			</span>
			<span class="text-xs text-content-muted">Played {playedColor}</span>
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
	</div>
</div>
