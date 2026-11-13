/**
 * A single laboratory window's create/invite/readiness journey. Capability links never select a
 * different already-owned seat. HTTP replies and socket callbacks are fenced independently so
 * navigating from the invitation to its board cannot disconnect players or rewind live state.
 * The gameplay controller shares this fenced connection and never persists into main-site history.
 */
import type { Seat, TimeControl } from '../live/liveTypes';
import { SvelteMap, SvelteURL } from 'svelte/reactivity';
import { LaboratoryApi, LaboratoryError, type LaboratoryGameState, type LabErrorCode } from './api';
import { laboratoryGuest, openRoomConnection, type RoomConnection } from './connection';
import { LaboratoryGame } from './game.svelte';
import { LaboratoryRecordsApi } from './records';
import { timeControlKey } from './api';
import {
	buildLabBoardUrl,
	buildLabInviteUrl,
	loadRoomAccess,
	parseLabLocation,
	saveRoomAccess,
	type LabLocation,
	type RoomAccess,
	type SeatAccess,
} from './seatLinks';

export interface LaboratoryWindow {
	origin: string;
	url(): URL;
	navigate(url: string, replace: boolean): void;
	storage: Storage | null;
	identityStorage: Storage | null;
}

export type JourneyError = LabErrorCode | 'invalid' | 'occupied';
type RoomLocation = Extract<LabLocation, { gameId: string }>;

function failureCode(error: unknown): LabErrorCode {
	return error instanceof LaboratoryError ? error.code : 'connection';
}

function chooseSeat(preference: Seat | 'random'): Seat {
	if (preference !== 'random') return preference;
	return crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0 ? 'White' : 'Black';
}

export class LaboratorySession {
	route = $state<LabLocation>({ kind: 'home' });
	state = $state<LaboratoryGameState | null>(null);
	access = $state<RoomAccess | null>(null);
	candidate = $state<SeatAccess | null>(null);
	error = $state<JourneyError | null>(null);
	loading = $state(false);
	pending = $state(false);
	connectionStatus = $state<'connecting' | 'open' | 'closed'>('connecting');
	persisted = $state(true);
	rematchPending = $state(false);
	rematchWaiting = $state(false);
	private loadEpoch = 0;
	private connectionEpoch = 0;
	readonly game: LaboratoryGame;
	private connection: RoomConnection | null = null;
	private connectionKey = '';
	private readonly rooms = new SvelteMap<string, RoomAccess>();
	private readonly guest: string;
	private disposed = false;

	constructor(
		private readonly api: LaboratoryApi,
		private readonly window: LaboratoryWindow,
	) {
		this.guest = laboratoryGuest(window.identityStorage);
		this.game = new LaboratoryGame(
			api,
			() => this.access?.mine.gameId ?? null,
			(command) => this.connection?.send(command) ?? false,
		);
	}

	get invitationUrl(): string | null {
		return this.access?.invitation
			? buildLabInviteUrl(this.window.origin, this.access.invitation)
			: null;
	}
	get boardUrl(): string | null {
		return this.access ? buildLabBoardUrl(this.window.origin, this.access.mine) : null;
	}
	get ended(): boolean {
		return this.state !== null && 'Ended' in this.state.status;
	}
	get started(): boolean {
		return this.state !== null && this.state.lab.turn.phase !== 'AwaitingPlayers';
	}

	private retained(gameId: string): RoomAccess | null {
		return (
			(this.window.storage && loadRoomAccess(this.window.storage, gameId)) ??
			this.rooms.get(gameId) ??
			null
		);
	}

	private remember(room: RoomAccess): void {
		this.rooms.set(room.mine.gameId, room);
		this.persisted = this.window.storage !== null && saveRoomAccess(this.window.storage, room);
		if (this.persisted && this.window.url().hash) {
			const url = this.window.url();
			url.hash = '';
			this.window.navigate(url.toString(), true);
		}
	}

