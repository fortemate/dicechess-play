import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { settlementLine } from './stakeSettlement';
import type { Doubling, Over, PublicGameState, ServerEvent } from './liveTypes';

// The canonical play-api contract examples (see fixtures/stake-doubling/README.md): the tests read
// the amounts from them rather than inventing a stake, so a contract change shows up here first.
function fixture<T>(name: string): T {
	return JSON.parse(
		readFileSync(
			path.join(process.cwd(), 'src/lib/live/fixtures/stake-doubling', `${name}.json`),
			'utf8',
		),
	) as T;
}

const stateResponse = fixture<PublicGameState>('state-response');
const doubling = stateResponse.doubling as Doubling;
const declined =
	fixture<Extract<ServerEvent, { DoubleDeclined: unknown }>>('event-declined').DoubleDeclined;
const accepted =
	fixture<Extract<ServerEvent, { DoubleAccepted: unknown }>>('event-accepted').DoubleAccepted;

const whiteWon: Over = { result: { Win: { side: 'White' } }, termination: 'DoubleDeclined' };
const drawn: Over = { result: { Draw: {} }, termination: 'Draw' };
const aborted: Over = { result: { Draw: {} }, termination: 'Aborted' };

describe('settlementLine', () => {
	it('signs the server stake from the viewer’s seat', () => {
		expect(doubling.currentStake).toBe(10);
		expect(settlementLine(doubling, whiteWon, 'White')).toBe('+10 credits');
		expect(settlementLine(doubling, whiteWon, 'Black')).toBe('−10 credits');
	});

	it('names the winner for a spectator, who has no side to sign from', () => {
		expect(settlementLine(doubling, whiteWon, null)).toBe('10 credits to White');
	});

	it('settles nothing on a draw and releases the reservations on a technical abort', () => {
		expect(settlementLine(doubling, drawn, 'White')).toBe('No credits change hands');
		expect(settlementLine(doubling, aborted, 'Black')).toBe('Reservations released');
	});

	it('is silent for a classic game', () => {
		expect(settlementLine(null, whiteWon, 'White')).toBeNull();
		expect(settlementLine(undefined, drawn, null)).toBeNull();
	});

	it('a drop settles the pre-offer stake the DoubleDeclined event names, never the proposed one', () => {
		// The contract example drops a 10 → 20 offer: the decliner loses 10.
		expect(declined.proposedStake).toBe(20);
		expect(declined.currentStake).toBe(doubling.currentStake);
		const atDrop: Doubling = { ...doubling, currentStake: declined.currentStake };
		expect(settlementLine(atDrop, whiteWon, 'Black')).toBe('−10 credits');
	});

	it('after an accepted double the settled amount is the doubled stake the server sent', () => {
		expect(accepted.currentStake).toBe(20);
		const afterTake: Doubling = {
			...doubling,
			currentStake: accepted.currentStake,
			cubeValue: accepted.cubeValue,
			cubeOwner: accepted.cubeOwner,
		};
		const blackWon: Over = { result: { Win: { side: 'Black' } }, termination: 'KingCaptured' };
		expect(settlementLine(afterTake, blackWon, 'Black')).toBe('+20 credits');
		expect(settlementLine(afterTake, blackWon, 'White')).toBe('−20 credits');
	});

	it('uses the singular for a one-credit stake', () => {
		expect(settlementLine({ ...doubling, currentStake: 1 }, whiteWon, 'White')).toBe('+1 credit');
	});
});
