// play-api redirects successful Google sign-ins to the public site root. Remember the
// initiating tab so the TV page can hand the player back to the game after that round trip.
const LOGIN_STARTED = 'dicechess-play-login-started';
const STATE_LIFETIME_MS = 10 * 60 * 1000; // play-api's OAuth state cookie lives for ten minutes.

export function markLoginStart(): void {
	try {
		window.sessionStorage.setItem(LOGIN_STARTED, String(Date.now()));
	} catch {
		// Storage can be blocked. Signing in still works through the browser-game link.
	}
}

export function consumeLoginReturn(): boolean {
	try {
		const started = window.sessionStorage.getItem(LOGIN_STARTED);
		if (started === null) return false;
		window.sessionStorage.removeItem(LOGIN_STARTED);
		const age = Date.now() - Number(started);
		return age >= 0 && age < STATE_LIFETIME_MS;
	} catch {
		return false;
	}
}
