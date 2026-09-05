<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	// One player's HUD row on the game screen: identity on the left, clock on the right.
	// The clock is optional (bot games and unlimited live games have none).
	import { formatClock, isLowTime } from '$lib/live/clockFormat';
	import BotBadge from './BotBadge.svelte';

	interface Props {
		name: string;
		sub: string;
		/** This seat is a machine — renders the BOT badge next to the name (transparency, D.3). */
		bot?: boolean;
		/** This side is to move — highlights the strip (and clock, when present). */
		active?: boolean;
		/** Replaces `sub` with an animated thinking indicator (bot games). */
		thinking?: boolean;
		/** Remaining ms; omit (undefined) for games without clocks. */
		clockMs?: number;
		/** Settled rating as of game start (play-api #290); omit (undefined) when the server didn't
		 * send one — never render a placeholder in its place. */
		rating?: number;
		/** Links the name to the player's public profile. Omit to keep the name plain text — the
		 * caller only passes this once the game is over (#213), so the board stays free of
		 * accidental navigation mid-game. */
		href?: string;
		/** Denser row on phones (48px instead of 56px), for a screen that has to fit a full-width
		 * board above the fold; md+ is unaffected. The showcase table uses it. */
		compact?: boolean;
	}

	let {
		name,
		sub,
		bot = false,
		active = false,
		thinking = false,
		clockMs,
		href,
		rating,
		compact = false,
	}: Props = $props();

	const low = $derived(clockMs !== undefined && isLowTime(clockMs));
</script>

<!-- min-h matches the strip's height with the clock pill (taller than the avatar),
     so the strip doesn't jump when clock state arrives after connect. -->
<div
	class="flex items-center gap-2.5 rounded-xl border bg-surface px-3 transition-colors
		{compact ? 'min-h-12 py-1 md:min-h-14 md:py-2' : 'min-h-14 py-2'}
		{active ? (low ? 'border-danger/50' : 'border-badge-accent/60') : 'border-border'}"
>
	<span
		class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface-hover text-content-muted"
		aria-hidden="true"
	>
		<svg
			viewBox="0 0 24 24"
			class="h-[18px] w-[18px]"
			fill="none"
			stroke="currentColor"
			stroke-width="1.7"
			stroke-linecap="round"
		>
			<circle cx="12" cy="8" r="3.4" />
			<path d="M5 19.5c0-3.4 3-6 7-6s7 2.6 7 6" />
		</svg>
	</span>
	<span class="flex min-w-0 flex-col leading-tight">
		<span class="flex min-w-0 items-center gap-1.5">
			{#if href}
				<!-- href is caller-resolved (see live/[id]/+page.svelte's seatProfileHref); the rule can't
				     trace resolve() through a prop boundary. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					{href}
					class="truncate text-sm font-semibold text-content hover:text-primary hover:underline"
				>
					{name}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{:else}
				<b class="truncate text-sm font-semibold text-content">{name}</b>
			{/if}
			{#if rating !== undefined}
				<!-- Glicko-2 rating on the wire is a raw double (e.g. 1797.2144251082318, #235); whole
				     points are honest enough here, matching AccountPanel/LeaderboardRow. -->
				<small class="shrink-0 font-mono text-[11px] text-content-muted"
					>· {Math.round(rating)}</small
				>
			{/if}
			{#if bot}
				<BotBadge />
			{/if}
		</span>
		{#if thinking}
			<small class="animate-pulse text-[11px] text-content-muted italic">thinking…</small>
		{:else}
			<small class="truncate text-[11px] text-content-muted">{sub}</small>
		{/if}
	</span>
	{#if clockMs !== undefined}
		<span
			class="ml-auto min-w-[92px] rounded-lg border px-2.5 py-0.5 text-right font-mono text-2xl font-bold tabular-nums transition-all
				{low
				? 'border-danger/50 bg-danger/15 text-danger'
				: active
					? 'border-badge-accent/60 bg-badge-accent/15 text-content shadow-[0_0_12px] shadow-badge-accent/25'
					: 'border-border bg-surface-hover/50 text-content'}"
			class:animate-pulse={active && low}
			aria-label="{name} clock: {formatClock(clockMs)}"
		>
			{formatClock(clockMs)}
		</span>
	{/if}
</div>
