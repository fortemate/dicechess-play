// Wire types for the rematch protocol (play-api ADR 007 / rematch-v1).
// Do not modify field shapes: they mirror the server codecs in RematchWire.scala.

import type { Seat, TimeControl } from './liveTypes';

export type RematchAction = 'propose' | 'accept' | 'decline' | 'cancel';

export type RematchPhase = 'available' | 'offered' | 'starting' | 'matched' | 'closed';

export type RematchCloseReason =
	'declined' | 'cancelled' | 'expired' | 'technical_failure' | 'restart';

export interface RematchSettings {
	timeControl: TimeControl;
	rated: boolean;
	mode: string;
}

export interface RematchJoin {
	seat: Seat;
	token: string;
}

export interface PrivateRematch {
	sourceGameId: string;
	phase: RematchPhase;
	serverNow: string;
	myConsent: boolean;
	allowedActions: RematchAction[];
	settings: RematchSettings;
	deadlineAt?: string | null;
	nextGameId?: string | null;
	joinDeadlineAt?: string | null;
	join?: RematchJoin | null;
	closedReason?: RematchCloseReason | null;
}

export interface RematchRequestBody {
	requestId: string;
	action: RematchAction;
}

export interface RematchErrorResponse {
	error: {
		code: string;
	};
	state?: PrivateRematch;
}

/**
 * The PUBLIC projection of a rematch opportunity (`GET /games/{id}/continuation`), which any
 * viewer may read without a seat. It is deliberately poorer than `PrivateRematch`: no consent
 * identities, no closure reason, no join data — see "Authorization and privacy" in the contract.
 *
 * `phase` collapses the private lifecycle into three public values. In particular an ordinary
 * game that is still being played answers `waiting` with no `deadlineAt`, which is NOT a closed
 * chain: a follower keeps waiting for that game to finish.
 */
export type PublicContinuationPhase = 'waiting' | 'matched' | 'closed';

export interface PublicContinuation {
	sourceGameId: string;
	phase: PublicContinuationPhase;
	serverNow: string;
	/** The current opportunity/response deadline; absent for an active game or a recovering commit. */
	deadlineAt?: string | null;
	/** The committed successor, present only at `matched` and only once it is readable. */
	nextGameId?: string | null;
}
