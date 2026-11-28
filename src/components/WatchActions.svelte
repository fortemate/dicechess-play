<script lang="ts">
	// What a spectator can do with a game (#263): open the move list on a phone, turn the board
	// round, copy the link of the game, and go to the other live games. None of it needs a seat,
	// and nothing here is a game control: a spectator is never offered a draw or a resignation.
	//
	// One row for both layouts: under the move list on a wide screen, the bar at the bottom of
	// a phone. The page owns the state (which way the board faces, whether the link was just
	// copied) and passes it in.
	import { m } from '#lib/paraglide/messages.js';
	import Button from './ui/Button.svelte';

	interface Props {
		/** The "Moves" button of a phone, which opens the move sheet. Hidden from `md` up. */
		moves?: { open: boolean; controls: string; toggle: () => void };
		/** Whether Black is at the bottom. */
		flipped: boolean;
		onflip: () => void;
		/** Whether the link was copied a moment ago. */
		copied: boolean;
		onshare: () => void;
		/** Where the other live games are: the block on this page, or the full list. */
		othersHref: string;
	}

	let { moves, flipped, onflip, copied, onshare, othersHref }: Props = $props();

	const WRAP = 'flex-1 px-2 text-center leading-tight whitespace-normal';
</script>

<div role="group" aria-label={m.game_watch_actions()} class="flex items-stretch gap-2">
	{#if moves}
		<Button
			class="{WRAP} md:hidden"
			aria-expanded={moves.open}
			aria-controls={moves.controls}
			onclick={moves.toggle}
		>
			{m.game_action_moves()}
		</Button>
	{/if}
	<Button class={WRAP} aria-pressed={flipped} onclick={onflip}>{m.game_watch_flip()}</Button>
	<Button class={WRAP} onclick={onshare}>
		<span aria-live="polite">{copied ? m.game_watch_copied() : m.game_watch_share()}</span>
	</Button>
	<!-- On a wide screen the other games are a block of the rail, in view already. -->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the page passes a path it has resolved -->
	<Button class="{WRAP} md:hidden" href={othersHref}>{m.game_watch_others()}</Button>
</div>
