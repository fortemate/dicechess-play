// src/lib/types.ts
import type { GameResult } from '../utils/formatters';
import type { DrawShape } from '@lichess-org/chessground/draw';

export type MoveHistoryState = {
	fen: string;
	active_color?: 'w' | 'b';
	bank: number;
	dices: { value: string; allowed: boolean; used: boolean }[];
	leftTime: { [playerId: string]: number };
	gameMoveHistoryMove: { from: string; to: string; promotion: string } | null;
	guessStatus?: 'correct' | 'incorrect';
};

export type GameSummary = {
	id: string;
	white_player: string;
	black_player: string;
	white_player_rating: number | null;
	black_player_rating: number | null;
	bet: number;
	game_type: string;
	time_limit: number | null;
	time_bonus: number | null;
	start_time: string | null;
	is_favorite?: boolean;
	has_moves?: boolean;
	metadata?: { source?: string; [key: string]: any };
};

export type GameMetadata = {
	allowDoubling?: boolean;
	color?: 'WHITE' | 'BLACK';
	historyOpponent?: {
		opponentId?: string;
		opponentName?: string;
	};
	whiteId?: string;
	blackId?: string;
	whiteRating?: number;
	blackRating?: number;
	timeLimit?: number;
	timeBonus?: number;
	startTime?: string;
	result?: GameResult | null;
	timeControl?: string;
	source?: string;
};

export type GameData = {
	white_player?: string;
	black_player?: string;
	white_player_rating?: number | null;
	black_player_rating?: number | null;
	bet?: number;
	time_limit?: number | null;
	time_bonus?: number | null;
	result?: GameResult | null;
	allow_doubling?: boolean;
	metadata?: GameMetadata;
	moves?: {
		gameMoveHistoryStateMap: { [key: string]: MoveHistoryState };
	};
};

export type TurnBlock = {
	turnNumber: number;
	whiteDice: { index: number; diceChars: string[] } | null;
	blackDice: { index: number; diceChars: string[] } | null;
	whiteMoves: { index: number; text: string; pieceIcon: string; pieceChar: string | null }[];
	blackMoves: { index: number; text: string; pieceIcon: string; pieceChar: string | null }[];
	events: { index: number; text: string }[];
};

export type BookmarkedPosition = {
	id: string;
	user_id: number;
	game_id: string;
	ply: number;
	fen: string;
	dice_roll: string;
	played_moves: string;
	notes: string | null;
	created_at: string;
};

export type AdminUser = {
	id: number;
	email: string;
	name: string | null;
	picture_url: string | null;
	role: string;
	is_approved: boolean;
	is_active: boolean;
	balance?: number;
	created_at: string | null;
	last_login_at: string | null;
	solved_puzzles_count?: number;
	attempted_puzzles_count?: number;
	training_attempts_count?: number;
};

export interface TransactionResponse {
	id: number;
	user_id: number;
	amount: number;
	balance_after: number;
	type: string;
	description: string | null;
	game_id: string | null;
	created_at: string;
	updated_at: string;
}

export interface PaginatedTransactionsResponse {
	items: TransactionResponse[];
	total: number;
	limit: number;
	offset: number;
}

export type SyncGamesBatchResponse = {
	requested: number;
	fetched_from_api: number;
	inserted: number;
	skipped_existing: number;
	errors: string[];
};

export type SyncGameMovesBatchResponse = {
	requested: number;
	fetched_candidates: number;
	updated: number;
	skipped_not_found: number;
	errors: string[];
};

export type MissingMovesCountResponse = {
	missing_moves_count: number;
};

export type TrainingLogCreate = {
	timestamp: string;
	game_id: string;
	move_number: number;
	color_played: 'w' | 'b';
	dice_roll: string;
	time_spent_ms: number;
	fen_before: string;
	user_guess: string;
	actual_move: string;
	actual_moves_count: number;
	guessed_moves_count: number;
	is_perfect: boolean;
	fen_after_guess: string | null;
	fen_after_actual: string;
};

export type TrainingPuzzleCreate = {
	game_id: string | null;
	ply: number;
	normalized_initial_fen: string;
	dice: string;
	solution_moves: string;
	normalized_final_fen: string;
	annotations?: DrawShape[];
};

export type TrainingPuzzle = TrainingPuzzleCreate & {
	id: string;
	user_id: number;
	success_count: number;
	failure_count: number;
	notes: string | null;
	is_active: boolean;
	last_attempted_at: string | null;
	created_at: string;
	game_white_player?: string | null;
	game_black_player?: string | null;
	game_bet?: number | null;
	game_time_limit?: number | null;
	game_time_bonus?: number | null;
};

export type PaginatedTrainingPuzzlesResponse = {
	items: TrainingPuzzle[];
	total: number;
	limit: number;
	offset: number;
};

export type PublicTrainingPuzzle = {
	id: string;
	game_id: string | null;
	ply: number;
	normalized_initial_fen: string;
	dice: string;
	solution_moves: string;
	normalized_final_fen: string;
	annotations?: DrawShape[];
};

export type TrainingProgressPeriod = 'today' | '7d' | '30d' | 'all';

export type TrainingProgressBucket = {
	attempts: number;
	correct_attempts: number;
	accuracy_percent: number;
	avg_time_spent_ms: number;
};

export type TrainingProgressResponse = {
	period: TrainingProgressPeriod;
	trainer: TrainingProgressBucket;
	positions: TrainingProgressBucket;
};

export type Job = {
	id: string;
	job_type: 'SYNC_METADATA' | 'SYNC_MOVES';
	status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
	progress: number;
	parameters: Record<string, any> | null;
	error: string | null;
	result: Record<string, any> | null;
	created_at: string;
	updated_at: string;
};
