<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { resolve } from '$app/paths';
	import { createGame, isLiveEnabled } from '#lib/live/liveApi.js';
	import { buildJoinUrl, resolveSeats } from '#lib/live/seatLink.js';
	import { getGuestUuid } from '#lib/ingest/guestIdentity.js';
	import { timeControlChoices, timeControlPresets } from '#lib/live/timeControls.js';
	import { SEAT_LABELS } from '#lib/live/playerLabel.js';
	import GameSetupPanel from '../../components/GameSetupPanel.svelte';
	import type { Seat } from '#lib/live/liveTypes.js';

	type ColorChoice = Seat | 'random';
	// The setup panel speaks of three colours; `resolveSeats` takes a seat or 'random'.
	const COLOR_VALUES = { random: 'random', white: 'White', black: 'Black' } as const;

	let creating = $state(false);
	let error = $state<string | null>(null);
	let shareUrl = $state<string | null>(null);
	let boardUrl = $state<string | null>(null);
	let copied = $state(false);
	let selected = $state(0); // index into presets
	let chosenLabel = $state('Unlimited'); // the control the created game actually used
	let preferredColor = $state<ColorChoice>('random');
	let yourSeat = $state<Seat>('White'); // the colour actually assigned once the game is created
	const opponentSeat = $derived<Seat>(yourSeat === 'White' ? 'Black' : 'White');

	async function create() {
		creating = true;
		error = null;
		try {
			const guest = getGuestUuid();
			const preset = timeControlPresets[selected];
			const res = await createGame(guest, guest, preset.value);
			chosenLabel = preset.label;
			const white = res.tokens.find((t) => t.seat === 'White');
			const black = res.tokens.find((t) => t.seat === 'Black');
			if (!white || !black) throw new Error('Server did not return both seat tokens');
			// Both seats are already registered to this guest — "colour choice" is just which token
			// we keep for our own board vs. which one goes into the friend's link. Random is resolved
			// here, at creation time, not deferred until the friend joins.
			const { mine, theirs } = resolveSeats(preferredColor, white, black);
			yourSeat = mine.seat;
			shareUrl = buildJoinUrl(location.origin, res.gameId, theirs.token, theirs.seat);
			boardUrl = `${resolve('/live/[id]', { id: res.gameId })}?seat=${encodeURIComponent(mine.token)}&as=${mine.seat === 'White' ? 'white' : 'black'}`;
		} catch {
			// Any failure here — unreachable server, a bad response, a malformed body — means the same
			// thing to the player: live play isn't working right now. Show one honest, non-technical
			// message instead of a raw fetch exception or status code.
			error = 'Live play is unavailable right now — try again in a minute.';
		} finally {
			creating = false;
		}
	}

	async function copy() {
		if (!shareUrl || !navigator.clipboard) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// Clipboard write was blocked/rejected; the link stays selectable for manual copy.
		}
	}
</script>

<section class="max-w-md mx-auto flex flex-col gap-6">
	<h2 class="text-2xl font-bold text-content">Play a friend</h2>

	{#if !isLiveEnabled()}
		<p class="text-content-muted">
			Live play is not configured. Set <code>VITE_PLAY_API_URL</code> to the play-api server.
		</p>
	{:else if !shareUrl}
		<p class="text-content-muted">
			Create a game, send the link to your opponent, and open your board.
		</p>
		<!-- A game by link is always casual: both seats are registered to the creator. -->
		<GameSetupPanel
			name="friend"
			timeGroups={timeControlChoices()}
			bind:time={selected}
			colorValues={COLOR_VALUES}
			bind:color={preferredColor}
			rating="casual"
			actionLabel="Create game"
			busyLabel="Creating…"
			busy={creating}
			onstart={create}
			{error}
		/>
	{:else}
		<p class="text-sm text-content-muted">
			Time control: <span class="text-content font-bold">{chosenLabel}</span> · You play
			<span class="text-content font-bold">{SEAT_LABELS[yourSeat]}</span>
		</p>
		<div class="flex flex-col gap-2">
			<span class="text-sm font-bold text-content-muted"
				>Send this link to your opponent ({SEAT_LABELS[opponentSeat]}):</span
			>
			<div class="flex gap-2">
				<input
					readonly
					value={shareUrl}
					class="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-content text-sm font-mono"
				/>
				<button
					type="button"
					onclick={copy}
					class="px-4 py-2 rounded-lg bg-surface border border-border text-content-muted hover:text-content font-bold"
				>
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>
		</div>
		<!-- boardUrl is built with resolve() above; the rule just can't trace it through a variable
		     (it also carries a ?seat=…&as=… query that resolve() can't express). -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href={boardUrl}
			class="px-6 py-3 rounded-xl bg-primary text-primary-content font-bold text-lg text-center shadow-lg shadow-primary/30 hover:bg-primary-hover transition-colors"
		>
			Open your board →
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{/if}
</section>
