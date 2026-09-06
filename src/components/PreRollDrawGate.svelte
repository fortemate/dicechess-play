<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	// Pre-roll draw offer gate card for live games (play-api #327, standing flag play-api #105).
	// When an offer is pending for the active player before their dice roll, auto-roll is suspended:
	// the responder either accepts, or declines and rolls. The card sits in the dice panel's slot so
	// no modal ever blocks the board, the move list or history navigation while a clock runs.
	//
	// Declining is the cheap path and is laid out as such (ADR 006 §4.6): it is the first, focused
	// control, Escape does it, and so does a tap on the board — in bullet the responder should be able
	// to carry on playing without aiming at a button. Accepting ends the game, so it is deliberately
	// the awkward one: placed away from the board and confirmed twice, the same gesture as resigning.
	import { RESIGN_CONFIRM_MS } from '$lib/timings';

	interface Props {
		isResponder: boolean;
		offeredByName?: string | null;
		onAccept?: () => void;
		onDecline?: () => void;
	}

	let { isResponder, offeredByName, onAccept, onDecline }: Props = $props();

	let armedAccept = $state(false);
	let armTimer: ReturnType<typeof setTimeout> | undefined;

	function disarm() {
		clearTimeout(armTimer);
		armedAccept = false;
	}

	function accept() {
		if (!armedAccept) {
			armedAccept = true;
			armTimer = setTimeout(() => (armedAccept = false), RESIGN_CONFIRM_MS);
			return;
		}
		disarm();
		onAccept?.();
	}

	function decline() {
		disarm();
		onDecline?.();
	}

	// Escape declines; it never accepts. No single key may end the game, which is why `accept` has no
	// keyboard shortcut of its own and goes through the same two presses as the button.
	function onKeydown(event: KeyboardEvent) {
		if (!isResponder) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			if (armedAccept) disarm();
			else decline();
		}
	}

	$effect(() => () => clearTimeout(armTimer));
</script>

<svelte:window onkeydown={onKeydown} />

<div
	class="flex flex-col justify-center gap-3.5 rounded-2xl border border-primary/40 bg-surface p-4 shadow-lg md:flex-1"
	role="region"
	aria-label="Draw offer"
>
	<div class="flex items-center justify-center gap-2 text-primary">
		<span class="text-xl font-black">½–½</span>
		<h4 class="text-base font-extrabold uppercase tracking-wider text-content">Draw Offered</h4>
	</div>

	{#if isResponder}
		<p class="text-center text-xs text-content-muted" aria-live="assertive">
			{offeredByName ? `${offeredByName} offered a draw.` : 'Your opponent offered a draw.'}
			Your clock is running: roll to decline, or accept to end the game.
		</p>

		<div class="flex flex-col gap-2 pt-1">
			<!-- svelte-ignore a11y_autofocus (the card replaces the dice panel mid-game and owns the
			     decision; landing focus here is what lets a keyboard player answer without hunting) -->
			<button
				type="button"
				autofocus
				onclick={decline}
				class="w-full cursor-pointer rounded-xl bg-primary py-3 text-sm font-bold tracking-wider text-primary-content uppercase shadow-md transition-all hover:bg-primary-hover active:scale-[0.98]"
			>
				Decline &amp; roll 🎲
			</button>
			<button
				type="button"
				onclick={accept}
				onblur={disarm}
				aria-label={armedAccept
					? 'Press again to accept the draw and end the game'
					: 'Accept the draw'}
				class="w-full cursor-pointer rounded-xl border py-2.5 text-sm font-bold tracking-wider uppercase shadow-sm transition-all active:scale-[0.98] {armedAccept
					? 'border-primary bg-primary/15 text-primary'
					: 'border-border bg-surface-hover text-content hover:border-border-strong hover:bg-surface'}"
			>
				{armedAccept ? 'Accept draw — confirm?' : 'Accept draw ½–½'}
			</button>
		</div>
	{:else}
		<div class="flex items-center justify-center gap-3 py-2" aria-label="Dice withheld">
			{#each [0, 1, 2] as i (i)}
				<div class="h-14 w-14 rounded-xl border border-border opacity-30 xl:h-16 xl:w-16"></div>
			{/each}
		</div>
		<p class="text-center text-xs text-content-muted animate-pulse">
			{offeredByName
				? `${offeredByName} offered a draw — waiting for decision…`
				: 'Draw offered — waiting for decision…'}
		</p>
	{/if}
</div>
