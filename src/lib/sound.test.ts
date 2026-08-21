import { describe, it, expect, beforeEach, vi } from 'vitest';

class AudioMock {
	static instances: AudioMock[] = [];
	src: string;
	preload = '';
	muted = false;
	paused = true;
	currentTime = 0;
	play = vi.fn(() => Promise.resolve());
	pause = vi.fn();
	constructor(src: string) {
		this.src = src;
		AudioMock.instances.push(this);
	}
}

async function loadSound() {
	const [sound, prefs] = await Promise.all([
		import('./sound'),
		import('./preferencesStore.svelte'),
	]);
	return { ...sound, preferencesStore: prefs.preferencesStore };
}

describe('sound service', () => {
	beforeEach(() => {
		// Flush unlock listeners leaked by the previous test's module instance
		// (they self-remove on first gesture) BEFORE resetting the mock registry,
		// so they fire against their own mocks, not this test's.
		window.dispatchEvent(new Event('pointerdown'));
		vi.resetModules(); // fresh module state: no cached Audio element between tests
		AudioMock.instances = [];
		vi.stubGlobal('Audio', AudioMock);
		globalThis.localStorage?.clear(); // soundEnabled must not leak into the re-imported store
	});

	it('plays the dice sound through a single reused element', async () => {
		const { playDiceSound, preferencesStore } = await loadSound();
		preferencesStore.setSoundEnabled(true);

		playDiceSound();
		playDiceSound();

		expect(AudioMock.instances).toHaveLength(1);
		const audio = AudioMock.instances[0];
		expect(audio.src).toContain('dice-roll-natural.mp3');
		expect(audio.play).toHaveBeenCalledTimes(2);
	});

	it('rewinds to the start on each play', async () => {
		const { playDiceSound, preferencesStore } = await loadSound();
		preferencesStore.setSoundEnabled(true);

		playDiceSound();
		AudioMock.instances[0].currentTime = 3;
		playDiceSound();

		expect(AudioMock.instances[0].currentTime).toBe(0);
	});

	it('does nothing when sound is disabled', async () => {
		const { playDiceSound, preferencesStore } = await loadSound();
		preferencesStore.setSoundEnabled(false);

		playDiceSound();

		expect(AudioMock.instances).toHaveLength(0);
	});

	it('preloads the element without playing it', async () => {
		const { preloadSounds } = await loadSound();

		preloadSounds();

		expect(AudioMock.instances).toHaveLength(1);
		expect(AudioMock.instances[0].preload).toBe('auto');
		expect(AudioMock.instances[0].play).not.toHaveBeenCalled();
	});

	it('unlocks playback on the first user gesture via muted play+pause', async () => {
		const { preloadSounds } = await loadSound();
		preloadSounds();
		const audio = AudioMock.instances[0];

		window.dispatchEvent(new Event('pointerdown'));
		expect(audio.play).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(audio.pause).toHaveBeenCalled());
		expect(audio.muted).toBe(false);

		// listeners removed — a second gesture must not re-trigger the unlock
		window.dispatchEvent(new Event('pointerdown'));
		expect(audio.play).toHaveBeenCalledTimes(1);
	});

	it('does not cut off a real play racing the unlock probe', async () => {
		const { playDiceSound, preloadSounds, preferencesStore } = await loadSound();
		preferencesStore.setSoundEnabled(true);
		preloadSounds();
		const audio = AudioMock.instances[0];

		// The very first gesture is the one that rolls the dice: pointerdown fires
		// the muted unlock probe, then the same gesture's handler plays for real.
		window.dispatchEvent(new Event('pointerdown'));
		playDiceSound();

		expect(audio.muted).toBe(false); // the real play unmutes immediately
		expect(audio.play).toHaveBeenCalledTimes(2);

		// Once the probe's promise settles it must not pause the real playback.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(audio.pause).not.toHaveBeenCalled();
		expect(audio.muted).toBe(false);
	});
});
