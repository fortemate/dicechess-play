<script lang="ts">
	// The actions of a game in progress, as labelled buttons (#255): "Moves" on a phone, "Offer a
	// draw" and "Resign". They replace a row of 32 px icons whose meaning a visitor had to guess.
	//
	// It decides nothing. The page owns the state of each control and passes it in: what the
	// draw control is doing and the sentence that explains it, and whether a first press of
	// "Resign" is waiting for the second. The two-press confirmation and its timing constant
	// (`RESIGN_CONFIRM_MS`) stay in the pages, where they were.
	//
	// What a visitor reads on a button is what a screen reader or a voice command finds. The draw
	// button shows a short text and carries the page's full sentence as its accessible name and
	// tooltip; the short text is the start of that sentence. The resign button is named by its
	// own visible text, in both of its states, and only takes a different name when it cannot
	// be pressed and has to say why.
	//
	// Leave a control out to hide it: a spectator gets no draw and no resign button.
	import { m } from '#lib/paraglide/messages.js';
	import Button from './ui/Button.svelte';

	type DrawState = 'idle' | 'armed' | 'pending' | 'forbidden';

	interface Props {
		/** The "Moves" button of a phone, which opens the move sheet. Hidden from `md` up. */
		moves?: { open: boolean; controls: string; toggle: () => void };
		draw?: {
			state: DrawState;
			/** The sentence that explains the state; the accessible name and the tooltip. */
			label: string;
			disabled?: boolean;
			ontoggle: () => void;
		};
		resign?: {
			/** The first press was made and the second is awaited. */
			armed: boolean;
			/** Text of the armed button, when the page has more to say than "Press again to resign". */
			armedText?: string;
			disabled?: boolean;
			/** Why the button is disabled; its accessible name and tooltip while it is. It must
			 * contain the word on the button ("Resign unavailable while disconnected"). */
			disabledReason?: string;
			onpress: () => void;
			/** Lets the page take the first press back when focus leaves the button. */
			onblur?: () => void;
		};
	}

	let { moves, draw, resign }: Props = $props();

	const DRAW_TEXT: Record<DrawState, () => string> = {
		idle: m.game_action_draw_offer,
		forbidden: m.game_action_draw_offer,
		armed: m.game_action_draw_armed,
		pending: m.game_action_draw_pending,
	};

	const WRAP = 'flex-1 px-2 text-center leading-tight whitespace-normal';
</script>

{#if moves || draw || resign}
	<div role="group" aria-label={m.game_actions_region()} class="flex items-stretch gap-2">
		{#if moves}
			<Button
				variant="secondary"
				class="{WRAP} md:hidden"
				aria-expanded={moves.open}
				aria-controls={moves.controls}
				onclick={moves.toggle}
			>
				{m.game_action_moves()}
			</Button>
		{/if}
		{#if draw}
			<Button
				variant="secondary"
				class="{WRAP} {draw.state === 'armed' || draw.state === 'pending'
					? 'border-primary bg-primary/15 text-primary'
					: ''}"
				aria-label={draw.label}
				aria-pressed={draw.state === 'armed'}
				title={draw.label}
				disabled={draw.disabled || draw.state === 'forbidden' || draw.state === 'pending'}
				onclick={draw.ontoggle}
			>
				{DRAW_TEXT[draw.state]()}
			</Button>
		{/if}
		{#if resign}
			<Button
				variant="danger"
				filled={resign.armed}
				class={WRAP}
				aria-label={resign.disabled ? resign.disabledReason : undefined}
				title={resign.disabled ? resign.disabledReason : undefined}
				disabled={resign.disabled}
				onclick={resign.onpress}
				onblur={resign.onblur}
			>
				{resign.armed
					? (resign.armedText ?? m.game_action_resign_confirm())
					: m.game_action_resign()}
			</Button>
		{/if}
	</div>
{/if}
