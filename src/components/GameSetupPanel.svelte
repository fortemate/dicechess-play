<script lang="ts" generics="C extends string">
	// The one place a game is configured (#253): the time control, the seat colour, the note
	// about rating and the button that starts it. Four pages used to draw this each in its own
	// way, with their own order of colours and their own look for the selected option: the bot
	// challenge panel, the practice setup, the friend setup and the open-a-table form.
	//
	// The panel owns the look and the order. What may be chosen stays a property of the mode,
	// and the caller states it:
	//
	//   - `timeGroups`: the caller's own list. A catalog bot has no "Unlimited" (ADR-0014), a
	//     practice game does; the panel does not merge the lists.
	//   - `colorValues`: pass it and the visitor chooses a colour, always in the order Random,
	//     White, Black. Leave it out for a mode without that choice: an open table, where the
	//     seat is drawn when someone sits down. The panel then says so, or says `colorNote`
	//     where the visitor is the one who sits down.
	//   - `rating`: `choice` renders `RatedChoice`, which alone decides whether this visitor may
	//     play rated; `casual` and `unrated` are a line of text for modes that are never rated.
	//     `ratingNote` replaces that line where the mode has its own reason to give: a starter
	//     bot, or a table whose owner has already decided.
	//   - `choicesClass`: classes for the block of choices above the button. Play folds the
	//     choices away on a phone and keeps the button in view (#257); the choices stay mounted,
	//     so they keep their values.
	//
	// It sends nothing. The values are bound, in the caller's own vocabulary (`colorValues` maps
	// the three colours to it), so each caller builds exactly the request it built before.
	import { m } from '#lib/paraglide/messages.js';
	import RatedChoice from './RatedChoice.svelte';
	import Spinner from './Spinner.svelte';
	import Button from './ui/Button.svelte';
	import ChoiceGroup from './ui/ChoiceGroup.svelte';

	interface TimeGroup {
		label?: string;
		options: readonly { value: number; label: string }[];
	}

	interface Props {
		/** Scopes the radio groups: unique among the panels on one page. */
		name: string;
		timeGroups: readonly TimeGroup[];
		/** The selected time control, as the caller's own index. */
		time: number;
		/** The caller's values for the three colours. Omit when the mode has no colour choice. */
		colorValues?: { random: C; white: C; black: C };
		color?: C;
		/** The line shown instead of the standard one when there is no colour choice. */
		colorNote?: string;
		rating: 'choice' | 'casual' | 'unrated';
		/** The line shown instead of the standard one when `rating` is not `choice`. */
		ratingNote?: string;
		rated?: boolean;
		actionLabel: string;
		/** Shown on the button while `busy`. */
		busyLabel?: string;
		busy?: boolean;
		onstart: () => void;
		error?: string | null;
		/** Classes for the block of choices, e.g. to fold it away on a narrow screen. */
		choicesClass?: string;
		class?: string;
	}

	let {
		name,
		timeGroups,
		time = $bindable(),
		colorValues,
		color = $bindable(),
		colorNote,
		rating,
		ratingNote,
		rated = $bindable(false),
		actionLabel,
		busyLabel,
		busy = false,
		onstart,
		error = null,
		choicesClass = '',
		class: className = '',
	}: Props = $props();

	const colorOptions = $derived(
		colorValues
			? [
					{ value: colorValues.random, label: m.common_setup_color_random() },
					{ value: colorValues.white, label: m.common_seat_white() },
					{ value: colorValues.black, label: m.common_seat_black() },
				]
			: [],
	);
</script>

<div class="flex flex-col gap-5 {className}">
	<div class="flex flex-col gap-5 {choicesClass}">
		<ChoiceGroup
			legend={m.common_setup_time_control()}
			name="time-{name}"
			groups={timeGroups}
			bind:value={time}
		/>

		{#if colorValues}
			<ChoiceGroup
				legend={m.common_setup_color()}
				name="color-{name}"
				options={colorOptions}
				bind:value={color as C}
				stretch
			/>
		{:else}
			<p class="m-0 text-sm text-content-muted">
				{colorNote ?? m.common_setup_color_drawn()}
			</p>
		{/if}

		{#if rating === 'choice'}
			<RatedChoice bind:rated {name} />
		{:else}
			<p class="m-0 text-sm text-content-muted">
				{ratingNote ??
					(rating === 'casual' ? m.common_setup_note_casual() : m.common_setup_note_unrated())}
			</p>
		{/if}
	</div>

	{#if error}<p class="m-0 text-sm text-danger" role="alert">{error}</p>{/if}

	<Button
		variant="primary"
		size="lg"
		block
		onclick={onstart}
		disabled={busy}
		aria-busy={busy}
		aria-live="polite"
	>
		{#if busy}<Spinner />{/if}
		{busy && busyLabel ? busyLabel : actionLabel}
	</Button>
</div>
