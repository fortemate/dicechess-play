import type { Key } from '@lichess-org/chessground/types';

interface MoveEntry {
	gameMoveHistoryMove: { from: string; to: string; promotion: string } | null;
}

/** [from, to] for chessground's lastMove highlight; undefined for a roll/pass entry (no move) or a missing one. */
export function lastMoveKeys(entry: MoveEntry | undefined): Key[] | undefined {
	const move = entry?.gameMoveHistoryMove;
	if (!move?.from || !move.to) return undefined;
	return [move.from as Key, move.to as Key];
}
