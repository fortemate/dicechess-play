import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

export interface DbConfig {
	containerName?: string;
	user?: string;
	db?: string;
}

export class DbAssertions {
	private readonly containerName: string;
	private readonly user: string;
	private readonly db: string;

	constructor(config?: DbConfig) {
		this.containerName = config?.containerName || 'dicechess-acceptance-postgres';
		this.user = config?.user || 'play';
		this.db = config?.db || 'test';
	}

	execSql(sql: string): string {
		const escaped = sql.replace(/"/g, '\\"');
		const cmd = `docker exec ${this.containerName} psql -U ${this.user} -d ${this.db} -t -A -c "${escaped}"`;
		return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	}

	execSqlJson<T = any>(sql: string): T {
		const jsonSql = `SELECT COALESCE(json_agg(t), '[]'::json) FROM (${sql}) t;`;
		const raw = this.execSql(jsonSql);
		try {
			return JSON.parse(raw);
		} catch (err) {
			throw new Error(`Failed to parse psql JSON output for SQL: ${sql}\nRaw: ${raw}\nError: ${String(err)}`);
		}
	}

	seedFeaturedBot(
		team: string = 'rpi3',
		name: string = 'hunter-book',
		token: string = 'test-hunter-token',
		maxConcurrent: number = 3,
		webhookUrl: string = 'http://127.0.0.1:8089/webhook',
		webhookSecret: string = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
	): void {
		const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
		const botSql = `
			INSERT INTO bots (team, name, token_hash, max_concurrent_games, open_to_humans)
			VALUES ('${team}', '${name}', '${tokenHash}', ${maxConcurrent}, true)
			ON CONFLICT (team, name) DO UPDATE SET max_concurrent_games = ${maxConcurrent}, open_to_humans = true;
		`;
		this.execSql(botSql);

		const hookSql = `
			INSERT INTO bot_webhooks (team, name, url, secret, verified_at)
			VALUES ('${team}', '${name}', '${webhookUrl}', '${webhookSecret}', now())
			ON CONFLICT (team, name) DO UPDATE SET
				url = '${webhookUrl}',
				secret = '${webhookSecret}',
				verified_at = now(),
				last_failure_at = NULL,
				last_failure_reason = NULL;
		`;
		this.execSql(hookSql);
	}

	getShowcaseTable(): {
		id: number;
		next_human_color: string;
		current_game_id: string | null;
		updated_at: string;
	} {
		const rows = this.execSqlJson<any[]>(
			'SELECT id, next_human_color, current_game_id, updated_at FROM showcase_table WHERE id = 1',
		);
		return rows[0] || null;
	}

	getShowcaseClaims(actorId?: string): Array<{
		actor_id: string;
		idempotency_key: string;
		outcome: string;
		game_id: string | null;
		human_color: string | null;
		created_at: string;
		expires_at: string;
	}> {
		const filter = actorId ? `WHERE actor_id = '${actorId}'` : '';
		return this.execSqlJson(
			`SELECT actor_id, idempotency_key, outcome, game_id, human_color, created_at, expires_at FROM showcase_claims ${filter} ORDER BY created_at DESC`,
		);
	}

	getShowcaseGames(): Array<{
		id: string;
		status: string;
		origin: string;
		rated: boolean;
		ladder: boolean;
		created_at: string;
		snapshot: any;
	}> {
		return this.execSqlJson(
			`SELECT id, status, origin, (snapshot->>'rated')::boolean as rated, (snapshot->>'ladder')::boolean as ladder, created_at, snapshot FROM games WHERE origin = 'showcase' ORDER BY created_at DESC`,
		);
	}

	getShowcaseArchives(): Array<{
		game_id: string;
		origin: string;
		sporting_eligible: boolean;
		finished_at: string;
		payload: any;
	}> {
		return this.execSqlJson(
			`SELECT game_id, origin, sporting_eligible, finished_at, payload FROM game_archive WHERE origin = 'showcase' ORDER BY finished_at DESC`,
		);
	}

	getActiveGamesCount(): number {
		const raw = this.execSql("SELECT count(*) FROM games WHERE status = 'active';");
		return parseInt(raw, 10) || 0;
	}

	getAllGames(): Array<{
		id: string;
		origin: string;
		status: string;
		created_at: string;
	}> {
		return this.execSqlJson(
			`SELECT id, origin, status, created_at FROM games ORDER BY created_at DESC`,
		);
	}
}
