/**
 * Server-authoritative laboratory interaction. A draft follows only the accepted pair's legal
 * prefix tree; the rules-only engine renders that draft (including castling and promotion).
 * Every laboratory mutation has a fresh id and expected version. Reconnection restores server
 * state without replaying a roll or choice. History presentation never feeds live decisions.
 */
import { DiceChess } from '@fortemate/dicechess-engine/rules';
import type { ClientCommand, Seat } from '../live/liveTypes';
import type { MoveTree } from '../moveTreeWalker';
import type { LaboratoryApi, LaboratoryGameState } from './api';
import { isRecord, validMoveTree } from './api';
import type { Action, CommandFrame, PairIndex } from './protocol';

export const DIE_LETTERS = 'PNBRQK';
type Send = (command: CommandFrame | ClientCommand) => boolean;

export class LaboratoryGame {
	state = $state<LaboratoryGameState | null>(null);
	seat = $state<Seat>('White');
	connected = $state(false);
	pending = $state(false);
	error = $state<string | null>(null);
	tentative = $state<PairIndex | null>(null);
	draft = $state<string[]>([]);
	tree = $state<MoveTree | null>(null);
	drawArmed = $state(false);
	lastPass = $state<string | null>(null);
	private commandId: string | null = null;
	private appliedVersion: number | null = null;
	private observedAt = 0;
	private treeEpoch = 0;
	private simpleVersion: number | null = null;
	private awaitingArm = false;

	constructor(
		private api: LaboratoryApi,
		private gameId: () => string | null,
		private send: Send,
	) {}

	get canAct(): boolean {
		return (
			!!this.state &&
			this.connected &&
			!this.pending &&
			!('Ended' in this.state.status) &&
			this.state.activeSeat === this.seat
		);
	}
	get canMove(): boolean {
		return (
			this.canAct && this.state?.lab.turn.phase === 'PlayingSelectedPair' && this.tree !== null
		);
	}
	get boardDfen(): string {
		let position = this.state?.dfen ?? '';
		for (const move of this.draft) {
			position =
				DiceChess.applyMove(position, move.slice(0, 2), move.slice(2, 4), move[4]) ?? position;
		}
		return position;
	}
	get remainingDice(): number[] {
		return (this.boardDfen.split(/\s+/)[6] ?? '')
			.toUpperCase()
			.split('')
			.map((letter) => DIE_LETTERS.indexOf(letter) + 1)
			.filter((die) => die > 0);
	}
	get node(): MoveTree | null {
		let node = this.tree;
		for (const move of this.draft) node = node?.[move] ?? null;
		return node;
	}
	get moves(): string[] {
		return this.canMove ? Object.keys(this.node ?? {}) : [];
	}
	get complete(): boolean {
		return this.draft.length > 0 && this.node !== null && Object.keys(this.node).length === 0;
	}

	accept(state: LaboratoryGameState, seat: Seat): void {
		if (this.state && state.version < this.state.version) return;
		const changed =
			!this.state || state.version !== this.state.version || state.dfen !== this.state.dfen;
		if (changed) {
			this.treeEpoch += 1;
			this.draft = [];
			this.tentative = null;
			this.tree = validMoveTree(state.legalMoves) ? state.legalMoves : null;
			this.simpleVersion = null;
		}
		this.state = state;
		this.seat = seat;
		this.observedAt = performance.now();
		if (this.appliedVersion !== null && state.version >= this.appliedVersion) this.clearPending();
		if (this.simpleVersion !== null && state.version > this.simpleVersion) this.clearPending();
		if ('Ended' in state.status) {
			this.clearPending();
			this.connected = false;
		}
		if (changed && state.lab.turn.phase === 'PlayingSelectedPair' && this.tree === null)
			void this.loadTree();
	}

	private async loadTree(): Promise<void> {
		const state = this.state;
		const id = this.gameId();
		if (!state || !id) return;
		const epoch = ++this.treeEpoch;
		try {
			const result = await this.api.moves(id);
			if (epoch !== this.treeEpoch || this.state?.version !== state.version) return;
			if (result.version !== state.version || result.dfen !== state.dfen || !result.dicePending)
				return;
			this.tree = result.legalMoves;
			if (this.tree === null) this.error = 'Legal moves are unavailable. Reconnect to try again.';
		} catch {
			if (epoch === this.treeEpoch)
				this.error = 'Legal moves are unavailable. Reconnect to try again.';
		}
	}

