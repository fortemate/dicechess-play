<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { onDestroy } from 'svelte';
	import { authStore } from '$lib/authStore.svelte';
	import { getGuestUuid } from '$lib/ingest/guestIdentity';
	import { wakeBot } from '$lib/catalog/catalogApi';
	import { describeStartFailure, startBotGame } from '$lib/catalog/botChallenge';
	import { rememberBotGame } from '$lib/catalog/lastBotGame';
	import { botTimeControlPresets, defaultBotTimeControlIndex } from '$lib/live/timeControls';
	import { preferencesStore } from '$lib/preferencesStore.svelte';
	import BotTimeControlPicker from './BotTimeControlPicker.svelte';
	import RatedChoice from './RatedChoice.svelte';
	import Spinner from './Spinner.svelte';

	// The wake -> configure -> start flow for challenging a rated bot, shared by the catalog card
	// (src/routes/bots) and each bot's profile page (src/routes/bots/[team]/[name]): click wakes the
	// bot (a scale-to-zero endpoint may need a cold start), then — if it answered — offers the game
	// config inline. Only team/name are needed; callers own their own layout/wrapper around this panel.
	let { team, name }: { team: string; name: string } = $props();

	// 'busy' is distinct from 'dead': the bot answered nothing because the server never asked it to
	// (it's at its declared concurrent-game limit) — a visitor should be told to come back shortly,
	// not that the bot looks broken.
	type Phase = 'idle' | 'waking' | 'dead' | 'busy' | 'ready' | 'starting';
	type ColorChoice = 'random' | 'White' | 'Black';
	let phase = $state<Phase>('idle');

	// Reflect the persisted setup (#212) so the panel comes up the way it was last left, on any
	// bot's page. Looked up by label rather than trusting a stored index, same reasoning as
	// `defaultBotTimeControlIndex` above it — a preset list reorder must not silently point at the
	// wrong entry, it should just fall back to the default.
	const storedTimeControlIndex = () => {
		const i = botTimeControlPresets.findIndex(
			(p) => p.label === preferencesStore.botChallengeTimeControl,
		);
		return i >= 0 ? i : defaultBotTimeControlIndex;
	};

	let selectedTimeControl = $state(storedTimeControlIndex());
	let preferredColor = $state<ColorChoice>(preferencesStore.botChallengeColor);
	// Casual unless the visitor is signed in AND asks for rated — RatedChoice owns that gate (#279).
	// Seeded from the stored preference; RatedChoice forces it back to false itself if it turns out
	// nobody is signed in.
	let rated = $state(preferencesStore.botChallengeRated);
	let error = $state<string | null>(null);
	// Guards the async start() flow below: if the panel unmounts (visitor navigates away) while
	// playBot is in flight, the resolved/rejected continuation must not redirect or touch state.
	let destroyed = false;
	onDestroy(() => {
		destroyed = true;
	});

	const colorOptions: readonly { value: ColorChoice; label: string }[] = [
		{ value: 'random', label: 'Random' },
		{ value: 'White', label: 'White' },
		{ value: 'Black', label: 'Black' },
	];

	// Every non-config phase shares ONE button that stays in the same place (#219): a card that
	// swapped the button out for a line of text read as a dead click, and the wake handshake can take
	// several seconds against a scaled-to-zero bot. Label and styling change, the element does not.
	const wakeLabel = $derived(
		phase === 'waking' ? 'Waking the bot…' : phase === 'idle' ? 'Play →' : 'Try again',
	);
	const wakeButtonTone = $derived(
		phase === 'idle' || phase === 'waking'
			? 'bg-primary text-primary-content hover:bg-primary-hover'
			: 'border border-border bg-surface text-content-muted hover:text-content',
	);

	async function wake() {
		// The button is disabled while waking, but a second click can still land before Svelte has
		// flushed that — and a duplicate wake would let a late first answer overwrite a later one.
		if (phase === 'waking') return;
		phase = 'waking';
		error = null;
		try {
			const result = await wakeBot(team, name);
			if (destroyed) return;
			phase = result.busy ? 'busy' : result.alive ? 'ready' : 'dead';
		} catch {
			if (destroyed) return;
			phase = 'dead';
		}
	}

	async function start() {
		if (phase === 'starting') return;
		phase = 'starting';
		error = null;
		// Persist the setup (#212) so the next bot panel opens the same way. `rated` only persists
		// for a signed-in account: RatedChoice's gate may have just forced this visitor's `rated`
		// to false because they aren't signed in (or the session is still resolving), and that is
		// not a real choice — persisting it here would silently wipe a stored `true` on every
		// signed-out visit.
		if (authStore.status === 'signed-in') {
			preferencesStore.setBotChallengeRated(rated);
		}
		preferencesStore.setBotChallengeTimeControl(botTimeControlPresets[selectedTimeControl].label);
		preferencesStore.setBotChallengeColor(preferredColor);
		const timeControl = botTimeControlPresets[selectedTimeControl].value;
		try {
			const { match, url } = await startBotGame(
				{
					guestId: getGuestUuid(),
					team,
					name,
					timeControl,
					...(preferredColor === 'random' ? {} : { preferredColor }),
					// Sent even when false, unlike preferredColor: there `false` has no meaning but omission
					// does (random seat), whereas casual is a real, statable choice.
					rated,
				},
				location.origin,
			);
			if (destroyed) return;
			// Record the exact request against the game it produced, so the board can offer a
			// same-settings rematch when this game ends (#215). The live wire carries no time control
			// and no parseable bot identity, so this is the only place that knows.
			rememberBotGame({ gameId: match.gameId, team, name, timeControl, preferredColor, rated });
			// Full navigation: the board page connects fresh from the seat token in the URL — same
			// pattern the lobby's seek-accept flow uses (see lobby/+page.svelte's goToBoard).
			window.location.href = url;
		} catch (e) {
			if (destroyed) return;
			error = describeStartFailure(e);
			phase = 'ready';
		}
	}
