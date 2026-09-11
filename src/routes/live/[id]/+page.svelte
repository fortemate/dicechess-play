<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import Board from '../../../components/Board.svelte';
	import PawnPromotionSelector from '../../../components/PawnPromotionSelector.svelte';
	import PlayerStrip from '../../../components/PlayerStrip.svelte';
	import DicePanel from '../../../components/DicePanel.svelte';
	import PreRollDrawGate from '../../../components/PreRollDrawGate.svelte';
	import MoveHistory from '../../../components/MoveHistory.svelte';
	import GameEndModal from '../../../components/GameEndModal.svelte';
	import BotRematchButton from '../../../components/BotRematchButton.svelte';
	import RematchControl from '../../../components/RematchControl.svelte';
	import SpectatorFollowPanel from '../../../components/SpectatorFollowPanel.svelte';
	import { recallBotGame } from '$lib/catalog/lastBotGame';
	import RatedBadge from '../../../components/RatedBadge.svelte';
	import RatingDeltaLine from '../../../components/RatingDeltaLine.svelte';
	import { chromeStore } from '$lib/stores/chromeStore.svelte';
	import { LiveGameStore } from '$lib/live/liveGameStore.svelte';
	import { RematchStore } from '$lib/live/rematchStore.svelte';
	import { SpectatorFollowStore } from '$lib/live/spectatorFollowStore.svelte';
	import { isLiveEnabled } from '$lib/live/liveApi';
	import { buildJoinUrl, buildSpectateUrl, parseSeat } from '$lib/live/seatLink';
	import { buildReplayUrl, hasReplay } from '$lib/live/replayLink';
	import {
		SEAT_LABELS,
		publicPlayer,
		seatDisplayName,
		seatDisplaySub,
		seatRating,
	} from '$lib/live/playerLabel';
	import { preferencesStore } from '$lib/preferencesStore.svelte';
	import { preloadSounds } from '$lib/sound';
	import { endReasonLabel } from '$lib/gameOutcome';
	import { toastStore } from '$lib/toastStore.svelte';
	import { fetchGameRatingChange } from '$lib/live/ratingApi';
	import { ratingPollStep, type RatingOutcome } from '$lib/live/ratingDelta';
	import type { Seat } from '$lib/live/liveTypes';
	import { RESIGN_CONFIRM_MS } from '$lib/timings';

	// Rating-change poll (play-api #296): GameEnded carries no delta — rating application is an
	// asynchronous batch job — so the client asks the game's own rating endpoint until the batch
	// reports it applied, and gives up silently if it never does.
	//
	// The window is deliberately generous — three minutes, at a cadence that costs a dozen small
	// requests in the normal case: play-api's batch polls its queue every RATING_INTERVAL_SECONDS
	// (60 by default) and drains a backlog oldest-first, so a delta arriving a minute or more after
	// the game ends is normal, not a fault. The old 10s window was sized for a poll that stopped at
	// the first CHANGED profile rating — which is exactly what made it report the previous game's
	// change instead of this one's (#235).
	const RATING_POLL_MS = 5000;
	const RATING_POLL_ATTEMPTS = 36;

	const wideScreen = () =>
		typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

	const live = new LiveGameStore();

	let confirmResign = $state(false);
	let showHistory = $state(wideScreen());

	function setMove(index: number) {
		live.setMoveIndex(index);
	}

	function onKeydown(event: KeyboardEvent) {
		// Disable keyboard navigation during active game play to prevent accidental jumps, unless spectating
		if (live.gameStatus !== 'over' && !live.spectator) return;

		const el = document.activeElement;
		if (
			el &&
			(el.tagName === 'INPUT' ||
				el.tagName === 'TEXTAREA' ||
				el.tagName === 'SELECT' ||
				el.hasAttribute('contenteditable'))
		) {
			return;
		}

		switch (event.key) {
			case 'ArrowLeft':
				setMove(live.currentMoveIndex - 1);
				event.preventDefault();
				break;
			case 'ArrowRight':
				setMove(live.currentMoveIndex + 1);
				event.preventDefault();
				break;
			case 'Home':
				setMove(0);
				event.preventDefault();
				break;
			case 'End':
				setMove(live.maxMoveIndex);
				event.preventDefault();
				break;
		}
	}

	$effect(() => {
		// Reset showHistory to default wideScreen value when game changes
		if (page.params.id) {
			showHistory = wideScreen();
		}
	});

	// Board is shown from the player's side (white for spectators), so the opponent's clock sits on top.
	const bottomSeat = $derived<Seat>(live.playerColor === 'b' ? 'Black' : 'White');
	const topSeat = $derived<Seat>(bottomSeat === 'White' ? 'Black' : 'White');
	const clockMs = (seat: Seat): number | undefined =>
		live.hasClocks ? (seat === 'White' ? live.whiteClockMs : live.blackClockMs) : undefined;
	// Turn highlight follows the PRESENTED position (consistent with board/dice pacing) and is
	// deliberately independent of clocks: tickingClockSeat is null in unlimited games and nulled
	// between turns, which used to leave the highlight dark or blinking.
	const isActiveSeat = (seat: Seat): boolean =>
		live.gameStatus !== 'over' &&
		live.gameStatus !== 'connecting' &&
		(seat === 'White') === (live.activeColor === 'w');

	// One unmistakable your-move cue: a persistent line by the dice panel + a title marker.
	// gameStatus === 'playing' is live truth (my dice are pending). The presented activeColor
	// additionally delays the cue during catch-up pacing until my roll visually lands — but a
	// deliberate manual scrub must NOT flicker it off: it is still my move while I browse.
	const myMove = $derived(
		!live.spectator &&
			live.gameStatus === 'playing' &&
			(live.isManuallyBrowsing || live.activeColor === live.playerColor),
	);
	const turnLine = $derived.by(() => {
		if (live.gameStatus === 'over' || live.gameStatus === 'connecting') return null;
		if (live.rematchStartup?.phase === 'awaiting_joins') {
			return awaitingOpponentText;
		}
		if (live.spectator) return live.activeColor === 'w' ? 'White to move' : 'Black to move';
		return myMove ? 'Your move' : 'Waiting for opponent…';
	});
	// The end-of-game modal shows once per finished game; dismissing reveals the board with
	// the side-rail card as fallback. Any transition away from 'over' (new game) re-arms it.
	let endModalDismissed = $state(false);
	$effect(() => {
		if (live.gameStatus !== 'over') endModalDismissed = false;
	});
	// The modal belongs to a game the viewer watched finish. A result read back from the archive
	// (#109) is news about the past — a spectator opening an old link, or a player returning to a
	// rematch that timed out while they were away — so it lands in the panel, not over the board.
	const showEndModal = $derived(
		live.gameStatus === 'over' && !endModalDismissed && !live.finishedFromArchive,
	);
	const endTone = $derived(
		live.outcome === 'won'
			? ('win' as const)
			: live.outcome === 'lost'
				? ('loss' as const)
				: ('neutral' as const),
	);

	const seatName = (seat: Seat): string =>
		seatDisplayName(live.players, seat, bottomSeat, live.spectator);
	const seatSub = (seat: Seat): string => seatDisplaySub(live.players, seat, live.spectator);
	const seatIsBot = (seat: Seat): boolean => publicPlayer(live.players, seat)?.kind === 'Bot';
	const seatRatingOf = (seat: Seat): number | undefined => seatRating(live.players, seat);

	// A seat's name links to its public profile once the game is over — never mid-game, so the board
	// stays free of accidental navigation (#213). Only a registered human has one; bots and
	// unregistered guests don't, so they stay plain text.
	const seatProfileHref = (seat: Seat): string | undefined => {
		if (live.gameStatus !== 'over') return undefined;
		const face = publicPlayer(live.players, seat);
		return face?.kind === 'Human' && face.name
			? resolve('/players/[nickname]', { nickname: face.name })
			: undefined;
	};

	// THIS game's rating change for the local player, as recorded by the server (see the
	// RATING_POLL_* constants above). Never a guess, and in particular never a diff of the player's
	// current rating against an earlier one. `null` means "nothing to say at all": not a rated game
	// of mine, or the poll ran out of patience — as opposed to `waiting`, which says the batch simply
	// has not got here yet and is worth showing.
	let ratingOutcome = $state<RatingOutcome | null>(null);
	$effect(() => {
		ratingOutcome = null;
		const gameId = page.params.id;
		if (!gameId || live.gameStatus !== 'over' || live.spectator || !live.rated) return;
		const seat = bottomSeat;
		// Announce the wait before the first request resolves: the batch is a minute behind at worst,
		// and a blank minute is what made this look broken rather than busy.
		ratingOutcome = { kind: 'waiting' };

		let alive = true;
		let attempts = 0;
		let timer: ReturnType<typeof setInterval> | undefined;
		const stop = () => {
			alive = false;
			clearInterval(timer);
		};
		/** Giving up is a state change, not just a stopped timer: leaving `waiting` on screen forever
		 * would promise a number that is no longer coming. */
		const giveUp = () => {
			ratingOutcome = null;
			stop();
		};
		const tick = async () => {
			attempts += 1;
			try {
				const change = await fetchGameRatingChange(gameId);
				if (!alive) return;
				// null is permanent (no such game / a server that records no ratings), so stop showing
				// a wait; a pending answer is the normal case for a game that just ended.
				if (change === null) return giveUp();
				const step = ratingPollStep(change, seat);
				ratingOutcome = step.outcome;
				if (step.done) stop();
			} catch {
				/* transient — keep trying within the attempt cap */
			}
		};
		tick();
		timer = setInterval(() => {
			if (attempts >= RATING_POLL_ATTEMPTS) return giveUp();
			tick();
		}, RATING_POLL_MS);
		return stop;
	});

	// A finished game's primary action depends on who the OPPONENT was (never the viewer's own
	// seat — a spectator has no opponent of their own, hence the !live.spectator guard): rematching
	// a bot returns to the catalog (wake re-confirms it, since its webhook may have gone quiet
	// since); rematching a human goes back to the lobby to find a new one. Previously this was a
	// hardcoded link to /live (play-a-friend) regardless of context.
	const opponentIsBot = $derived(!live.spectator && seatIsBot(topSeat));

	// The recorded setup for THIS game, when it is a bot game this browser started (#215) — the one
	// case where a same-settings rematch is a promise we can keep, since the live wire carries
	// neither the time control nor a parseable bot identity. Arriving at a finished game by link or
	// in another browser leaves it null, and the pre-existing actions stand unchanged.
	const rematchOffer = $derived.by(() => {
		if (live.gameStatus !== 'over' || !opponentIsBot) return null;
		const id = page.params.id;
		return id ? recallBotGame(id) : null;
	});

	const effectiveTermination = $derived(live.authoritativeOver?.termination ?? live.termination);
	const rematchEligible = $derived(
		!live.spectator && !opponentIsBot && !live.doubling && effectiveTermination !== 'Aborted',
	);

	const rematchStore = new RematchStore();
	const followStore = new SpectatorFollowStore();
	// Only a seatless viewer follows a chain, and only where live play is configured at all.
	const spectatorFollows = $derived(live.spectator && isLiveEnabled());
	// The follow panel normally lives on the end-of-game surfaces, which need the socket to have
	// reported the ending. A spectator who reloads on a game that is already over never gets that:
	// the room is evicted with the game, so the board sits in 'connecting' forever. Their choice to
	// stay here — and the successor they were offered — must survive that, so the rail carries the
	// panel too whenever the follower has something a finished game can say: a live offer window
	// (`deadlineAt`, which an in-progress or ineligible game never has) or a committed successor.
	const railFollowPanel = $derived(
		spectatorFollows && (followStore.status === 'matched' || followStore.deadlineAt !== null),
	);

	$effect(() => {
		const gameId = page.params.id;
		const eligible = rematchEligible;
		const authoritativeOver = live.authoritativeOver;
		if (!gameId || !eligible || !authoritativeOver) {
			untrack(() => rematchStore.dispose());
			return;
		}
		const { token } = parseSeat(page.url);
		untrack(() => {
			rematchStore.onMatched = (nextGameId, join) => {
				const nextUrl = buildJoinUrl(location.origin, nextGameId, join.token, join.seat);
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				void goto(nextUrl);
			};
			rematchStore.init(gameId, token);
		});
		return () => {
			untrack(() => rematchStore.dispose());
		};
	});

	let joinCountdown = $state<number>(0);
	$effect(() => {
		const deadlineStr = live.rematchStartup?.joinDeadlineAt;
		if (!deadlineStr || live.rematchStartup?.phase !== 'awaiting_joins') {
			joinCountdown = 0;
			return;
		}
		const update = () => {
			const diff = new Date(deadlineStr).getTime() - Date.now();
			joinCountdown = Math.max(0, Math.ceil(diff / 1000));
		};
		update();
		const interval = setInterval(update, 250);
		return () => clearInterval(interval);
	});

	const awaitingOpponentText = $derived(
		joinCountdown > 0 ? `Awaiting opponent… (${joinCountdown}s)` : 'Awaiting opponent…',
	);

	// The finished game's public replay (#216). Available to spectators too — the replay wire is
	// anonymized, and someone who watched the game has as much reason to keep the link as a player.
	const replayId = $derived.by(() => {
		const id = page.params.id;
		return id && hasReplay(live.gameStatus, live.termination) ? id : null;
	});

	let copiedLink = $state(false);
	async function copyReplayLink() {
		if (!replayId) return;
		try {
			await navigator.clipboard.writeText(buildReplayUrl(location.origin, replayId));
			copiedLink = true;
			setTimeout(() => (copiedLink = false), 1500);
		} catch {
			// Blocked or unavailable clipboard (insecure context, permission denied). "Watch replay"
			// sits right next to this, so the address bar is one click away — say that instead of
			// failing silently.
			toastStore.error('Could not copy — open the replay and copy the address instead.');
		}
	}

	// The board is the primary element: hide the app chrome while on the live board.
	$effect(() => {
		chromeStore.zen = true;
		return () => {
			chromeStore.zen = false;
		};
	});

	// (Re)connect when the game id changes; tear the socket down on teardown/navigation.
	$effect(() => {
		const id = page.params.id;
		if (!id) return;
		const { token, as, spectate } = parseSeat(page.url);
		preloadSounds(); // fetch + arm the gesture unlock before the first roll arrives
		live.connect(id, token, as, spectate);
		return () => live.dispose();
	});

	// Spectator continuation (#106). A watched game's room — and with it the socket — is gone the
	// moment the game ends, so following the same two people into their rematch is a public read of
	// its own, never a seat: `SpectatorFollowStore` polls the continuation and opens each successor
	// in explicit spectator mode. Players never follow this way; their own rematch control carries
	// them into the successor holding a seat.
	$effect(() => {
		const id = page.params.id;
		if (!id || !spectatorFollows) {
			untrack(() => followStore.dispose());
			return;
		}
		untrack(() => {
			followStore.onFollow = (nextGameId) => {
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				void goto(buildSpectateUrl(location.origin, nextGameId));
			};
			followStore.init(id);
		});
		return () => {
			untrack(() => followStore.dispose());
		};
	});

	// The watched game reaching its end is what opens the offer window; from here the follower
	// reads on its own, independently of the socket that is about to close.
	$effect(() => {
		if (live.gameStatus === 'over' && spectatorFollows) {
			untrack(() => followStore.sourceEnded());
		}
	});

	const statusText = $derived.by(() => {
		// A dropped connection should show through whatever the last game status was (until it's over).
		if (live.connection === 'closed' && live.gameStatus !== 'over') return 'Disconnected.';
		// Mid-game 'connecting' means a reconnect is in flight (the initial connect still says "Connecting…").
		if (
			live.connection === 'connecting' &&
			live.gameStatus !== 'connecting' &&
			live.gameStatus !== 'over'
		)
			return 'Reconnecting…';
		// Only while the game is still open: a rematch that aborts on the first-join gate is evicted
		// with this phase still on record, and the seat that DID join must be told it won rather than
		// left waiting for an opponent who can no longer come (#109).
		if (live.gameStatus !== 'over' && live.rematchStartup?.phase === 'awaiting_joins') {
			return awaitingOpponentText;
		}
		switch (live.gameStatus) {
			case 'connecting':
				return 'Connecting…';
			case 'playing':
				return 'Your turn.';
			case 'waiting':
				return 'Waiting for your opponent…';
			case 'over':
				if (live.termination === 'Aborted') return 'Game aborted.';
				if (live.outcome === 'won') return 'You won! 🎉';
				if (live.outcome === 'lost') return 'You lost.';
				if (live.outcome === 'draw') return 'Draw.';
				return live.winner ? `${live.winner} won.` : 'Game over.';
		}
	});

	// A dropped connection is otherwise invisible whenever dice are on the table (statusText only
	// surfaces via the dice panel's EMPTY state) — this badge is independent of dice/turn state.
	// Skipped for the very first connect: DicePanel's "Connecting…" empty-state already covers it,
	// and the badge would be redundant before there's anything else on screen.
	const connectionBadge = $derived.by(() => {
		if (live.gameStatus === 'over') return null;
		if (live.rematchStartup?.phase === 'awaiting_joins') {
			return 'Awaiting opponent';
		}
		if (live.connection === 'closed') return 'Disconnected';
		if (live.connection === 'connecting' && live.gameStatus !== 'connecting')
			return 'Reconnecting…';
		return null;
	});

	// Human wording for the wire termination enum ('by KingCaptured' read like a debug dump).
	const endReason = $derived.by(() => {
		switch (live.termination) {
			case 'KingCaptured':
				return endReasonLabel('mate');
			case 'Resign':
				return endReasonLabel('resign');
			case 'Timeout':
				return endReasonLabel('timeout');
			case 'Draw':
				return 'Draw by agreement';
			case 'DoubleDeclined':
				return endReasonLabel('double_declined');
			case 'Aborted':
			case null:
				return ''; // Aborted gets its own headline
			default:
				// A termination this build does not know (the server may add members): say something
				// neutral rather than a blank or a debug dump, and never throw.
				return 'Game over';
		}
	});

	// A no-legal-moves pass is announced as a toast — the same surface the bot game uses —
	// so both game surfaces notify identically. Fires once per dwell (LiveGameStore nulls
	// passNoticeSeat between passes); being transient, it needs no history-browsing gate.
	$effect(() => {
		const seat = live.passNoticeSeat;
		if (seat === null) return;
		if (live.spectator) {
			toastStore.info(`${SEAT_LABELS[seat]} has no legal moves — turn passed.`);
			return;
		}
		const mine = (seat === 'White') === (live.playerColor === 'w');
		toastStore.info(
			mine
				? 'You have no legal moves — turn passed.'
				: 'Opponent has no legal moves — turn passed.',
		);
	});

	// What the ½ control is doing right now, and the one sentence that explains it. The wording of the
	// forbidden state follows the server: it names a number of turns only where a deployment lets the
	// right to offer return on its own, and otherwise says plainly whose turn it is to offer.
	const drawControl = $derived(live.drawOfferControlState);
	const drawLabel = $derived.by(() => {
		switch (drawControl) {
			case 'armed':
				return 'Draw offer armed — sent when your turn completes (click to cancel)';
			case 'pending':
				return 'Draw offered — waiting for your opponent';
			case 'forbidden': {
				const turns = live.drawArmRefusal?.availableAfterTurns ?? null;
				return turns === null
					? 'Opponent must offer the next draw'
					: `Draw offer available in ${turns} ${turns === 1 ? 'turn' : 'turns'}`;
			}
			default:
				return 'Offer a draw with your next turn';
		}
	});

	let resignTimeout: ReturnType<typeof setTimeout> | undefined;

	function disarmResign() {
		clearTimeout(resignTimeout);
		confirmResign = false;
	}

	function resign() {
		if (!confirmResign) {
			confirmResign = true;
			resignTimeout = setTimeout(() => (confirmResign = false), RESIGN_CONFIRM_MS);
			return;
		}
		disarmResign();
		live.resign();
	}

	// Escape backs out of an armed resignation from anywhere; the gate handles its own Escape, and the
	// two never overlap because the resign control is only ever armed by a deliberate first press.
	function onGlobalEscape(event: KeyboardEvent) {
		if (event.key === 'Escape' && confirmResign) {
			event.preventDefault();
			disarmResign();
		}
	}

	// A tap on the board while an offer is pending declines it: before dice exist a board gesture has
	// no other meaning, and in bullet it saves the responder from aiming at a button. Guarded to the
	// responder so a spectator's click does nothing, and to a non-browsing view so scrubbing history
	// is never mistaken for an answer.
	function onBoardPointerDown() {
		if (live.isPreRollResponder && !live.isViewingHistory) live.respondDraw(false);
	}

	$effect(() => () => clearTimeout(resignTimeout));