	status(connected: boolean, resynced = false): void {
		this.connected = connected;
		if (resynced) {
			this.clearPending();
			this.draft = [];
			this.tentative = null;
		}
	}
	private clearPending(): void {
		this.pending = false;
		this.commandId = null;
		this.appliedVersion = null;
		this.simpleVersion = null;
		this.awaitingArm = false;
	}
	frame(frame: unknown): void {
		if (!isRecord(frame)) return;
		if (
			isRecord(frame.LabCommandApplied) &&
			frame.LabCommandApplied.commandId === this.commandId &&
			Number.isSafeInteger(frame.LabCommandApplied.appliedVersion)
		) {
			this.appliedVersion = Number(frame.LabCommandApplied.appliedVersion);
			if (this.state && this.state.version >= this.appliedVersion) this.clearPending();
		}
		if (isRecord(frame.LabRejected) && frame.LabRejected.commandId === this.commandId) {
			this.clearPending();
			this.draft = [];
			this.error = 'The server rejected this action. The latest position is being restored.';
		}
		if (isRecord(frame.Rejected)) {
			this.clearPending();
			this.error = 'The server rejected this action. Try again from the latest position.';
		}
		if (isRecord(frame.DrawOfferArmed) && typeof frame.DrawOfferArmed.armed === 'boolean') {
			this.drawArmed = frame.DrawOfferArmed.armed;
			if (this.awaitingArm) this.clearPending();
		}
		if (isRecord(frame.TurnPlayed) && Array.isArray(frame.TurnPlayed.moves)) {
			this.lastPass =
				frame.TurnPlayed.moves.length === 0
					? 'The selected pair had no legal moves. Turn passed.'
					: null;
		}
	}
	clock(seat: Seat): string {
		const state = this.state;
		if (!state?.clocks) return '∞';
		let ms = seat === 'White' ? state.clocks.white : state.clocks.black;
		if (
			!('Ended' in state.status) &&
			state.lab.turn.phase !== 'AwaitingPlayers' &&
			seat === state.activeSeat
		)
			ms -= Math.max(0, performance.now() - this.observedAt);
		const seconds = Math.ceil(Math.max(0, ms) / 1000);
		return `${Math.floor(seconds / 60)
			.toString()
			.padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
	}
	offerPlayable(index: PairIndex): boolean | null {
		const pair = this.state?.lab.turn.offers[index];
		if (!pair || !this.state) return null;
		const fen = this.state.dfen.split(/\s+/).slice(0, 6).join(' ');
		let letters = pair.map((die) => DIE_LETTERS[die - 1]).join('');
		if (this.state.activeSeat === 'Black') letters = letters.toLowerCase();
		try {
			return DiceChess.getLegalUciMoves(`${fen} ${letters}`).length > 0;
		} catch {
			return null;
		}
	}
	private command(action: Action): void {
		if (!this.canAct || !this.state) return;
		const commandId = crypto.randomUUID();
		this.pending = true;
		this.commandId = commandId;
		this.error = null;
		if (!this.send({ LabCommand: { commandId, expectedVersion: this.state.version, action } }))
			this.clearPending();
	}
	rollFirst(): void {
		if (this.state?.lab.turn.phase === 'AwaitingFirstRoll') this.command({ RollFirst: {} });
	}
	rollSecond(): void {
		if (this.state?.lab.turn.phase === 'AwaitingSecondRoll') this.command({ RollSecond: {} });
	}
	chooseTentative(index: PairIndex): void {
		if (
			this.canAct &&
			this.state?.lab.turn.phase === 'AwaitingPairChoice' &&
			(index === 0 || index === 1)
		)
			this.tentative = index;
	}
	confirmPair(): void {
		if (this.tentative !== null && this.state?.lab.turn.phase === 'AwaitingPairChoice')
			this.command({ ChoosePair: { pairIndex: this.tentative } });
	}
	move(uci: string): void {
		if (!this.moves.includes(uci)) return;
		try {
			if (!DiceChess.applyMove(this.boardDfen, uci.slice(0, 2), uci.slice(2, 4), uci[4])) return;
			this.draft = [...this.draft, uci];
			this.error = null;
		} catch {
			this.error = 'This move could not be displayed. Reconnect to restore the position.';
		}
	}
	undo(): void {
		if (this.canMove) this.draft = this.draft.slice(0, -1);
	}
	submit(): void {
		if (this.complete && this.draft.length <= 2)
			this.command({ SubmitTurn: { moves: this.draft as [string] | [string, string] } });
	}
	private simple(command: ClientCommand): void {
		if (!this.connected || this.pending || !this.state || 'Ended' in this.state.status) return;
		this.pending = true;
		this.error = null;
		this.simpleVersion = this.state.version;
		this.awaitingArm = 'ArmDrawOffer' in command;
		if (!this.send(command)) this.clearPending();
	}
	resign(): void {
		this.simple({ Resign: {} });
	}
	respondDraw(accept: boolean): void {
		if (this.canAct && this.state?.drawOffer?.pending) this.simple({ RespondDraw: { accept } });
	}
	armDraw(armed: boolean): void {
		this.simple({ ArmDrawOffer: { armed } });
	}
	destroy(): void {
		this.treeEpoch += 1;
		this.connected = false;
		this.clearPending();
	}
	reset(): void {
		this.destroy();
		this.state = null;
		this.draft = [];
		this.tree = null;
		this.tentative = null;
		this.error = null;
		this.lastPass = null;
		this.drawArmed = false;
	}
}
