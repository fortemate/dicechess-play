/** Native test participant. Credentials stay in memory; only lab first-frame authentication is used. */
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import net from 'node:net';
import { until, API_ORIGIN } from './environment.mjs';
export async function readJson(path, origin = API_ORIGIN, init = {}) {
	const response = await fetch(new URL(path, origin), {
		...init,
		signal: AbortSignal.timeout(10000),
		credentials: 'omit',
	});
	assert.ok(response.ok, `Local acceptance HTTP request failed (${response.status})`);
	return response.json();
}
export async function createRoom(timeControl = { Unlimited: {} }, origin = API_ORIGIN) {
	return readJson('/games', origin, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			white: randomUUID(),
			black: randomUUID(),
			timeControl,
			...(origin === API_ORIGIN
				? { variant: { id: 'choice-2x2d6', revision: 1 }, labProtocolVersion: 1, rated: false }
				: {}),
		}),
	});
}
export class Peer {
	constructor(creation, seat, seed, origin = API_ORIGIN) {
		this.creation = creation;
		this.seat = seat;
		this.seed = seed;
		this.origin = origin;
		this.frames = [];
		this.closed = false;
	}
	async open() {
		const token = this.creation.tokens.find((value) => value.seat === this.seat).token;
		const url = new URL(`/games/${this.creation.gameId}/ws`, this.origin);
		url.protocol = 'ws:';
		if (this.origin !== API_ORIGIN) {
			url.searchParams.set('token', token);
			url.searchParams.set('guest', randomUUID());
		}
		this.socket = new WebSocket(url);
		this.socket.addEventListener('message', (event) => {
			try {
				this.frames.push(JSON.parse(event.data));
			} catch {
				assert.fail('Invalid server JSON');
			}
		});
		this.socket.addEventListener('close', (event) => {
			this.closed = true;
			this.closeCode = event.code;
		});
		await until(() => this.socket.readyState === WebSocket.OPEN, 'participant socket');
		if (this.origin === API_ORIGIN) {
			this.send({ LabAuthenticate: { token, guest: randomUUID() } });
			const frame = await this.next((value) => value.LabAuthenticated);
			assert.equal(frame.LabAuthenticated.seat, this.seat);
		}
		this.send({ SubmitSeed: { seed: this.seed } });
		await this.next((value) => value.Snapshot);
		return this;
	}
	send(frame) {
		this.socket.send(JSON.stringify(frame));
	}
	async next(predicate, from = 0) {
		let match;
		await until(() => {
			match = this.frames.slice(from).find(predicate);
			return !!match;
		}, 'participant event');
		return match;
	}
	async state() {
		return readJson(`/games/${this.creation.gameId}`, this.origin);
	}
	async command(action, { expectedVersion, commandId = randomUUID(), reject } = {}) {
		const before = await this.state();
		const index = this.frames.length;
		const frame = {
			LabCommand: { commandId, expectedVersion: expectedVersion ?? before.version, action },
		};
		this.send(frame);
		const reply = await this.next(
			(value) =>
				value.LabCommandApplied?.commandId === commandId ||
				value.LabRejected?.commandId === commandId,
			index,
		);
		if (reject) {
			assert.ok(reply.LabRejected, 'Expected command rejection');
			assert.ok([reject].flat().includes(reply.LabRejected.code), 'Unexpected rejection code');
		} else assert.ok(reply.LabCommandApplied, 'Expected command receipt');
		return { frame, reply, state: await this.state() };
	}
	close() {
		this.socket?.close();
	}
}
export async function joinRoom(
	creation,
	seeds = ['acceptance-white-seed', 'acceptance-black-seed'],
	origin = API_ORIGIN,
) {
	const white = await new Peer(creation, 'White', seeds[0], origin).open();
	const black = await new Peer(creation, 'Black', seeds[1], origin).open();
	if (origin === API_ORIGIN)
		await until(
			async () => (await white.state()).lab.turn.phase === 'AwaitingFirstRoll',
			'both seats ready',
		);
	else await until(async () => (await white.state()).dicePending, 'classic roll');
	return { white, black };
}

/** Read the policy close control frame directly; Node's WebSocket close event waits for TCP drain. */
export async function foreignCapabilityClose(gameId, token) {
	const payload = Buffer.from(JSON.stringify({ LabAuthenticate: { token, guest: randomUUID() } }));
	const mask = randomBytes(4);
	const frame = Buffer.alloc(8 + payload.length);
	frame[0] = 0x81;
	frame[1] = 0x80 | 126;
	frame.writeUInt16BE(payload.length, 2);
	mask.copy(frame, 4);
	for (let index = 0; index < payload.length; index++)
		frame[index + 8] = payload[index] ^ mask[index % 4];
	return new Promise((resolvePromise, reject) => {
		const socket = net.connect(8081, '127.0.0.1');
		let buffer = Buffer.alloc(0);
		let upgraded = false;
		const timer = setTimeout(() => {
			socket.destroy();
			reject(new Error('Foreign capability did not receive a policy close frame'));
		}, 5000);
		const fail = (error) => {
			clearTimeout(timer);
			socket.destroy();
			reject(error);
		};
		socket.on('error', fail);
		socket.on('connect', () =>
			socket.write(
				`GET /games/${gameId}/ws HTTP/1.1\r\nHost: 127.0.0.1:8081\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
			),
		);
		socket.on('data', (chunk) => {
			try {
				buffer = Buffer.concat([buffer, chunk]);
				if (!upgraded) {
					const end = buffer.indexOf('\r\n\r\n');
					if (end < 0) return;
					assert.match(buffer.subarray(0, end).toString(), /^HTTP\/1\.1 101/);
					buffer = buffer.subarray(end + 4);
					upgraded = true;
					socket.write(frame);
				}
				if (buffer.length < 2) return;
				const opcode = buffer[0] & 15;
				let length = buffer[1] & 127;
				let offset = 2;
				assert.equal(buffer[1] & 128, 0, 'Server frames must be unmasked');
				if (length === 126) {
					if (buffer.length < 4) return;
					length = buffer.readUInt16BE(2);
					offset = 4;
				}
				assert.ok(length < 126, 'Policy close frame must be bounded');
				if (buffer.length < offset + length) return;
				assert.equal(opcode, 8, 'Foreign capability must receive no application data');
				assert.ok(length >= 2);
				const code = buffer.readUInt16BE(offset);
				clearTimeout(timer);
				socket.destroy();
				resolvePromise(code);
			} catch (error) {
				fail(error);
			}
		});
	});
}
