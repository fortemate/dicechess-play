/** Regression for child exit preceding the final stdout/stderr chunks. No services are started. */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { captureChildOutput } from './environment.mjs';

test('database output resolves only after close and preserves final UTF-8 chunks', async () => {
	const child = new EventEmitter();
	child.stdin = new PassThrough();
	child.stdout = new PassThrough();
	child.stderr = new PassThrough();
	let settled = false;
	const completion = captureChildOutput(child, 'query').then((result) => {
		settled = true;
		return result;
	});
	child.stdout.write('{"value":"');
	child.emit('exit', 0);
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(settled, false, 'exit alone must not complete the database read');
	const text = Buffer.from('é"}');
	child.stdout.write(text.subarray(0, 1));
	child.stdout.end(text.subarray(1));
	child.stderr.end('last diagnostic');
	await Promise.all([
		new Promise((resolve) => child.stdout.on('end', resolve)),
		new Promise((resolve) => child.stderr.on('end', resolve)),
	]);
	child.emit('close', 0);
	assert.deepEqual(await completion, { stdout: '{"value":"é"}', stderr: 'last diagnostic' });
});
