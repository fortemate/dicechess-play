<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { isLiveEnabled } from '#lib/live/liveApi.js';
	import { createFriendGame, FRIEND_COLOR_VALUES, type FriendColor } from '#lib/live/friendGame.js';
	import { timeControlChoices, timeControlPresets } from '#lib/live/timeControls.js';
	import GameSetupPanel from '../../components/GameSetupPanel.svelte';

	let creating = $state(false);
	let error = $state<string | null>(null);
	let selected = $state(0); // index into presets
	let preferredColor = $state<FriendColor>('random');

	async function create() {
		creating = true;
		error = null;
		try {
			// Straight to the board (#256). The same start as the friend tab of Play (#258): see
			// `friendGame.ts` for what it does and why. Full navigation: the board page connects
			// fresh from the seat token in the URL, the same way the lobby goes to a board.
			window.location.href = await createFriendGame(
				timeControlPresets[selected].value,
				preferredColor,
				location.origin,
			);
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
			colorValues={FRIEND_COLOR_VALUES}
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
