/**
 * Opening one's own table (#258): posting a seek and what the wait for an opponent needs to know.
 *
 * Shared by the open-table tab of Play and the lobby, so both post the same seek and both hand
 * the same record to the waiting board (`OpenTableWaiting.svelte`).
 */
import { getGuestUuid } from '#lib/ingest/guestIdentity.js';
import { createSeek } from './lobbyApi';
import { timeControlPresets } from './timeControls';

export interface OpenTable {
	id: string;
	/** The creator's capability: it reads the status of the seek and closes it. */
	secret: string;
	/** The time control in words, for the title of the waiting board. */
	label: string;
	/** What was asked for. The server is the authority and degrades the flag for a guest. */
	rated: boolean;
	/** What each clock will start at, for the two strips of the waiting board. */
	clockMs: number | undefined;
}

/** Post the seek for a preset of `timeControlPresets`. Throws when the lobby cannot be reached. */
export async function openTable(presetIndex: number, rated: boolean): Promise<OpenTable> {
	const preset = timeControlPresets[presetIndex] ?? timeControlPresets[0];
	const created = await createSeek(getGuestUuid(), preset.value, rated);
	const control = preset.value;
	let initialSeconds: number | undefined;
	if (control && 'Fischer' in control) initialSeconds = control.Fischer.initialSeconds;
	else if (control && 'SuddenDeath' in control) initialSeconds = control.SuddenDeath.initialSeconds;
	return {
		id: created.seekId,
		secret: created.secret,
		label: preset.label,
		rated,
		clockMs: initialSeconds === undefined ? undefined : initialSeconds * 1000,
	};
}
