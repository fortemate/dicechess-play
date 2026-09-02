<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import Spinner from '../Spinner.svelte';
	import type { ShowcaseIntent, ShowcaseState } from './types';

	interface Props {
		state: ShowcaseState;
		onIntent?: (intent: ShowcaseIntent) => void;
	}

	let { state, onIntent }: Props = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
		}
	}
</script>

<div class="flex h-14 w-full items-center">
	{#if state.kind === 'open'}
		<button
			type="button"
			onclick={() => onIntent?.({ type: 'claim', color: state.assignedColor })}
			class="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-bold tracking-wider text-primary-content uppercase shadow-lg shadow-primary/25 transition-all hover:bg-primary-hover active:scale-[0.98]"
		>
			{state.assignedColor === 'w' ? m.home_action_claim_white() : m.home_action_claim_black()}
		</button>
	{:else if state.kind === 'claiming'}
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
	{:else if state.kind === 'live-player'}
		<button
			type="button"
			onclick={() => onIntent?.({ type: 'resign' })}
			class="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl border border-danger/40 bg-surface px-4 py-3 text-sm font-bold tracking-wider text-danger transition-all hover:border-danger/70 hover:bg-danger/10 active:scale-[0.98]"
		>
			{m.home_action_resign()}
		</button>
	{:else if state.kind === 'live-spectator'}
		<a
			href={resolve('/play')}
			class="flex h-12 w-full items-center justify-center rounded-xl border border-border bg-surface px-4 py-3 text-sm font-bold tracking-wider text-content transition-all hover:border-border-strong hover:bg-surface-hover"
		>
			{m.home_action_play_alt()}
		</a>
	{:else if state.kind === 'reconnecting'}
		<button
			type="button"
			onclick={() => onIntent?.({ type: 'retry' })}
			class="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-bold tracking-wider text-primary-content uppercase shadow-md transition-all hover:bg-primary-hover active:scale-[0.98]"
		>
			{m.home_action_retry()}
		</button>
	{:else if state.kind === 'finishing'}
		<button
			type="button"
			onclick={() => onIntent?.({ type: 'reset-now' })}
			class="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold tracking-wider text-primary-content uppercase shadow-md transition-all hover:bg-primary-hover active:scale-[0.98]"
		>
			<span>{m.home_action_reset_now()}</span>
			<span class="rounded bg-primary-content/20 px-1.5 py-0.5 text-xs font-mono font-bold">
				{state.countdownSeconds}s
			</span>
		</button>
	{:else if state.kind === 'reset'}
		<button
			type="button"
			aria-disabled="true"
			onkeydown={handleKeydown}
			class="flex h-12 w-full pointer-events-none items-center justify-center rounded-xl border border-border bg-surface/50 px-4 py-3 text-sm font-bold tracking-wider text-content-muted"
		>
			{m.home_action_opening_soon()}
		</button>
	{/if}
</div>
