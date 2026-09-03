// Reactive flow state for one bot's webhook control plane (#48). A class instantiated per panel
// rather than a singleton: two bots' setups must never share a revision, a candidate, or a secret.
//
// Everything security-relevant about the staged flow lives here rather than in markup, because both
// the owner card and the admin drawer mount the same panel and duplicated client-side guards are
// how the two roots drift apart. The rules this store exists to enforce:
//
//  * REVISION DISCIPLINE. Every mutation carries the revision of the last authoritative read. A
//    `412 stale_webhook_revision` ships the server's current slot in its body, so recovery adopts
//    that slot instead of guessing — one round trip, and the retry is against real state.
//  * THE SECRET IS HELD ONCE, BRIEFLY, AND NOWHERE ELSE. `createSetup` is the only source and there
//    is no recovery endpoint, so it is kept in exactly one field, never copied into a notice, an
//    error, a log, analytics, Sentry, or storage, and scrubbed the moment the flow reaches a state
//    that cannot use it. It is deliberately NOT scrubbed on a retryable verification failure: the
//    same candidate secret is still the right one for the next of the five attempts.
//  * AN ABORTED ACTIVATION IS AN UNKNOWN OUTCOME, NOT A FAILURE. The server consumes an attempt
//    when it takes its lease — before it probes the candidate URL — so a client timeout or cancel
//    refunds nothing and can even race a successful commit. Both paths therefore re-read the slot
//    and report what the server actually holds, never an assumption.
//  * FAILURE LEAVES THE OLD REGISTRATION ALONE. Verification failure, exhaustion and expiry all
//    keep the previous registration serving traffic, and the UI has to say so — an operator who
//    thinks a failed replacement broke live delivery will go and "fix" something that is not broken.

import {
	activateWebhookSetup,
	cancelWebhookSetup,
	createWebhookSetup,
	deleteWebhook,
	fetchWebhookCapabilityCatalog,
	readWebhook,
	updateWebhookCapabilities,
	type ManagedWebhookSlot,
	type WebhookCapabilityDescriptor,
	type WebhookProblem,
	type WebhookResult,
	type WebhookRoot,
	type WebhookSetupKind,
	type WebhookSetupRequest,
} from './webhookApi';
import {
	buildCapabilityView,
	declaredSelection,
	droppedByCapabilityPatch,
	selectionChanged,
	writableSelection,
	type CapabilityView,
} from './webhookCapabilities';

/** How long the client waits for an activation before it stops watching and re-reads the truth. */
export const ACTIVATION_TIMEOUT_MS = 30_000;

export type WebhookAccess =
	| { state: 'loading' }
	| { state: 'ready' }
	/** The feature gate is closed: the routes are not mounted and answer a plain 404. */
	| { state: 'gated' }
	| { state: 'signed-out' }
	| { state: 'denied' }
	| { state: 'missing' }
	| { state: 'unavailable' };

export type WebhookAction = 'load' | 'stage' | 'activate' | 'cancel' | 'capabilities' | 'delete';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

export interface WebhookNotice {
	tone: NoticeTone;
	text: string;
	/** Set when the operator's next step is to re-read or retry rather than to change input. */
	retryable?: boolean;
}

/**
 * The live candidate together with its one-time secret. Present only between staging and the
 * moment activation settles; `null` at every other time, including after a page reload, which is
 * precisely the unrecoverable case the panel has to explain.
 */
export interface SecretHandoff {
	setupId: string;
	kind: WebhookSetupKind;
	secret: string;
	expiresAt: string;
	candidateUrl: string;
}

export class BotWebhookController {
	readonly root: WebhookRoot;
	readonly team: string;
	readonly name: string;

	access = $state<WebhookAccess>({ state: 'loading' });
	slot = $state<ManagedWebhookSlot | null>(null);
	catalog = $state<WebhookCapabilityDescriptor[] | null>(null);
	busy = $state<WebhookAction | null>(null);
	notice = $state<WebhookNotice | null>(null);

	/** The one-time secret. See the file header before moving, copying, or logging this. */
	handoff = $state<SecretHandoff | null>(null);
	/** The operator has confirmed they stored the secret; activation stays blocked until then. */
	secretAcknowledged = $state(false);

