// Transport for play-api's cookie-session webhook control plane (ADR-004, #48). Rune-free on
// purpose: reactive flow state belongs in `webhookStore`, while this module only mirrors the HTTP
// contract documented at `docs/reference/webhooks.md` in `dicechess-play-api`.
//
// Four invariants make this module security-relevant, and none of them may be "simplified" away:
//
//  1. ONE implementation, TWO roots. `/me/bots/...` and `/admin/bots/...` are served by a single
//     server handler whose only intentional difference is authorization, so the client must not
//     fork either: a duplicated owner/admin path is how status codes and redaction drift apart.
//  2. EVERY mutation is guarded. The server demands a strong `If-Match` revision
//     (`428 webhook_revision_required` otherwise) plus `X-DiceChess-CSRF: 1` and an allow-listed
//     `Origin` (`403 csrf_origin_rejected`). The revision is read from the slot BODY rather than
//     the `ETag` header — both are authoritative and CORS-exposed, but the body is always present.
//  3. Bodies are EXACT. The server rejects unknown and cross-variant fields, so `WebhookSetupRequest`
//     is literally the wire body. Cancellation must send NO body at all (the server treats any
//     byte as `malformed_request`), and every JSON mutation needs exactly one `application/json`
//     `Content-Type`.
//  4. The candidate secret appears in exactly ONE response — `createSetup` — and there is no
//     recovery endpoint. Callers keep it out of stores, logs, analytics, Sentry and storage, and
//     scrub it as soon as activation settles.
//
// Failures are classified, never thrown: the panel has to distinguish "the feature is switched off"
// from "this bot has no webhook" from "your revision is stale", and an exception collapses all
// three. Branch on `code`, never on `detail` — `detail` is prose and may be reworded.

import { isAuthEnabled } from '$lib/auth/authApi';
import { apiBase } from '$lib/live/liveApi';

export type WebhookRoot = 'owner' | 'admin';

export interface WebhookDeliveryFailure {
	at: string;
	reason: string;
}

/** Redacted registration state. The signing secret is absent by construction, not by filtering. */
export interface ManagedWebhookRegistration {
	registrationId: string;
	url: string;
	verifiedAt: string;
	capabilities: string[];
	lastFailure: WebhookDeliveryFailure | null;
}

/** Public metadata for the single live candidate. Candidate credentials never enter this shape. */
export interface ManagedPendingWebhookSetup {
	setupId: string;
	kind: WebhookSetupKind;
	candidateUrl: string;
	createdAt: string;
	expiresAt: string;
	canActivate: boolean;
}

/** The authoritative control-plane state. Both optional members encode as JSON `null`. */
export interface ManagedWebhookSlot {
	revision: string;
	registration: ManagedWebhookRegistration | null;
	pendingSetup: ManagedPendingWebhookSetup | null;
}

/** The only secret-bearing response in the whole session API. */
export interface ManagedWebhookSetupCreated {
	setupId: string;
	kind: WebhookSetupKind;
	secret: string;
	expiresAt: string;
	revision: string;
}

export type WebhookSetupKind = 'create' | 'replaceUrl' | 'rotateSecret';

/**
 * The staged-setup request bodies, mirroring `ManagedWebhookSetupRequest`'s exact decoder
 * field-for-field. `confirmSecretRotation` and `cutoverMode` are literal types because the server
 * accepts exactly one value for each: they exist to make a destructive consequence explicit at the
 * call site, so widening them to `boolean`/`string` would delete the guard.
 */
export type WebhookSetupRequest =
	| { kind: 'create'; url: string; capabilities: string[] }
	| { kind: 'replaceUrl'; url: string; confirmSecretRotation: true }
	| { kind: 'rotateSecret'; cutoverMode: 'dualKey'; confirm: string };

export interface WebhookCapabilityDescriptor {
	name: string;
	status: string;
	selectable: boolean;
}

export interface WebhookCapabilityCatalog {
	capabilities: WebhookCapabilityDescriptor[];
}

/**
 * The stable problem vocabulary from the webhook reference's "Problem types" table. Kept as a
 * literal union so a typo in a branch is a compile error rather than a silently dead arm; an
 * unrecognized code from a newer server degrades to `'unrecognized'` instead of being dropped.
 */
