/**
 * App-chrome visibility. Game screens set `zen` while a game is on screen so the layout
 * hides the header, footer and mobile nav — the board is the primary element and
 * everything else gets out of the way. Pages must reset it in their effect cleanup.
 */
class ChromeStore {
	zen = $state(false);
	/** A game is in progress on screen. The layout defers the service worker's update reload while
	 * this is set: a reload mid-game drops the seat (see +layout.svelte and +page.svelte). */
	holdReload = $state(false);
	/** Pending durable game writes survive route cleanup. A worker must not replace the
	 * page until every write has settled, including a failed write. */
	pendingGameSaves = $state(0);
	get reloadHeld() {
		return this.holdReload || this.pendingGameSaves > 0;
	}
}

export const chromeStore = new ChromeStore();