	/** Draft capability selection, reset from authoritative server state after every read/write. */
	selection = $state<string[]>([]);

	/** Set when the server reports it has no outbound verification transport (503). */
	verificationUnavailable = $state(false);

	#activation: AbortController | null = null;
	#disposed = false;

	constructor(root: WebhookRoot, team: string, name: string) {
		this.root = root;
		this.team = team;
		this.name = name;
	}

	get view(): CapabilityView {
		return buildCapabilityView(this.catalog ?? [], this.slot?.registration?.capabilities ?? []);
	}

	get droppedByPatch(): string[] {
		return droppedByCapabilityPatch(this.view);
	}

	get selectionDirty(): boolean {
		return selectionChanged(this.view, this.selection);
	}

	get canActivate(): boolean {
		return this.handoff !== null && this.secretAcknowledged && this.busy === null;
	}

	/**
	 * A candidate exists server-side but its secret is not in memory — a lost create response, a
	 * reload, or another session's staging. There is no way to recover the secret, so the only exit
	 * is to cancel and stage again.
	 */
	get orphanedSetup(): boolean {
		return this.handoff === null && (this.slot?.pendingSetup ?? null) !== null;
	}

	/** Load the authoritative slot and the public capability registry. */
	async load(): Promise<void> {
		this.busy = 'load';
		const [slot, catalog] = await Promise.all([
			readWebhook(this.root, this.team, this.name),
			this.catalog === null ? fetchWebhookCapabilityCatalog() : Promise.resolve(null),
		]);
		if (this.#disposed) return;
		this.busy = null;

		if (catalog !== null && catalog.outcome === 'ok') this.catalog = catalog.value;

		if (slot.outcome === 'ok') {
			this.#adopt(slot.value);
			this.access = { state: 'ready' };
			return;
		}
		this.access = this.#accessFor(slot);
		if (this.access.state === 'unavailable') {
			this.notice = {
				tone: 'danger',
				text: 'Could not read the webhook configuration. Nothing has been changed.',
				retryable: true,
			};
		}
	}

	/**
	 * Stage a candidate and take custody of its secret.
	 *
	 * `create` needs an empty slot; `replaceUrl` and `rotateSecret` need an active registration and
	 * both mint a new secret. The old registration keeps serving traffic until activation commits.
	 */
	async stage(request: WebhookSetupRequest): Promise<void> {
		const revision = this.slot?.revision;
		if (revision === undefined || this.busy !== null) return;
		this.busy = 'stage';
		this.notice = null;
		const result = await createWebhookSetup(this.root, this.team, this.name, revision, request);
		if (this.#disposed) return;
		this.busy = null;

		if (result.outcome !== 'ok') {
			await this.#handleFailure(result, 'stage');
			return;
		}

		this.handoff = {
			setupId: result.value.setupId,
			kind: result.value.kind,
			secret: result.value.secret,
			expiresAt: result.value.expiresAt,
			candidateUrl:
				request.kind === 'rotateSecret' ? (this.slot?.registration?.url ?? '') : request.url,
		};
		this.secretAcknowledged = false;
		if (this.slot) this.slot = { ...this.slot, revision: result.value.revision };
		// Deliberately does NOT repeat the "shown once" warning: the secret block below carries it as
		// a focused heading, and saying it twice in two adjacent regions reads as two separate
		// warnings. This names the next step instead.
		this.notice = {
			tone: 'warning',
			text: 'Candidate staged. Store the secret below, then verify and activate.',
		};
	}

	/** Record that the operator has stored the secret. Nothing may activate before this. */
	acknowledgeSecret(): void {
		if (this.handoff !== null) this.secretAcknowledged = true;
	}

	/**
	 * Commit the staged candidate. Bounded by `ACTIVATION_TIMEOUT_MS` because the server probes the
	 * candidate URL inside this request; on timeout or cancellation the outcome is unknown and the
	 * slot is re-read rather than assumed.
	 */
	async activate(): Promise<void> {
		const handoff = this.handoff;
		// Deliberately the CURRENT slot revision, not the one the create response carried: a
		// capability save or a stale-revision recovery between staging and activating bumps the
		// revision, and pinning the creation-time value would make every activation attempt fail
		// `412` with no way to recover but discarding a candidate that was perfectly good.
		const revision = this.slot?.revision;
		if (
			handoff === null ||
			revision === undefined ||
			!this.secretAcknowledged ||
			this.busy !== null
		)
			return;

		this.busy = 'activate';
		this.notice = { tone: 'info', text: 'Verifying the candidate endpoint…' };
		const controller = new AbortController();
		this.#activation = controller;
		const timer = setTimeout(() => controller.abort(), ACTIVATION_TIMEOUT_MS);

		const result = await activateWebhookSetup(
			this.root,
			this.team,
			this.name,
			revision,
			handoff.setupId,
			controller.signal,
		);
		clearTimeout(timer);
		this.#activation = null;
		if (this.#disposed) return;
		this.busy = null;

		if (result.outcome === 'ok') {
			this.#adopt(result.value);
			this.#scrubSecret();
			this.notice = {
				tone: 'success',
				text: 'Verified and activated. The values below are the server’s authoritative state.',
			};
			return;
		}

		if (result.outcome === 'aborted' || result.outcome === 'offline') {
			this.notice = {
				tone: 'warning',
				text: 'The activation result never reached this page, so one of the five attempts may still have been spent — and it may even have succeeded. Re-reading the server state now.',
				retryable: true,
			};
			await this.#reread();
			return;
		}

		await this.#handleFailure(result, 'activate');
	}

	/** Abort a watched activation. The server keeps going, so the outcome must still be re-read. */
	cancelActivationWatch(): void {
		this.#activation?.abort();
	}

	/**
	 * Discard the candidate. The active registration is untouched, and the secret becomes useless
	 * the moment this succeeds, so it is scrubbed.
	 */
	async cancelSetup(): Promise<void> {
		const setupId = this.handoff?.setupId ?? this.slot?.pendingSetup?.setupId;
		const revision = this.slot?.revision;
		if (setupId === undefined || revision === undefined || this.busy !== null) return;

		this.busy = 'cancel';
		const result = await cancelWebhookSetup(this.root, this.team, this.name, revision, setupId);
		if (this.#disposed) return;
		this.busy = null;

		if (result.outcome === 'ok') {
			this.#scrubSecret();
			this.#adopt(result.value);
			this.notice = {
				tone: 'info',
				text: 'Candidate discarded. The existing registration was not touched.',
			};
			return;
		}
		await this.#handleFailure(result, 'cancel');
	}

	/**
	 * Write the capability selection. This is the one write that touches no credential: URL, secret,
	 * verification time, registration id and delivery health all survive it.
	 */
	async saveCapabilities(): Promise<void> {
		const revision = this.slot?.revision;
		if (revision === undefined || this.busy !== null) return;
		const previous = this.slot?.registration?.registrationId ?? null;
		const capabilities = writableSelection(this.view, this.selection);

		this.busy = 'capabilities';
		this.notice = null;
		const result = await updateWebhookCapabilities(
			this.root,
			this.team,
			this.name,
			revision,
			capabilities,
		);
		if (this.#disposed) return;
		this.busy = null;

		if (result.outcome !== 'ok') {
			await this.#handleFailure(result, 'capabilities');
			return;
		}

		this.#adopt(result.value);
		const current = result.value.registration?.registrationId ?? null;
		const preserved = current !== null && current === previous;
		this.notice = {
			tone: 'success',
			text: preserved
				? 'Capabilities saved. No credential changed: the URL, signing secret and registration are the same as before, and the values below are the server’s authoritative state.'
				: 'Capabilities saved. The values below are the server’s authoritative state.',
		};
	}

	/** Destroy the registration and every credential for it, after the bot-name echo. */
	async remove(confirm: string): Promise<void> {
		const revision = this.slot?.revision;
		if (revision === undefined || this.busy !== null) return;
		this.busy = 'delete';
		this.notice = null;
		const result = await deleteWebhook(this.root, this.team, this.name, revision, confirm);
		if (this.#disposed) return;
		this.busy = null;

		if (result.outcome !== 'ok') {
			await this.#handleFailure(result, 'delete');
			return;
		}
		this.#scrubSecret();
		this.#adopt(result.value);
		this.notice = {
			tone: 'success',
			text: 'Webhook deleted. Active and candidate credentials are destroyed and deliveries have stopped; delivery history is retained.',
		};
	}

	/** Drop every reference to the one-time secret and its acknowledgement. */
	dispose(): void {
		this.#disposed = true;
		this.#activation?.abort();
		this.#activation = null;
		this.#scrubSecret();
	}

	#scrubSecret(): void {
		this.handoff = null;
		this.secretAcknowledged = false;
	}

	/** Adopt an authoritative slot and re-derive the capability draft from it. */
	#adopt(slot: ManagedWebhookSlot): void {
		this.slot = slot;
		this.selection = declaredSelection(
			buildCapabilityView(this.catalog ?? [], slot.registration?.capabilities ?? []),
		);
	}

	async #reread(): Promise<void> {
		const result = await readWebhook(this.root, this.team, this.name);
		if (this.#disposed) return;
		if (result.outcome === 'ok') {
			this.#adopt(result.value);
			// A committed activation retires the candidate, which makes the held secret the live one
			// — but the operator was told to store it before activating, so nothing is lost by
			// dropping it here, and holding a live secret in memory for longer is the worse trade.
			if (result.value.pendingSetup === null) this.#scrubSecret();
			this.access = { state: 'ready' };
			return;
		}
		this.access = this.#accessFor(result);
	}

	#accessFor(result: WebhookResult<unknown>): WebhookAccess {
		if (result.outcome === 'gated') return { state: 'gated' };
		if (result.outcome === 'problem') {
			if (result.code === 'authentication_required') return { state: 'signed-out' };
			if (result.code === 'bot_not_owned' || result.code === 'admin_required')
				return { state: 'denied' };
			if (result.code === 'bot_not_found') return { state: 'missing' };
		}
		return { state: 'unavailable' };
	}

	/**
	 * Turn a rejected mutation into an honest next step.
	 *
	 * Three groups need care. A stale revision carries the server's current slot, so it is adopted
	 * and the operator simply retries. The `410` setup tombstones mean the candidate — and with it
	 * the held secret — is dead, so the secret is scrubbed and the flow restarts. Verification
	 * failure is the opposite: retryable with the SAME secret, so it must survive.
	 */
	async #handleFailure(
		result: Exclude<WebhookResult<never>, { outcome: 'ok' }>,
		action: WebhookAction,
	): Promise<void> {
		if (result.outcome === 'gated') {
			this.access = { state: 'gated' };
			return;
		}
		if (result.outcome === 'offline' || result.outcome === 'aborted') {
			this.notice = {
				tone: 'danger',
				text: 'The request never reached play-api. Nothing was changed; check the connection and retry.',
				retryable: true,
			};
			return;
		}
		if (result.outcome === 'unavailable') {
			this.notice = {
				tone: 'danger',
				text: 'play-api returned an unreadable response. Re-read the state before retrying.',
				retryable: true,
			};
			return;
		}

		switch (result.code) {
			case 'stale_webhook_revision':
				if (result.current) this.#adopt(result.current);
				this.notice = {
					tone: 'warning',
					text: 'Someone else changed this webhook first, so the change was refused. The current server state is shown below — review it and retry.',
					retryable: true,
				};
				return;

			case 'authentication_required':
				this.access = { state: 'signed-out' };
				this.#scrubSecret();
				return;

			case 'bot_not_owned':
			case 'admin_required':
				this.access = { state: 'denied' };
				this.#scrubSecret();
				return;

			case 'csrf_origin_rejected':
				this.notice = {
					tone: 'danger',
					text: 'play-api rejected this page’s origin, so no change was made. This surface only works from an allow-listed origin.',
				};
				return;

			case 'webhook_verification_failed':
				this.notice = {
					tone: 'danger',
					text: `The endpoint did not return a valid verification proof, so nothing was committed and the previous registration is still live and unchanged. Fix the endpoint and activate again with the same secret — five attempts are allowed in total. ${result.detail}`.trim(),
					retryable: true,
				};
				return;

			case 'webhook_url_rejected':
				this.notice = {
					tone: 'danger',
					text: `That URL failed the public HTTPS policy, so nothing was staged. ${result.detail}`.trim(),
				};
				return;

			case 'capability_rejected':
				this.notice = {
					tone: 'danger',
					text: `play-api rejected a capability, so the selection was not saved. ${result.detail}`.trim(),
				};
				return;

			case 'webhook_verification_rate_limited': {
				const wait = result.retryAfterSeconds;
				this.notice = {
					tone: 'warning',
					text: `The verification budget is spent, so nothing was committed and the previous registration is unchanged.${
						wait === null ? '' : ` Retry in about ${wait} seconds.`
					}`,
					retryable: true,
				};
				return;
			}

			case 'webhook_verification_unavailable':
				this.verificationUnavailable = true;
				this.notice = {
					tone: 'danger',
					text: 'This play-api instance has no outbound verification transport, so webhooks cannot be staged or activated right now. Existing registrations and this read-only view are unaffected.',
					retryable: true,
				};
				return;

			case 'setup_consumed':
			case 'setup_cancelled':
			case 'setup_expired':
			case 'setup_invalidated':
			case 'setup_attempts_exhausted':
			case 'setup_not_found':
				this.#scrubSecret();
				this.notice = {
					tone: 'danger',
					text: `${terminalSetupText(result.code)} The secret just shown is now useless and has been discarded; the previous registration is unchanged. Start a fresh setup from the state below.`,
					retryable: true,
				};
				await this.#reread();
				return;

			case 'pending_setup_exists':
				this.notice = {
					tone: 'warning',
					text: 'A candidate setup is already in progress for this bot, so nothing new was staged. Cancel it below before staging another.',
					retryable: true,
				};
				await this.#reread();
				return;

			case 'activation_in_progress':
				this.notice = {
					tone: 'warning',
					text: 'Another activation attempt is still running for this candidate. Wait for it to settle, then re-read before retrying.',
					retryable: true,
				};
				return;

			case 'setup_actor_mismatch':
				this.notice = {
					tone: 'warning',
					text: 'This candidate was staged from the other management surface, so it cannot be acted on here. Cancel it there, or from that surface complete it.',
					retryable: true,
				};
				await this.#reread();
				return;

			case 'replacement_url_unchanged':
				this.notice = {
					tone: 'warning',
					text: 'A replacement must point at a different URL. To mint a new secret for the same URL, rotate the secret instead.',
				};
				return;

			case 'confirmation_mismatch':
				this.notice = {
					tone: 'danger',
					text: 'The confirmation did not match the bot name exactly, so nothing was changed.',
				};
				return;

			case 'bot_not_found':
				this.access = { state: 'missing' };
				return;

			case 'webhook_already_registered':
				this.notice = {
					tone: 'warning',
					text: 'This bot already has a registration, so nothing was staged. Replace its URL or rotate its secret instead.',
					retryable: true,
				};
				await this.#reread();
				return;

			case 'webhook_not_registered':
				this.notice = {
					tone: 'warning',
					text: 'This bot has no active registration, so there is nothing to replace or rotate. Register a webhook first.',
					retryable: true,
				};
				await this.#reread();
				return;

			default:
				this.notice = {
					tone: 'danger',
					text: `play-api refused the ${action} request (${result.status}). ${result.detail}`.trim(),
					retryable: true,
				};
		}
	}
}

function terminalSetupText(code: WebhookProblem['code']): string {
	switch (code) {
		case 'setup_consumed':
			return 'That candidate was already activated.';
		case 'setup_cancelled':
			return 'That candidate was cancelled.';
		case 'setup_expired':
			return 'That candidate passed its 15-minute expiry.';
		case 'setup_invalidated':
			return 'That candidate was discarded because the staging account’s authority changed.';
		case 'setup_attempts_exhausted':
			return 'All five activation attempts were spent, so the candidate was destroyed.';
		default:
			return 'That candidate no longer exists.';
	}
}
