/** Coordinate cooperative interruption and once-only cleanup for a qualification run. */
export class QualificationControl {
	constructor() {
		this.signal = undefined;
		this.exitCode = undefined;
		this.shutdownPromise = undefined;
	}

	get stopped() {
		return this.signal !== undefined;
	}

	get interrupted() {
		return this.stopped;
	}

	throwIfStopped() {
		if (!this.stopped) return;
		const error = new Error(`Interrupted by ${this.signal}`);
		error.name = 'AbortError';
		throw error;
	}

	requestStop(signal) {
		if (this.stopped) return false;
		if (signal !== 'SIGINT' && signal !== 'SIGTERM')
			throw new TypeError(`Unsupported interruption signal: ${signal}`);
		this.signal = signal;
		this.exitCode = signal === 'SIGINT' ? 130 : 143;
		return true;
	}

	install(target = process, onInterrupt = () => {}) {
		const handlers = new Map();
		for (const signal of ['SIGINT', 'SIGTERM']) {
			const handler = () => {
				if (this.requestStop(signal)) onInterrupt(signal);
			};
			handlers.set(signal, handler);
			target.on(signal, handler);
		}
		return () => {
			for (const [signal, handler] of handlers) target.off(signal, handler);
		};
	}

	shutdown(cleanup) {
		if (!this.shutdownPromise) this.shutdownPromise = Promise.resolve().then(cleanup);
		return this.shutdownPromise;
	}
}

export const qualification = new QualificationControl();
