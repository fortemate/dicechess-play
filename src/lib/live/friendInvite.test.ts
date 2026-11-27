import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { forgetFriendInvite, recallFriendInvite, rememberFriendInvite } from './friendInvite';

// The link to send for a game by link travels from the setup page to the board through session
// storage (#256). Two properties matter: it is only ever given back for the game it belongs to,
// and storage that misbehaves means "no link", never an error on a page that has a game running.

const LINK = 'https://play.test/live/game-1?seat=friend-token&as=black';

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('friendInvite', () => {
	it('gives the link back for the game it was kept for', () => {
		rememberFriendInvite('game-1', LINK);
		expect(recallFriendInvite('game-1')).toBe(LINK);
	});

	it('gives nothing for another game', () => {
		rememberFriendInvite('game-1', LINK);
		expect(recallFriendInvite('game-2')).toBeNull();
	});

	it('keeps one link: a newer game replaces the older', () => {
		rememberFriendInvite('game-1', LINK);
		rememberFriendInvite('game-2', 'https://play.test/live/game-2?seat=other&as=white');
		expect(recallFriendInvite('game-1')).toBeNull();
		expect(recallFriendInvite('game-2')).toContain('game-2');
	});

	it('forgets the link of its own game only', () => {
		rememberFriendInvite('game-1', LINK);
		forgetFriendInvite('game-2');
		expect(recallFriendInvite('game-1')).toBe(LINK);
		forgetFriendInvite('game-1');
		expect(recallFriendInvite('game-1')).toBeNull();
	});

	it.each(['not json', '42', 'null', '[]', '{"gameId":"game-1"}', '{"gameId":1,"url":2}'])(
		'reads a stored value it does not understand (%s) as no link',
		(raw) => {
			sessionStorage.setItem('dicechess-play-friend-invite', raw);
			expect(recallFriendInvite('game-1')).toBeNull();
		},
	);

	it('means "no link", not an error, when storage is unavailable', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('denied');
		});
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('denied');
		});
		expect(() => rememberFriendInvite('game-1', LINK)).not.toThrow();
		expect(recallFriendInvite('game-1')).toBeNull();
		expect(() => forgetFriendInvite('game-1')).not.toThrow();
	});
});
