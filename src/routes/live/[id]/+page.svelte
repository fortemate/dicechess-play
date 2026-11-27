<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import Board from '../../../components/Board.svelte';
	import PawnPromotionSelector from '../../../components/PawnPromotionSelector.svelte';
	import PlayerStrip from '../../../components/PlayerStrip.svelte';
	import TurnCard from '../../../components/TurnCard.svelte';
	import PreRollDrawGate from '../../../components/PreRollDrawGate.svelte';
	import GameActions from '../../../components/GameActions.svelte';
	import GameFrame from '../../../components/GameFrame.svelte';
	import MoveList from '../../../components/MoveList.svelte';
	import MoveStepper from '../../../components/MoveStepper.svelte';
	import GameEndModal from '../../../components/GameEndModal.svelte';
	import BotRematchButton from '../../../components/BotRematchButton.svelte';
	import RematchControl from '../../../components/RematchControl.svelte';
	import SpectatorFollowPanel from '../../../components/SpectatorFollowPanel.svelte';
	import { recallBotGame } from '#lib/catalog/lastBotGame.js';
	import GameRatingContext from '../../../components/GameRatingContext.svelte';
	import RatingDeltaLine from '../../../components/RatingDeltaLine.svelte';
	import Button from '../../../components/ui/Button.svelte';
	import Card from '../../../components/ui/Card.svelte';
	import Tag from '../../../components/ui/Tag.svelte';
	import { chromeStore } from '#lib/stores/chromeStore.svelte.js';
	import { LiveGameStore } from '#lib/live/liveGameStore.svelte.js';
	import { RematchStore } from '#lib/live/rematchStore.svelte.js';
	import { SpectatorFollowStore } from '#lib/live/spectatorFollowStore.svelte.js';
	import { isLiveEnabled } from '#lib/live/liveApi.js';
	import { buildJoinUrl, buildSpectateUrl, parseSeat } from '#lib/live/seatLink.js';
	import { buildReplayUrl, hasReplay } from '#lib/live/replayLink.js';
	import {
		SEAT_LABELS,
		publicPlayer,
		seatDisplayName,
		seatDisplaySub,
		seatRating,
	} from '#lib/live/playerLabel.js';
	import { preloadSounds } from '#lib/sound.js';
	import { endReasonLabel } from '#lib/gameOutcome.js';
	import { toastStore } from '#lib/toastStore.svelte.js';
	import { m } from '#lib/paraglide/messages.js';
	import { fetchGameRatingChange } from '#lib/live/ratingApi.js';
	import { ratingPollStep, type RatingOutcome } from '#lib/live/ratingDelta.js';
	import type { Seat } from '#lib/live/liveTypes.js';
	import { RESIGN_CONFIRM_MS } from '#lib/timings.js';

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

	const live = new LiveGameStore();
	$effect(() => {
		chromeStore.holdReload = isLiveEnabled() && !live.spectator && live.gameStatus !== 'over';
		return () => {
			chromeStore.holdReload = false;
		};
	});

	let confirmResign = $state(false);

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
		if (live.spectator)
			return live.activeColor === 'w' ? m.game_live_turn_white() : m.game_live_turn_black();
		return myMove ? m.game_live_turn_yours() : m.game_live_turn_waiting();
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
	const gameTimeControl = $derived(
		page.params.id ? recallBotGame(page.params.id)?.timeControl : undefined,
	);
	const gameRatingDomain = $derived(
		ratingOutcome?.details?.ratingDomain !== undefined
			? ratingOutcome.details.ratingDomain
			: live.ratingDomain,
	);
	$effect(() => {
		ratingOutcome = null;
		const gameId = page.params.id;
		if (!gameId || live.gameStatus !== 'over' || live.spectator) return;
		const domain = live.ratingDomain;
		const seat = bottomSeat;
		// Announce the wait before the first request resolves: the batch is a minute behind at worst,
		// and a blank minute is what made this look broken rather than busy.
		ratingOutcome = domain
			? { kind: 'waiting', details: { ratingDomain: domain } }
			: { kind: 'waiting' };

		let alive = true;
		const controller = new AbortController();
		let attempts = 0;
		let timer: ReturnType<typeof setInterval> | undefined;
		const stop = () => {
			alive = false;
			controller.abort();
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
				const change = await fetchGameRatingChange(gameId, controller.signal);
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
		joinCountdown > 0
			? m.game_live_awaiting_opponent_countdown({ seconds: joinCountdown })
			: m.game_live_awaiting_opponent(),
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
			toastStore.error(m.game_toast_copy_replay_failed());
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
		if (live.connection === 'closed' && live.gameStatus !== 'over')
			return m.game_live_status_disconnected();
		// Mid-game 'connecting' means a reconnect is in flight (the initial connect still says "Connecting…").
		if (
			live.connection === 'connecting' &&
			live.gameStatus !== 'connecting' &&
			live.gameStatus !== 'over'
		)
			return m.game_live_status_reconnecting();
		// Only while the game is still open: a rematch that aborts on the first-join gate is evicted
		// with this phase still on record, and the seat that DID join must be told it won rather than
		// left waiting for an opponent who can no longer come (#109).
		if (live.gameStatus !== 'over' && live.rematchStartup?.phase === 'awaiting_joins') {
			return awaitingOpponentText;
		}
		switch (live.gameStatus) {
			case 'connecting':
				return m.game_live_status_connecting();
			case 'playing':
				return m.game_live_status_your_turn();
			case 'waiting':
				return m.game_live_status_waiting();
			case 'over':
				if (live.termination === 'Aborted') return m.game_live_status_aborted();
				if (live.outcome === 'won') return m.game_over_won();
				if (live.outcome === 'lost') return m.game_over_lost();
				if (live.outcome === 'draw') return m.game_over_draw();
				return live.winner
					? m.game_live_status_seat_won({ seat: SEAT_LABELS[live.winner] })
					: m.game_live_status_over();
		}
	});

	// A dropped connection is otherwise invisible whenever dice are on the table (statusText only
	// surfaces via the dice panel's EMPTY state) — this badge is independent of dice/turn state.
	// Skipped for the very first connect: TurnCard's "Connecting…" empty-state already covers it,
	// and the badge would be redundant before there's anything else on screen.
	const connectionBadge = $derived.by(() => {
		if (live.gameStatus === 'over') return null;
		if (live.rematchStartup?.phase === 'awaiting_joins') {
			return m.game_live_badge_awaiting();
		}
		if (live.connection === 'closed') return m.game_live_badge_disconnected();
		if (live.connection === 'connecting' && live.gameStatus !== 'connecting')
			return m.game_live_status_reconnecting();
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
				return m.game_live_end_draw_agreed();
			case 'DoubleDeclined':
				return endReasonLabel('double_declined');
			case 'Aborted':
			case null:
				return '';
			default:
				// Aborted gets its own headline
				// A termination this build does not know (the server may add members): say something
				// neutral rather than a blank or a debug dump, and never throw.
				return m.game_live_end_unknown();
		}
	});

	// A no-legal-moves pass is announced as a toast — the same surface the bot game uses —
	// so both game surfaces notify identically. Fires once per dwell (LiveGameStore nulls
	// passNoticeSeat between passes); being transient, it needs no history-browsing gate.
	$effect(() => {
		const seat = live.passNoticeSeat;
		if (seat === null) return;
		if (live.spectator) {
			toastStore.info(m.game_toast_no_legal_moves_seat({ seat: SEAT_LABELS[seat] }));
			return;
		}
		const mine = (seat === 'White') === (live.playerColor === 'w');
		toastStore.info(
			mine ? m.game_toast_no_legal_moves_you() : m.game_toast_no_legal_moves_opponent(),
		);
	});

	// What the ½ control is doing right now, and the one sentence that explains it. The wording of the
	// forbidden state follows the server: it names a number of turns only where a deployment lets the
	// right to offer return on its own, and otherwise says plainly whose turn it is to offer.
	const drawControl = $derived(live.drawOfferControlState);
	const drawLabel = $derived.by(() => {
		switch (drawControl) {
			case 'armed':
				return m.game_draw_label_armed();
			case 'pending':
				return m.game_draw_label_pending_opponent();
			case 'forbidden': {
				const turns = live.drawArmRefusal?.availableAfterTurns ?? null;
				if (turns === null) return m.game_draw_label_forbidden_opponent();
				return turns === 1
					? m.game_draw_label_available_one()
					: m.game_draw_label_available_many({ turns });
			}
			default:
				return m.game_draw_label_idle();
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

	// What the resign button says to assistive technology and in its tooltip.
	const resignLabel = $derived(
		live.connection !== 'open'
			? m.game_resign_label_disconnected()
			: confirmResign
				? m.game_resign_label_confirm()
				: m.game_action_resign(),
	);
	// What this game is, for the top bar of the frame.
	const frameTitle = $derived(
		m.game_live_title({ white: seatName('White'), black: seatName('Black') }),
	);
</script>

{#snippet endActions()}
	{#if rematchOffer}
		<BotRematchButton setup={rematchOffer} />
		<Button variant="secondary" block href={resolve('bots')}>
			{m.game_live_play_another_bot()}
		</Button>
	{:else if rematchEligible}
		<RematchControl store={rematchStore} />
	{:else if spectatorFollows}
		<SpectatorFollowPanel store={followStore} />
	{:else}
		<Button variant="primary" block href={resolve(opponentIsBot ? '/bots' : '/lobby')}>
			{opponentIsBot ? m.game_live_play_another_bot() : m.game_live_find_another_game()}
		</Button>
	{/if}
	{#if replayId}
		<div class="flex w-full items-stretch justify-center gap-2">
			<Button variant="secondary" class="flex-1" href={resolve('/replay/[id]', { id: replayId })}>
				{m.game_live_watch_replay()}
			</Button>
			<Button variant="secondary" class="flex-1" onclick={copyReplayLink}>
				{copiedLink ? m.game_live_copied() : m.game_live_copy_link()}
			</Button>
		</div>
	{/if}
	<a
		href={resolve('lobby')}
		class="inline-flex min-h-11 items-center rounded-control px-2 text-sm font-semibold text-content-muted transition-colors hover:text-content focus-visible:focus-ring"
	>
		{m.game_live_back_to_lobby()}
	</a>
{/snippet}

<svelte:head>
	<title>{myMove ? m.game_live_page_title_your_move() : m.game_live_page_title()}</title>
</svelte:head>

<svelte:window
	onkeydown={(event) => {
		onGlobalEscape(event);
		onKeydown(event);
	}}
/>

<GameEndModal
	open={showEndModal}
	headline={statusText ?? m.game_live_status_over()}
	tone={endTone}
	reason={endReason}
	settlement={live.settlement}
	onDismiss={() => (endModalDismissed = true)}
>
	<RatingDeltaLine outcome={ratingOutcome} />
	{@render endActions()}
</GameEndModal>

<GameFrame title={frameTitle} leaveHref={resolve('lobby')}>
	{#snippet status()}
		<!-- A dropped connection is otherwise invisible whenever dice are on the table. -->
		{#if connectionBadge}
			<span role="status">
				<Tag tone={live.connection === 'closed' ? 'danger' : 'highlight'}>{connectionBadge}</Tag>
			</span>
		{/if}
		{#if live.spectator}
			<Tag>{m.game_live_badge_spectating()}</Tag>
		{/if}
	{/snippet}

	{#snippet top()}
		<PlayerStrip
			name={seatName(topSeat)}
			sub={seatSub(topSeat)}
			bot={seatIsBot(topSeat)}
			compact
			active={isActiveSeat(topSeat)}
			clockMs={clockMs(topSeat)}
			href={seatProfileHref(topSeat)}
			rating={seatRatingOf(topSeat)}
		/>
	{/snippet}

	{#snippet board()}
		<!-- Relative wrapper so the promotion overlay covers the board. The pointer handler is on
		     the wrapper, not an overlay: nothing is ever laid over the board, so the king stays
		     one click away at every moment of the game. -->
		<!-- svelte-ignore a11y_no_static_element_interactions
		     (declining by tapping the board is a pointer shortcut; Escape and the card's own
		     focused button are the keyboard paths) -->
		<div class="relative aspect-square w-full" onpointerdown={onBoardPointerDown}>
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
	{/snippet}

	{#snippet underBoard()}
		{#if live.isManuallyBrowsing}
			<Button variant="secondary" block onclick={() => setMove(live.maxMoveIndex)}>
				{m.game_live_return_to_live()}
			</Button>
		{/if}
		<MoveStepper
			currentMoveIndex={live.currentMoveIndex}
			maxMoveIndex={live.maxMoveIndex}
			onSetMove={(i) => setMove(i)}
		/>
	{/snippet}

	{#snippet bottom()}
		<PlayerStrip
			name={seatName(bottomSeat)}
			sub={seatSub(bottomSeat)}
			bot={seatIsBot(bottomSeat)}
			compact
			active={isActiveSeat(bottomSeat)}
			clockMs={clockMs(bottomSeat)}
			href={seatProfileHref(bottomSeat)}
			rating={seatRatingOf(bottomSeat)}
		/>
	{/snippet}

	{#snippet card()}
		{#if live.gameStatus === 'over'}
			<Card class="flex flex-col items-center gap-3">
				<p class="m-0 text-lg font-bold text-content">{statusText}</p>
				{#if endReason}
					<p class="m-0 text-sm text-content-muted">{endReason}</p>
				{/if}
				{#if live.settlement}
					<p class="m-0 text-sm font-semibold text-content">{live.settlement}</p>
				{/if}
				<!-- Silent while the modal is up: this card is mounted underneath it the whole time, and
				     two live regions announce the same line twice. It takes the duty back on dismissal,
				     so a delta landing later is still announced. -->
				<RatingDeltaLine outcome={ratingOutcome} announce={!showEndModal} />
				{@render endActions()}
			</Card>
		{:else}
			{#if rematchEligible && live.authoritativeOver && rematchStore.phase !== 'idle' && rematchStore.phase !== 'closed'}
				<Card class="flex flex-col items-center">
					<RematchControl store={rematchStore} compact={true} />
				</Card>
			{:else if railFollowPanel}
				<Card class="flex flex-col items-center">
					<SpectatorFollowPanel store={followStore} compact={true} />
				</Card>
			{/if}
			{#if live.isPreRollGateActive}
				<!-- The gate takes the turn card's slot, so the line that says whose move it is stays
				     above it, as it did before the card carried it. -->
				{#if turnLine}
					<p
						class="m-0 text-center text-sm font-semibold {myMove
							? 'text-content'
							: 'text-content-muted'}"
						aria-live="polite"
					>
						{turnLine}
					</p>
				{/if}
				<PreRollDrawGate
					isResponder={live.isPreRollResponder}
					offeredByName={live.drawOfferedBy ? seatName(live.drawOfferedBy) : null}
					onAccept={() => live.respondDraw(true)}
					onDecline={() => live.respondDraw(false)}
				/>
			{:else}
				<TurnCard
					title={turnLine ?? undefined}
					mine={myMove && !live.isViewingHistory}
					dice={live.currentDice}
					animating={live.isAnimatingRoll}
					emptyText={live.currentDice.length === 0 ? statusText : undefined}
				/>
			{/if}
		{/if}
	{/snippet}

	{#snippet extra()}
		<div class="rounded-card border border-border bg-surface/40 p-3">
			<GameRatingContext
				domain={gameRatingDomain}
				rated={live.rated}
				timeControl={gameTimeControl}
				hasSeatRating={seatRatingOf(topSeat) !== undefined ||
					seatRatingOf(bottomSeat) !== undefined}
			/>
		</div>
	{/snippet}

	{#snippet moves(close)}
		<MoveList
			historyBlocks={live.historyBlocks}
			currentMoveIndex={live.currentMoveIndex}
			maxMoveIndex={live.maxMoveIndex}
			onSetMove={(i) => setMove(i)}
			keyboardNavEnabled={live.gameStatus === 'over' || live.spectator}
			onclose={close}
		/>
	{/snippet}

	{#snippet actions(movesControl)}
		<!-- The standing draw offer is available in every phase, including the opponent's turn:
		     arming reaches nobody until this seat's own turn completes, which is the only way an
		     offer can ride on a forced pass. A spectator has neither control. -->
		<GameActions
			moves={movesControl}
			draw={live.canResign && drawControl !== 'hidden'
				? {
						state: drawControl,
						label: drawLabel,
						disabled: live.connection !== 'open',
						ontoggle: () => live.toggleArmDrawOffer(),
					}
				: undefined}
			resign={live.canResign
				? {
						armed: confirmResign,
						label: resignLabel,
						armedText: live.doubling
							? m.game_resign_confirm_stake({ stake: live.doubling.currentStake })
							: undefined,
						disabled: live.connection !== 'open',
						onpress: resign,
						onblur: disarmResign,
					}
				: undefined}
		/>
	{/snippet}
</GameFrame>
