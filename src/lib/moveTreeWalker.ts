import type { Key } from '@lichess-org/chessground/types';
import { deriveChessgroundDests } from '../utils/fenUtils';

/**
 * Prefix tree of UCI micro-moves for a complete turn.
 * A node with no children (`{}`) is a complete legal turn.
 */
export interface MoveTree {
	[uci: string]: MoveTree;
}

export interface WalkResult {
	/**
	 * The subtree node at the end of `movesPlayed`, or `null` if the path
	 * left the tree (an invalid move was played) or no tree was provided.
	 */
	node: MoveTree | null;
	/**
	 * Chessground dests (source square -> target squares) for legal continuations.
	 */
	dests: Map<Key, Key[]>;
	/**
	 * True if at least one move was played and the current node has no children.
	 */
	isComplete: boolean;
	/**
	 * Returns lowercase promotion letters (e.g. ['q', 'r', 'b', 'n']) for a given orig + dest.
	 */
	getPromotions: (orig: string, dest: string) => string[];
}

/**
 * Walks a MoveTree following the UCI micro-moves played so far in the turn.
 *
 * @param tree The MoveTree root for the rolled position, or null/undefined.
 * @param movesPlayed Array of UCI micro-moves played so far in this turn.
 */
export function walkMoveTree(
	tree: MoveTree | null | undefined,
	movesPlayed: readonly string[] = [],
): WalkResult {
	const emptyDests = new Map<Key, Key[]>();
	const emptyPromotions = () => [];

	if (!tree) {
		return {
			node: null,
			dests: emptyDests,
			isComplete: false,
			getPromotions: emptyPromotions,
		};
	}

	let current: MoveTree | null = tree;

	for (const move of movesPlayed) {
		if (!current) break;
		const next: MoveTree | undefined = current[move] ?? current[move.toLowerCase()];
		if (next === undefined) {
			current = null;
			break;
		}
		current = next;
	}

	if (!current) {
		return {
			node: null,
			dests: emptyDests,
			isComplete: false,
			getPromotions: emptyPromotions,
		};
	}

	const keys = Object.keys(current);
	const dests = deriveChessgroundDests(keys);
	const isComplete = movesPlayed.length > 0 && keys.length === 0;

	const getPromotions = (orig: string, dest: string): string[] => {
		const prefix = orig + dest;
		const promos: string[] = [];
		for (const key of keys) {
			if (key.startsWith(prefix) && key.length === 5) {
				const promo = key[4].toLowerCase();
				if (!promos.includes(promo)) {
					promos.push(promo);
				}
			}
		}
		const preferredOrder = ['q', 'r', 'b', 'n'];
		return promos.sort((a, b) => {
			const ia = preferredOrder.indexOf(a);
			const ib = preferredOrder.indexOf(b);
			return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
		});
	};

	return {
		node: current,
		dests,
		isComplete,
		getPromotions,
	};
}
