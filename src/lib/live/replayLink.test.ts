import { describe, expect, it } from 'vitest';

import { buildReplayUrl, hasReplay } from './replayLink';

describe('hasReplay', () => {
	it.each(['KingCaptured', 'Resign', 'Draw', 'Timeout'])(
		'offers a replay for a game that ended by %s',
		(termination) => {
			expect(hasReplay('over', termination)).toBe(true);
		},
	);

	// play-api's GameArchive.payload excludes aborted games, so the replay page could only ever
	// answer "history unavailable" for one.
	it('offers nothing for an aborted game — it was never archived', () => {
		expect(hasReplay('over', 'Aborted')).toBe(false);
	});

	it.each(['playing', 'connecting'])('offers nothing while the game is %s', (status) => {
		expect(hasReplay(status, null)).toBe(false);
	});

	it('offers nothing when the game is over but the client never saw how it ended', () => {
		expect(hasReplay('over', null)).toBe(false);
	});
});

describe('buildReplayUrl', () => {
	it('builds an absolute URL from the game id', () => {
		expect(buildReplayUrl('https://fortemate.com', 'game-1')).toBe(
			'https://fortemate.com/replay/game-1',
		);
	});

	it('handles an origin with a trailing slash', () => {
		expect(buildReplayUrl('https://fortemate.com/', 'game-1')).toBe(
			'https://fortemate.com/replay/game-1',
		);
	});

	// The board URL carries a seat token; a shared link must never do the same.
	it('carries no seat token or query string of any kind', () => {
		const url = new URL(buildReplayUrl('https://fortemate.com', 'game-1'));

		expect(url.search).toBe('');
		expect(url.pathname).toBe('/replay/game-1');
	});
});