	private closeConnection(): void {
		this.game.status(false);
		this.connectionEpoch += 1;
		this.connection?.close();
		this.connection = null;
		this.connectionKey = '';
	}

	private connect(): void {
		if (!this.access || !this.state || this.ended || this.disposed) return;
		const access = this.access;
		const key = `${access.mine.gameId}:${access.mine.seat}:${access.mine.token}`;
		if (key === this.connectionKey) return;
		this.closeConnection();
		const epoch = this.connectionEpoch;
		this.connectionKey = key;
		this.connectionStatus = 'connecting';
		this.game.accept(this.state, access.mine.seat);
		this.connection = openRoomConnection(
			this.api,
			access.mine,
			this.guest,
			this.state,
			{
				onState: (state) => {
					if (epoch !== this.connectionEpoch || this.disposed) return;
					if (this.state && state.version < this.state.version) return;
					this.state = state;
					this.game.accept(state, access.mine.seat);
					if (this.error === 'connection') this.error = null;
					if (this.ended && this.route.kind === 'invite') this.error = 'expired';
				},
				onStatus: (status) => {
					if (epoch !== this.connectionEpoch || this.disposed) return;
					this.connectionStatus = status;
					if (status === 'open') {
						this.remember(access);
						this.candidate = null;
						if (this.error === 'connection') this.error = null;
					}
				},
				onError: (code) => {
					if (epoch === this.connectionEpoch && !this.disposed) this.error = code;
				},
				onFrame: (frame) => {
					if (epoch === this.connectionEpoch && !this.disposed) this.game.frame(frame);
				},
				onReady: (ready, resynced) => {
					if (epoch === this.connectionEpoch && !this.disposed) this.game.status(ready, resynced);
				},
			},
			this.window.storage,
		);
	}

	private currentLoad(epoch: number): boolean {
		return epoch === this.loadEpoch && !this.disposed;
	}

	private prepareAccess(route: RoomLocation): boolean {
		const retained = this.retained(route.gameId);
		if (this.access?.mine.gameId !== route.gameId) {
			this.closeConnection();
			this.game.reset();
			this.state = null;
		}
		this.access = retained;
		if (
			route.access &&
			retained &&
			(route.access.seat !== retained.mine.seat || route.access.token !== retained.mine.token)
		) {
			this.error = 'occupied';
			this.loading = false;
			return false;
		}
		if (!retained && !route.access) {
			this.error = 'invalid';
			this.loading = false;
			return false;
		}
		this.candidate = route.access;
		return true;
	}

	private completeLoad(route: RoomLocation, state: LaboratoryGameState): void {
		if (!this.state || state.version >= this.state.version) this.state = state;
		if (this.ended && route.kind === 'invite') {
			this.error = 'expired';
			return;
		}
		if (this.access) {
			this.game.accept(this.state!, this.access.mine.seat);
			this.candidate = null;
			this.connect();
		} else if (route.kind === 'board' && route.access) {
			this.access = { mine: route.access };
			this.game.accept(this.state!, this.access.mine.seat);
			this.connect();
		}
	}

	async open(url = this.window.url()): Promise<void> {
		const epoch = ++this.loadEpoch;
		this.rematchWaiting = false;
		const route = parseLabLocation(url);
		this.route = route;
		this.error = null;
		this.pending = false;
		this.candidate = null;
		if (route.kind === 'home' || route.kind === 'invalid') {
			this.closeConnection();
			this.state = null;
			this.access = null;
			this.loading = false;
			if (route.kind === 'invalid') this.error = 'invalid';
			return;
		}
		if (!this.prepareAccess(route)) return;
		this.loading = true;
		try {
			const state = await this.api.state(route.gameId);
			if (this.currentLoad(epoch)) this.completeLoad(route, state);
		} catch (error) {
			if (this.currentLoad(epoch)) this.error = failureCode(error);
		} finally {
			if (this.currentLoad(epoch)) this.loading = false;
		}
	}

