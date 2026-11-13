/**
 * Independent commit-reveal and transcript verifier for laboratory acceptance runs.
 * Keeps the server's HMAC/SHA-256 derivation local to this script and replays recorded turns
 * through the pinned rules-only engine. Never returns seeds or other transcript credentials.
 */
import { createHash, createHmac } from 'node:crypto';
import { DiceChess } from '@fortemate/dicechess-engine';

export const LAB_DICE_ALGORITHM = 'choice-2x2d6-hmac-sha256-v1';
const CLASSIC_DICE_COUNT = 3;
const OFFER_COUNT = 2;
const CUTOFF = 252;
const UINT32_MAX = 0xffff_ffff;
const SAFE_INTEGER_MAX = Number.MAX_SAFE_INTEGER;
const DIE_LETTERS = 'PNBRQK';

function uint32(value) {
	const buffer = Buffer.alloc(4);
	buffer.writeUInt32BE(value);
	return buffer;
}

function int64(value) {
	const buffer = Buffer.alloc(8);
	buffer.writeBigInt64BE(BigInt(value));
	return buffer;
}

function utf8(value) {
	if (typeof value !== 'string') throw new Error('invalid client seed');
	const bytes = Buffer.from(value, 'utf8');
	if (bytes.toString('utf8') !== value) throw new Error('invalid client seed');
	if (bytes.length > UINT32_MAX) throw new Error('client seed too long');
	return bytes;
}

function validTurnNumber(value) {
	return Number.isSafeInteger(value) && value >= 0;
}

function decodeServerSeed(value) {
	if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value))
		throw new Error('invalid server seed');
	return Buffer.from(value, 'hex');
}

function sampleDice(seed, message, amount) {
	const dice = [];
	for (let block = 0; block <= UINT32_MAX && dice.length < amount; block += 1) {
		const bytes = createHmac('sha256', seed).update(message).update(uint32(block)).digest();
		for (const byte of bytes) {
			if (byte < CUTOFF) dice.push((byte % 6) + 1);
			if (dice.length === amount) break;
		}
	}
	if (dice.length !== amount) throw new Error('dice counter exhausted');
	return dice;
}

function classicDice(seed, whiteSeed, blackSeed, ply) {
	const white = utf8(whiteSeed);
	const black = utf8(blackSeed);
	const base = Buffer.concat([
		uint32(white.length),
		white,
		uint32(black.length),
		black,
		int64(ply),
	]);
	return sampleDice(seed, base, CLASSIC_DICE_COUNT);
}

function laboratoryOffers(seed, whiteSeed, blackSeed, turnNumber) {
	if (!validTurnNumber(turnNumber)) throw new Error('invalid turn number');
	const white = utf8(whiteSeed);
	const black = utf8(blackSeed);
	const domain = Buffer.from(`${LAB_DICE_ALGORITHM}\0`, 'ascii');
	const base = Buffer.concat([
		domain,
		uint32(white.length),
		white,
		uint32(black.length),
		black,
		int64(turnNumber),
	]);
	return Array.from({ length: OFFER_COUNT }, (_, offerIndex) => {
		const message = Buffer.concat([base, Buffer.from([offerIndex])]);
		return sampleDice(seed, message, 2);
	});
}

/** Derives the two laboratory offers from a revealed 64-character server-seed hex string. */
export function deterministicOffers(serverSeed, whiteSeed, blackSeed, turnNumber) {
	return laboratoryOffers(decodeServerSeed(serverSeed), whiteSeed, blackSeed, turnNumber);
}

/** Derives the legacy classic three-die roll from the same independent HMAC implementation. */
export function classicRoll(serverSeed, whiteSeed, blackSeed, ply) {
	return classicDice(decodeServerSeed(serverSeed), whiteSeed, blackSeed, ply);
}

function fail(message, verifiedTurns = 0) {
	return { status: 'failed', verifiedTurns, reason: message };
}

function isPair(value) {
	return (
		Array.isArray(value) &&
		value.length === 2 &&
		value.every((die) => Number.isInteger(die) && die >= 1 && die <= 6)
	);
}

function samePair(left, right) {
	return (
		Array.isArray(left) && left.length === right.length && left.every((die, i) => die === right[i])
	);
}

