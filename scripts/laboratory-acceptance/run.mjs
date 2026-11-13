/** Opt-in real-service qualification. All mutations are confined to resources this runner creates. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import {
	AcceptanceEnvironment,
	APP_ORIGIN,
	API_ORIGIN,
	CLASSIC_ORIGIN,
	until,
} from './environment.mjs';
import { Peer, readJson, createRoom, joinRoom, foreignCapabilityClose } from './peer.mjs';
import { fixtures } from './fixtures.mjs';
import { deterministicOffers, classicRoll, verifyTranscript } from './oracle.mjs';
import { runBrowserAcceptance } from './browser.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(
	process.env.LAB_ACCEPTANCE_OUTPUT ?? resolve(here, '../../test-results/laboratory-acceptance'),
	`run-${Date.now()}`,
);
const env = new AcceptanceEnvironment();
const evidence = [];
const peers = [];
let browser;
const report = (scenario, details = {}) => {
	evidence.push({ scenario, status: 'PASS', ...details });
	process.stdout.write(`PASS ${scenario}\n`);
};
const jsonLiteral = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const snapshot = async (id) =>
	JSON.parse(
		await env.sql(
			'lab225_lab',
			`SELECT snapshot FROM laboratory.games WHERE game_id='${id}'::uuid`,
		),
	);
const publicRecord = async (id) => readJson(`/games/${id}/transcript`);
function privateDataAbsent(value, creation, active = true) {
	const text = JSON.stringify(value);
	for (const token of creation.tokens)
		assert.ok(!text.includes(token.token), 'Seat credential leaked');
	assert.doesNotMatch(text, /"(?:seatTokens|generatedOffers|frozenClientSeeds|receipts)"/);
	if (active) {
		const visit = (entry) => {
			if (entry === null || typeof entry !== 'object') return;
			for (const [key, item] of Object.entries(entry)) {
				if (['seed', 'serverSeed', 'clientSeeds'].includes(key))
					assert.equal(item, null, 'Unrevealed fairness evidence leaked');
				else visit(item);
			}
		};
		visit(value);
	}
}
async function finishAndVerify(room, name) {
	let state = await room.white.state();
	if (!state.status.Ended) {
		const index = room.white.frames.length;
		room.white.send({ Resign: {} });
		await room.white.next((value) => value.GameEnded, index);
		state = await room.white.state();
		assert.deepEqual(
			state.status.Ended.over,
			{
				result: { Win: { side: 'Black' } },
				termination: 'Resign',
			},
			'White resignation must award Black the game',
		);
	}
	const record = await publicRecord(room.white.creation.gameId);
	privateDataAbsent(record, room.white.creation, false);
	const verification = verifyTranscript(record);
	assert.equal(verification.status, 'verified', verification.reason);
	await writeFile(resolve(output, `${name}.json`), JSON.stringify(record, null, 2) + '\n');
	return verification;
}
async function classicControl() {
	const creation = await createRoom({ Unlimited: {} }, CLASSIC_ORIGIN);
	const room = await joinRoom(creation, undefined, CLASSIC_ORIGIN);
	peers.push(room.white, room.black);
	let rolled;
	await until(async () => {
		rolled = await room.white.state();
		return (rolled.dfen.split(/\s+/)[6] ?? '').length === 3;
	}, 'classic playable three-die roll');
	const first = {
		dice: (rolled.dfen.split(/\s+/)[6] ?? '')
			.toUpperCase()
			.split('')
			.map((letter) => 'PNBRQK'.indexOf(letter) + 1),
	};
	assert.equal(first.dice.length, 3, 'Classic must still roll three dice');
	const index = room.white.frames.length;
	room.white.send({ Resign: {} });
	const ended = (await room.white.next((value) => value.GameEnded, index)).GameEnded;
	assert.deepEqual(
		[...first.dice].sort(),
		classicRoll(
			ended.seed,
			ended.clientSeeds.white,
			ended.clientSeeds.black,
			(Number(rolled.dfen.split(/\s+/)[5]) - 1) * 2 + (rolled.activeSeat === 'Black' ? 1 : 0),
		).sort(),
	);
	assert.equal(
		createHash('sha256').update(Buffer.from(ended.seed, 'hex')).digest('hex'),
		creation.commit,
		'Classic commitment mismatch',
	);
	room.white.close();
	room.black.close();
	const refused = await fetch(`${CLASSIC_ORIGIN}/games`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			white: randomUUID(),
			black: randomUUID(),
			variant: { id: 'choice-2x2d6', revision: 1 },
			labProtocolVersion: 1,
		}),
	});
	assert.equal(refused.status, 400);
	report('classic-three-dice-regression', { dice: 3 });
}
async function mainDatabaseFingerprint() {
	const tables = (
		await env.sql(
			'lab225_classic',
			"SELECT tablename FROM pg_tables WHERE schemaname='play' ORDER BY tablename",
		)
	)
		.split('\n')
		.filter(Boolean);
	const counts = {};
	for (const table of tables) {
		assert.match(table, /^[a-z_]+$/);
		const rows = await env.sql(
			'lab225_classic',
			`SELECT COALESCE(jsonb_agg(to_jsonb(entry) ORDER BY to_jsonb(entry)::text), '[]'::jsonb) FROM play.${table} entry`,
		);
		counts[table] = {
			rows: JSON.parse(rows).length,
			sha256: createHash('sha256').update(rows).digest('hex'),
		};
	}
	return counts;
}
async function prepareFixtures() {
	const cases = [];
	for (const fixture of fixtures) {
		const creation = await createRoom();
		const saved = await snapshot(creation.gameId);
		const blackSeed = 'acceptance-fixture-black';
		let seeds;
		for (let counter = 0; counter < 250000; counter++) {
			const whiteSeed = `lab225-${fixture.name}-${counter}`;
			const offers = deterministicOffers(saved.serverSeed, whiteSeed, blackSeed, 0);
			if (fixture.match(offers)) {
				seeds = [whiteSeed, blackSeed];
				break;
			}
		}
		assert.ok(seeds, 'Could not find fixture seed inputs');
		cases.push({ fixture, creation, seeds });
	}
	await env.process('stop');
	for (const { fixture, creation } of cases) {
		const changed = await env.sql(
			'lab225_lab',
			`UPDATE laboratory.games SET snapshot=jsonb_set(jsonb_set(snapshot,'{dfen}',${jsonLiteral(fixture.dfen)}),'{lab,initialDfen}',${jsonLiteral(fixture.dfen)})
WHERE game_id='${creation.gameId}'::uuid AND version=0 AND status='active' AND snapshot->>'started'='false'
AND snapshot->'lab'->'turn'->>'phase'='AwaitingPlayers' AND snapshot->'lab'->'turn'->'generatedOffers'='[]'::jsonb RETURNING game_id;`,
		);
		assert.ok(
			changed.startsWith(creation.gameId),
			'Offline fixture update must change exactly its own pre-start row',
		);
	}
	await env.start();
	return cases;
}
async function runFixture({ fixture, creation, seeds }) {
	const room = await joinRoom(creation, seeds);
	peers.push(room.white, room.black);
	const before = await room.white.state();
	privateDataAbsent(before, creation);
	assert.equal(before.dfen, fixture.dfen);
	assert.equal(before.lab.turn.offers.length, 0);
	await room.white.command({ RollFirst: {} });
	const first = await room.white.state();
	assert.equal(first.lab.turn.offers.length, 1);
	const firstRecord = await publicRecord(creation.gameId);
	privateDataAbsent(firstRecord, creation);
	assert.equal(firstRecord.fairness, null);
	assert.equal(firstRecord.currentTurn.offers.length, 1);
	await room.white.command({ RollSecond: {} });
	const choice = await room.white.state();
	assert.equal(choice.lab.turn.phase, 'AwaitingPairChoice');
	assert.equal(choice.activeSeat, 'White');
	assert.equal(choice.dicePending, false);
	const chosen = await room.white.command({ ChoosePair: { pairIndex: fixture.selected } });
	if (fixture.moves.length === 0) {
		assert.equal(chosen.state.activeSeat, 'Black');
		assert.equal(chosen.state.lab.turn.phase, 'AwaitingFirstRoll');
	} else {
		assert.equal(chosen.state.lab.turn.phase, 'PlayingSelectedPair');
		assert.deepEqual(
			chosen.state.dfen.split(/\s+/)[6].toUpperCase().split('').sort(),
			choice.lab.turn.offers[fixture.selected].map((die) => 'PNBRQK'[die - 1]).sort(),
			'Only the two dice from the selected whole pair may enter the playable pool',
		);
		const tree = await readJson(`/games/${creation.gameId}/moves`);
		assert.equal(tree.dfen, chosen.state.dfen);
		if (fixture.partial) {
			await room.white.command(
				{ SubmitTurn: { moves: fixture.partial } },
				{ reject: 'InvalidCommand' },
			);
			await room.white.command(
				{ SubmitTurn: { moves: fixture.other } },
				{ reject: 'InvalidCommand' },
			);
			const index = room.white.frames.length;
			room.white.send({
				LabCommand: {
					commandId: randomUUID(),
					expectedVersion: chosen.state.version,
					action: { SubmitTurn: { moves: ['e2e3', 'f1c4', 'a2a4', 'a1a3'] } },
				},
			});
			await room.white.next((frame) => frame.LabRejected, index);
			assert.equal((await room.white.state()).version, chosen.state.version);
		}
		let node = tree.legalMoves;
		for (const move of fixture.moves) {
			assert.ok(node[move], 'Independent expected UCI must exist in the authoritative tree');
			node = node[move];
		}
		assert.deepEqual(node, {}, 'Expected turn must consume the maximum permitted selected dice');
		await room.white.command({ SubmitTurn: { moves: fixture.moves } });
		if (fixture.expectedBoard)
			assert.equal((await room.white.state()).dfen.split(' ')[0], fixture.expectedBoard);
		if (fixture.win)
			assert.equal((await room.white.state()).status.Ended.over.result.Win.side, fixture.win);
	}
	const verification = await finishAndVerify(room, fixture.name);
	const record = await publicRecord(creation.gameId);
	assert.equal(record.turns[0].selectedPairIndex, fixture.selected);
	assert.deepEqual(record.turns[0].moves, fixture.moves);
	assert.deepEqual(record.turns[0].offers, choice.lab.turn.offers);
	report(fixture.name, { verifiedTurns: verification.verifiedTurns });
	room.white.close();
	room.black.close();
}
async function protocolRejections() {
	const creation = await createRoom();
	const room = await joinRoom(creation);
	peers.push(room.white, room.black);
	const initial = await room.white.state();
	await room.black.command({ RollFirst: {} }, { reject: 'WrongSeat' });
	await room.white.command({ SubmitTurn: { moves: ['e2e4'] } }, { reject: 'WrongStage' });
	await room.white.command(
		{ RollFirst: {} },
		{ expectedVersion: initial.version - 1, reject: 'StaleVersion' },
	);
	assert.equal((await room.white.state()).version, initial.version);
	const applied = await room.white.command({ RollFirst: {} });
	await env.restart({ crash: true });
	room.white = await new Peer(creation, 'White', 'acceptance-white-seed').open();
	room.black = await new Peer(creation, 'Black', 'acceptance-black-seed').open();
	peers.push(room.white, room.black);
	const recovered = await room.white.state();
	assert.equal(recovered.lab.turn.phase, 'AwaitingSecondRoll');
	assert.deepEqual(recovered.lab.turn.offers, applied.state.lab.turn.offers);
	assert.deepEqual(recovered.lab.variant, applied.state.lab.variant);
	const index = room.white.frames.length;
	room.white.send(applied.frame);
	await room.white.next(
		(value) => value.LabCommandApplied?.commandId === applied.frame.LabCommand.commandId,
		index,
	);
	assert.equal((await room.white.state()).version, applied.state.version);
	await room.white.command(
		{ RollSecond: {} },
		{
			commandId: applied.frame.LabCommand.commandId,
			expectedVersion: initial.version,
			reject: 'CommandConflict',
		},
	);
	await room.white.command({ RollSecond: {} });
	await room.white.command({ ChoosePair: { pairIndex: 0 } });
	await room.white.command(
		{ ChoosePair: { pairIndex: 1 } },
		{ reject: ['WrongStage', 'WrongSeat'] },
	);
	const other = await createRoom();
	assert.equal(await foreignCapabilityClose(creation.gameId, other.tokens[0].token), 1008);
	for (const frame of room.black.frames)
		assert.notEqual(
			frame.LabCommandApplied?.commandId,
			applied.frame.LabCommand.commandId,
			'Private receipts must not reach the opponent',
		);
	await finishAndVerify(room, 'protocol-rejections');
	room.white.close();
	room.black.close();
	report('protocol-rejections-and-seat-boundaries');
}
async function timingAndRetention() {
	const pending = await createRoom({ SuddenDeath: { initialSeconds: 30 } });
	let waitingPeer = await new Peer(pending, 'White', 'acceptance-waiting-white').open();
	peers.push(waitingPeer);
	await env.restart();
	waitingPeer = await new Peer(pending, 'White', 'acceptance-waiting-white').open();
	peers.push(waitingPeer);
	const restored = await waitingPeer.state();
	assert.equal(restored.lab.turn.phase, 'AwaitingPlayers');
	assert.equal(restored.clocks.white, 30000);
	assert.equal(restored.clocks.black, 30000);
	const waitingBlack = await new Peer(pending, 'Black', 'acceptance-waiting-black').open();
	peers.push(waitingBlack);
	await until(
		async () => (await waitingPeer.state()).lab.turn.phase === 'AwaitingFirstRoll',
		'restored readiness gate',
	);
	await finishAndVerify({ white: waitingPeer, black: waitingBlack }, 'waiting-restart');
	waitingPeer.close();
	waitingBlack.close();
	report('waiting-stage-restart-preserves-stopped-clocks');
	const timed = await createRoom({ SuddenDeath: { initialSeconds: 3 } });
	const room = await joinRoom(timed);
	peers.push(room.white, room.black);
	await room.white.command({ RollFirst: {} });
	await room.white.command({ RollSecond: {} });
	await until(async () => !!(await room.white.state()).status.Ended, 'selection timeout', 80);
	const ended = await room.white.state();
	assert.equal(ended.status.Ended.over.termination, 'Timeout');
	assert.deepEqual(ended.status.Ended.over.result, { Win: { side: 'Black' } });
	assert.equal(ended.lab.turn.selectedPairIndex, null);
	await finishAndVerify(room, 'selection-timeout');
	room.white.close();
	room.black.close();
	report('timeout-during-pair-choice');
	await env.restart({ join: 2 });
	const lonely = await createRoom({ SuddenDeath: { initialSeconds: 30 } });
	const white = await new Peer(lonely, 'White', 'acceptance-lonely-seed').open();
	peers.push(white);
	const waiting = await white.state();
	assert.equal(waiting.lab.turn.phase, 'AwaitingPlayers');
	assert.equal(waiting.clocks.white, 30000);
	assert.equal(waiting.clocks.black, 30000);
	await until(async () => !!(await white.state()).status.Ended, 'missing participant abort', 80);
	const record = await publicRecord(lonely.gameId);
	assert.equal(record.completeness, 'incomplete');
	assert.equal(record.fairness, null);
	assert.equal(record.status.Ended.over.termination, 'Aborted');
	assert.deepEqual(record.status.Ended.over.result, { Draw: {} });
	privateDataAbsent(record, lonely);
	await writeFile(
		resolve(output, 'missing-participant-incomplete.json'),
		JSON.stringify(record, null, 2) + '\n',
	);
	white.close();
	await env.restart();
	report('missing-participant-stopped-clocks-and-incomplete-export');
	return lonely;
}
async function isolation(baseline) {
	assert.deepEqual(
		await mainDatabaseFingerprint(),
		baseline,
		'Laboratory traffic changed ordinary tables',
	);
	assert.equal(
		await env.sql('lab225_lab', "SELECT count(*) FROM pg_tables WHERE schemaname='play'"),
		'0',
	);
	assert.equal(
		await env.sql('lab225_classic', "SELECT count(*) FROM pg_tables WHERE schemaname='laboratory'"),
		'0',
	);
	const allowed = await env.sql(
		'postgres',
		"SELECT has_database_privilege('lab225_lab','lab225_classic','CONNECT')",
	);
	assert.equal(allowed, 'f');
	const games = await readJson('/games', CLASSIC_ORIGIN);
	const labIds = (await env.sql('lab225_lab', 'SELECT game_id FROM laboratory.games')).split('\n');
	for (const id of labIds)
		assert.ok(!JSON.stringify(games).includes(id), 'Laboratory game leaked into classic listing');
	for (const path of [
		'/lobby/seeks',
		'/leaderboard',
		'/me',
		'/bots',
		'/ingest/games',
		'/training',
	]) {
		const response = await fetch(`${API_ORIGIN}${path}`);
		assert.equal(response.status, 404);
	}
	report('separate-databases-roles-routes-and-ordinary-tables', {
		ordinaryTables: Object.keys(baseline).length,
	});
}

async function retirementHandoff(finishedId) {
	await env.restart({ admission: false });
	const before = await env.sql('lab225_lab', 'SELECT count(*) FROM laboratory.games');
	const response = await fetch(`${API_ORIGIN}/games`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			white: randomUUID(),
			black: randomUUID(),
			variant: { id: 'choice-2x2d6', revision: 1 },
			labProtocolVersion: 1,
		}),
	});
	assert.ok([400, 503].includes(response.status), 'Closed admission must reject new games');
	assert.equal(await env.sql('lab225_lab', 'SELECT count(*) FROM laboratory.games'), before);
	assert.equal(verifyTranscript(await publicRecord(finishedId)).status, 'verified');
	report('closed-admission-preserves-export-and-blocks-new-games');
}
try {
	await mkdir(output, { recursive: true });
	await env.setup(output);
	await classicControl();
	await new Promise((r) => setTimeout(r, 200));
	const baseline = await mainDatabaseFingerprint();
	const cases = await prepareFixtures();
	for (const fixture of cases) await runFixture(fixture);
	await protocolRejections();
	const incompleteRoom = await timingAndRetention();
	browser = await chromium.launch({ headless: true });
	const browserEvidence = await runBrowserAcceptance({
		browser,
		appOrigin: APP_ORIGIN,
		apiOrigin: API_ORIGIN,
		incompleteRoom,
		restart: async (gameId) => {
			assert.match(gameId, /^[0-9a-f-]{36}$/);
			const saved = await snapshot(gameId);
			await env.process('stop');
			const startedAt = performance.now();
			await env.start();
			const restored = await readJson(`/games/${gameId}`);
			const bank = { white: saved.remainingMs.White, black: saved.remainingMs.Black };
			for (const side of ['white', 'black']) {
				assert.ok(
					restored.clocks[side] <= bank[side],
					'Restart must not grant an increment or reset a clock',
				);
				assert.ok(
					restored.clocks[side] >= bank[side] - (performance.now() - startedAt) - 500,
					'Restart must recover the committed clock bank',
				);
			}
			return {
				savedClocks: bank,
				restoredClocks: restored.clocks,
				sampledAt: performance.now(),
				activeSeat: restored.activeSeat,
			};
		},
		outputDir: output,
		disconnect: () => env.dropConnections(),
	});
	evidence.push(...browserEvidence.findings);
	assert.ok(
		evidence.every((item) => item.status === 'PASS'),
		'Browser qualification failed',
	);
	assert.equal(
		verifyTranscript(browserEvidence.terminalRecord).status,
		'verified',
		'Downloaded UI record failed independent verification',
	);
	await isolation(baseline);
	await retirementHandoff(cases.at(-1).creation.gameId);
	const versions = {
		node: process.version,
		clientRules: '0.18.2',
		server: await readJson('/health'),
		postgres: await env.sql('lab225_lab', 'SHOW server_version'),
		postgresImage: JSON.parse(
			(
				await env.docker([
					'image',
					'inspect',
					'postgres:18-alpine',
					'--format',
					'{{json .RepoDigests}}',
				])
			).stdout,
		)[0],
		serverArtifactSha256: (
			await env.linux('sha256sum', [
				`${env.stage}/lib/com.fortemate.dicechess-play-api-0.1.0-SNAPSHOT.jar`,
			])
		).stdout.split(/\s+/)[0],
		chromium: browser.version(),
	};
	await writeFile(
		resolve(output, 'acceptance-results.json'),
		JSON.stringify({ schemaVersion: 1, status: 'PASS', versions, scenarios: evidence }, null, 2) +
			'\n',
	);
	const digests = [];
	for (const name of (await readdir(output)).sort()) {
		const bytes = await readFile(resolve(output, name));
		digests.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
	}
	await writeFile(resolve(output, 'SHA256SUMS'), digests.join('\n') + '\n');
	process.stdout.write(`Laboratory acceptance passed (${evidence.length} scenarios).\n`);
} catch (error) {
	await writeFile(
		resolve(output, 'acceptance-results.json'),
		JSON.stringify(
			{
				schemaVersion: 1,
				status: 'FAIL',
				scenarios: evidence,
				failure: { name: error.name, message: error.message },
			},
			null,
			2,
		) + '\n',
	);
	process.stderr.write(`Laboratory acceptance failed: ${error.message}\n`);
	process.exitCode = 1;
} finally {
	for (const peer of peers) peer.close();
	await browser?.close();
	await env.cleanup();
}
