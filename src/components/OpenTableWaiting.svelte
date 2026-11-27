<script lang="ts">
	// Waiting at one's own table (#256), shared by the lobby and the open-table tab of Play (#258).
	//
	// The wait happens on the board, not inside a list: the game frame with an untouched starting
	// position, both clocks standing at what they will start from, and one way out, which closes
	// the table. No game exists yet, so there is nothing to resign and no move to list.
	//
	// The component owns the wait: it asks for the status of the seek until someone sits down,
	// then goes to the board as whichever seat the server drew (never assume White, see play-api
	// #95). Closing tells the server, best effort; its own time limit reaps the seek anyway.
	import { cancelSeek, seekStatus } from '#lib/live/lobbyApi.js';
	import type { OpenTable } from '#lib/live/openTable.js';
	import { buildJoinUrl } from '#lib/live/seatLink.js';
	import { m } from '#lib/paraglide/messages.js';
	import { preferencesStore } from '#lib/preferencesStore.svelte.js';
	import { chromeStore } from '#lib/stores/chromeStore.svelte.js';
	import GameFrame from './GameFrame.svelte';
	import GameWaitingCard from './GameWaitingCard.svelte';
	import MiniBoard from './MiniBoard.svelte';
	import MoveList from './MoveList.svelte';
	import PlayerStrip from './PlayerStrip.svelte';
	import RatedBadge from './RatedBadge.svelte';

	interface Props {
		table: OpenTable;
		/** The table is closed: the caller goes back to what it showed before. */
		onclose: () => void;
	}

	let { table, onclose }: Props = $props();

	const STATUS_POLL_MS = 1500;
	const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

	$effect(() => {
		const { id, secret } = table;
		let alive = true;
		const tick = async () => {
			try {
				const status = await seekStatus(id, secret);
				if (alive && status.matched && status.gameId && status.token && status.seat) {
					// Full navigation: the board page connects fresh from the seat token in the address.
					window.location.href = buildJoinUrl(
						location.origin,
						status.gameId,
						status.token,
						status.seat,
					);
				}
			} catch {
				/* transient: keep waiting */
			}
		};
		// At once, so a match that already happened does not wait for the first interval.
		void tick();
		const timer = setInterval(tick, STATUS_POLL_MS);
		return () => {
			alive = false;
			clearInterval(timer);
		};
	});

	// The page is a board now: the site header gets out of the way, as it does in a game.
	$effect(() => {
		chromeStore.zen = true;
		return () => {
			chromeStore.zen = false;
		};
	});

	function close() {
		const { id, secret } = table;
		onclose(); // stops the wait at once
		cancelSeek(id, secret).catch(() => {
			/* best effort: the server reaps the seek anyway */
		});
	}
</script>

<GameFrame
	title={m.game_waiting_table_frame_title({ time: table.label })}
	onleave={close}
	sound={{
		enabled: preferencesStore.soundEnabled,
		toggle: () => preferencesStore.setSoundEnabled(!preferencesStore.soundEnabled),
	}}
>
	{#snippet status()}
		<!-- Echoes what was asked for; the server is the authority and degrades the flag if the
		     session turns out to be absent, which RatedChoice's own gate already prevents. -->
		{#if table.rated}<RatedBadge sizeClass="text-xs" />{/if}
	{/snippet}
	{#snippet top()}
		<PlayerStrip
			name={m.game_waiting_table_opponent()}
			sub={m.game_waiting_table_opponent_sub()}
			compact
			clockMs={table.clockMs}
		/>
	{/snippet}
	{#snippet board()}
		<div class="relative aspect-square w-full overflow-hidden rounded-xl shadow-lg">
			<MiniBoard fen={START_FEN} />
		</div>
	{/snippet}
	{#snippet bottom()}
		<PlayerStrip
			name={m.common_player_you()}
			sub={m.game_waiting_table_you_sub()}
			compact
			clockMs={table.clockMs}
		/>
	{/snippet}
	{#snippet card()}
		<GameWaitingCard
			title={m.game_waiting_table_title()}
			text={m.game_waiting_table_text()}
			closeLabel={m.game_waiting_table_close()}
			onclose={close}
		/>
	{/snippet}
	{#snippet moves(closeSheet)}
		<MoveList
			historyBlocks={[]}
			currentMoveIndex={0}
			maxMoveIndex={0}
			onSetMove={() => {}}
			keyboardNavEnabled={false}
			onclose={closeSheet}
		/>
	{/snippet}
</GameFrame>
