import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeMaskedClientFrame } from './peer.mjs';

function decodeMaskedTextFrame(frame) {
	assert.equal(frame[0], 0x81, 'Expected a final text frame');
	assert.equal(frame[1] & 0x80, 0x80, 'Client frames must be masked');
	const lengthCode = frame[1] & 0x7f;
	let length;
	let offset;
	if (lengthCode < 126) {
		length = lengthCode;
		offset = 2;
	} else {
		assert.equal(lengthCode, 126, 'Test frames use at most a 16-bit payload length');
		length = frame.readUInt16BE(2);
		offset = 4;
	}
	assert.equal(frame.length, offset + 4 + length);
	const mask = frame.subarray(offset, offset + 4);
	const payload = Buffer.alloc(length);
	for (let index = 0; index < length; index++)
		payload[index] = frame[offset + 4 + index] ^ mask[index % 4];
	return { lengthCode, payload };
}

for (const length of [0, 125, 126, 65535]) {
	test(`masked client frame round-trips ${length} byte payload`, () => {
		const payload = Buffer.alloc(length);
		for (let index = 0; index < length; index++) payload[index] = (index * 31) % 256;

		const decoded = decodeMaskedTextFrame(encodeMaskedClientFrame(payload));
		assert.equal(decoded.lengthCode, length < 126 ? length : 126);
		assert.deepEqual(decoded.payload, payload);
	});
}

test('masked client frame rejects payloads beyond its 16-bit length bound', () => {
	assert.throws(() => encodeMaskedClientFrame(Buffer.alloc(65536)), RangeError);
});
