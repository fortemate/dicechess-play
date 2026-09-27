// Vendors the site's sounds from fortemate/dicechess-assets at one pinned commit.
//
//   node scripts/vendor-sounds.mjs <path-to-dicechess-assets-checkout> <commit>
//
// The asset repository's consumption rules (docs/CONSUMPTION.md there) ask a client to pin a full
// commit and never build against a moving branch, to keep each pack's licence and manifest beside
// its files, and to record where everything came from. For the web they ask for OGG with an MP3
// fallback. This does all of it. Files are read with `git show <commit>:<path>`, so the state of
// the checkout's working tree does not matter, and every file is checked against the digest the
// asset repository itself published for it before it is written.
//
// CUES below is the one place this site decides which sound means what. The choices are Dice Chess
// TV's, made by ear by the owner (dicechess-assets#8, dicechess-tv#85), so the two sound alike.
// Each cue names a pack and one of that pack's events; the files the event lists are what the cue
// may play, taking turns when there are several.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CUES = {
	dice_roll: ['kenney-casino-audio', 'dice_roll'],
	// The TV's move, capture and castling sounds are JDSherbert's, whose licence forbids sharing the
	// raw files; the author's permission covers dicechess-tv alone. Silent until #167 settles them.
	piece_move: null,
	piece_capture: null,
	castle: null,
	promotion: ['kenney-interface-sounds', 'promotion'],
	// A roll with nothing to play.
	no_move: ['kenney-interface-sounds', 'no_move'],
	game_win: ['kenney-music-jingles', 'game_win'],
	game_loss: ['kenney-music-jingles', 'game_loss'],
	game_draw: ['kenney-music-jingles', 'game_draw'],
	// No turn_handoff: the TV plays it when a player presses "continue" to pass the dice. Here the
	// next roll follows a turn by itself and already sounds.
};

const FORMATS = ['ogg', 'mp3'];
const UPSTREAM = 'fortemate/dicechess-assets';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const [checkout, commit] = process.argv.slice(2);
if (!checkout || !/^[0-9a-f]{40}$/.test(commit ?? ''))
	throw new Error(
		'Usage: vendor-sounds.mjs <dicechess-assets checkout> <full 40-character commit>',
	);

const show = (path) =>
	execFileSync('git', ['-C', checkout, 'show', `${commit}:${path}`], {
		maxBuffer: 64 * 1024 * 1024,
	});
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const baseName = (path) => path.split('/').pop();
const stemOf = (path) => baseName(path).replace(/\.[^.]+$/, '');
// Code-unit order, the same on every machine; localeCompare is not.
const byCodeUnit = (a, b) => Number(a > b) - Number(a < b);

const packs = {};
const cues = {};
for (const [cue, source] of Object.entries(CUES)) {
	if (source === null) {
		cues[cue] = [];
		continue;
	}
	const [packId, event] = source;
	const manifest = JSON.parse(show(`sounds/${packId}/manifest.json`).toString('utf8'));
	const listed = manifest.events?.[event] ?? [];
	const stems = [...new Set(listed.map(stemOf))].sort(byCodeUnit);
	if (stems.length === 0) throw new Error(`${packId} has no files for event ${event} at ${commit}`);
	packs[packId] ??= { manifest, exports: new Set() };
	for (const stem of stems)
		for (const format of FORMATS) {
			const path = `exports/${format}/${stem}.${format}`;
			if (!listed.includes(path))
				throw new Error(`${packId} event ${event} lists no ${format} export of ${stem}`);
			packs[packId].exports.add(path);
		}
	cues[cue] = stems.map((stem) => `${packId}/${stem}`);
}

const soundsDir = join(root, 'static/sounds');
const lock = { upstream: UPSTREAM, commit, formats: FORMATS, packs: {}, cues };
for (const [packId, { manifest, exports }] of Object.entries(packs)) {
	const published = JSON.parse(show(`sounds/${packId}/checksums.json`).toString('utf8'));
	const dir = join(soundsDir, packId);
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	const files = {};
	for (const path of ['manifest.json', manifest.licenseFile, ...[...exports].sort(byCodeUnit)]) {
		const bytes = show(`sounds/${packId}/${path}`);
		const digest = sha256(bytes);
		if (published[path] !== digest)
			throw new Error(
				`${packId}/${path} does not match the digest ${UPSTREAM} published at ${commit}`,
			);
		writeFileSync(join(dir, baseName(path)), bytes);
		files[baseName(path)] = { from: `sounds/${packId}/${path}`, sha256: digest };
	}
	lock.packs[packId] = {
		version: manifest.version,
		license: manifest.license,
		attribution: manifest.attribution,
		attributionRequired: manifest.attributionRequired,
		files,
	};
}
writeFileSync(join(soundsDir, 'sounds.lock.json'), JSON.stringify(lock, null, '\t') + '\n');

// The site reads this at run time. It is generated, rather than importing the lock, because
// `resolveJsonModule` is off here.
const table = join(root, 'src/lib/soundFiles.ts');
const body = Object.entries(cues)
	.map(([cue, list]) => `\t${cue}: [${list.map((file) => `'${file}'`).join(', ')}],`)
	.join('\n');
writeFileSync(
	table,
	`// Generated by scripts/vendor-sounds.mjs from static/sounds/sounds.lock.json. Do not edit.
//
// The vendored files each cue may play, under /sounds/ and without the extension: every one exists
// as .ogg and as .mp3, and the player picks the format the browser can play. Where there are
// several, they take turns. An empty list is a cue that stays silent.
import type { Cue } from './soundCues';

export const SOUND_FORMATS = [${FORMATS.map((f) => `'${f}'`).join(', ')}] as const;

export const CUE_FILES: Readonly<Record<Cue, readonly string[]>> = {
${body}
};
`,
);

// Formatted like the rest of the source, so the format check passes and a re-run leaves no diff.
execFileSync('npx', ['prettier', '--write', table, join(soundsDir, 'sounds.lock.json')], {
	cwd: root,
	stdio: 'ignore',
});

const count = Object.values(lock.packs).reduce((n, p) => n + Object.keys(p.files).length, 0);
console.log(
	`vendored ${count} files from ${UPSTREAM}@${commit.slice(0, 7)} for ${Object.keys(cues).length} cues`,
);
