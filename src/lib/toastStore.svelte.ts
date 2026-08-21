export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
	id: string;
	text: string;
	type: ToastType;
}

class ToastStore {
	toasts: ToastMessage[] = $state([]);
	// Per-toast dismissal timers, so a coalesced repeat can refresh instead of stacking.
	private timers = new Map<string, ReturnType<typeof setTimeout>>();

	private add(text: string, type: ToastType, duration: number = 3000) {
		// Coalesce: an identical toast already on screen just gets its timer refreshed rather than
		// stacking a duplicate. Some events fire in bursts (e.g. a live opponent passing several
		// rolls with no legal move); N identical copies never help — and a screen reader would
		// otherwise announce each one.
		const existing = this.toasts.find((t) => t.text === text && t.type === type);
		if (existing) {
			this.arm(existing.id, duration);
			return;
		}

		const id = crypto.randomUUID();
		this.toasts.push({ id, text, type });
		this.arm(id, duration);
	}

	private arm(id: string, duration: number) {
		const prev = this.timers.get(id);
		if (prev) clearTimeout(prev);
		this.timers.set(
			id,
			setTimeout(() => this.remove(id), duration),
		);
	}

	remove(id: string) {
		this.toasts = this.toasts.filter((t) => t.id !== id);
		const timer = this.timers.get(id);
		if (timer) {
			clearTimeout(timer);
			this.timers.delete(id);
		}
	}

	success(text: string, duration?: number) {
		this.add(text, 'success', duration);
	}

	error(text: string, duration?: number) {
		this.add(text, 'error', duration);
	}

	info(text: string, duration?: number) {
		this.add(text, 'info', duration);
	}
}

export const toastStore = new ToastStore();
