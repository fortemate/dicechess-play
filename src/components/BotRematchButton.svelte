<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { onDestroy } from 'svelte';
	import { wakeBot } from '$lib/catalog/catalogApi';
	import { describeStartFailure, startBotGame } from '$lib/catalog/botChallenge';
	import { rememberBotGame, rematchSetup, type BotGameSetup } from '$lib/catalog/lastBotGame';
	import { getGuestUuid } from '$lib/ingest/guestIdentity';

	// One-click rematch against the bot from the game that just finished (#215), shown on the live
	// board's end-of-game surfaces. `setup` is the FINISHED game's setup as recorded by the challenge
	// panel; the colour swap for the new game is applied here, so "rematch this game" is the whole
	// contract a caller needs to satisfy.
	//
	// The wake -> start handshake is the same one `BotChallengePanel` runs, and for the same reason:
	// a community bot scales to zero, so the one it beat five seconds ago may need a cold start
	// again. Unlike the panel this collapses to a single click — the settings are not up for
	// discussion here, they are the ones just played — so the wake phase shows on the button itself
	// rather than gating a config step.
	let { setup }: { setup: BotGameSetup } = $props();

	type Phase = 'idle' | 'waking' | 'starting' | 'dead' | 'busy';
	let phase = $state<Phase>('idle');
	let error = $state<string | null>(null);

	// Guards the async flow: if the board navigates away mid-request, the continuation must not
	// redirect or touch state — same guard the challenge panel keeps.
	let destroyed = false;
	onDestroy(() => {
		destroyed = true;
	});

	const label = $derived(
		phase === 'waking' ? 'Waking the bot…' : phase === 'starting' ? 'Starting…' : 'Rematch →',
	);

	async function rematch() {
		if (phase === 'waking' || phase === 'starting') return;
		phase = 'waking';
		error = null;
		try {
			const wake = await wakeBot(setup.team, setup.name);
			if (destroyed) return;
			if (wake.busy) {
				phase = 'busy';
				return;
			}
			if (!wake.alive) {
				phase = 'dead';
				return;
			}
		} catch {
			if (destroyed) return;
			phase = 'dead';
			return;
		}

		phase = 'starting';
		const next = rematchSetup(setup);
		try {
			const { match, url } = await startBotGame(
				{
					guestId: getGuestUuid(),
					team: next.team,
					name: next.name,
					timeControl: next.timeControl,
					...(next.preferredColor === 'random' ? {} : { preferredColor: next.preferredColor }),
					rated: next.rated,
				},
				location.origin,
			);
			if (destroyed) return;
			// Remember the new game too, or the rematch of a rematch would have nothing to replay.
			rememberBotGame({ ...next, gameId: match.gameId });
			window.location.href = url;
		} catch (e) {
			if (destroyed) return;
			error = describeStartFailure(e);
			phase = 'idle';
		}
	}
</script>

<div class="flex w-full flex-col gap-2">
	{#if phase === 'dead'}
		<p class="text-center text-sm text-danger" role="alert">This bot isn't answering right now.</p>
	{:else if phase === 'busy'}
		<p class="text-center text-sm text-content-muted" role="status">
			This bot is playing right now — try again in a few minutes.
		</p>
	{:else if error}
		<p class="text-center text-sm text-danger" role="alert">{error}</p>
	{/if}

	<button
		type="button"
		onclick={rematch}
		disabled={phase === 'waking' || phase === 'starting'}
		aria-live="polite"
		class="w-full rounded-xl bg-primary py-2.5 text-center font-bold text-primary-content shadow-md transition-colors hover:bg-primary-hover disabled:opacity-60"
	>
		{phase === 'dead' || phase === 'busy' ? 'Try again' : label}
	</button>
</div>
