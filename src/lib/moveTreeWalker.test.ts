import { describe, it, expect } from 'vitest';
import { walkMoveTree, type MoveTree } from './moveTreeWalker';

describe('walkMoveTree', () => {
	// Reproduction tree from issue #164 / engine #279:
	// Position: 8/8/8/2k5/8/1N6/2P5/K7 w - - 0 1, roll NPP.
	// Only turn starting with c2c4 is c2c4 b3c5.
	const REPRO_TREE: MoveTree = {
		c2c4: {
			b3c5: {},
		},
		c2c3: {
			c3c4: {
				b3c5: {},
			},
		},
	};

	it('offers only dest b3 -> c5 after c2c4 in the reproduction tree', () => {
		const result = walkMoveTree(REPRO_TREE, ['c2c4']);
		expect(result.node).toEqual({ b3c5: {} });
		expect(result.dests.get('b3')).toEqual(['c5']);
		expect(result.dests.size).toBe(1);
		expect(result.isComplete).toBe(false);
	});

	it('reports [c2c4, b3c5] as complete', () => {
		const result = walkMoveTree(REPRO_TREE, ['c2c4', 'b3c5']);
		expect(result.node).toEqual({});
		expect(result.dests.size).toBe(0);
		expect(result.isComplete).toBe(true);
	});

	it('reports a path outside the tree as left the tree (null node, not complete, empty dests)', () => {
		const result = walkMoveTree(REPRO_TREE, ['c2c4', 'b3d4']);
		expect(result.node).toBeNull();
		expect(result.dests.size).toBe(0);
		expect(result.isComplete).toBe(false);
		expect(result.getPromotions('b3', 'd4')).toEqual([]);
	});

	it('extracts promotion letters from 5-character children', () => {
		const promoTree: MoveTree = {
			e7e8q: {},
			e7e8r: {},
			e7e8b: {},
			e7e8n: {},
			d7d8q: {},
		};

		const result = walkMoveTree(promoTree, []);
		expect(result.dests.get('e7')).toEqual(['e8']);
		expect(result.dests.get('d7')).toEqual(['d8']);
		expect(result.getPromotions('e7', 'e8')).toEqual(['q', 'r', 'b', 'n']);
		expect(result.getPromotions('d7', 'd8')).toEqual(['q']);
		expect(result.getPromotions('e7', 'd8')).toEqual([]);
	});

	it('gives no dests and does not count as completed for an empty tree at root', () => {
		const emptyTree: MoveTree = {};
		const result = walkMoveTree(emptyTree, []);
		expect(result.node).toEqual({});
		expect(result.dests.size).toBe(0);
		expect(result.isComplete).toBe(false);
	});

	it('handles null and undefined tree gracefully', () => {
		const nullResult = walkMoveTree(null, []);
		expect(nullResult.node).toBeNull();
		expect(nullResult.dests.size).toBe(0);
		expect(nullResult.isComplete).toBe(false);

		const undefResult = walkMoveTree(undefined, ['e2e4']);
		expect(undefResult.node).toBeNull();
		expect(undefResult.dests.size).toBe(0);
		expect(undefResult.isComplete).toBe(false);
	});
});
