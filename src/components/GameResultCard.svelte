<script lang="ts">
	// The result of a game, as a state of the first card of the rail (#256). It takes the place of
	// the turn card when the game is over, so the board and the move list stay in view; the result
	// used to open as a dialog over the board.
	//
	// It only shows what the page gives it: the headline, coloured by the outcome, the reason, and
	// the credits line of a staked game. Everything below those is the page's own content: the
	// rating line, which keeps asking the server for the change it applied and never computes
	// one, and the actions.
	//
	// A region with a name, so a screen reader user can jump to it, and announced when it
	// appears: the end of a game must not pass silently for someone who cannot see the card
	// replace the dice.
	import type { Snippet } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		headline: string;
		/** Colours the headline by the outcome. */
		tone?: 'win' | 'loss' | 'neutral';
		/** The line under the headline: how the game ended. */
		reason?: string;
		/** The credits line of a staked game ("+10 credits"), from the server's amounts. */
		settlement?: string | null;
		/** The rating line and the actions of the page. */
		children?: Snippet;
	}

	let { headline, tone = 'neutral', reason, settlement = null, children }: Props = $props();

	const TONE = {
		win: 'text-success',
		loss: 'text-danger',
		neutral: 'text-content',
	};
</script>

<section
	aria-label={m.game_result_region()}
	class="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-4 text-center shadow-lg"
>
	<div class="flex flex-col gap-1" role="status">
		<h2 class="m-0 text-2xl leading-tight font-bold {TONE[tone]}">{headline}</h2>
		{#if reason}
			<p class="m-0 text-sm text-content-muted">{reason}</p>
		{/if}
		{#if settlement}
			<p class="m-0 text-sm font-semibold text-content" data-testid="settlement-line">
				{settlement}
			</p>
		{/if}
	</div>
	{#if children}
		<div class="flex w-full flex-col items-center gap-2.5">{@render children()}</div>
	{/if}
</section>
