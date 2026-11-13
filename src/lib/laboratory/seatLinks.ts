/** Laboratory room capability links and session storage. Tokens stay in URL fragments and this
 * module never sends them over the network or reads/writes the main live-game storage.
 */
import type { Seat } from '../live/liveTypes';

export interface SeatAccess {
	gameId: string;
	seat: Seat;
	token: string;
}

export interface RoomAccess {
	mine: SeatAccess;
	invitation?: SeatAccess;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;
const STORAGE_PREFIX = 'dicechess-laboratory-room:';
const SCHEMA_VERSION = 1;

function normalizeGameId(gameId: string): string | null {
	return UUID_PATTERN.test(gameId) ? gameId.toLowerCase() : null;
}

function validateAccess(access: SeatAccess): SeatAccess | null {
	const gameId = typeof access?.gameId === 'string' ? normalizeGameId(access.gameId) : null;
	if (
		!gameId ||
		(access.seat !== 'White' && access.seat !== 'Black') ||
		typeof access.token !== 'string' ||
		!TOKEN_PATTERN.test(access.token)
	) {
		return null;
	}
	return { gameId, seat: access.seat, token: access.token };
}

function buildUrl(origin: string, path: 'invite' | 'game', access: SeatAccess): string {
	const normalizedAccess = validateAccess(access);
	let parsedOrigin: URL;
	try {
		parsedOrigin = new URL(origin);
	} catch {
		throw new Error('Invalid laboratory link input');
	}
	if (
		!normalizedAccess ||
		(parsedOrigin.protocol !== 'https:' && parsedOrigin.protocol !== 'http:') ||
		parsedOrigin.username ||
		parsedOrigin.password ||
		parsedOrigin.pathname !== '/' ||
		parsedOrigin.search ||
		parsedOrigin.hash ||
		parsedOrigin.origin !== origin
	) {
		throw new Error('Invalid laboratory link input');
	}
	const url = new URL(`/${path}/${normalizedAccess.gameId}`, parsedOrigin.origin);
	url.hash = new URLSearchParams({
		token: normalizedAccess.token,
		as: normalizedAccess.seat === 'White' ? 'white' : 'black',
	}).toString();
	return url.toString();
}

export function buildLabInviteUrl(origin: string, access: SeatAccess): string {
	return buildUrl(origin, 'invite', access);
}

export function buildLabBoardUrl(origin: string, access: SeatAccess): string {
	return buildUrl(origin, 'game', access);
}

export type LabLocation =
	| { kind: 'home' }
	| { kind: 'invite' | 'board'; gameId: string; access: SeatAccess | null }
	| { kind: 'invalid' };

function hasDuplicateOrInvalidParams(params: URLSearchParams, allowed: Set<string>): boolean {
	const seen = new Set<string>();
	for (const [key] of params) {
		if (!allowed.has(key) || seen.has(key)) return true;
		seen.add(key);
	}
	return false;
}

export function parseLabLocation(url: URL): LabLocation {
	if (url.pathname === '/') {
		return url.searchParams.has('seat') ||
			url.searchParams.has('token') ||
			url.searchParams.has('as')
			? { kind: 'invalid' }
			: { kind: 'home' };
	}
	const match = /^\/(invite|game)\/([^/]+)$/.exec(url.pathname);
	if (!match) return { kind: 'invalid' };
	if (url.searchParams.has('seat') || url.searchParams.has('token') || url.searchParams.has('as')) {
		return { kind: 'invalid' };
	}
	const gameId = normalizeGameId(match[2]);
	if (!gameId) return { kind: 'invalid' };
	const fragment = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
	if (fragment && fragment.split('&').some((part) => part.length === 0)) return { kind: 'invalid' };
	const params = new URLSearchParams(fragment);
	if (hasDuplicateOrInvalidParams(params, new Set(['token', 'as']))) return { kind: 'invalid' };
	const token = params.get('token');
	const as = params.get('as');
	if (token === null && as === null) {
		return { kind: match[1] === 'invite' ? 'invite' : 'board', gameId, access: null };
	}
	if (
		token === null ||
		as === null ||
		!TOKEN_PATTERN.test(token) ||
		(as !== 'white' && as !== 'black')
	) {
		return { kind: 'invalid' };
	}
	return {
		kind: match[1] === 'invite' ? 'invite' : 'board',
		gameId,
		access: { gameId, seat: as === 'white' ? 'White' : 'Black', token },
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeRoom(value: unknown, expectedGameId: string): RoomAccess | null {
	if (!isRecord(value) || value.schemaVersion !== SCHEMA_VERSION || !isRecord(value.room))
		return null;
	const roomRecord = value.room;
	const mine = isRecord(roomRecord.mine)
		? validateAccess(roomRecord.mine as unknown as SeatAccess)
		: null;
	if (!mine || mine.gameId !== expectedGameId) return null;
	let invitation: SeatAccess | undefined;
	if ('invitation' in roomRecord) {
		if (!isRecord(roomRecord.invitation)) return null;
		invitation = validateAccess(roomRecord.invitation as unknown as SeatAccess) ?? undefined;
		if (
			!invitation ||
			invitation.gameId !== expectedGameId ||
			invitation.seat === mine.seat ||
			invitation.token === mine.token
		) {
			return null;
		}
	}
	return invitation ? { mine, invitation } : { mine };
}

export function saveRoomAccess(storage: Storage, room: RoomAccess): boolean {
	const mine = validateAccess(room?.mine);
	const invitation = room?.invitation === undefined ? undefined : validateAccess(room.invitation);
	if (
		!mine ||
		(room?.invitation !== undefined && !invitation) ||
		(invitation &&
			(invitation.gameId !== mine.gameId ||
				invitation.seat === mine.seat ||
				invitation.token === mine.token))
	) {
		return false;
	}
	try {
		const key = STORAGE_PREFIX + mine.gameId;
		const existingText = storage.getItem(key);
		const existing =
			existingText === null ? null : decodeRoom(JSON.parse(existingText), mine.gameId);
		if (existing && (existing.mine.seat !== mine.seat || existing.mine.token !== mine.token)) {
			return false;
		}
		const savedRoom: RoomAccess = {
			mine,
			...(invitation
				? { invitation }
				: existing?.invitation
					? { invitation: existing.invitation }
					: {}),
		};
		storage.setItem(key, JSON.stringify({ schemaVersion: SCHEMA_VERSION, room: savedRoom }));
		return true;
	} catch {
		return false;
	}
}

export function loadRoomAccess(storage: Storage, gameId: string): RoomAccess | null {
	const normalizedGameId = normalizeGameId(gameId);
	if (!normalizedGameId) return null;
	try {
		const text = storage.getItem(STORAGE_PREFIX + normalizedGameId);
		if (text === null) return null;
		return decodeRoom(JSON.parse(text), normalizedGameId);
	} catch {
		return null;
	}
}