</script>

{#if phase === 'idle' || phase === 'waking' || phase === 'dead' || phase === 'busy'}
	<div class="flex flex-col gap-2">
		{#if phase === 'dead'}
			<p class="text-sm text-danger" role="alert">This bot isn't answering right now.</p>
		{:else if phase === 'busy'}
			<p class="text-sm text-content-muted" role="status">
				This bot is playing right now — try again in a few minutes.
			</p>
		{/if}
		<button
			type="button"
			onclick={wake}
			disabled={phase === 'waking'}
			aria-busy={phase === 'waking'}
			aria-live="polite"
			class="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors disabled:opacity-60 {wakeButtonTone}"
		>
			{#if phase === 'waking'}<Spinner />{/if}
			{wakeLabel}
		</button>
	</div>
{:else}
	<div class="flex flex-col gap-3">
		<BotTimeControlPicker
			presets={botTimeControlPresets}
			name="botTimeControl-{team}-{name}"
			bind:selected={selectedTimeControl}
		/>

		<fieldset class="flex flex-col gap-1.5">
			<legend class="text-[10px] font-bold tracking-widest text-content-muted/80 uppercase">
				Color
			</legend>
			<div class="flex flex-wrap gap-2">
				{#each colorOptions as opt (opt.value)}
					<label
						class="cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors focus-within:ring-2 focus-within:ring-primary/50
							{preferredColor === opt.value
							? 'border-primary bg-primary text-primary-content'
							: 'border-border bg-surface text-content-muted hover:text-content'}"
					>
						<input
							type="radio"
							name="preferredColor-{team}-{name}"
							value={opt.value}
							bind:group={preferredColor}
							class="sr-only"
						/>
						{opt.label}
					</label>
				{/each}
			</div>
		</fieldset>

		<RatedChoice bind:rated name="{team}-{name}" />

		{#if error}<p class="text-sm text-danger" role="alert">{error}</p>{/if}

		<button
			type="button"
			onclick={start}
			disabled={phase === 'starting'}
			aria-busy={phase === 'starting'}
			aria-live="polite"
			class="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-content transition-colors hover:bg-primary-hover disabled:opacity-60"
		>
			{#if phase === 'starting'}<Spinner />{/if}
			{phase === 'starting' ? 'Starting…' : 'Start game'}
		</button>
	</div>
{/if}
