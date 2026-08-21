// src/lib/playWithBot/playWithBotDice.svelte.ts

import { getDieValue } from '../../utils/fenUtils';

/**
 * State representing a single die in the active turn's dice pool.
 */
export interface DieState {
	/** The chess piece character code representing the die value (e.g. 'P', 'n'). */
	value: string;
	/** Whether the die is permitted to be consumed by the player. */
	allowed: boolean;
	/** Whether the die has been used to execute a micro-move in the current turn. */
	used: boolean;
}

/**
 * PlayWithBotDice encapsulates all rolling animations, dice pool values,
 * and usage markers in an isolated, reactive state engine.
 */
export class PlayWithBotDice {
	/** The reactive list of active dice in the current turn. */
	currentDice = $state<DieState[]>([]);

	/** Whether the dice roll animation is currently executing in the UI. */
	isAnimatingRoll = $state<boolean>(false);

	/**
	 * Recomputes and returns a list of integer values of dice that are
	 * allowed and have not yet been consumed in the active turn.
	 */
	get availableDiceValues(): number[] {
		return this.currentDice.filter((d) => d.allowed && !d.used).map((d) => getDieValue(d));
	}

	/**
	 * Resets the active dice pool and roll animation states.
	 */
	clear() {
		this.currentDice = [];
		this.isAnimatingRoll = false;
	}

	/**
	 * Generates a randomized 3-dice pool mapped to standard chess pieces.
	 * Piece values are generated uppercase for White and lowercase for Black.
	 * @param activeColor The color active on the turn ('w' or 'b').
	 * @returns An array of 3 DieState objects.
	 */
	generateRandomDice(activeColor: 'w' | 'b'): DieState[] {
		const indexToPiece = ['p', 'n', 'b', 'r', 'q', 'k'];
		const rolled: DieState[] = [];
		for (let i = 0; i < 3; i++) {
			let val = indexToPiece[Math.floor(Math.random() * 6)];
			if (activeColor === 'w') {
				val = val.toUpperCase();
			}
			rolled.push({
				value: val,
				allowed: true,
				used: false,
			});
		}
		return rolled;
	}

	/**
	 * Marks a specific die as consumed by its pool index.
	 * @param dieIndex The index of the die in the currentDice array.
	 */
	markUsed(dieIndex: number) {
		if (this.currentDice[dieIndex]) {
			this.currentDice[dieIndex].used = true;
		}
	}

	/**
	 * Reverts the usage of a specific die, making it available again.
	 * @param dieIndex The index of the die in the currentDice array.
	 */
	revertUse(dieIndex: number) {
		if (this.currentDice[dieIndex]) {
			this.currentDice[dieIndex].used = false;
		}
	}
}
