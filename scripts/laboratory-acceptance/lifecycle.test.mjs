import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { QualificationControl } from './lifecycle.mjs';

test('signal handlers record only the first interruption and can be removed', () => {
	const control = new QualificationControl();
	const target = new EventEmitter();
	const callbacks = [];
	const uninstall = control.install(target, (signal) => callbacks.push(signal));

	target.emit('SIGTERM');
	target.emit('SIGINT');

	assert.equal(control.stopped, true);
	assert.equal(control.signal, 'SIGTERM');
	assert.equal(control.exitCode, 143);
	assert.deepEqual(callbacks, ['SIGTERM']);
	assert.throws(control.throwIfStopped.bind(control), {
		name: 'AbortError',
		message: 'Interrupted by SIGTERM',
	});

	uninstall();
	assert.equal(target.listenerCount('SIGINT'), 0);
	assert.equal(target.listenerCount('SIGTERM'), 0);
});

test('stop observed after pending resource creation prevents subsequent work', async () => {
	const control = new QualificationControl();
	let resourceCreated = false;
	let subsequentWorkStarted = false;
	let finishCreation;
	const pendingCreation = new Promise((resolve) => {
		finishCreation = () => {
			resourceCreated = true;
			resolve();
		};
	});
	const flow = (async () => {
		await pendingCreation;
		control.throwIfStopped();
		subsequentWorkStarted = true;
	})();

	control.requestStop('SIGINT');
	finishCreation();
	await assert.rejects(flow, { name: 'AbortError', message: 'Interrupted by SIGINT' });
	assert.equal(resourceCreated, true);
	assert.equal(subsequentWorkStarted, false);
});

test('concurrent normal and signal shutdown calls share one awaited cleanup', async () => {
	const control = new QualificationControl();
	let calls = 0;
	let finishCleanup;
	const cleanupGate = new Promise((resolve) => {
		finishCleanup = resolve;
	});
	const cleanup = async () => {
		calls++;
		await cleanupGate;
		return 'cleaned';
	};

	const normalShutdown = control.shutdown(cleanup);
	control.requestStop('SIGTERM');
	const signalShutdown = control.shutdown(cleanup);
	assert.strictEqual(signalShutdown, normalShutdown);
	await Promise.resolve();
	assert.equal(calls, 1);
	let completed = false;
	normalShutdown.then(() => {
		completed = true;
	});
	await Promise.resolve();
	assert.equal(completed, false);

	finishCleanup();
	assert.equal(await signalShutdown, 'cleaned');
	assert.equal(completed, true);
	assert.equal(calls, 1);
});

test('shutdown memoizes and propagates cleanup errors', async () => {
	const control = new QualificationControl();
	const failure = new Error('cleanup failed');
	let calls = 0;
	const cleanup = () => {
		calls++;
		throw failure;
	};

	const first = control.shutdown(cleanup);
	const second = control.shutdown(cleanup);
	assert.strictEqual(second, first);
	await assert.rejects(first, failure);
	await assert.rejects(second, failure);
	assert.equal(calls, 1);
});
