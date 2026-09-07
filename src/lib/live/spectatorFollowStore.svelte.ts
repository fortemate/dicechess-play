import { getContinuation, ContinuationError } from './continuationApi';
import { MAX_FOLLOW_HOPS, resolveChainHead, type ContinuationReader } from './continuationChain';
import { createFollowIntentStore, type FollowIntentStore } from './followIntent';
import type { PublicContinuation } from './rematchTypes';

/**
 * The spectator half of the rematch feature (play-api ADR 007 / rematch-v1): keep watching the
 * same two people as their game becomes a rematch, and the rematch a rematch of its own.
 *
 * Why this exists as its own store rather than a branch of `rematchStore.svelte.ts`: the two
 * speak different halves of the contract. The participant store is authorized — it sends a seat
 * capability or an account session, and its answers can contain join data. This one is public
 * and credential-free, and MUST stay that way: a spectator never asks for join data, never
 * stores one, and never claims a seat, even when the browser happens to carry the account cookie
 * of a player in the game being watched (`continuationApi` omits credentials; the socket is
 * opened with an explicit `mode=spectator`).
 *
 * The transport is polling, not the game socket, because the socket is exactly what is gone: an
 * ended room is dropped from the registry and its WebSocket closes, while the rematch
 * coordinator outlives it. So the follower reads `GET /games/{id}/continuation` on its own.
 *
 * Following is the default for a live spectator and is cancelled by "Stay on this game", which
 * `followIntent.ts` persists for the tab. A cancelled follow still tracks the chain — the viewer
 * is offered the current game explicitly — it simply never navigates on its own.
 */

/** What the follower can currently say about this game's continuation. */
export type FollowStatus =
	/** Nothing to say yet: the game is still being played, or the first read has not landed. */
	| 'idle'
	/** The source is finished and a rematch may still be agreed. */
	| 'waiting'
	/** A successor exists — being followed, or offered when the viewer stayed here. */
	| 'matched'
	/** This game will never continue. */
	| 'closed';

const POLL_INTERVAL_MS = 1000;
const TICK_INTERVAL_MS = 250;
/** Transient-failure backoff (ms); the last entry repeats. The last readable state stays on screen. */
const ERROR_BACKOFF_MS = [2000, 4000, 8000, 15000];

export class SpectatorFollowStore {
	status = $state<FollowStatus>('idle');
	/** True while the viewer is following automatically (the default; off after "Stay on this game"). */
	following = $state<boolean>(true);
	/** The head of the chain when it is not the game being viewed, for the explicit "watch it" action. */
	nextGameId = $state<string | null>(null);
	/** A transient failure to report; the last readable status is kept alongside it. */
	error = $state<string | null>(null);
	/** Countdown on the public offer deadline, 0 when there is none (an active or closed game). */
	secondsRemaining = $state<number>(0);
	/**
	 * The public offer deadline, or null when there is none. Its presence is also the one public
	 * signal that the watched game has ENDED and an offer window is live: an ordinary game still
	 * being played answers `waiting` without one, and so does a permanently ineligible source.
	 */
	deadlineAt = $state<string | null>(null);
	/** True while a chain walk is in flight, so the UI can disable a second "watch it" click. */
	resolving = $state<boolean>(false);

	/** Called with the game to open when following is on and the chain has moved on. */
	onFollow?: (gameId: string) => void;

	private gameId: string | null = null;
	private serverClockOffsetMs = 0;
	private pollTimer: ReturnType<typeof setTimeout> | null = null;
	private tickTimer: ReturnType<typeof setInterval> | null = null;
	private consecutiveErrors = 0;
	private polling = false;
	private followedTo: string | null = null;
	// Every async result carries the epoch it started in; a navigation, a re-init or a dispose
	// bumps it, so a poll or a chain walk that lands late can never move a page that has moved on.
	private epoch = 0;

	constructor(
		private readonly intent: FollowIntentStore = createFollowIntentStore(),
		private readonly read: ContinuationReader = getContinuation,
	) {}

	/**
	 * Watch `gameId`. Reads the chain once immediately — a viewer arriving after a reload may be
	 * holding a game that was superseded twice while they were away — and then stays quiet until
	 * the game ends, since nothing can continue before then.
	 */
	init(gameId: string): void {
		this.dispose();
		this.epoch += 1;
		this.gameId = gameId;
		this.followedTo = null;
		this.status = 'idle';
		this.nextGameId = null;
		this.error = null;
		this.deadlineAt = null;
		this.secondsRemaining = 0;
		this.consecutiveErrors = 0;
		this.following = !this.intent.isPinned(gameId);

		if (typeof window !== 'undefined') {
			document.addEventListener('visibilitychange', this.handleVisibilityChange);
			window.addEventListener('focus', this.handleFocus);
		}
		this.startTick();
		void this.resolve();
	}

	/**
	 * The watched game reached an authoritative end. From here the offer window is live and the
	 * game socket is on its way out, so the follower starts reading on its own. Idempotent.
	 */
	sourceEnded(): void {
		if (!this.gameId || this.polling) return;
		this.polling = true;
		void this.resolve();
	}

	/** "Stay on this game": stop following, remember it for this tab, keep tracking the chain. */
	stayHere(): void {
		if (!this.gameId) return;
		this.intent.pin(this.gameId);
		this.following = false;
	}

	/** The explicit way back: resume following and open the current head of the chain. */
	resumeFollowing(): void {
		if (!this.gameId) return;
		this.intent.unpin(this.gameId);
		this.following = true;
		this.error = null;
		void this.resolve();
	}

	/** Retry after a transient failure, without waiting for the backoff to elapse. */
	retry(): void {
		this.error = null;
		this.consecutiveErrors = 0;
		void this.resolve();
	}

