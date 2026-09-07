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
