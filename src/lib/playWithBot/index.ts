// playWithBot test package - exports all test files for easy import
// Usage: import 'src/lib/playWithBot' to run all playWithBot tests

// Entry point for the playWithBot module, exporting the store and test utilities.

export {
	PlayWithBotStore,
	playWithBotStore,
	setDiceChessInstance,
	resetDiceChessInstance,
} from './playWithBotStore.svelte';
export { PlayWithBotHistory, type BotMoveHistoryState } from './playWithBotHistory.svelte';
export { PlayWithBotDice } from './playWithBotDice.svelte';
export {
	PlayWithBotBot,
	setBotDiceChessInstance,
	resetBotDiceChessInstance,
} from './playWithBotBot';
