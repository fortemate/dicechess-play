/** Independent, explicit two-die acceptance positions. No production route can inject these. */
export const INITIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const pair = (value, left, right) => value.includes(left) && value.includes(right);
export const fixtures = [
	{
		name: 'equal-offers',
		dfen: INITIAL,
		match: (offers) =>
			JSON.stringify(offers[0]) === JSON.stringify(offers[1]) && pair(offers[0], 3, 4),
		selected: 1,
		moves: [],
	},
	{
		name: 'unplayable-over-playable',
		dfen: INITIAL,
		match: (offers) => pair(offers[0], 3, 4) && pair(offers[1], 1, 3),
		selected: 0,
		moves: [],
	},
	{
		name: 'both-unplayable',
		dfen: INITIAL,
		match: (offers) => pair(offers[0], 3, 4) && pair(offers[1], 5, 6),
		selected: 1,
		moves: [],
	},
	{
		name: 'maximum-consumption',
		dfen: INITIAL,
		match: (offers) => pair(offers[0], 1, 3) && pair(offers[1], 1, 4),
		selected: 0,
		moves: ['e2e3', 'f1c4'],
		partial: ['e2e3'],
		other: ['a2a4', 'a1a3'],
	},
	{
		name: 'castling',
		dfen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1',
		match: (offers) => pair(offers[0], 6, 4),
		selected: 0,
		moves: ['e1g1'],
		expectedBoard: '4k3/8/8/8/8/8/8/5RK1',
	},
	{
		name: 'promotion',
		dfen: '7k/P7/8/8/8/8/8/K7 w - - 0 1',
		match: (offers) => offers[0].every((die) => die === 1),
		selected: 0,
		moves: ['a7a8n'],
		expectedBoard: 'N6k/8/8/8/8/8/8/K7',
	},
	{
		name: 'king-capture',
		dfen: '3k4/2P5/8/8/8/8/8/K7 w - - 0 1',
		match: (offers) => pair(offers[0], 1, 2),
		selected: 0,
		moves: ['c7d8'],
		expectedBoard: '3P4/8/8/8/8/8/8/K7',
		win: 'White',
	},
];
