// Pure helper for the lobby's mini-board tiles: expand a FEN/DFEN board field into 64 cells.
// Rendering stays dependency-free (piece SVGs on a CSS grid) — a chessground instance per
// tile would be far heavier than these static, poll-refreshed previews need.

/** The 64 squares of a FEN (or DFEN) position, a1-h8 read as rows from rank 8 down: piece letters
 * (`K`..`p`) or null for empty squares. Malformed or missing input (a pre-dfen server) yields an
 * empty board rather than throwing — a lobby tile must never take the page down. */
export function boardGrid(fenOrDfen: string | undefined): (string | null)[] {
	const board = (fenOrDfen ?? '').trim().split(/\s+/)[0] ?? '';
	const ranks = board.split('/');
	if (ranks.length !== 8) return Array(64).fill(null);
	const cells: (string | null)[] = [];
	for (const rank of ranks) {
		const row: (string | null)[] = [];
		for (const ch of rank) {
			if (/[1-8]/.test(ch)) row.push(...Array<null>(Number(ch)).fill(null));
			else if (/[kqrbnp]/i.test(ch)) row.push(ch);
			else return Array(64).fill(null);
		}
		if (row.length !== 8) return Array(64).fill(null);
		cells.push(...row);
	}
	return cells;
}

/** The fullmove number (6th FEN field) — "move N" on a tile; 1 when absent/malformed. */
export function fullmoveOf(fenOrDfen: string | undefined): number {
	const n = Number((fenOrDfen ?? '').trim().split(/\s+/)[5]);
	return Number.isInteger(n) && n > 0 ? n : 1;
}