</script>

{#snippet iconBtn(
	kind:
		| 'back'
		| 'list'
		| 'flag'
		| 'first'
		| 'prev'
		| 'next'
		| 'last'
		| 'sound-on'
		| 'sound-off'
		| 'handshake',
)}
	<svg
		viewBox="0 0 24 24"
		class="h-[17px] w-[17px]"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#if kind === 'back'}
			<path d="M19 12H6M11 6l-6 6 6 6" />
		{:else if kind === 'list'}
			<path d="M9 6h11M9 12h11M9 18h11" /><circle
				cx="5"
				cy="6"
				r="1.2"
				fill="currentColor"
				stroke="none"
			/><circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle
				cx="5"
				cy="18"
				r="1.2"
				fill="currentColor"
				stroke="none"
			/>
		{:else if kind === 'sound-on'}
			<path d="M11 5.5 6.5 9H3.5v6h3l4.5 3.5z" /><path d="M14.5 9.5a3.6 3.6 0 0 1 0 5" /><path
				d="M17 7.5a6.5 6.5 0 0 1 0 9"
			/>
		{:else if kind === 'sound-off'}
			<path d="M11 5.5 6.5 9H3.5v6h3l4.5 3.5z" /><path d="m15.5 9.5 5 5M20.5 9.5l-5 5" />
		{:else if kind === 'handshake'}
			<path
				d="m11 17 2 2a1 1 0 0 0 1.4 0l4.3-4.3a1 1 0 0 0 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0L13.5 12"
			/>
			<path d="m13 7-2-2a1 1 0 0 0-1.4 0L5.3 9.3a1 1 0 0 0 0 1.4l2.4 2.4a1 1 0 0 0 1.4 0L10.5 12" />
			<path d="m16 8 2-2a2.83 2.83 0 0 1 4 0 2.83 2.83 0 0 1 0 4l-2 2" />
			<path d="m8 16-2 2a2.83 2.83 0 0 1-4 0 2.83 2.83 0 0 1 0-4l2-2" />
		{:else}
			{#if kind === 'first'}
				<path d="M11 6l-6 6 6 6M18 6l-6 6 6 6" />
			{:else if kind === 'prev'}
				<path d="M15 6l-6 6 6 6" />
			{:else if kind === 'next'}
				<path d="M9 6l6 6-6 6" />
			{:else if kind === 'last'}
				<path d="M6 6l6 6-6 6M13 6l6 6-6 6" />
			{:else}
				<path d="M6 20V4M6 5h11l-2 3 2 3H6" />
			{/if}
		{/if}
	</svg>
{/snippet}

{#snippet endActions()}
	{#if rematchOffer}
		<BotRematchButton setup={rematchOffer} />
		<a
			href={resolve('/bots')}
			class="text-sm font-semibold text-content-muted transition-colors hover:text-content"
		>
			Play another bot →
		</a>
	{:else if rematchEligible}
		<RematchControl store={rematchStore} />
	{:else if spectatorFollows}
		<SpectatorFollowPanel store={followStore} />
	{:else}
		<a
			href={resolve(opponentIsBot ? '/bots' : '/lobby')}
			class="w-full rounded-xl bg-primary py-2.5 text-center font-bold text-primary-content shadow-md transition-colors hover:bg-primary-hover"
		>
			{opponentIsBot ? 'Play another bot →' : 'Find another game →'}
		</a>
	{/if}
	{#if replayId}
		<div class="flex w-full items-center justify-center gap-2">
			<a
				href={resolve('/replay/[id]', { id: replayId })}
				class="flex-1 rounded-xl border border-border bg-surface py-2 text-center text-sm font-bold text-content transition-colors hover:bg-surface-hover"
			>
				Watch replay
			</a>
			<button
				type="button"
				onclick={copyReplayLink}
				class="flex-1 rounded-xl border border-border bg-surface py-2 text-center text-sm font-bold text-content-muted transition-colors hover:text-content"
			>
				{copiedLink ? 'Copied' : 'Copy link'}
			</button>
		</div>
	{/if}
	<a
		href={resolve('/lobby')}
		class="text-sm font-semibold text-content-muted transition-colors hover:text-content"
	>
		← Back to the lobby
	</a>
{/snippet}

<svelte:head>
	<title>{myMove ? '● Your move · Dice Chess' : 'Dice Chess — Play'}</title>
</svelte:head>

<svelte:window
	onkeydown={(event) => {
		onGlobalEscape(event);
		onKeydown(event);
	}}
/>

<GameEndModal
	open={showEndModal}
	headline={statusText ?? 'Game over.'}
	tone={endTone}
	reason={endReason}
	settlement={live.settlement}
	onDismiss={() => (endModalDismissed = true)}
>
	<RatingDeltaLine outcome={ratingOutcome} />
	{@render endActions()}
</GameEndModal>

<section class="w-full">
	<div
		class="flex flex-col gap-2.5 md:grid md:grid-cols-[minmax(0,1fr)_280px] md:items-start md:gap-3 lg:gap-4 {showHistory
			? 'lg:grid-cols-[300px_minmax(0,1fr)_280px]'
			: ''}"
	>
		{#if showHistory}
			<!-- On phones the history acts as a tab: it takes the board's slot and the
			     board/dice hide. From md up it is an extra panel alongside the game. -->
			<aside
				id="move-history-panel"
				class="order-2 h-[70dvh] md:order-none md:col-span-2 md:row-start-2 md:h-[320px] lg:sticky lg:top-4 lg:col-span-1 lg:col-start-1 lg:row-start-1 lg:h-[calc(100dvh-2rem)]"
			>
				<MoveHistory
					historyBlocks={live.historyBlocks}
					currentMoveIndex={live.currentMoveIndex}
					maxMoveIndex={live.maxMoveIndex}
					onSetMove={(i) => setMove(i)}
					keyboardNavEnabled={live.gameStatus === 'over' || live.spectator}
				/>
			</aside>
		{/if}

		<!-- Board column — the hero. Player strips sit above and below the board and share
		     its width; the board is width-capped by the column and height-capped by the
		     screen minus the strips. -->
		<div
			class="order-2 min-w-0 justify-center md:order-none md:col-start-1 md:row-start-1 {showHistory
				? 'hidden md:flex lg:col-start-2'
				: 'flex'}"
		>
			<!-- Cap the board by the height left after the surrounding chrome (two player strips, the
			     move-nav row, and — stacked below on phones — the turn line + dice panel), not just
			     10rem, so a short mobile viewport (browser URL bar showing) doesn't push the dice
			     panel off the bottom. On a narrow phone the board is width-limited anyway, so this
			     only engages when height is the tighter constraint. The 200px floor keeps it from
			     collapsing in landscape. -->
			<div
				class="flex w-full max-w-[min(560px,max(200px,calc(100dvh-24rem)))] flex-col gap-2.5 md:max-w-[calc(100dvh-15rem)]"
			>
				<PlayerStrip
					name={seatName(topSeat)}
					sub={seatSub(topSeat)}
					bot={seatIsBot(topSeat)}
					active={isActiveSeat(topSeat)}
					clockMs={clockMs(topSeat)}
					href={seatProfileHref(topSeat)}
					rating={seatRatingOf(topSeat)}
				/>

				<!-- Relative wrapper so the promotion overlay covers the board. The pointer handler is on
				     the wrapper, not an overlay: nothing is ever laid over the board, so the king stays
				     one click away at every moment of the game. -->
				<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events
				     (declining by tapping the board is a pointer shortcut; Escape and the card's own
				     focused button are the keyboard paths) -->
				<div class="relative w-full aspect-square" onpointerdown={onBoardPointerDown}>
					<Board store={live} />
					{#if live.pendingPromotion}
						<PawnPromotionSelector
							color={live.pendingPromotion.color}
							availablePieces={live.pendingPromotion.availablePieces}
							onSelect={(p) => live.completePromotion(p)}
							onCancel={() => live.cancelPromotion()}
						/>
					{/if}
				</div>

				{#if live.isManuallyBrowsing}
					<button
						type="button"
						onclick={() => setMove(live.maxMoveIndex)}
						class="w-full rounded-xl border border-primary bg-primary/10 py-2 text-center text-sm font-bold text-primary transition-colors hover:bg-primary/20"
					>
						Viewing history — Return to live
					</button>
				{/if}

				<!-- History navigation buttons under the board -->
				<div class="flex items-center justify-center gap-2 w-full">
					<button
						type="button"
						aria-label="First move"
						onclick={() => setMove(0)}
						disabled={live.currentMoveIndex === 0}
						class="flex h-8 w-8 items-center justify-center rounded-lg bg-surface border border-border text-content hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
					>
						{@render iconBtn('first')}
					</button>
					<button
						type="button"
						aria-label="Previous move"
						onclick={() => setMove(live.currentMoveIndex - 1)}
						disabled={live.currentMoveIndex === 0}
						class="flex h-8 w-8 items-center justify-center rounded-lg bg-surface border border-border text-content hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
					>
						{@render iconBtn('prev')}
					</button>
					<span class="px-2 text-xs font-mono font-bold text-content-muted tabular-nums">
						{live.currentMoveIndex} / {live.maxMoveIndex}
					</span>
					<button
						type="button"
						aria-label="Next move"
						onclick={() => setMove(live.currentMoveIndex + 1)}
						disabled={live.currentMoveIndex === live.maxMoveIndex}
						class="flex h-8 w-8 items-center justify-center rounded-lg bg-surface border border-border text-content hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
					>
						{@render iconBtn('next')}
					</button>
					<button
						type="button"
						aria-label="Last move"
						onclick={() => setMove(live.maxMoveIndex)}
						disabled={live.currentMoveIndex === live.maxMoveIndex}
						class="flex h-8 w-8 items-center justify-center rounded-lg bg-surface border border-border text-content hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
					>
						{@render iconBtn('last')}
					</button>
				</div>

				<PlayerStrip
					name={seatName(bottomSeat)}
					sub={seatSub(bottomSeat)}
					bot={seatIsBot(bottomSeat)}
					active={isActiveSeat(bottomSeat)}
					clockMs={clockMs(bottomSeat)}
					href={seatProfileHref(bottomSeat)}
					rating={seatRatingOf(bottomSeat)}
				/>
			</div>
		</div>

		<!-- Rail: actions, players, dice. On mobile its children interleave around the board. -->
		<div
			class="contents md:sticky md:top-4 md:col-start-2 md:row-start-1 md:flex md:flex-col md:gap-2.5 md:self-stretch md:[max-height:calc(100dvh-2rem)] {showHistory
				? 'lg:col-start-3'
				: ''}"
		>
			<div class="order-1 flex items-center gap-1.5 md:order-none">
				<a
					href={resolve('/lobby')}
					aria-label="Leave game"
					title="Leave"
					class="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-content-muted transition-colors hover:border-border-strong hover:text-content"
				>
					{@render iconBtn('back')}
				</a>
				<button
					type="button"
					onclick={() => (showHistory = !showHistory)}
					aria-label="Move history"
					aria-expanded={showHistory}
					aria-controls="move-history-panel"
					title="Moves"
					class="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors {showHistory
						? 'border-primary bg-primary/10 text-content'
						: 'border-border bg-surface text-content-muted hover:border-border-strong hover:text-content'}"
				>
					{@render iconBtn('list')}
				</button>
				<button
					type="button"
					onclick={() => preferencesStore.setSoundEnabled(!preferencesStore.soundEnabled)}
					aria-label="Sound effects"
					aria-pressed={preferencesStore.soundEnabled}
					title={preferencesStore.soundEnabled ? 'Sound on' : 'Sound off'}
					class="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface transition-colors hover:border-border-strong hover:text-content {preferencesStore.soundEnabled
						? 'text-content-muted'
						: 'text-content-muted/50'}"
				>
					{@render iconBtn(preferencesStore.soundEnabled ? 'sound-on' : 'sound-off')}
				</button>
				{#if live.canResign}
					<button
						type="button"
						onclick={resign}
						onblur={disarmResign}
						disabled={live.connection !== 'open'}
						aria-label={live.connection !== 'open'
							? 'Resign unavailable while disconnected'
							: confirmResign
								? 'Click again to confirm resignation'
								: 'Resign'}
						title={live.connection !== 'open' ? 'Reconnecting…' : 'Resign'}
						class="relative flex h-8 items-center justify-center gap-1.5 rounded-lg border transition-colors after:absolute after:-inset-1.5 after:content-[''] disabled:cursor-not-allowed disabled:opacity-40 {confirmResign
							? 'border-danger/50 bg-danger/15 px-2.5 text-xs font-bold text-danger'
							: 'w-8 border-border bg-surface text-content-muted hover:border-danger/50 hover:text-danger'}"
					>
						{@render iconBtn('flag')}
						{#if confirmResign}Resign?{#if live.doubling}
								&nbsp;−{live.doubling.currentStake}
							{/if}{/if}
					</button>

					<!-- Standing draw offer. Available in every phase, including the opponent's turn: arming
					     reaches nobody until this seat's own turn completes, which is the only way an
					     offer can ride on a forced pass. -->
					{#if drawControl !== 'hidden'}
						<button
							type="button"
							onclick={() => live.toggleArmDrawOffer()}
							disabled={drawControl === 'forbidden' ||
								drawControl === 'pending' ||
								live.connection !== 'open'}
							aria-label={drawLabel}
							title={drawLabel}
							class="relative flex h-8 items-center justify-center gap-1.5 rounded-lg border transition-colors after:absolute after:-inset-1.5 after:content-[''] disabled:cursor-not-allowed disabled:opacity-40 {drawControl ===
							'armed'
								? 'border-primary bg-primary/20 text-primary shadow-sm px-2.5 text-xs font-bold'
								: drawControl === 'pending'
									? 'border-primary/50 bg-primary/10 text-primary px-2.5 text-xs font-bold'
									: 'w-8 border-border bg-surface text-content-muted hover:border-border-strong hover:text-content'}"
						>
							{@render iconBtn('handshake')}
							{#if drawControl === 'armed'}
								Armed
							{:else if drawControl === 'pending'}
								Sent
							{/if}
						</button>
					{/if}
				{/if}
				{#if live.rated || connectionBadge || live.spectator}
					<div class="ml-auto flex items-center gap-1.5">
						{#if live.rated}
							<RatedBadge sizeClass="text-xs" />
						{/if}
						{#if connectionBadge}
							<span
								class="rounded-lg border px-2.5 py-1.5 text-xs font-bold {live.connection ===
								'closed'
									? 'border-danger/50 bg-danger/15 text-danger'
									: 'border-badge-accent/50 bg-badge-accent/15 text-badge-accent'}"
								role="status"
							>
								{connectionBadge}
							</span>
						{/if}
						{#if live.spectator}
							<span
								class="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-bold text-content-muted"
							>
								Spectating
							</span>
						{/if}
					</div>
				{/if}
			</div>

			{#if live.gameStatus === 'over'}
				<div
					class="order-4 flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-4 md:order-none md:flex-1 md:justify-center"
				>
					<p class="text-lg font-bold text-content">{statusText}</p>
					{#if endReason}
						<p class="text-sm text-content-muted">{endReason}</p>
					{/if}
					{#if live.settlement}
						<p class="text-sm font-semibold text-content">{live.settlement}</p>
					{/if}
					<!-- Silent while the modal is up: this card is mounted underneath it the whole time, and
					     two live regions announce the same line twice. It takes the duty back on dismissal,
					     so a delta landing later is still announced. -->
					<RatingDeltaLine outcome={ratingOutcome} announce={!showEndModal} />
					{@render endActions()}
				</div>
			{:else}
				{#if rematchEligible && live.authoritativeOver && rematchStore.phase !== 'idle' && rematchStore.phase !== 'closed'}
					<div
						class="order-3 mb-2 flex w-full flex-col items-center rounded-2xl border border-border bg-surface p-3 md:order-none"
					>
						<RematchControl store={rematchStore} compact={true} />
					</div>
				{:else if railFollowPanel}
					<div
						class="order-3 mb-2 flex w-full flex-col items-center rounded-2xl border border-border bg-surface p-3 md:order-none"
					>
						<SpectatorFollowPanel store={followStore} compact={true} />
					</div>
				{/if}
				{#if turnLine}
					<p
						class="order-3 text-center text-sm font-semibold md:order-none {myMove
							? 'text-content'
							: 'text-content-muted'}"
						aria-live="polite"
					>
						<!-- Single line: inter-block whitespace renders as a literal space and would
						     off-center the text when the dot is absent. -->
						{#if myMove}<span class="mr-1.5 text-badge-accent">●</span>{/if}{turnLine}
					</p>
				{/if}
				<div class="order-4 md:order-none md:flex md:min-h-0 md:flex-1 md:flex-col">
					{#if live.isPreRollGateActive}
						<PreRollDrawGate
							isResponder={live.isPreRollResponder}
							offeredByName={live.drawOfferedBy ? seatName(live.drawOfferedBy) : null}
							onAccept={() => live.respondDraw(true)}
							onDecline={() => live.respondDraw(false)}
						/>
					{:else}
						<DicePanel
							dice={live.currentDice}
							animating={live.isAnimatingRoll}
							emptyText={live.currentDice.length === 0 ? statusText : undefined}
						/>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</section>
