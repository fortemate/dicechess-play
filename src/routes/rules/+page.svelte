<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	// The rules of the Dice Chess dialect this site plays (#254). Every rule stated here is
	// verified against the engine's actual behavior (dicechess-engine-scala) and play-api's
	// server rules — when in doubt, the engine is the source of truth, not other sites' docs.
	import { m } from '$lib/paraglide/messages.js';
	import { resolve } from '$app/paths';
	import { CANONICAL_ORIGIN, SITE_ORIGIN } from '$lib/rules/seo';

	const sections = [
		{ id: 'glance', title: 'The game at a glance' },
		{ id: 'dice', title: 'The three dice' },
		{ id: 'turns', title: 'Your turn: play as many dice as you can' },
		{ id: 'winning', title: 'Winning the game' },
		{ id: 'no-check', title: 'No check, no checkmate' },
		{ id: 'special-moves', title: 'Castling, promotion, en passant' },
		{ id: 'draws', title: 'Draws' },
		{ id: 'time', title: 'Time controls' },
		{ id: 'fair-dice', title: 'Provably fair dice' },
		{ id: 'dialects', title: 'How other sites differ' },
	] as const;
</script>

<svelte:head>
	<title>Dice Chess Rules — How to Play | Dice Chess Play</title>
	<meta
		name="description"
		content="The complete rules of Dice Chess: what the three dice mean, the maximum-dice rule, castling, promotion, en passant, draws, time controls, and provably fair dice."
	/>
	<link rel="canonical" href="{CANONICAL_ORIGIN}/rules" />
	<link rel="alternate" hreflang="en" href="{CANONICAL_ORIGIN}/rules" />
	<link rel="alternate" hreflang="x-default" href="{CANONICAL_ORIGIN}/rules" />
	<meta property="og:type" content="article" />
	<meta property="og:site_name" content="Dice Chess — Play" />
	<meta property="og:title" content="Dice Chess Rules — How to Play" />
	<meta
		property="og:description"
		content="Roll three dice, make up to three moves, capture the king. The complete rules of Dice Chess, as enforced by our open-source engine."
	/>
	<meta property="og:url" content="{SITE_ORIGIN}/rules" />
	<meta property="og:image" content="{SITE_ORIGIN}/social-preview-1200x630.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Fortemate" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<article class="mx-auto flex w-full max-w-3xl flex-col gap-10">
	<header class="flex flex-col gap-4">
		<h1 class="text-3xl font-bold text-content sm:text-4xl">{m.rules_heading()}</h1>
		<p class="leading-relaxed text-content-muted">
			Dice Chess is chess with the fog of luck rolled in: three dice decide which pieces you may
			move, and the game ends the moment a king is captured. You keep all of your chess instincts —
			and learn where they betray you. A game takes minutes, and you can
			<a class="font-semibold text-primary hover:underline" href={resolve('/play')}>
				play one right now, free, no sign-up</a
			>.
		</p>
		<nav aria-label="Table of contents" class="rounded-2xl border border-border bg-surface/40 p-4">
			<ul class="flex flex-col gap-1.5 text-sm sm:grid sm:grid-cols-2">
				{#each sections as s (s.id)}
					<li>
						<a class="text-content-muted transition-colors hover:text-content" href="#{s.id}">
							{s.title}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</header>

	<section id="glance" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">The game at a glance</h2>
		<ul class="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-content-muted">
			<li>
				The board, the pieces, and the starting position are standard chess. White moves first.
			</li>
			<li>
				Each turn starts with a roll of <b class="text-content">three dice</b>. Each die shows a
				piece type: pawn, knight, bishop, rook, queen, or king.
			</li>
			<li>
				You make <b class="text-content">up to three moves</b> in one turn. Each move is paid for with
				one die showing the type of the piece you move.
			</li>
			<li>
				You win by <b class="text-content">capturing the king</b>. There is no check and no
				checkmate — the king is a piece you take, like any other.
			</li>
		</ul>
	</section>

	<section id="dice" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">The three dice</h2>
		<p class="leading-relaxed text-content-muted">
			The dice are rolled fresh at the start of every turn, before you move. A die showing
			<i>knight</i> lets you move <em>a</em> knight — any one of yours. Doubles and triples are
			real: two <i>pawn</i> dice mean two pawn moves, by two different pawns or by the same pawn twice.
			Each die pays for exactly one move and is then spent for the rest of the turn.
		</p>
		<p class="leading-relaxed text-content-muted">
			One exception spends two dice at once: castling needs both a <i>king</i> die and a
			<i>rook</i> die (see <a class="text-primary hover:underline" href="#special-moves">below</a>).
		</p>
	</section>

	<section id="turns" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">
			Your turn: play as many dice as you can
		</h2>
		<p class="leading-relaxed text-content-muted">
			The defining rule of this dialect: <b class="text-content">
				you must spend as many dice as the position allows</b
			>. You may not stop early and you may not skip a die you could legally use. If some sequence
			of moves uses all three dice, every legal turn uses all three; if at most two can be used,
			every legal turn uses two — and so on.
		</p>
		<p class="leading-relaxed text-content-muted">
			This has teeth. Suppose the game just started and you roll <i>pawn, knight, bishop</i>.
			Playing a7–a6-style rook-pawn moves is illegal here: they don't open a diagonal, your bishop
			stays locked in, and the turn would waste a die. Only pawn moves that free the bishop (or move
			orders that still spend all three dice) are legal. Plan the whole turn before touching a
			piece.
		</p>
		<ul class="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-content-muted">
			<li>
				<b class="text-content">Capturing the king overrides everything.</b> A move that takes the king
				is always legal — even if it leaves dice unused — and ends the game on the spot.
			</li>
			<li>
				<b class="text-content">No legal move at all? You pass.</b> If the roll gives you nothing —
				say, <i>bishop, rook, queen</i> on the very first turn, when none of those pieces can move — the
				turn is passed automatically. It happens instantly and costs you no clock time.
			</li>
			<li>
				The count is in <b class="text-content">dice, not moves</b>: castling spends two dice with a
				single move, and counts toward the maximum accordingly.
			</li>
		</ul>
	</section>

	<section id="winning" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">Winning the game</h2>
		<p class="leading-relaxed text-content-muted">You win when any of these happens:</p>
		<ul class="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-content-muted">
			<li>
				<b class="text-content">You capture the king.</b> Attacking it is not enough — you need a die
				for the attacking piece on the turn you take it.
			</li>
			<li>
				<b class="text-content">Your opponent resigns.</b> Resigning is allowed at any moment.
			</li>
			<li>
				<b class="text-content">Your opponent runs out of time</b> (see
				<a class="text-primary hover:underline" href="#time">time controls</a>).
			</li>
		</ul>
	</section>

	<section id="no-check" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">No check, no checkmate</h2>
		<p class="leading-relaxed text-content-muted">
			If you come from chess, this is the part to unlearn. Because the game ends by capturing the
			king, the entire concept of check does not exist:
		</p>
		<ul class="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-content-muted">
			<li>Your king may move to an attacked square, and may be left under attack.</li>
			<li>“Pinned” pieces don't exist — any piece may move regardless of what it exposes.</li>
			<li>Castling out of, through, or into an attacked square is perfectly legal.</li>
			<li>
				There is no stalemate: a player with no legal moves simply passes, and the game goes on.
			</li>
		</ul>
		<p class="leading-relaxed text-content-muted">
			An attacked king is in danger, not in a rules-defined state. Whether the attacker can actually
			cash in depends on the next roll — that tension is the heart of the game.
		</p>
	</section>

	<section id="special-moves" class="flex flex-col gap-5">
		<h2 class="text-xl font-bold text-content sm:text-2xl">Castling, promotion, en passant</h2>
		<div class="flex flex-col gap-2">
			<h3 class="font-bold text-content">Castling</h3>
			<p class="leading-relaxed text-content-muted">
				Castling requires <b class="text-content">both a <i>king</i> die and a <i>rook</i> die</b>
				in the same roll, and spends both. It counts as a single move, so a castling turn can still include
				one more move with the third die. The usual chess conditions apply — the king and that rook haven't
				moved, the squares between them are empty — but attacked squares don't matter at all. Games start
				from the standard position only (no Chess960 here).
			</p>
		</div>
		<div class="flex flex-col gap-2">
			<h3 class="font-bold text-content">Promotion</h3>
			<p class="leading-relaxed text-content-muted">
				Moving a pawn to the last rank uses a <i>pawn</i> die, and promotion is mandatory: choose a queen,
				rook, bishop, or knight (never a king). Watch out — the maximum-dice rule can choose for you:
				if only one promotion piece lets you spend your remaining dice, that piece is the only legal promotion.
				And if the last-rank square holds the enemy king, the pawn simply captures it and wins — no promotion
				happens.
			</p>
		</div>
		<div class="flex flex-col gap-2">
			<h3 class="font-bold text-content">En passant</h3>
			<p class="leading-relaxed text-content-muted">
				As in chess, a pawn that advances two squares may be captured en passant by an enemy pawn,
				using a <i>pawn</i> die. The right lasts for the
				<b class="text-content"> whole of the opponent's next turn</b> — any of their up-to-three moves
				may take en passant, not only the first. Since one turn can push several pawns two squares, several
				en-passant captures can be available at once.
			</p>
		</div>
	</section>

	<section id="draws" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">Draws</h2>
		<div class="flex flex-col gap-2">
			<h3 class="font-bold text-content">Draw by agreement</h3>
			<p class="leading-relaxed text-content-muted">
				You offer a draw together with your completed turn — the offer travels with your moves. Your
				opponent must answer it <b class="text-content">before their dice are revealed</b>: accept,
				and the game ends right there; decline, and only then are their dice rolled. The responder's
				clock runs while they decide, and an ignored offer is simply a flag risk — there is no way
				to see the roll first. After your offer is declined, you may not offer again until your
				opponent has made an offer of their own.
			</p>
		</div>
		<div class="flex flex-col gap-2">
			<h3 class="font-bold text-content">Automatic draws</h3>
			<p class="leading-relaxed text-content-muted">
				A game is drawn automatically after <b class="text-content">
					100 consecutive single moves with no capture and no pawn move</b
				> — the Dice Chess analogue of chess's 50-move rule, counted in individual moves (of which each
				turn has up to three), so it arrives sooner than a chess player might expect. An extreme game-length
				safety cap also exists, far beyond any real game.
			</p>
			<p class="leading-relaxed text-content-muted">
				There is <b class="text-content">no draw by repetition</b> and
				<b class="text-content"> no insufficient-material rule</b> — a lone king can still win on time.
			</p>
		</div>
	</section>

	<section id="time" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">Time controls</h2>
		<ul class="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-content-muted">
			<li>
				Live games are played with a clock. The lobby offers blitz (3+2, 5+3, 5+5, 5&nbsp;min) and
				rapid (10+5, 10+10, 15+10, 10&nbsp;min) controls.
			</li>
			<li>
				The increment is added <b class="text-content">once per completed turn</b>, not per move
				within it.
			</li>
			<li>Forced passes are instant and free — a passed turn costs no time.</li>
			<li>Thinking about a draw offer runs your clock, like any other decision.</li>
			<li>
				<b class="text-content">A fallen flag is always a loss.</b> There is no insufficient-material
				exception: if your time runs out against a lone king, you lose.
			</li>
			<li>
				If you disconnect, you have a grace period of about 30 seconds to come back; after that the
				game is forfeited.
			</li>
		</ul>
	</section>

	<section id="fair-dice" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">Provably fair dice</h2>
		<p class="leading-relaxed text-content-muted">
			You never have to trust our dice — you can check them. Before a game starts, the server
			publishes a cryptographic commitment (a SHA-256 hash) to a secret seed. Both players then
			contribute random seeds of their own. Every roll of the game is derived deterministically from
			those seeds and the turn number — the dice are fixed before the first move and cannot depend
			on the position, your moves, or who is winning. The moment the game ends, the server reveals
			its seed, and anyone can recompute every roll and verify it matches the commitment published
			up front.
		</p>
		<p class="leading-relaxed text-content-muted">
			The replay page of every finished live game shows the commitment, the revealed seed, and both
			players' seeds, ready to copy. The full verification procedure, with runnable code, is in
			<a
				class="text-primary hover:underline"
				href="https://bots.fortemate.com/provably-fair/"
				rel="external"
			>
				our provably-fair documentation</a
			>.
		</p>
	</section>

	<section id="dialects" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">How other sites differ</h2>
		<p class="leading-relaxed text-content-muted">
			Dice Chess is played on a handful of sites, and the rules differ in places — mostly around
			what's layered on top of the moves, rather than the moves themselves. This page documents the
			dialect our open-source
			<a
				class="text-primary hover:underline"
				href="https://github.com/fortemate/dicechess-engine"
				rel="external"
			>
				engine</a
			> enforces; here is how the sites we've studied compare.
		</p>
		<ul class="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-content-muted">
			<li>
				<b class="text-content">dicechess.com</b> — the core movement rules match this dialect, including
				the maximum-dice rule and the two-dice castling; we verified this by replaying tens of thousands
				of its publicly played games through our engine, move for move. On top of the moves it adds a
				backgammon-style doubling cube and pot-based stakes, so a game there can also end by declining
				a double.
			</li>
			<li>
				<b class="text-content">beturanga.com</b> — the games in our sample, classic and Fischer-random
				alike, replay cleanly under this dialect's movement rules as well. It additionally offers Chess960
				(Fischer-random) starting positions, which this site does not, and runs real-money-style betting
				formats.
			</li>
			<li>
				<b class="text-content">This site</b> — the reference dialect described above, with no stakes
				and no cube: classic starting position, both-dice castling, mandatory maximum, en passant alive
				for the whole reply turn, provably fair rolls.
			</li>
		</ul>
		<p class="leading-relaxed text-content-muted">
			Found a rules difference we haven't documented — here or elsewhere? Please
			<a
				class="text-primary hover:underline"
				href="https://github.com/fortemate/dicechess-play/issues"
				rel="external"
			>
				open an issue</a
			> — documenting the dialects accurately is part of this project's mission.
		</p>
	</section>

	<section
		class="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface/40 p-6 text-center"
	>
		<h2 class="text-xl font-bold text-content">Ready to roll?</h2>
		<p class="max-w-xl leading-relaxed text-content-muted">
			The fastest way to learn is to play a game — it takes minutes, and the site will only ever let
			you make legal moves.
		</p>
		<div class="flex flex-wrap items-center justify-center gap-3">
			<a
				href={resolve('/play')}
				class="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-content transition-colors hover:bg-primary-hover"
			>
				Play now
			</a>
			<a
				href={resolve('/lobby')}
				class="rounded-xl border border-border px-5 py-2.5 text-sm font-bold text-content-muted transition-colors hover:border-primary hover:text-content"
			>
				Play a human
			</a>
		</div>
	</section>
</article>
