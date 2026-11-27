<script lang="ts">
	// TEST-ONLY harness for GameSetupPanel.test.ts — not part of any page, and nothing in src/
	// imports it.
	//
	// The panel sends nothing: its whole output is what it writes back through its bindings, in the
	// vocabulary of the page that uses it. A bound value is invisible to a test that renders the
	// component directly, so this configures the panel the way each of the four pages does and
	// reflects the bound values into the DOM.
	import {
		botTimeControlChoices,
		timeControlChoices,
		type TimeControlChoiceGroup,
	} from '#lib/live/timeControls.js';
	import GameSetupPanel from './GameSetupPanel.svelte';

	type Mode = 'bot' | 'practice' | 'friend' | 'table';

	interface Props {
		mode: Mode;
		name?: string;
		rated?: boolean;
		busy?: boolean;
		error?: string | null;
		onstart?: () => void;
	}

	let {
		mode,
		name = 'harness',
		rated = $bindable(false),
		busy = false,
		error = null,
		onstart = () => {},
	}: Props = $props();

	// The same shape the practice page builds from its own presets: it alone offers no clock.
	const PRACTICE_TIMES: TimeControlChoiceGroup[] = [
		{ label: 'Casual', options: [{ value: 0, label: 'Unlimited' }] },
		{ label: 'Blitz', options: [{ value: 1, label: '3 + 2' }] },
	];
	const SEATS = { random: 'random', white: 'White', black: 'Black' } as const;
	const LOWER = { random: 'random', white: 'white', black: 'black' } as const;

	let time = $state(0);
	let seat = $state<'random' | 'White' | 'Black'>('random');
	let lower = $state<'random' | 'white' | 'black'>('random');
</script>

<output data-testid="time">{time}</output>
<output data-testid="color">{mode === 'practice' ? lower : seat}</output>
<output data-testid="rated">{rated}</output>

{#if mode === 'bot'}
	<GameSetupPanel
		{name}
		timeGroups={botTimeControlChoices()}
		bind:time
		colorValues={SEATS}
		bind:color={seat}
		rating="choice"
		bind:rated
		actionLabel="Start game"
		busyLabel="Starting…"
		{busy}
		{onstart}
		{error}
	/>
{:else if mode === 'practice'}
	<GameSetupPanel
		{name}
		timeGroups={PRACTICE_TIMES}
		bind:time
		colorValues={LOWER}
		bind:color={lower}
		rating="unrated"
		actionLabel="Start game"
		{onstart}
	/>
{:else if mode === 'friend'}
	<GameSetupPanel
		{name}
		timeGroups={timeControlChoices()}
		bind:time
		colorValues={SEATS}
		bind:color={seat}
		rating="casual"
		actionLabel="Create game"
		busyLabel="Creating…"
		{busy}
		{onstart}
		{error}
	/>
{:else}
	<GameSetupPanel
		{name}
		timeGroups={timeControlChoices()}
		bind:time
		rating="choice"
		bind:rated
		actionLabel="Open a table"
		busyLabel="Opening…"
		{busy}
		{onstart}
	/>
{/if}