export const WEBHOOK_PROBLEM_CODES = [
	'malformed_request',
	'confirmation_mismatch',
	'authentication_required',
	'bot_not_owned',
	'admin_required',
	'csrf_origin_rejected',
	'bot_not_found',
	'setup_not_found',
	'webhook_already_registered',
	'webhook_not_registered',
	'pending_setup_exists',
	'activation_in_progress',
	'setup_actor_mismatch',
	'replacement_url_unchanged',
	'setup_consumed',
	'setup_cancelled',
	'setup_expired',
	'setup_invalidated',
	'setup_attempts_exhausted',
	'stale_webhook_revision',
	'webhook_url_rejected',
	'webhook_verification_failed',
	'capability_rejected',
	'webhook_revision_required',
	'webhook_verification_rate_limited',
	'webhook_verification_unavailable',
] as const;

export type WebhookProblemCode = (typeof WEBHOOK_PROBLEM_CODES)[number] | 'unrecognized';

const KNOWN_PROBLEM_CODES: ReadonlySet<string> = new Set(WEBHOOK_PROBLEM_CODES);

/** An `application/problem+json` response, normalized for branching. */
export interface WebhookProblem {
	outcome: 'problem';
	status: number;
	code: WebhookProblemCode;
	title: string;
	detail: string;
	/** Present only on `stale_webhook_revision`: the server's current slot, ready to adopt. */
	current: ManagedWebhookSlot | null;
	/** From the `Retry-After` header — the problem body deliberately omits it. */
	retryAfterSeconds: number | null;
}

/**
 * Failures with no problem body. `gated` is the load-bearing one: while the feature gate is closed
 * these routes are not mounted at all and the server answers a PLAIN `404`, exactly as it would for
 * a typo'd path. That is a different situation from `bot_not_found`, which arrives as a problem
 * body, so the discriminator is the body, not the status.
 */
export type WebhookTransportFailure =
	| { outcome: 'gated' }
	| { outcome: 'offline' }
	| { outcome: 'aborted' }
	| { outcome: 'unavailable' };

export type WebhookResult<T> =
	{ outcome: 'ok'; value: T } | WebhookProblem | WebhookTransportFailure;

export function isWebhookProblem<T>(result: WebhookResult<T>): result is WebhookProblem {
	return result.outcome === 'problem';
}

function webhookPath(root: WebhookRoot, team: string, name: string): string {
	const prefix = root === 'admin' ? 'admin' : 'me';
	return `${apiBase()}/${prefix}/bots/${encodeURIComponent(team)}/${encodeURIComponent(name)}/webhook`;
}

/** `If-Match` must carry exactly one STRONG revision — the quotes are part of the contract. */
function mutationHeaders(revision: string, json: boolean): Record<string, string> {
	return {
		'x-dicechess-csrf': '1',
		'if-match': `"${revision}"`,
		...(json ? { 'content-type': 'application/json' } : {}),
	};
}

