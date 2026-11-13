/**
 * Pins the laboratory client's server-authoritative command and draft rules. Legal move fixtures
 * come from the real rules package, while the transport is injected so receipts and snapshots can
 * be delivered independently and in adversarial order.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiceChess } from '@fortemate/dicechess-engine/rules';
import type { MoveTree } from '../moveTreeWalker';
import type { LaboratoryApi, LaboratoryGameState } from './api';
import { LaboratoryGame } from './game.svelte';
import type { PublicTurn } from './protocol';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const gameId = 'a12b3456-7890-4abc-def0-1234567890ab';
const commandId = 'b12b3456-7890-4abc-def0-1234567890ab';

function treeFor(dfen: string): MoveTree {
	const tree: MoveTree = {};
	for (const move of DiceChess.getLegalUciMoves(dfen)) {
		const next = DiceChess.applyMove(dfen, move.slice(0, 2), move.slice(2, 4), move[4]);
		if (!next) continue;
		const diceLeft = next.split(/\s+/)[6] ?? '';
		const kingCaptured = (next.split(/\s+/)[0].match(/k/gi) ?? []).length < 2;
		tree[move] = diceLeft && !kingCaptured ? treeFor(next) : {};
	}
	return tree;
}

function turn(phase: PublicTurn['phase']): PublicTurn {
	switch (phase) {
		case 'AwaitingPlayers':
		case 'AwaitingFirstRoll':
			return { phase, offers: [], selectedPairIndex: null };
		case 'AwaitingSecondRoll':
			return { phase, offers: [[2, 2]], selectedPairIndex: null };
		case 'AwaitingPairChoice':
			return {
				phase,
				offers: [
					[2, 2],
					[2, 2],
				],
				selectedPairIndex: null,
			};
		case 'PlayingSelectedPair':
			return {
				phase,
				offers: [
					[2, 2],
					[2, 2],
				],
				selectedPairIndex: 0,
			};
		case 'Ended':
			return { phase, offers: [], selectedPairIndex: null };
	}
}

function state(
	phase: PublicTurn['phase'] = 'PlayingSelectedPair',
	overrides: Partial<LaboratoryGameState> = {},
): LaboratoryGameState {
	const dfen = overrides.dfen ?? `${START} NN`;
	return {
		version: 7,
		dfen,
		activeSeat: 'White',
		dicePending: true,
		status: { Active: {} },
		clocks: { white: 600_000, black: 600_000 },
		players: {
			white: { kind: 'Human', name: null },
			black: { kind: 'Human', name: null },
		},
		rated: false,
		ratingDomain: 'casual',
		timeControl: { Fischer: { initialSeconds: 600, incrementSeconds: 10 } },
		commit: 'ab'.repeat(32),
		lab: {
			variant: { id: 'choice-2x2d6', revision: 1 },
			protocolVersion: 1,
			provenance: {
				rulesVersion: '0.18.2',
				diceAlgorithm: 'choice-2x2d6-hmac-sha256-v1',
			},
			turn: turn(phase),
		},
		legalMoves: phase === 'PlayingSelectedPair' ? treeFor(dfen) : null,
		...overrides,
	};
}

function setup(initial = state()) {
	const send = vi.fn((_command: unknown) => true);
	const moves = vi.fn();
	const api = { moves } as unknown as LaboratoryApi;
	const game = new LaboratoryGame(api, () => gameId, send);
	game.connected = true;
	game.accept(initial, 'White');
	return { game, send, moves };
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('LaboratoryGame', () => {
	it('gates commands by stage, active seat, and connection status', () => {
		const wrongSeat = setup(state('AwaitingFirstRoll', { activeSeat: 'Black' }));
		wrongSeat.game.rollFirst();
		expect(wrongSeat.send).not.toHaveBeenCalled();

		const wrongStage = setup(state('AwaitingSecondRoll'));
		wrongStage.game.rollFirst();
		expect(wrongStage.send).not.toHaveBeenCalled();
		wrongStage.game.rollSecond();
		expect(wrongStage.send).toHaveBeenCalledTimes(1);

		const disconnected = setup(state('AwaitingFirstRoll'));
		disconnected.game.status(false);
		disconnected.game.rollFirst();
		expect(disconnected.game.canAct).toBe(false);
		expect(disconnected.send).not.toHaveBeenCalled();
	});

	it('coalesces duplicate roll clicks into one versioned UUID command', () => {
		vi.stubGlobal('crypto', { randomUUID: vi.fn(() => commandId) });
		const { game, send } = setup(state('AwaitingFirstRoll'));
		game.rollFirst();
		game.rollFirst();
		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith({
			LabCommand: {
				commandId,
				expectedVersion: 7,
				action: { RollFirst: {} },
			},
		});
		expect(game.pending).toBe(true);
	});

	it('keeps tentative pair choice local until explicit confirmation, then freezes it pending', () => {
		vi.stubGlobal('crypto', { randomUUID: vi.fn(() => commandId) });
		const { game, send } = setup(state('AwaitingPairChoice'));
		game.chooseTentative(1);
		expect(game.tentative).toBe(1);
		expect(send).not.toHaveBeenCalled();
		game.confirmPair();
		game.chooseTentative(0);
		game.confirmPair();
		expect(game.tentative).toBe(1);
		expect(send).toHaveBeenCalledTimes(1);
		expect(send.mock.calls[0][0]).toMatchObject({
			LabCommand: { expectedVersion: 7, action: { ChoosePair: { pairIndex: 1 } } },
		});
	});

	it('keeps equal offers addressable by index and allows choosing a pair with no legal move', () => {
		const choice = state('AwaitingPairChoice', {
			lab: {
				...state('AwaitingPairChoice').lab,
				turn: {
					phase: 'AwaitingPairChoice',
					offers: [
						[6, 6],
						[6, 6],
					],
					selectedPairIndex: null,
				},
			},
		});
		const { game, send } = setup(choice);
		expect(game.state?.lab.turn.offers).toEqual([
			[6, 6],
			[6, 6],
		]);
		expect(game.offerPlayable(0)).toBe(false);
		expect(game.offerPlayable(1)).toBe(false);
		game.chooseTentative(1);
		game.confirmPair();
		expect(send).toHaveBeenCalledTimes(1);
		expect(send.mock.calls[0][0]).toMatchObject({
			LabCommand: { action: { ChoosePair: { pairIndex: 1 } } },
		});
	});

	it('waits for both the receipt and an applied-version snapshot before unlocking', () => {
		vi.stubGlobal('crypto', { randomUUID: vi.fn(() => commandId) });
		const { game } = setup(state('AwaitingFirstRoll'));
		game.rollFirst();
		game.frame({ LabCommandApplied: { commandId, appliedVersion: 9 } });
		expect(game.pending).toBe(true);
		game.accept(state('AwaitingSecondRoll', { version: 8 }), 'White');
		expect(game.pending).toBe(true);
		game.accept(state('AwaitingSecondRoll', { version: 9 }), 'White');
		expect(game.pending).toBe(false);
	});

	it('clears a rejected draft and does not retry its submitted turn', () => {
		vi.stubGlobal('crypto', { randomUUID: vi.fn(() => commandId) });
		const dfen = `${START} N`;
		const { game, send } = setup(
			state('PlayingSelectedPair', { dfen, legalMoves: { b1c3: {} } as MoveTree }),
		);
		game.move('b1c3');
		expect(game.complete).toBe(true);
		game.submit();
		expect(send).toHaveBeenCalledTimes(1);
		game.frame({ LabRejected: { commandId, code: 'StaleVersion' } });
		expect(game.pending).toBe(false);
		expect(game.draft).toEqual([]);
		game.submit();
		expect(send).toHaveBeenCalledTimes(1);
	});

	it('disables a disconnected game and drops its draft on resync without rerolling', () => {
		const { game, send } = setup(
			state('PlayingSelectedPair', { dfen: `${START} N`, legalMoves: { b1c3: {} } as MoveTree }),
		);
		game.move('b1c3');
		game.status(false);
		expect(game.canAct).toBe(false);
		expect(game.draft).toEqual(['b1c3']);
		game.status(true, true);
		expect(game.draft).toEqual([]);
		game.rollFirst();
		expect(send).not.toHaveBeenCalled();
	});

	it('ignores stale state versions without discarding the current draft', () => {
		const current = state('PlayingSelectedPair', {
			dfen: `${START} N`,
			legalMoves: { b1c3: {} } as MoveTree,
		});
		const { game } = setup(current);
		game.move('b1c3');
		game.accept(state('AwaitingFirstRoll', { version: 6 }), 'Black');
		expect(game.state?.version).toBe(7);
		expect(game.seat).toBe('White');
		expect(game.draft).toEqual(['b1c3']);
	});

	it('resets for a new room whose authoritative version starts lower', () => {
		const { game, send } = setup(
			state('PlayingSelectedPair', {
				version: 700,
				dfen: `${START} N`,
				legalMoves: { b1c3: {} } as MoveTree,
			}),
		);
		game.move('b1c3');
		game.reset();
		expect(game.state).toBeNull();
		expect(game.draft).toEqual([]);
		expect(game.tree).toBeNull();
		expect(game.connected).toBe(false);
		game.connected = true;
		game.accept(
			state('AwaitingFirstRoll', {
				version: 0,
				dfen: START.replace(' w ', ' b '),
				activeSeat: 'Black',
			}),
			'Black',
		);
		game.rollFirst();
		expect(game.state?.version).toBe(0);
		expect(send).toHaveBeenCalledTimes(1);
		expect(send.mock.calls[0][0]).toMatchObject({
			LabCommand: { expectedVersion: 0, action: { RollFirst: {} } },
		});
	});

	it('uses the real rules tree to castle with the king die and move the rook', () => {
		const castleFen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
		const dfen = `${castleFen} KR`;
		const tree = treeFor(dfen);
		expect(tree).toHaveProperty('e1g1');
		const { game } = setup(state('PlayingSelectedPair', { dfen, legalMoves: tree }));
		game.move('e1g1');
		expect(game.complete).toBe(true);
		expect(game.boardDfen.split(' ')[0]).toContain('R4RK1');
		expect(game.remainingDice).toEqual([]);
	});

	it('requires explicit promotion and preserves a king capture without a promotion suffix', () => {
		const promotionDfen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1 P';
		const promotionTree = treeFor(promotionDfen);
		expect(promotionTree).toHaveProperty('a7a8q');
		const promotion = setup(
			state('PlayingSelectedPair', { dfen: promotionDfen, legalMoves: promotionTree }),
		);
		promotion.game.move('a7a8');
		expect(promotion.game.draft).toEqual([]);
		promotion.game.move('a7a8q');
		expect(promotion.game.boardDfen.split(' ')[0]).toMatch(/^Q/);

		const captureDfen = 'k7/8/8/8/8/8/8/Q3K3 w - - 0 1 Q';
		const captureTree = treeFor(captureDfen);
		expect(captureTree).toHaveProperty('a1a8');
		expect(captureTree).not.toHaveProperty('a1a8q');
		const capture = setup(
			state('PlayingSelectedPair', { dfen: captureDfen, legalMoves: captureTree }),
		);
		capture.game.move('a1a8');
		expect(capture.game.draft).toEqual(['a1a8']);
		expect(capture.game.draft[0]).toHaveLength(4);
	});

	it('does not submit before the supplied tree has consumed its available dice', () => {
		const dfen = `${START} NN`;
		const tree: MoveTree = { b1c3: { g1f3: {} } };
		const { game, send } = setup(state('PlayingSelectedPair', { dfen, legalMoves: tree }));
		game.move('b1c3');
		expect(game.complete).toBe(false);
		game.submit();
		expect(send).not.toHaveBeenCalled();
		game.move('g1f3');
		expect(game.complete).toBe(true);
		game.submit();
		expect(send).toHaveBeenCalledTimes(1);
	});

	it('keeps the clock running during second roll, pair choice, and disconnect, but pauses while waiting', async () => {
		vi.useFakeTimers();
		for (const phase of [
			'AwaitingSecondRoll',
			'AwaitingPairChoice',
			'PlayingSelectedPair',
		] as const) {
			const { game } = setup(state(phase));
			const before = game.clock('White');
			await vi.advanceTimersByTimeAsync(1100);
			expect(game.clock('White')).not.toBe(before);
			game.status(false);
			const disconnected = game.clock('White');
			await vi.advanceTimersByTimeAsync(1100);
			expect(game.clock('White')).not.toBe(disconnected);
		}
		const waiting = setup(state('AwaitingPlayers'));
		const before = waiting.game.clock('White');
		await vi.advanceTimersByTimeAsync(1500);
		expect(waiting.game.clock('White')).toBe(before);
	});

	it('fences late legal-move fetches against a newer authoritative snapshot', async () => {
		let finish!: (value: {
			version: number;
			dfen: string;
			dicePending: boolean;
			legalMoves: MoveTree;
		}) => void;
		const moves = vi.fn(
			() =>
				new Promise<{
					version: number;
					dfen: string;
					dicePending: boolean;
					legalMoves: MoveTree;
				}>((resolve) => {
					finish = resolve;
				}),
		);
		const api = { moves } as unknown as LaboratoryApi;
		const oldState = state('PlayingSelectedPair', {
			dfen: `${START} N`,
			legalMoves: null,
		});
		const game = new LaboratoryGame(
			api,
			() => gameId,
			vi.fn(() => true),
		);
		game.accept(oldState, 'White');
		const freshTree: MoveTree = { g1f3: {} };
		game.accept(
			state('PlayingSelectedPair', {
				version: 8,
				dfen: `${START} B`,
				legalMoves: { f1c4: {} } as MoveTree,
			}),
			'White',
		);
		finish({ version: 7, dfen: oldState.dfen, dicePending: true, legalMoves: freshTree });
		await Promise.resolve();
		await Promise.resolve();
		expect(moves).toHaveBeenCalledTimes(1);
		expect(game.tree).toEqual({ f1c4: {} });
	});

	it('rejects a move-tree response whose DFEN does not match its version', async () => {
		let finish!: (value: {
			version: number;
			dfen: string;
			dicePending: boolean;
			legalMoves: MoveTree;
		}) => void;
		const moves = vi.fn(
			() =>
				new Promise<{
					version: number;
					dfen: string;
					dicePending: boolean;
					legalMoves: MoveTree;
				}>((resolve) => {
					finish = resolve;
				}),
		);
		const api = { moves } as unknown as LaboratoryApi;
		const current = state('PlayingSelectedPair', {
			dfen: `${START} N`,
			legalMoves: null,
		});
		const game = new LaboratoryGame(
			api,
			() => gameId,
			vi.fn(() => true),
		);
		game.accept(current, 'White');
		finish({
			version: current.version,
			dfen: `${START} B`,
			dicePending: true,
			legalMoves: { f1c4: {} },
		});
		await Promise.resolve();
		await Promise.resolve();
		expect(moves).toHaveBeenCalledTimes(1);
		expect(game.tree).toBeNull();
	});
});
