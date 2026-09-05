<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import { RESIGN_CONFIRM_MS } from '$lib/timings';
	import Spinner from '../Spinner.svelte';
	import type { ShowcaseIntent, ShowcaseState } from './types';

	interface Props {
		state: ShowcaseState;
		onIntent?: (intent: ShowcaseIntent) => void;
	}

	// The prop is `state` for every showcase component, but a local binding named `state` turns
	// `$state(...)` below into a store subscription (svelte.dev/e/store_rune_conflict) — hence the alias.
	let { state: showcase, onIntent }: Props = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
		}
	}

	// Resigning takes two presses within RESIGN_CONFIRM_MS — the same flag-and-confirm control
	// as /live and /practice. The showcase is the landing page, so its player is often a
	// first-time visitor feeling out the controls: a one-press, full-width "Resign Game" there
	// read as the primary action and ended games nobody meant to end.
	let confirmResign = $state(false);
	let resignTimeout: ReturnType<typeof setTimeout> | undefined;

	function disarmResign() {
		clearTimeout(resignTimeout);
		resignTimeout = undefined;
		confirmResign = false;
	}

	function resign() {
		if (!confirmResign) {
			confirmResign = true;
			resignTimeout = setTimeout(disarmResign, RESIGN_CONFIRM_MS);
			return;
		}
		disarmResign();
		onIntent?.({ type: 'resign' });
	}

	// An armed confirmation must not outlive live play: if the game ends or the connection drops
	// before the second press, the next live game starts unarmed.
	$effect(() => {
		if (showcase.kind !== 'live-player') disarmResign();
	});
	$effect(() => () => clearTimeout(resignTimeout));

	// Only the resign control is compact; every other action is a full-width button in a fixed slot
	// (48px on phones, where every pixel goes to the board; 56px on md+, where the rail must never
	// shift between states). ShowcaseShell lays the compact control out at the end of the dice row on
	// phones.
	const compact = $derived(showcase.kind === 'live-player');
</script>

<div
	class={compact
		? 'flex shrink-0 items-center md:h-14 md:w-full md:justify-end'
		: 'flex h-12 w-full items-center md:h-14'}
>
	{#if showcase.kind === 'open'}
		<button
			type="button"
			onclick={() => onIntent?.({ type: 'claim' })}
			class="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-bold tracking-wider text-primary-content uppercase shadow-lg shadow-primary/25 transition-all hover:bg-primary-hover active:scale-[0.98]"
		>
			{showcase.assignedColor === 'w' ? m.home_action_claim_white() : m.home_action_claim_black()}
		</button>
	{:else if showcase.kind === 'claiming'}
		<button
			type="button"
			aria-disabled="true"
			aria-busy="true"
			onkeydown={handleKeydown}
			class="flex h-12 w-full pointer-events-none items-center justify-center gap-2 rounded-xl bg-primary/70 px-4 py-3 text-sm font-bold tracking-wider text-primary-content uppercase shadow-md cursor-wait"
		>
			<Spinner />
			<span>{m.home_action_claiming()}</span>
		</button>
	{:else if showcase.kind === 'live-player'}
		<button
			type="button"
			onclick={resign}
			aria-label={confirmResign ? m.home_action_resign_confirm_hint() : m.home_action_resign()}
			title={m.home_action_resign()}
			class="flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border text-xs font-bold transition-colors {confirmResign
				? 'border-danger/50 bg-danger/15 px-2.5 text-danger'
				: 'w-8 border-border bg-surface text-content-muted hover:border-danger/50 hover:text-danger md:w-auto md:px-2.5'}"
		>
			<svg
				viewBox="0 0 24 24"
				class="h-[17px] w-[17px] shrink-0"
				fill="none"
				stroke="currentColor"
				stroke-width="1.8"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M6 20V4M6 5h11l-2 3 2 3H6" />
			</svg>
			{#if confirmResign}
				<span>{m.home_action_resign_confirm()}</span>
			{:else}
				<span class="hidden md:inline">{m.home_action_resign_short()}</span>
			{/if}
		</button>
	{:else if showcase.kind === 'live-spectator'}
		<a
			href={resolve('/play')}
			class="flex h-12 w-full items-center justify-center rounded-xl border border-border bg-surface px-4 py-3 text-sm font-bold tracking-wider text-content transition-all hover:border-border-strong hover:bg-surface-hover"
		>
			{m.home_action_play_alt()}
		</a>
	{:else if showcase.kind === 'reconnecting'}
		<button
			type="button"
			onclick={() => onIntent?.({ type: 'retry' })}
			class="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-bold tracking-wider text-primary-content uppercase shadow-md transition-all hover:bg-primary-hover active:scale-[0.98]"
		>
			{m.home_action_retry()}
		</button>
	{:else if showcase.kind === 'finishing'}
		<button
			type="button"
			onclick={() => onIntent?.({ type: 'reset-now' })}
			class="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold tracking-wider text-primary-content uppercase shadow-md transition-all hover:bg-primary-hover active:scale-[0.98]"
		>
			<span>{m.home_action_reset_now()}</span>
			<span class="rounded bg-primary-content/20 px-1.5 py-0.5 text-xs font-mono font-bold">
				{showcase.countdownSeconds}s
			</span>
		</button>
	{:else if showcase.kind === 'reset'}
		<button
			type="button"
			aria-disabled="true"
			onkeydown={handleKeydown}
			class="flex h-12 w-full pointer-events-none items-center justify-center rounded-xl border border-border bg-surface/50 px-4 py-3 text-sm font-bold tracking-wider text-content-muted"
		>
			{m.home_action_opening_soon()}
		</button>
	{:else if showcase.kind === 'unavailable'}
		<a
			href={resolve('/play')}
			class="flex h-12 w-full items-center justify-center rounded-xl border border-border bg-surface px-4 py-3 text-sm font-bold tracking-wider text-content transition-all hover:border-border-strong hover:bg-surface-hover"
		>
			{m.home_action_play_alt()}
		</a>
	{/if}
</div>