function retryAfterOf(res: Response): number | null {
	const raw = res.headers.get('retry-after');
	if (raw === null) return null;
	const seconds = Number.parseInt(raw.trim(), 10);
	return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isSetupKind(value: unknown): value is WebhookSetupKind {
	return value === 'create' || value === 'replaceUrl' || value === 'rotateSecret';
}

function isDeliveryFailure(value: unknown): value is WebhookDeliveryFailure {
	return isRecord(value) && typeof value.at === 'string' && typeof value.reason === 'string';
}

function isRegistration(value: unknown): value is ManagedWebhookRegistration {
	return (
		isRecord(value) &&
		typeof value.registrationId === 'string' &&
		typeof value.url === 'string' &&
		typeof value.verifiedAt === 'string' &&
		isStringArray(value.capabilities) &&
		(value.lastFailure === null ||
			value.lastFailure === undefined ||
			isDeliveryFailure(value.lastFailure))
	);
}

function isPendingSetup(value: unknown): value is ManagedPendingWebhookSetup {
	return (
		isRecord(value) &&
		typeof value.setupId === 'string' &&
		isSetupKind(value.kind) &&
		typeof value.candidateUrl === 'string' &&
		typeof value.createdAt === 'string' &&
		typeof value.expiresAt === 'string' &&
		typeof value.canActivate === 'boolean'
	);
}

function isSlot(value: unknown): value is ManagedWebhookSlot {
	return (
		isRecord(value) &&
		typeof value.revision === 'string' &&
		(value.registration === null ||
			value.registration === undefined ||
			isRegistration(value.registration)) &&
		(value.pendingSetup === null ||
			value.pendingSetup === undefined ||
			isPendingSetup(value.pendingSetup))
	);
}

/** Normalize absent optionals to `null` so components never branch on `undefined` as well. */
function normalizeSlot(slot: ManagedWebhookSlot): ManagedWebhookSlot {
	return {
		revision: slot.revision,
		registration: slot.registration
			? { ...slot.registration, lastFailure: slot.registration.lastFailure ?? null }
			: null,
		pendingSetup: slot.pendingSetup ?? null,
	};
}

function isSetupCreated(value: unknown): value is ManagedWebhookSetupCreated {
	return (
		isRecord(value) &&
		typeof value.setupId === 'string' &&
		isSetupKind(value.kind) &&
		typeof value.secret === 'string' &&
		typeof value.expiresAt === 'string' &&
		typeof value.revision === 'string'
	);
}

function isCatalog(value: unknown): value is WebhookCapabilityCatalog {
	return (
		isRecord(value) &&
		Array.isArray(value.capabilities) &&
		value.capabilities.every(
			(entry) =>
				isRecord(entry) &&
				typeof entry.name === 'string' &&
				typeof entry.status === 'string' &&
				typeof entry.selectable === 'boolean',
		)
	);
}

async function readJson(res: Response): Promise<unknown> {
	try {
		return await res.json();
	} catch {
		return null;
	}
}

/**
 * Parse an `application/problem+json` body. Returns `null` when the response carries no problem —
 * the signal that a `404` is the closed feature gate (or an unknown path) rather than a documented
 * outcome. A stale-revision problem's `current` slot is validated like any other read.
 */
async function readProblem(res: Response): Promise<WebhookProblem | null> {
	const body = await readJson(res);
	if (!isRecord(body) || typeof body.code !== 'string') return null;
	const current = isSlot(body.current) ? normalizeSlot(body.current) : null;
	return {
		outcome: 'problem',
		status: res.status,
		code: KNOWN_PROBLEM_CODES.has(body.code) ? (body.code as WebhookProblemCode) : 'unrecognized',
		title: typeof body.title === 'string' ? body.title : 'Request rejected',
		detail: typeof body.detail === 'string' ? body.detail : '',
		current,
		retryAfterSeconds: retryAfterOf(res),
	};
}

async function failureOf(res: Response): Promise<WebhookProblem | WebhookTransportFailure> {
	const problem = await readProblem(res);
	if (problem) return problem;
	return res.status === 404 ? { outcome: 'gated' } : { outcome: 'unavailable' };
}

interface SendOptions {
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
	/** Omitted entirely for body-less mutations — the server rejects any body on cancellation. */
	body?: unknown;
	revision?: string;
	signal?: AbortSignal;
}

async function send(
	url: string,
	options: SendOptions,
): Promise<Response | WebhookTransportFailure> {
	if (!isAuthEnabled()) return { outcome: 'unavailable' };
	const sendsJson = options.body !== undefined;
	try {
		return await fetch(url, {
			method: options.method,
			credentials: 'include',
			...(options.signal ? { signal: options.signal } : {}),
			...(options.revision !== undefined
				? { headers: mutationHeaders(options.revision, sendsJson) }
				: {}),
			...(sendsJson ? { body: JSON.stringify(options.body) } : {}),
		});
	} catch (cause) {
		return cause instanceof DOMException && cause.name === 'AbortError'
			? { outcome: 'aborted' }
			: { outcome: 'offline' };
	}
}

async function expectSlot(
	res: Response | WebhookTransportFailure,
): Promise<WebhookResult<ManagedWebhookSlot>> {
	if ('outcome' in res) return res;
	if (!res.ok) return failureOf(res);
	const body = await readJson(res);
	return isSlot(body) ? { outcome: 'ok', value: normalizeSlot(body) } : { outcome: 'unavailable' };
}

/**
 * The authoritative, redacted slot read. Every flow starts here, including recovery: the docs are
 * explicit that a caller must probe with a read before branching on anything else, because a closed
 * feature gate is indistinguishable from an unknown path until you see (or fail to see) a body.
 */
export async function readWebhook(
	root: WebhookRoot,
	team: string,
	name: string,
): Promise<WebhookResult<ManagedWebhookSlot>> {
	return expectSlot(await send(webhookPath(root, team, name), { method: 'GET' }));
}

/**
 * Stage a candidate. THIS IS THE ONLY CALL THAT RETURNS A SECRET, and the server keeps no copy the
 * caller can ask for again: if this response is lost, the only route forward is to cancel the
 * redacted pending setup and stage a fresh one.
 */
export async function createWebhookSetup(
	root: WebhookRoot,
	team: string,
	name: string,
	revision: string,
	request: WebhookSetupRequest,
): Promise<WebhookResult<ManagedWebhookSetupCreated>> {
	const res = await send(`${webhookPath(root, team, name)}/setups`, {
		method: 'POST',
		body: request,
		revision,
	});
	if ('outcome' in res) return res;
	if (!res.ok) return failureOf(res);
	const body = await readJson(res);
	return isSetupCreated(body) ? { outcome: 'ok', value: body } : { outcome: 'unavailable' };
}

/**
 * Commit the candidate. The server POSTs verification-v2 to the candidate URL while this request is
 * open, so it is the slowest call in the API and the only one worth aborting.
 *
 * An attempt is consumed when the server takes its lease — BEFORE the outbound probe — so a client
 * abort or timeout refunds nothing and may even race a successful commit. Callers must therefore
 * treat `aborted`/`offline` here as "outcome unknown" and re-read the slot rather than assuming the
 * old registration survived.
 */
export async function activateWebhookSetup(
	root: WebhookRoot,
	team: string,
	name: string,
	revision: string,
	setupId: string,
	signal?: AbortSignal,
): Promise<WebhookResult<ManagedWebhookSlot>> {
	return expectSlot(
		await send(`${webhookPath(root, team, name)}/setups/${encodeURIComponent(setupId)}/activate`, {
			method: 'POST',
			body: { secretStored: true },
			revision,
			signal,
		}),
	);
}

/** Discard the candidate. Deliberately body-less: any body at all is `malformed_request`. */
export async function cancelWebhookSetup(
	root: WebhookRoot,
	team: string,
	name: string,
	revision: string,
	setupId: string,
): Promise<WebhookResult<ManagedWebhookSlot>> {
	return expectSlot(
		await send(`${webhookPath(root, team, name)}/setups/${encodeURIComponent(setupId)}`, {
			method: 'DELETE',
			revision,
		}),
	);
}

/**
 * Replace the capability selection in place. This touches no credential: the URL, secret,
 * verification time, registration id and delivery health all survive, which is exactly why it is a
 * separate route from the staged setups above.
 */
export async function updateWebhookCapabilities(
	root: WebhookRoot,
	team: string,
	name: string,
	revision: string,
	capabilities: string[],
): Promise<WebhookResult<ManagedWebhookSlot>> {
	return expectSlot(
		await send(`${webhookPath(root, team, name)}/capabilities`, {
			method: 'PATCH',
			body: { capabilities },
			revision,
		}),
	);
}

/** Destroy active and candidate credentials. The bot-name echo is enforced server-side too. */
export async function deleteWebhook(
	root: WebhookRoot,
	team: string,
	name: string,
	revision: string,
	confirm: string,
): Promise<WebhookResult<ManagedWebhookSlot>> {
	return expectSlot(
		await send(webhookPath(root, team, name), {
			method: 'DELETE',
			body: { confirm },
			revision,
		}),
	);
}

/**
 * The public capability registry. Unauthenticated and independent of both the feature gate and
 * dispatcher health, so it stays readable when every other call here fails — which is what lets the
 * UI keep rendering honest capability names during an outage.
 */
export async function fetchWebhookCapabilityCatalog(): Promise<
	WebhookResult<WebhookCapabilityDescriptor[]>
> {
	const res = await send(`${apiBase()}/bot/webhook/capabilities`, { method: 'GET' });
	if ('outcome' in res) return res;
	if (!res.ok) return failureOf(res);
	const body = await readJson(res);
	return isCatalog(body) ? { outcome: 'ok', value: body.capabilities } : { outcome: 'unavailable' };
}