	async create(timeControl: TimeControl, preference: Seat | 'random'): Promise<void> {
		if (this.pending || this.disposed) return;
		const epoch = ++this.loadEpoch;
		this.pending = true;
		this.error = null;
		try {
			const { creation, state } = await this.api.create(this.guest, timeControl);
			if (!this.currentLoad(epoch)) return;
			const seat = chooseSeat(preference);
			const mine = creation.tokens.find((token) => token.seat === seat)!;
			const theirs = creation.tokens.find((token) => token.seat !== seat)!;
			this.closeConnection();
			this.game.reset();
			this.access = {
				mine: { ...mine, gameId: creation.gameId },
				invitation: { ...theirs, gameId: creation.gameId },
			};
			this.state = state;
			this.rematchWaiting = false;
			this.remember(this.access);
			// With blocked storage, a reload must recover our seat from the private board fragment.
			// Keep the invitation step visible now; its separate copy control still shares only theirs.
			const recoveryUrl = this.persisted
				? new SvelteURL(`/invite/${creation.gameId}`, this.window.origin).toString()
				: buildLabBoardUrl(this.window.origin, this.access.mine);
			this.window.navigate(recoveryUrl, false);
			this.route = { kind: 'invite', gameId: creation.gameId, access: null };
			this.connect();
		} catch (error) {
			if (this.currentLoad(epoch)) this.error = failureCode(error);
		} finally {
			if (this.currentLoad(epoch)) this.pending = false;
		}
	}

	join(): void {
		if (!this.candidate || !this.state || this.ended || this.pending || this.error) return;
		this.access = { mine: this.candidate };
		this.showBoard();
		this.connect();
	}

	showBoard(): void {
		if (!this.access) return;
		const url = new SvelteURL(buildLabBoardUrl(this.window.origin, this.access.mine));
		// Until the socket authenticates, keep the fragment so a refresh cannot lose this capability.
		if (this.retained(this.access.mine.gameId) && this.persisted) url.hash = '';
		this.window.navigate(url.toString(), false);
		this.route = { kind: 'board', gameId: this.access.mine.gameId, access: this.access.mine };
		this.error = null;
		if (!this.state) void this.open();
	}

	home(): void {
		this.window.navigate(new SvelteURL('/', this.window.origin).toString(), false);
		void this.open();
	}

	retry(): void {
		this.closeConnection();
		void this.open();
	}

	async rematch(consent = true): Promise<void> {
		if (
			!this.access ||
			!this.state ||
			!('Ended' in this.state.status) ||
			this.state.status.Ended.over.termination === 'Aborted' ||
			this.rematchPending
		)
			return;
		const source = this.access.mine;
		const conditions = timeControlKey(this.state.timeControl);
		const epoch = this.loadEpoch;
		this.rematchPending = true;
		try {
			const view = await new LaboratoryRecordsApi(this.api).rematch(
				source.gameId,
				source.token,
				consent,
			);
			if (!this.currentLoad(epoch)) return;
			this.rematchWaiting = consent && view.phase === 'awaiting_consent';
			if (view.phase !== 'created') return;
			const state = await this.api.state(view.gameId!);
			if (!this.currentLoad(epoch)) return;
			if (timeControlKey(state.timeControl) !== conditions || view.seat === source.seat)
				throw new LaboratoryError('incompatible');
			this.closeConnection();
			this.game.reset();
			this.access = { mine: { gameId: view.gameId!, seat: view.seat!, token: view.token! } };
			this.state = state;
			this.remember(this.access);
			this.rematchWaiting = false;
			this.showBoard();
			this.connect();
		} catch (error) {
			if (this.currentLoad(epoch)) this.error = failureCode(error);
		} finally {
			this.rematchPending = false;
		}
	}

	destroy(): void {
		this.game.destroy();
		this.disposed = true;
		this.loadEpoch += 1;
		this.closeConnection();
	}
}
