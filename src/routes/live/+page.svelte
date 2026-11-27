<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { createGame, isLiveEnabled } from '#lib/live/liveApi.js';
	import { buildJoinUrl, resolveSeats } from '#lib/live/seatLink.js';
	import { rememberFriendInvite } from '#lib/live/friendInvite.js';
	import { getGuestUuid } from '#lib/ingest/guestIdentity.js';
	import { timeControlChoices, timeControlPresets } from '#lib/live/timeControls.js';
	import GameSetupPanel from '../../components/GameSetupPanel.svelte';
	import type { Seat } from '#lib/live/liveTypes.js';

	type ColorChoice = Seat | 'random';
	// The setup panel speaks of three colours; `resolveSeats` takes a seat or 'random'.
	const COLOR_VALUES = { random: 'random', white: 'White', black: 'Black' } as const;

	let creating = $state(false);
	let error = $state<string | null>(null);
	let selected = $state(0); // index into presets
	let preferredColor = $state<ColorChoice>('random');

	async function create() {
		creating = true;
		error = null;
		try {
			const guest = getGuestUuid();
			const preset = timeControlPresets[selected];
			const res = await createGame(guest, guest, preset.value);
			const white = res.tokens.find((t) => t.seat === 'White');
			const black = res.tokens.find((t) => t.seat === 'Black');
			if (!white || !black) throw new Error('Server did not return both seat tokens');
			// Both seats are already registered to this guest — "colour choice" is just which token
			// we keep for our own board vs. which one goes into the friend's link. Random is resolved
			// here, at creation time, not deferred until the friend joins.
			const { mine, theirs } = resolveSeats(preferredColor, white, black);
			// Straight to the board (#256): the game is running from the moment it is created, so
			// the creator should be looking at it, not at a setup page. The link for the friend
			// travels through session storage, never through the address: the board's address is
			// what people copy, and it must carry no seat but the creator's own.
			rememberFriendInvite(
				res.gameId,
				buildJoinUrl(location.origin, res.gameId, theirs.token, theirs.seat),
			);
			// Full navigation: the board page connects fresh from the seat token in the URL, the
			// same way the lobby goes to a board.
			window.location.href = buildJoinUrl(location.origin, res.gameId, mine.token, mine.seat);
		} catch {
			// Any failure here — unreachable server, a bad response, a malformed body — means the same
			// thing to the player: live play isn't working right now. Show one honest, non-technical
			// message instead of a raw fetch exception or status code.
			error = 'Live play is unavailable right now — try again in a minute.';
			creating = false;
		}
	}
</script>

<section class="max-w-md mx-auto flex flex-col gap-6">
	<h2 class="text-2xl font-bold text-content">Play a friend</h2>

	{#if !isLiveEnabled()}
		<p class="text-content-muted">
			Live play is not configured. Set <code>VITE_PLAY_API_URL</code> to the play-api server.
		</p>
	{:else}
		<p class="text-content-muted">
			Create a game and you go straight to your board, with the link to send to your opponent.
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
	{/if}
</section>
