// The vendored sounds are what the lock says they are.
//
// The lock records, for every file, where it came from in dicechess-assets and the digest that
// repository published for it at the pinned commit. These checks make a hand-edited file, a stray
// one, or a regenerated cue table that drifted from the lock fail here rather than ship.
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CUE_FILES, SOUND_FORMATS } from './soundFiles';

// jsdom turns `import.meta.url` into an http URL, so resolve from the project root instead.
const SOUNDS = path.join(process.cwd(), 'static/sounds');
const read = (file: string) => readFileSync(path.join(SOUNDS, file));

type Lock = {
	upstream: string;
	commit: string;
	formats: string[];
	packs: Record<
		string,
		{
			version: string;
			license: string;
			attribution: string;
			attributionRequired: boolean;
			files: Record<string, { from: string; sha256: string }>;
		}
	>;
	cues: Record<string, string[]>;
};

const lock = JSON.parse(read('sounds.lock.json').toString('utf8')) as Lock;

describe('vendored sounds', () => {
	it('pin one full commit of the asset repository', () => {
		expect(lock.upstream).toBe('fortemate/dicechess-assets');
		expect(lock.commit).toMatch(/^[0-9a-f]{40}$/);
	});

	it('have the bytes the lock pinned, and nothing else is there', () => {
		for (const [pack, { files }] of Object.entries(lock.packs)) {
			for (const [name, { sha256 }] of Object.entries(files)) {
				const digest = createHash('sha256')
					.update(read(`${pack}/${name}`))
					.digest('hex');
				expect(digest, `${pack}/${name}`).toBe(sha256);
			}
			// A file on disk that the lock does not know about came from somewhere else.
			expect(readdirSync(path.join(SOUNDS, pack)).sort(), pack).toEqual(Object.keys(files).sort());
		}
		const packs = readdirSync(SOUNDS).filter((entry) => entry !== 'sounds.lock.json');
		expect(packs.sort()).toEqual(Object.keys(lock.packs).sort());
	});

	it('travel with each pack’s manifest and licence', () => {
		for (const [pack, { files, attribution, attributionRequired }] of Object.entries(lock.packs)) {
			const manifest = JSON.parse(read(`${pack}/manifest.json`).toString('utf8'));
			expect(manifest.id).toBe(pack);
			expect(files[manifest.licenseFile], `${pack}: licence not vendored`).toBeDefined();
			expect(existsSync(path.join(SOUNDS, pack, manifest.licenseFile))).toBe(true);
			// The lock repeats the credit terms so /licenses can be checked against them.
			expect(attribution).toBe(manifest.attribution);
			expect(attributionRequired).toBe(manifest.attributionRequired);
		}
	});

	it('are only packs this public repository may publish', () => {
		// CC0 needs nothing. JDSherbert's licence forbids sharing the raw files, but the author
		// permitted their use in Dice Chess on every platform, this site included (#167). Any other
		// licence needs a recorded decision first.
		const PERMITTED: Record<string, string> = {
			'jdsherbert-tabletop': 'Custom (Free with Attribution)',
		};
		for (const [pack, { license }] of Object.entries(lock.packs))
			expect(license, pack).toBe(PERMITTED[pack] ?? 'CC0-1.0');
	});

	it('are credited on /licenses, as each pack asks', () => {
		const page = readFileSync(path.join(process.cwd(), 'src/routes/licenses/+page.svelte'), 'utf8');
		for (const [pack, { attribution }] of Object.entries(lock.packs)) {
			// "Sounds by JDSherbert – https://jdsherbert.itch.io": the words and the link, which the
			// page sets apart.
			const [words, link] = attribution.split(' – ');
			expect(page, pack).toContain(words);
			expect(page, pack).toContain(link);
		}
	});

	it('match the cue table the site reads, in every format', () => {
		expect([...SOUND_FORMATS]).toEqual(lock.formats);
		expect(
			Object.fromEntries(Object.entries(CUE_FILES).map(([cue, files]) => [cue, [...files]])),
		).toEqual(lock.cues);
		for (const files of Object.values(lock.cues))
			for (const file of files) {
				const [pack, stem] = file.split('/');
				for (const format of lock.formats)
					expect(lock.packs[pack].files[`${stem}.${format}`], `${file}.${format}`).toBeDefined();
			}
	});
});
