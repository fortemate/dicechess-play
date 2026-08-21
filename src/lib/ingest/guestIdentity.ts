// Per-browser anonymous guest identity for the play site.
//
// Phase 1 decision (ADR-0003): the analytics player identity for a visitor is
// `guest:<uuidv7>`, persisted in localStorage so a returning visitor aggregates under
// ONE players row (per-browser, not per-game). The id doubles as a "restore code" the
// user can copy to carry their identity to another device.
//
// The `guest:` prefix is non-overlapping with dicechess.com integer ids, beturanga
// 24-hex ObjectIds, and the reserved `bot:<algorithm>` namespace, so it shares the
// analytics players table safely. See wiki "08 Идентичность, источники и дедупликация".

import { v7 as uuidv7 } from 'uuid';

const STORAGE_KEY = 'dicechess-play-guest-id';
const GUEST_RE = /^guest:[0-9a-f-]{36}$/i;

function isValidGuestId(value: string | null | undefined): value is string {
	return !!value && GUEST_RE.test(value);
}

/** Returns the stable per-browser guest external_id, minting and persisting one on first use. */
export function getGuestId(): string {
	if (typeof localStorage === 'undefined') {
		// SSR / non-browser: mint an ephemeral id (this path should not record games).
		return `guest:${uuidv7()}`;
	}
	let id: string | null = null;
	try {
		id = localStorage.getItem(STORAGE_KEY);
	} catch {
		// localStorage blocked (private mode) — fall through to ephemeral id.
	}
	if (isValidGuestId(id)) return id;

	const fresh = `guest:${uuidv7()}`;
	try {
		localStorage.setItem(STORAGE_KEY, fresh);
	} catch {
		// ignore — ephemeral for this session
	}
	return fresh;
}

/** The bare uuid — `getGuestId()` without its `guest:` prefix. play-api's `POST /games`,
 * `/lobby/seeks`, and `/lobby/seeks/{id}/accept` wrap whatever id they're given in their own
 * `Principal.Guest(id)`, whose `externalId` prepends `guest:` itself; passing the already-prefixed
 * `getGuestId()` there double-prefixes it (`guest:guest:<uuid>`, see dicechess-play-api#14). Use
 * this instead for `createGame`/`createSeek`/`acceptSeek`; `getGuestId()` stays canonical everywhere
 * else (ingest, the /me restore code).
 */
export function getGuestUuid(): string {
	return getGuestId().slice('guest:'.length);
}

/** Restore a guest identity from a code copied on another device. Returns false if malformed. */
export function setGuestId(code: string): boolean {
	const trimmed = code.trim();
	if (!isValidGuestId(trimmed)) return false;
	try {
		localStorage.setItem(STORAGE_KEY, trimmed);
	} catch {
		return false;
	}
	return true;
}

/** Discards the current identity and mints a fresh one (e.g. "play as someone new"). */
export function resetGuestId(): string {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
	return getGuestId();
}