	dispose(): void {
		this.epoch += 1;
		this.polling = false;
		this.resolving = false;
		this.stopPoll();
		this.stopTick();
		if (typeof window !== 'undefined') {
			document.removeEventListener('visibilitychange', this.handleVisibilityChange);
			window.removeEventListener('focus', this.handleFocus);
		}
	}

	private readonly handleVisibilityChange = (): void => {
		if (document.hidden) {
			this.stopPoll();
		} else {
			void this.resolve();
		}
	};

	private readonly handleFocus = (): void => {
		if (!document.hidden) void this.resolve();
	};

	/**
	 * One pass: read this game, and walk any committed successors to the head of the chain.
	 * Bounded and cycle-guarded by `resolveChainHead`; a failure leaves the last readable state
	 * untouched and schedules a backed-off retry instead of moving the viewer anywhere.
	 */
	private async resolve(): Promise<void> {
		const gameId = this.gameId;
		if (!gameId || this.resolving) return;
		const epoch = this.epoch;
		this.resolving = true;
		try {
			// A walk in flight when the viewer navigates would keep reading links for a page that no
			// longer exists, so the reader itself refuses once the epoch has moved on: the walk stops
			// at its next hop instead of running the chain out. Each pass gets a fresh cycle guard —
			// re-walking the same links on the next poll is the normal case, not a loop.
			const guardedRead: ContinuationReader = (id) =>
				epoch === this.epoch
					? this.read(id)
					: Promise.reject(new Error('follow loop cancelled by navigation'));
			const resolution = await resolveChainHead(gameId, guardedRead, {
				maxHops: MAX_FOLLOW_HOPS,
			});
			if (epoch !== this.epoch) return; // navigated away (or re-inited) while this was in flight

			const head = resolution.gameId;
			if (head !== gameId) {
				// The chain moved on to a game that answered. `matched` is the truthful status even when
				// the walk stopped at a hop limit, a cycle or an unreachable tail: a successor exists,
				// and this one was readable.
				this.consecutiveErrors = 0;
				this.error = null;
				this.status = 'matched';
				this.nextGameId = head;
				this.deadlineAt = null;
				this.secondsRemaining = 0;
				this.stopPoll();
				if (this.following && this.followedTo !== head) {
					this.followedTo = head;
					this.onFollow?.(head);
				}
				return;
			}

			if (resolution.stop === 'error') {
				// `state` is this game's own last readable projection, kept on screen (including the
				// successor it names) while the unreachable link is retried. `state === null` means even
				// this game could not be read — the only case where a 404 is a permanently closed chain.
				if (resolution.state) this.adoptReadable(resolution.state);
				this.handleError(resolution.error, resolution.state === null);
				return;
			}

			this.consecutiveErrors = 0;
			this.error = null;
			this.adoptHead(resolution.state);
		} finally {
			if (epoch === this.epoch) this.resolving = false;
		}
	}

	/** Take the phase and named successor of a read, without touching timers. */
	private adoptReadable(state: PublicContinuation): void {
		this.status = state.phase === 'matched' ? 'matched' : state.phase;
		this.nextGameId = state.phase === 'matched' ? (state.nextGameId ?? null) : null;
	}

	private adoptHead(state: PublicContinuation | null): void {
		if (!state) return;
		this.adoptReadable(state);
		this.deadlineAt = state.deadlineAt ?? null;

		const serverNowMs = new Date(state.serverNow).getTime();
		if (!Number.isNaN(serverNowMs)) this.serverClockOffsetMs = serverNowMs - Date.now();
		this.updateCountdown();

		// An ordinary game still being played answers `waiting` with no deadline. That is not a dead
		// chain and must not stop the follower — it just has nothing to poll for yet, so polling
		// starts on the deadline (the offer window) or when the page reports the game over.
		if (this.deadlineAt) this.polling = true;
		if (state.phase === 'closed') {
			this.stopPoll();
			return;
		}
		this.schedulePoll(POLL_INTERVAL_MS);
	}

	private handleError(error: unknown, onSource: boolean): void {
		if (onSource && error instanceof ContinuationError && error.isPermanent) {
			// An id the server does not know will never continue; stop rather than retry forever.
			this.status = 'closed';
			this.stopPoll();
			return;
		}
		this.error = 'Could not check for a rematch.';
		const delay = ERROR_BACKOFF_MS[Math.min(this.consecutiveErrors, ERROR_BACKOFF_MS.length - 1)];
		this.consecutiveErrors += 1;
		this.schedulePoll(delay);
	}

	private schedulePoll(delayMs: number): void {
		this.stopPoll();
		if (!this.polling || typeof document === 'undefined' || document.hidden) return;
		this.pollTimer = setTimeout(() => {
			void this.resolve();
		}, delayMs);
		this.pollTimer?.unref?.();
	}

	private stopPoll(): void {
		if (this.pollTimer) {
			clearTimeout(this.pollTimer);
			this.pollTimer = null;
		}
	}

	private startTick(): void {
		this.stopTick();
		this.updateCountdown();
		this.tickTimer = setInterval(() => this.updateCountdown(), TICK_INTERVAL_MS);
		this.tickTimer?.unref?.();
	}

	private stopTick(): void {
		if (this.tickTimer) {
			clearInterval(this.tickTimer);
			this.tickTimer = null;
		}
	}

	private updateCountdown(): void {
		if (!this.deadlineAt) {
			this.secondsRemaining = 0;
			return;
		}
		const deadlineMs = new Date(this.deadlineAt).getTime();
		if (Number.isNaN(deadlineMs)) {
			this.secondsRemaining = 0;
			return;
		}
		const diffMs = deadlineMs - (Date.now() + this.serverClockOffsetMs);
		this.secondsRemaining = Math.max(0, Math.ceil(diffMs / 1000));
	}
}
