import { v4 as uuidv4 } from 'uuid';
import { getRematch, postRematch, RematchApiError } from './rematchApi';
import type {
	PrivateRematch,
	RematchAction,
	RematchCloseReason,
	RematchJoin,
	RematchPhase,
	RematchSettings,
} from './rematchTypes';

const POLL_INTERVAL_MS = 1000;
const TICK_INTERVAL_MS = 250;

export class RematchStore {
	phase = $state<RematchPhase | 'idle'>('idle');
	myConsent = $state<boolean>(false);
	allowedActions = $state<RematchAction[]>([]);
	settings = $state<RematchSettings | null>(null);
	deadlineAt = $state<string | null>(null);
	nextGameId = $state<string | null>(null);
	join = $state<RematchJoin | null>(null);
	joinDeadlineAt = $state<string | null>(null);
	closedReason = $state<RematchCloseReason | null>(null);
	error = $state<string | null>(null);
	isSubmitting = $state<boolean>(false);
	secondsRemaining = $state<number>(0);

	private gameId: string | null = null;
	private seatToken: string | null = null;
	private serverClockOffsetMs = 0;
	private pollTimer: ReturnType<typeof setTimeout> | null = null;
	private tickTimer: ReturnType<typeof setInterval> | null = null;
	private destroyed = false;
	private matchedNotified = false;

	onMatched?: (nextGameId: string, join: RematchJoin, joinDeadlineAt?: string | null) => void;

	/** Initialize the store and start polling status for an authoritative finished game. */
	init(gameId: string, seatToken?: string | null): void {
		this.dispose();
		this.destroyed = false;
		this.matchedNotified = false;
		this.gameId = gameId;
		this.seatToken = seatToken ?? null;
		this.phase = 'idle';
		this.error = null;

		if (typeof window !== 'undefined') {
			document.addEventListener('visibilitychange', this.handleVisibilityChange);
			window.addEventListener('focus', this.handleFocus);
		}

		this.startTick();
		void this.pollOnce();
	}

	private handleVisibilityChange = (): void => {
		if (document.hidden) {
			this.stopPoll();
		} else {
			void this.pollOnce();
		}
	};

	private handleFocus = (): void => {
		if (!document.hidden && !this.isTerminal()) {
			void this.pollOnce();
		}
	};

	private isTerminal(): boolean {
		return this.phase === 'matched' || this.phase === 'closed';
	}

	private startTick(): void {
		this.stopTick();
		this.updateCountdown();
		this.tickTimer = setInterval(() => {
			this.updateCountdown();
		}, TICK_INTERVAL_MS);
		this.tickTimer?.unref?.();
	}

	private stopTick(): void {
		if (this.tickTimer) {
			clearInterval(this.tickTimer);
			this.tickTimer = null;
		}
	}

	private stopPoll(): void {
		if (this.pollTimer) {
			clearTimeout(this.pollTimer);
			this.pollTimer = null;
		}
	}

	private scheduleNextPoll(): void {
		this.stopPoll();
		if (this.destroyed || this.isTerminal()) return;
		this.pollTimer = setTimeout(() => {
			void this.pollOnce();
		}, POLL_INTERVAL_MS);
		this.pollTimer?.unref?.();
	}

	private updateCountdown(): void {
		if (!this.deadlineAt) {
			this.secondsRemaining = 0;
			return;
		}
		const deadlineMs = new Date(this.deadlineAt).getTime();
		const serverNowEst = Date.now() + this.serverClockOffsetMs;
		const diffMs = deadlineMs - serverNowEst;
		const secs = Math.max(0, Math.ceil(diffMs / 1000));
		this.secondsRemaining = secs;
	}

	private adoptState(state: PrivateRematch): void {
		this.phase = state.phase;
		this.myConsent = state.myConsent;
		this.allowedActions = state.allowedActions ?? [];
		this.settings = state.settings ?? null;
		this.deadlineAt = state.deadlineAt ?? null;
		this.nextGameId = state.nextGameId ?? null;
		this.join = state.join ?? null;
		this.joinDeadlineAt = state.joinDeadlineAt ?? null;
		this.closedReason = state.closedReason ?? null;

		if (state.serverNow) {
			this.serverClockOffsetMs = new Date(state.serverNow).getTime() - Date.now();
		}
		this.updateCountdown();

		if (this.phase === 'matched' && this.nextGameId && this.join && !this.matchedNotified) {
			this.matchedNotified = true;
			this.stopPoll();
			this.onMatched?.(this.nextGameId, this.join, this.joinDeadlineAt);
		} else if (this.isTerminal()) {
			this.stopPoll();
		}
	}

	async pollOnce(): Promise<void> {
		if (!this.gameId || this.destroyed || this.isTerminal()) return;
		try {
			const res = await getRematch(this.gameId, this.seatToken);
			if (this.destroyed) return;
			this.error = null;
			this.adoptState(res);
		} catch (err) {
			if (this.destroyed) return;
			if (err instanceof RematchApiError) {
				if (err.state) {
					this.adoptState(err.state);
				} else if (err.status === 410 || err.code === 'rematch_closed') {
					this.phase = 'closed';
					this.closedReason = 'expired';
					this.stopPoll();
				} else if (err.status === 401 || err.status === 403) {
					this.phase = 'closed';
					this.stopPoll();
				}
			}
			// Transient network failures don't clobber active state; keep polling
		} finally {
			if (!this.destroyed && !this.isTerminal() && !document.hidden) {
				this.scheduleNextPoll();
			}
		}
	}

	private async mutate(action: RematchAction, resumePoll: boolean): Promise<void> {
		if (!this.gameId || this.isSubmitting || this.destroyed) return;
		this.isSubmitting = true;
		this.error = null;
		const reqId = uuidv4();
		try {
			const res = await postRematch(this.gameId, action, reqId, this.seatToken);
			if (this.destroyed) return;
			this.adoptState(res);
		} catch (err) {
			this.handleMutationError(err);
		} finally {
			if (!this.destroyed) {
				this.isSubmitting = false;
				if (resumePoll && !this.isTerminal()) {
					this.scheduleNextPoll();
				}
			}
		}
	}

	async propose(): Promise<void> {
		await this.mutate('propose', true);
	}

	async accept(): Promise<void> {
		await this.mutate('accept', true);
	}

	async decline(): Promise<void> {
		await this.mutate('decline', false);
	}

	async cancel(): Promise<void> {
		await this.mutate('cancel', false);
	}

	retry(): void {
		this.error = null;
		void this.pollOnce();
	}

	private handleMutationError(err: unknown): void {
		if (this.destroyed) return;
		if (err instanceof RematchApiError) {
			if (err.state) {
				this.adoptState(err.state);
				return;
			}
			if (err.status === 410 || err.code === 'rematch_closed') {
				this.phase = 'closed';
				this.closedReason = 'expired';
				this.stopPoll();
				return;
			}
			if (err.code === 'rate_limited') {
				this.error = 'Too many requests — please wait a moment.';
				return;
			}
		}
		this.error = 'Unable to complete rematch action. Please try again.';
	}

	dispose(): void {
		this.destroyed = true;
		this.stopPoll();
		this.stopTick();
		if (typeof window !== 'undefined') {
			document.removeEventListener('visibilitychange', this.handleVisibilityChange);
			window.removeEventListener('focus', this.handleFocus);
		}
	}
}
