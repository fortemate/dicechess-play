/**
 * App-chrome visibility. Game screens set `zen` while a game is on screen so the layout
 * hides the header, footer and mobile nav — the board is the primary element and
 * everything else gets out of the way. Pages must reset it in their effect cleanup.
 */
class ChromeStore {
	zen = $state(false);
}

export const chromeStore = new ChromeStore();
