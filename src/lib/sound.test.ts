import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class AudioMock {
	static instances: AudioMock[] = [];
	// Every file played, unmuted, in order.
	static heard: string[] = [];
	// What canPlayType answers for OGG Vorbis; MP3 is always playable.
	static ogg: '' | 'maybe' | 'probably' = 'probably';
	src: string;
	preload = '';
	muted = false;
	paused = true;
	currentTime = 0;
	volume = 1;
	play = vi.fn(() => {
		if (!this.muted) AudioMock.heard.push(this.src);
		return Promise.resolve();
	});
	pause = vi.fn();
	canPlayType = vi.fn((type: string) => (type.startsWith('audio/ogg') ? AudioMock.ogg : 'maybe'));
	constructor(src?: string) {
		this.src = src ?? '';
		// The service's format probe is a bare `new Audio()`; only elements with a file count here.
		if (src) AudioMock.instances.push(this);
	}
}

async function loadSound() {
	const [sound, prefs] = await Promise.all([
		import('./sound'),
		import('./preferencesStore.svelte'),
	]);
	return { ...sound, preferencesStore: prefs.preferencesStore };
}

const named = (name: string) => AudioMock.instances.filter((a) => a.src.includes(name));

describe('sound service', () => {
	beforeEach(() => {
		// Flush unlock listeners leaked by the previous test's module instance
		// (they self-remove on first gesture) BEFORE resetting the mock registry,
		// so they fire against their own mocks, not this test's.
		window.dispatchEvent(new Event('pointerdown'));
		vi.resetModules(); // fresh module state: no cached elements between tests
		AudioMock.instances = [];
		AudioMock.heard = [];
		AudioMock.ogg = 'probably';
		vi.stubGlobal('Audio', AudioMock);
		globalThis.localStorage?.clear(); // soundEnabled must not leak into the re-imported store
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('plays a cue through a single reused element per file', async () => {
		const { playCue, preferencesStore } = await loadSound();
		preferencesStore.setSoundEnabled(true);

		playCue('game_win');
		playCue('game_win');

		expect(AudioMock.instances).toHaveLength(1);
		const audio = AudioMock.instances[0];
		expect(audio.src).toBe('/sounds/kenney-music-jingles/pizzicato_02.ogg');
		expect(audio.play).toHaveBeenCalledTimes(2);
	});

	it('plays the takes in turn, so none plays twice running', async () => {
		const { playCue, preferencesStore } = await loadSound();
		preferencesStore.setSoundEnabled(true);
		for (let i = 0; i < 4; i++) playCue('dice_roll');

		expect(AudioMock.heard).toEqual([
			'/sounds/kenney-casino-audio/dice_throw_1.ogg',
			'/sounds/kenney-casino-audio/dice_throw_2.ogg',
			'/sounds/kenney-casino-audio/dice_throw_3.ogg',
			'/sounds/kenney-casino-audio/dice_throw_1.ogg',
		]);
	});

	it('falls back to MP3 where the browser cannot play OGG Vorbis', async () => {
		const { playCue, preferencesStore } = await loadSound();
		preferencesStore.setSoundEnabled(true);
		AudioMock.ogg = '';

		playCue('game_win');

		expect(AudioMock.instances[0].src).toBe('/sounds/kenney-music-jingles/pizzicato_02.mp3');
	});

	it('plays at the tuned gain, below full scale', async () => {
		const { playCue, SOUND_VOLUME, preferencesStore } = await loadSound();
		preferencesStore.setSoundEnabled(true);

		playCue('dice_roll');

		expect(SOUND_VOLUME).toBeLessThan(1);
		expect(AudioMock.instances[0].volume).toBe(SOUND_VOLUME);
	});

	it('rewinds to the start on each play', async () => {
		const { playCue, preferencesStore } = await loadSound();
		preferencesStore.setSoundEnabled(true);

		playCue('game_win');
		AudioMock.instances[0].currentTime = 3;
		playCue('game_win');

		expect(AudioMock.instances[0].currentTime).toBe(0);
	});

	it('does nothing when sound is disabled', async () => {
		const { playCue, preferencesStore } = await loadSound();
		preferencesStore.setSoundEnabled(false);

		playCue('dice_roll');

		expect(AudioMock.instances).toHaveLength(0);
	});

	it('stays silent for a cue with no files', async () => {
		const { playCue, preferencesStore } = await loadSound();
		preferencesStore.setSoundEnabled(true);

		playCue('piece_move');

		expect(AudioMock.instances).toHaveLength(0);
	});

	it('cuts the last cue on the same channel short, and leaves other channels alone', async () => {
		const { playCue, preferencesStore } = await loadSound();
		preferencesStore.setSoundEnabled(true);

		playCue('dice_roll'); // dice channel
		playCue('no_move'); // result channel: heard over the dice, not instead of them
		const [roll] = named('dice_throw');
		const [noMove] = named('glass_004');
		expect(roll.pause).not.toHaveBeenCalled();

		playCue('game_loss'); // result channel again: the empty roll gives way to the result
		expect(noMove.pause).toHaveBeenCalledTimes(1);
		expect(roll.pause).not.toHaveBeenCalled();
	});

	it('preloads every file once without playing any', async () => {
		const { preloadSounds } = await loadSound();

		preloadSounds();

		// Three throws, promotion, the empty roll and three jingles.
		expect(AudioMock.instances).toHaveLength(8);
		for (const audio of AudioMock.instances) {
			expect(audio.preload).toBe('auto');
			expect(audio.play).not.toHaveBeenCalled();
		}
	});

	it('unlocks every element on the first user gesture via muted play+pause', async () => {
		const { preloadSounds } = await loadSound();
		preloadSounds();

		window.dispatchEvent(new Event('pointerdown'));
		for (const audio of AudioMock.instances) expect(audio.play).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => {
			for (const audio of AudioMock.instances) expect(audio.pause).toHaveBeenCalled();
		});
		for (const audio of AudioMock.instances) expect(audio.muted).toBe(false);

		// listeners removed — a second gesture must not re-trigger the unlock
		window.dispatchEvent(new Event('pointerdown'));
		for (const audio of AudioMock.instances) expect(audio.play).toHaveBeenCalledTimes(1);
	});

	it('unlocks an element created after the first gesture on the next one', async () => {
		const { preferencesStore, playCue } = await loadSound();
		preferencesStore.setSoundEnabled(true);
		window.dispatchEvent(new Event('pointerdown')); // nothing to unlock yet

		playCue('game_draw'); // created outside a gesture, e.g. the opponent's resignation
		const [draw] = AudioMock.instances;
		expect(draw.play).toHaveBeenCalledTimes(1);
		await Promise.resolve();

		window.dispatchEvent(new Event('keydown'));
		expect(draw.play).toHaveBeenCalledTimes(2);
	});

	it('does not cut off a real play racing the unlock probe', async () => {
		const { playCue, preloadSounds, preferencesStore } = await loadSound();
		preferencesStore.setSoundEnabled(true);
		preloadSounds();
		const [audio] = named('dice_throw_1');

		// The very first gesture is the one that rolls the dice: pointerdown fires
		// the muted unlock probe, then the same gesture's handler plays for real.
		window.dispatchEvent(new Event('pointerdown'));
		playCue('dice_roll');

		expect(audio.muted).toBe(false); // the real play unmutes immediately
		expect(audio.play).toHaveBeenCalledTimes(2);

		// Once the probe's promise settles it must not pause the real playback.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(audio.pause).not.toHaveBeenCalled();
		expect(audio.muted).toBe(false);
	});
});
