/** Public review tests validate transcripts through the records parser and keep live session state isolated. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';

const boardStub = vi.hoisted(() => async () => ({
	default: (await import('../routes/live/[id]/ChildStub.test.svelte')).default,
}));
vi.mock('./LaboratoryBoard.svelte', boardStub);

import LaboratoryReview from './LaboratoryReview.svelte';
import { LaboratoryApi } from '../lib/laboratory/api';
import type { LaboratoryGameState } from '../lib/laboratory/api';
import {
	LaboratoryRecordsApi,
	parseLaboratoryTranscript,
	type LaboratoryTranscript,
} from '../lib/laboratory/records';
import type { LaboratorySession } from '../lib/laboratory/session.svelte';

const rulesVersion = '0.18.2';
const sourceGameId = 'a12b3456-7890-4abc-def0-1234567890ab';
const friendToken = 'friend_private_capability_2';
const ownToken = 'own_private_capability_1';
const variant = { id: 'choice-2x2d6', revision: 1 } as const;
const provenance = { rulesVersion, diceAlgorithm: 'choice-2x2d6-hmac-sha256-v1' } as const;
const timeControl = { Fischer: { initialSeconds: 600, incrementSeconds: 10 } } as const;
const initialDfen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function completeTranscript(): LaboratoryTranscript {
	return parseLaboratoryTranscript(
		{
			schemaVersion: 1,
			variant,
			provenance,
			timeControl,
			initialDfen,
			status: { Ended: { over: { result: { Draw: {} }, termination: 'Draw' } } },
			completeness: 'complete',
			turns: [
				{
					turnNumber: 1,
					activeColor: 'w',
					offers: [
						[2, 3],
						[5, 6],
					],
					selectedPairIndex: 1,
					dice: [5, 6],
					moves: ['b1c3'],
					fenAfter: 'rnbqkbnr/pppppppp/8/8/8/2N5/PPPPPPPP/R1BQKBNR b KQkq - 1 1',
				},
				{
					turnNumber: 2,
					activeColor: 'b',
					offers: [
						[6, 2],
						[1, 4],
					],
					selectedPairIndex: 0,
					dice: [6, 2],
					moves: [],
					fenAfter: 'rnbqkbnr/pppppppp/8/8/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 2 2',
				},
			],
			currentTurn: { phase: 'Ended', offers: [], selectedPairIndex: null },
			fairness: {
				commit: 'ab'.repeat(32),
				serverSeed: 'cd'.repeat(32),
				clientSeeds: { white: '12'.repeat(16), black: '34'.repeat(16) },
			},
		},
		rulesVersion,
	);
}

function incompleteTranscript(): LaboratoryTranscript {
	return parseLaboratoryTranscript(
		{
			schemaVersion: 1,
			variant,
			provenance,
			timeControl,
			initialDfen,
			status: { Active: {} },
			completeness: 'incomplete',
			turns: [],
			currentTurn: {
				phase: 'AwaitingPairChoice',
				offers: [
					[6, 2],
					[3, 3],
				],
				selectedPairIndex: null,
			},
			fairness: null,
		},
		rulesVersion,
	);
}

function sessionStub(overrides: Record<string, unknown> = {}) {
	const liveState = {
		version: 23,
		dfen: initialDfen,
		status: { Ended: { over: { result: { Draw: {} }, termination: 'Draw' } } },
	} as unknown as LaboratoryGameState;
	return {
		access: {
			mine: { gameId: sourceGameId, seat: 'White', token: ownToken },
			invitation: {
				gameId: sourceGameId,
				seat: 'Black',
				token: friendToken,
			},
		},
		ended: true,
		state: liveState,
		game: { seat: 'White', draft: ['live-draft'] },
		rematchPending: false,
		rematchWaiting: false,
		rematch: vi.fn(),
		...overrides,
	} as unknown as LaboratorySession;
}

function setup(transcript = completeTranscript(), session = sessionStub()) {
	const api = new LaboratoryApi('https://lab.example', rulesVersion);
	const load = vi.spyOn(LaboratoryRecordsApi.prototype, 'transcript').mockResolvedValue(transcript);
	const result = render(LaboratoryReview, { props: { api, session } });
	return { api, load, result, session };
}

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('LaboratoryReview', () => {
	it('loads a complete record and navigates positions without mutating the live game', async () => {
		const record = completeTranscript();
		const session = sessionStub();
		const liveState = session.state;
		const liveDraft = session.game.draft;
		const { load } = setup(record, session);

		await fireEvent.click(screen.getByRole('button', { name: 'Review game record' }));
		expect(await screen.findByRole('heading', { name: 'Game record' })).toBeInTheDocument();
		expect(load).toHaveBeenCalledWith(sourceGameId);
		expect(screen.getByText(/Complete record/)).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Turn 2 · Black' })).toBeInTheDocument();
		expect(screen.getByText('No legal moves — turn passed')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Previous turn' }));
		expect(screen.getByRole('heading', { name: 'Turn 1 · White' })).toBeInTheDocument();
		expect(screen.getByText(/b1c3/)).toBeInTheDocument();
		expect(document.body.textContent?.replace(/\s+/g, ' ')).toContain('Selected pair');
		await fireEvent.click(screen.getByRole('button', { name: 'Start' }));
		expect(screen.getByRole('heading', { name: 'Initial position' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Next turn' }));
		expect(screen.getByRole('heading', { name: 'Turn 1 · White' })).toBeInTheDocument();
		expect(session.state).toBe(liveState);
		expect(session.game.draft).toBe(liveDraft);
	});

	it('shows incomplete transcript current-turn offers and selection state', async () => {
		const { load } = setup(incompleteTranscript());
		await fireEvent.click(screen.getByRole('button', { name: 'Review game record' }));
		expect(await screen.findByText(/Incomplete record/)).toBeInTheDocument();
		expect(load).toHaveBeenCalledWith(sourceGameId);
		expect(screen.getByText('Awaiting pair choice')).toBeInTheDocument();
		const visible = document.body.textContent?.replace(/\s+/g, ' ');
		expect(visible).toContain('Pair 1: king + knight');
		expect(visible).toContain('Pair 2: bishop + bishop');
	});

	it('downloads only the validated public record, without either seat capability', async () => {
		const record = completeTranscript();
		const captured: BlobPart[][] = [];
		const NativeBlob = Blob;
		class CaptureBlob extends NativeBlob {
			constructor(parts: BlobPart[], options?: BlobPropertyBag) {
				super(parts, options);
				captured.push(parts);
			}
		}
		const createObjectURL = vi.fn(() => 'blob:public-record');
		const revokeObjectURL = vi.fn();
		const NativeURL = URL;
		vi.stubGlobal('Blob', CaptureBlob);
		vi.stubGlobal(
			'URL',
			Object.assign(class extends NativeURL {}, { createObjectURL, revokeObjectURL }),
		);
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		setup(record);

		await fireEvent.click(screen.getByRole('button', { name: 'Review game record' }));
		await screen.findByRole('heading', { name: 'Game record' });
		await fireEvent.click(screen.getByRole('button', { name: /Download versioned record/ }));

		expect(createObjectURL).toHaveBeenCalledTimes(1);
		expect(click).toHaveBeenCalledTimes(1);
		expect(captured).toHaveLength(1);
		const serialized = String(captured[0][0]);
		expect(JSON.parse(serialized)).toEqual(record);
		expect(serialized).not.toContain(ownToken);
		expect(serialized).not.toContain(friendToken);
	});

	it('recovers from a record error and ignores a response for a previous game id', async () => {
		const first = completeTranscript();
		const second = incompleteTranscript();
		const session = sessionStub();
		const api = new LaboratoryApi('https://lab.example', rulesVersion);
		let finishFirst!: (record: LaboratoryTranscript) => void;
		const load = vi.spyOn(LaboratoryRecordsApi.prototype, 'transcript');
		load.mockRejectedValueOnce(new Error('unavailable'));
		load.mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)));
		load.mockResolvedValueOnce(second);
		const initial = render(LaboratoryReview, { props: { api, session } });
		await fireEvent.click(screen.getByRole('button', { name: 'Review game record' }));
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'The laboratory record is unavailable. Try again.',
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Review game record' }));
		await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
		const nextSession = sessionStub({
			access: {
				mine: { gameId: 'c12b3456-7890-4abc-def0-1234567890ab', seat: 'White', token: ownToken },
			},
		});
		await initial.rerender({ api, session: nextSession });
		finishFirst(first);
		await Promise.resolve();
		await Promise.resolve();
		expect(screen.queryByRole('heading', { name: 'Game record' })).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Review game record' }));
		expect(await screen.findByText(/Incomplete record/)).toBeInTheDocument();
		expect(load).toHaveBeenLastCalledWith('c12b3456-7890-4abc-def0-1234567890ab');
	});

	it('hides aborted rematches and exposes waiting consent checks and withdrawal', async () => {
		const aborted = sessionStub({
			state: {
				version: 23,
				status: { Ended: { over: { result: { Draw: {} }, termination: 'Aborted' } } },
			} as LaboratoryGameState,
		});
		const abortedView = setup(completeTranscript(), aborted);
		expect(screen.queryByRole('button', { name: 'Offer rematch' })).not.toBeInTheDocument();
		abortedView.result.unmount();

		const rematch = vi.fn();
		const waiting = sessionStub({ rematchWaiting: true, rematch });
		setup(completeTranscript(), waiting);
		await fireEvent.click(screen.getByRole('button', { name: 'Check rematch' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Withdraw consent' }));
		expect(screen.getByRole('status')).toHaveTextContent(
			"Waiting for your friend's consent. Check again after they accept.",
		);
		expect(rematch).toHaveBeenNthCalledWith(1);
		expect(rematch).toHaveBeenNthCalledWith(2, false);
		expect(waiting.access?.mine.gameId).toBe(sourceGameId);
	});
});