function boardFields(dfen) {
	if (typeof dfen !== 'string' || dfen.length === 0 || dfen.length > 512)
		throw new Error('invalid DFEN');
	const fields = dfen.trim().split(/\s+/);
	if (fields.length < 6 || fields.length > 7 || !['w', 'b'].includes(fields[1]))
		throw new Error('invalid DFEN');
	return fields.slice(0, 6);
}

function turnFen(position, color, dice) {
	const letters = dice.map((die) => DIE_LETTERS[die - 1]).join('');
	return `${position.join(' ')} ${color === 'w' ? letters : letters.toLowerCase()}`;
}

function capturedKingWinner(position) {
	const board = position[0];
	const whiteKing = board.includes('K');
	const blackKing = board.includes('k');
	if (whiteKing === blackKing) return null;
	return whiteKing ? 'White' : 'Black';
}

function replayTurns(transcript) {
	let position = boardFields(transcript.initialDfen);
	let color = position[1];
	let verifiedTurns = 0;
	for (let index = 0; index < transcript.turns.length; index += 1) {
		const turn = transcript.turns[index];
		if (!turn || turn.turnNumber !== index || turn.activeColor !== color)
			throw new Error(`turn ${index} order does not match the initial position`);
		if (
			!Array.isArray(turn.offers) ||
			turn.offers.length !== 2 ||
			!turn.offers.every(isPair) ||
			(turn.selectedPairIndex !== 0 && turn.selectedPairIndex !== 1) ||
			!isPair(turn.dice)
		)
			throw new Error(`turn ${index} has invalid pair data`);
		const selected = turn.offers[turn.selectedPairIndex];
		if (!samePair(selected, turn.dice))
			throw new Error(`turn ${index} selected dice do not match its offer`);
		if (!Array.isArray(turn.moves) || turn.moves.length > 2)
			throw new Error(`turn ${index} has invalid moves`);

		const rolledDfen = turnFen(position, color, turn.dice);
		let legalNode = DiceChess.getLegalTurnTree(rolledDfen);
		if (turn.moves.length === 0 && Object.keys(legalNode).length !== 0)
			throw new Error(`turn ${index} passed despite available legal paths`);
		let dfen = rolledDfen;
		for (const move of turn.moves) {
			if (typeof move !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))
				throw new Error(`turn ${index} has invalid UCI`);
			if (!Object.hasOwn(legalNode, move))
				throw new Error(`turn ${index} is not a legal turn path`);
			legalNode = legalNode[move];
			const applied = DiceChess.applyMove(dfen, move.slice(0, 2), move.slice(2, 4), move[4]);
			if (typeof applied !== 'string') throw new Error(`turn ${index} contains an illegal move`);
			dfen = applied;
		}
		if (turn.moves.length > 0 && Object.keys(legalNode).length !== 0)
			throw new Error(`turn ${index} ended before exhausting its legal path`);
		const winner = capturedKingWinner(boardFields(dfen));
		if (winner !== null && index !== transcript.turns.length - 1)
			throw new Error(`turn ${index} continued after king capture`);
		const ended = winner === null ? DiceChess.endTurn(dfen) : dfen;
		if (typeof ended !== 'string') throw new Error(`turn ${index} could not end`);
		const after = boardFields(ended);
		const expectedAfter = boardFields(turn.fenAfter);
		if (after.join(' ') !== expectedAfter.join(' '))
			throw new Error(`turn ${index} FEN replay mismatch`);
		position = after;
		color = position[1];
		verifiedTurns += 1;
	}
	return { position, verifiedTurns };
}

/**
 * Independently verifies a complete public transcript. Incomplete records intentionally return
 * `not-verifiable`: public state cannot establish fairness without the terminal seed reveal.
 */
export function verifyTranscript(transcript) {
	if (!transcript || transcript.completeness !== 'complete' || transcript.fairness == null)
		return {
			status: 'not-verifiable',
			verifiedTurns: 0,
			reason: 'complete fairness reveal required',
		};
	if (
		transcript.provenance?.diceAlgorithm !== LAB_DICE_ALGORITHM ||
		transcript.variant?.id !== 'choice-2x2d6' ||
		transcript.variant?.revision !== 1 ||
		transcript.provenance?.rulesVersion !== '0.18.2'
	)
		return fail('unsupported transcript provenance');
	if (
		!transcript.status?.Ended?.over ||
		transcript.status.Ended.over.termination === 'Aborted' ||
		transcript.currentTurn?.phase !== 'Ended'
	)
		return fail('complete transcript is not terminal');
	if (
		!Array.isArray(transcript.turns) ||
		!Number.isSafeInteger(transcript.turns.length) ||
		transcript.turns.length > SAFE_INTEGER_MAX
	)
		return fail('invalid transcript turns');
	try {
		const { commit, serverSeed, clientSeeds } = transcript.fairness;
		const seed = decodeServerSeed(serverSeed);
		if (typeof commit !== 'string' || !/^[a-f0-9]{64}$/.test(commit))
			return fail('invalid commitment');
		const actualCommit = createHash('sha256').update(seed).digest('hex');
		if (actualCommit !== commit) return fail('commitment mismatch');
		if (
			!clientSeeds ||
			typeof clientSeeds.white !== 'string' ||
			clientSeeds.white.length === 0 ||
			typeof clientSeeds.black !== 'string' ||
			clientSeeds.black.length === 0
		)
			return fail('client seeds unavailable');
		const verified = replayTurns(transcript);
		for (let index = 0; index < transcript.turns.length; index += 1) {
			const expected = laboratoryOffers(seed, clientSeeds.white, clientSeeds.black, index);
			const turn = transcript.turns[index];
			if (
				!Array.isArray(turn.offers) ||
				turn.offers.length !== 2 ||
				!samePair(turn.offers[0], expected[0]) ||
				!samePair(turn.offers[1], expected[1])
			)
				return fail(`turn ${index} offer mismatch`, verified.verifiedTurns);
		}
		const winner = capturedKingWinner(verified.position);
		const termination = transcript.status.Ended.over.termination;
		if ((winner !== null) !== (termination === 'KingCaptured'))
			return fail('terminal king capture reason mismatch', verified.verifiedTurns);
		if (winner !== null && transcript.status?.Ended?.over?.result?.Win?.side !== winner)
			return fail('terminal king capture result mismatch', verified.verifiedTurns);
		const terminalOffers = transcript.currentTurn?.offers;
		const terminalSelection = transcript.currentTurn?.selectedPairIndex;
		if (
			!Array.isArray(terminalOffers) ||
			terminalOffers.length > OFFER_COUNT ||
			!terminalOffers.every(isPair) ||
			(terminalSelection !== null &&
				(terminalOffers.length !== OFFER_COUNT ||
					(terminalSelection !== 0 && terminalSelection !== 1)))
		)
			return fail('invalid terminal offers', verified.verifiedTurns);
		if (terminalOffers.length > 0) {
			const terminalTurnNumber =
				termination === 'KingCaptured' ? transcript.turns.length - 1 : transcript.turns.length;
			if (terminalTurnNumber < 0) return fail('terminal offers have no originating turn');
			const expected = laboratoryOffers(
				seed,
				clientSeeds.white,
				clientSeeds.black,
				terminalTurnNumber,
			);
			if (terminalOffers.some((pair, index) => !samePair(pair, expected[index])))
				return fail('terminal offer mismatch', verified.verifiedTurns);
		}
		return { status: 'verified', verifiedTurns: verified.verifiedTurns };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'transcript verification failed';
		return fail(message);
	}
}

/** Fixed source vectors support the acceptance oracle's Node test without importing server code. */
export function verifyGoldenVector(vector) {
	try {
		const seed = decodeServerSeed(vector.serverSeed);
		const commit = createHash('sha256').update(seed).digest('hex');
		const offers = laboratoryOffers(
			seed,
			vector.clientSeeds.white,
			vector.clientSeeds.black,
			vector.turnNumber,
		);
		const legacy = classicDice(
			seed,
			vector.clientSeeds.white,
			vector.clientSeeds.black,
			vector.turnNumber,
		);
		return (
			commit === vector.commit &&
			Array.isArray(vector.offers) &&
			vector.offers.length === 2 &&
			samePair(offers[0], vector.offers[0]) &&
			samePair(offers[1], vector.offers[1]) &&
			Array.isArray(vector.classicDice) &&
			samePair(legacy.slice(0, 2), vector.classicDice.slice(0, 2)) &&
			legacy.length === vector.classicDice.length &&
			legacy.every((die, index) => die === vector.classicDice[index])
		);
	} catch {
		return false;
	}
}
