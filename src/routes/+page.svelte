<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>Dice Chess for Fire TV — The Living Room Chess Game</title>
	<meta
		name="description"
		content="Dice Chess for Amazon Fire TV: family chess with a roll of the dice, built for the living room. Share one remote, or take on three computer opponents with voice acting. Available now on the Amazon Appstore."
	/>
	<meta property="og:title" content="Dice Chess for Fire TV — The Living Room Chess Game" />
	<meta
		property="og:description"
		content="Family chess with a roll of the dice, built for Fire TV. Share one remote, or challenge three computer opponents. Available now on the Amazon Appstore."
	/>
	<meta property="og:image" content="https://fortemate.com/social-preview-1200x630.png" />
</svelte:head>

<div class="flex flex-col gap-16 sm:gap-24 pb-12">
	<!-- Hero Section -->
	<section class="relative pt-4 sm:pt-10 text-center flex flex-col items-center">
		<!-- Store Badge Pill -->
		<div
			class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border bg-surface/90 shadow-sm text-xs font-semibold text-content mb-6"
		>
			<span class="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
			<span>Live on Amazon Appstore · Fire TV &amp; Vega OS</span>
			<span class="text-content-muted">|</span>
			<a
				href="https://www.amazon.com/dp/B0HL6K9N47/"
				target="_blank"
				rel="noopener noreferrer"
				class="text-primary hover:underline font-bold inline-flex items-center gap-1"
			>
				v1.0.4 Released
				<svg
					class="h-3 w-3"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
				>
					<path d="M5 12h14M12 5l7 7-7 7" />
				</svg>
			</a>
		</div>

		<!-- Title & Subtitle -->
		<h1
			class="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-content max-w-4xl leading-[1.1] mb-6"
		>
			Family chess with a roll of the dice, <span class="text-primary">built for TV</span>
		</h1>
		<p class="text-lg sm:text-xl text-content-muted max-w-2xl leading-relaxed mb-8">
			Three dice decide which pieces can move each turn. Luck levels the playing field so kids,
			parents, and grandmasters can share a game on the couch with a single remote.
		</p>

		<!-- CTAs -->
		<div class="flex flex-wrap items-center justify-center gap-4 mb-12">
			<!-- Amazon Appstore Button -->
			<a
				href="https://www.amazon.com/dp/B0HL6K9N47/"
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-3.5 px-7 py-4 rounded-xl bg-primary text-primary-content hover:bg-primary-hover font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
			>
				<!-- Amazon Smile Icon -->
				<svg class="h-6 w-6 fill-current" viewBox="0 0 24 24">
					<path
						d="M13.9 14.6c-2.4 1.8-6 .9-8.3-.4-.3-.2-.6.1-.4.4 1.5 2.2 4.6 3.5 7.4 2.8 1.8-.4 3.4-1.6 4.3-3.1.2-.4-.1-.7-.5-.5-.8.5-1.6.7-2.5.8zm7.1 2.2c-.2-.3-.5-.4-.7-.2-1.3 1-2.9 1.6-4.6 1.8-.4 0-.5.4-.1.6 1.5.8 3.3.7 4.8-.3.3-.2.4-.6.2-.9zM19.7 13c-.3-.4-1.9-.2-2.7 0-.3.1-.3.3 0 .4.9.4 2.4.4 2.8.1.3-.2.3-.4-.1-.5zm-6-8.9c-3.7 0-6.7 2.4-6.7 6.3 0 2.2 1.1 4 2.8 4.9.3.2.6 0 .6-.3v-.8c0-.3-.2-.5-.4-.6-1.1-.7-1.8-1.9-1.8-3.3 0-2.8 2.3-4.8 5.4-4.8 3 0 5 1.8 5 4.5 0 2.1-1.3 3.6-3.2 3.6-1 0-1.8-.6-1.8-1.7V7.6c0-.4-.3-.6-.6-.6h-1.2c-.3 0-.6.3-.6.6v.3c-.6-.7-1.4-1-2.4-1-2.2 0-3.9 1.8-3.9 4.3 0 2.6 1.7 4.4 4 4.4 1.1 0 2-.4 2.6-1.2v.7c0 .4.3.7.7.7h1.2c.4 0 .7-.3.7-.7v-4.8c0-1.7 1.1-2.8 2.5-2.8 1.4 0 2.2 1 2.2 2.7 0 2.7-1.7 4.7-4.4 4.7-.5 0-1-.1-1.4-.3-.3-.1-.6.1-.6.4v.7c0 .3.2.5.5.6.5.2 1.1.3 1.7.3 3.5 0 5.8-2.6 5.8-6.1.1-4-3-6.5-6.8-6.5zm-3.6 8.3c-1.3 0-2.2-1.1-2.2-2.5 0-1.5.9-2.5 2.2-2.5 1.2 0 2.1 1.1 2.1 2.5 0 1.5-.9 2.5-2.1 2.5z"
					/>
				</svg>
				<div class="flex flex-col text-left leading-none">
					<span class="text-[11px] uppercase tracking-wider opacity-90">Available on</span>
					<span class="text-base font-extrabold">Amazon Appstore</span>
				</div>
			</a>

			<!-- Web Version Quick Link Button -->
			<a
				href={resolve('/play')}
				class="inline-flex items-center gap-2.5 px-6 py-4 rounded-xl border border-border bg-surface hover:bg-surface-hover text-content font-bold shadow-sm transition-colors"
			>
				<span>Play Web Beta</span>
				<span
					class="text-xs px-2 py-0.5 rounded-md bg-surface-hover border border-border text-content-muted"
				>
					Browser
				</span>
				<span>→</span>
			</a>
		</div>

		<!-- TV Screen Frame Mockup -->
		<div class="w-full max-w-5xl px-2 sm:px-4">
			<div
				class="relative rounded-2xl sm:rounded-3xl border border-border/80 bg-surface/60 p-2 sm:p-4 shadow-2xl backdrop-blur-sm overflow-hidden group"
			>
				<!-- Subtle Ambient Glow -->
				<div
					class="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none"
				></div>

				<!-- TV Bezel Visual -->
				<div
					class="relative rounded-xl sm:rounded-2xl overflow-hidden border border-border bg-black shadow-inner"
				>
					<img
						src="/tv/demo.png"
						alt="Dice Chess on Fire TV gameplay screen: board with pieces, three active dice and bot opponent"
						class="w-full h-auto object-cover"
						width="1280"
						height="720"
						loading="eager"
					/>
				</div>

				<!-- TV Stand base hint -->
				<div
					class="mt-2 text-center text-xs text-content-muted font-medium flex items-center justify-center gap-4"
				>
					<span>🎮 1 Remote Hotseat</span>
					<span>•</span>
					<span>🎙️ Voiced Lessons &amp; Bots</span>
					<span>•</span>
					<span>🔒 100% Offline &amp; Private</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Feature Grid: Built for the Living Room -->
	<section class="flex flex-col gap-8">
		<div class="text-center max-w-2xl mx-auto">
			<h2 class="text-2xl sm:text-4xl font-extrabold text-content tracking-tight mb-3">
				Built from scratch for the living room
			</h2>
			<p class="text-content-muted text-base sm:text-lg">
				Traditional chess can be intimidating. Dice Chess removes memorized opening theory and makes
				every match a fresh, exciting duel.
			</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
			<!-- Card 1 -->
			<div class="flex flex-col gap-3 p-6 rounded-2xl border border-border bg-surface/70 shadow-sm">
				<div
					class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-1"
				>
					<svg
						class="h-6 w-6"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<rect x="3" y="3" width="18" height="18" rx="2" />
						<circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
						<circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" />
						<circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" />
						<circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" />
					</svg>
				</div>
				<h3 class="text-xl font-bold text-content">Luck Meets Tactics</h3>
				<p class="text-content-muted text-sm leading-relaxed">
					Three dice roll on every turn to reveal which piece types may move. Even a beginner with a
					lucky roll can deliver a surprise attack against a club player.
				</p>
			</div>

			<!-- Card 2 -->
			<div class="flex flex-col gap-3 p-6 rounded-2xl border border-border bg-surface/70 shadow-sm">
				<div
					class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-1"
				>
					<svg
						class="h-6 w-6"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<rect x="7" y="2" width="10" height="20" rx="3" />
						<circle cx="12" cy="7" r="2" />
						<circle cx="12" cy="16" r="1" />
					</svg>
				</div>
				<h3 class="text-xl font-bold text-content">Pass-the-Remote Hot Seat</h3>
				<p class="text-content-muted text-sm leading-relaxed">
					Grab the remote, take your turn, and pass it to your friend on the couch. The board
					automatically spins to face whoever has the move so neither player reads upside-down.
				</p>
			</div>

			<!-- Card 3 -->
			<div class="flex flex-col gap-3 p-6 rounded-2xl border border-border bg-surface/70 shadow-sm">
				<div
					class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-1"
				>
					<svg
						class="h-6 w-6"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<polygon
							points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
						/>
					</svg>
				</div>
				<h3 class="text-xl font-bold text-content">Smart D-Pad Navigation</h3>
				<p class="text-content-muted text-sm leading-relaxed">
					No slow virtual cursor. The remote's arrow keys jump straight between pieces that can
					move, then straight to legal destinations — averaging 9 clicks per turn instead of 23.
				</p>
			</div>
		</div>
	</section>

	<!-- Characters & AI Opponents -->
	<section class="flex flex-col gap-8">
		<div class="text-center max-w-2xl mx-auto">
			<h2 class="text-2xl sm:text-4xl font-extrabold text-content tracking-tight mb-3">
				Meet your tutor &amp; computer opponents
			</h2>
			<p class="text-content-muted text-base sm:text-lg">
				Play against computer opponents with distinct personalities, tailored playstyles, and full
				voice acting.
			</p>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
			<!-- Thinkle -->
			<div
				class="flex flex-col items-center text-center p-6 rounded-2xl border border-border bg-surface/50"
			>
				<img
					src="/tv/thinkle-badge-128.png"
					alt="Thinkle the Wizard portrait"
					class="w-24 h-24 rounded-2xl mb-4 border border-border/70 shadow-md object-cover bg-surface"
					width="128"
					height="128"
					loading="lazy"
				/>
				<h3 class="text-lg font-bold text-content mb-1">Thinkle the Wizard</h3>
				<span
					class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary mb-3"
				>
					The Voiced Tutor
				</span>
				<p class="text-content-muted text-xs leading-relaxed">
					Patiently walks you through a 5-minute voiced tutorial. Explains the rules, roll
					mechanics, and tactical tricks directly on the board.
				</p>
			</div>

			<!-- Grabby -->
			<div
				class="flex flex-col items-center text-center p-6 rounded-2xl border border-border bg-surface/50"
			>
				<img
					src="/tv/grabby-badge-128.png"
					alt="Grabby portrait"
					class="w-24 h-24 rounded-2xl mb-4 border border-border/70 shadow-md object-cover bg-surface"
					width="128"
					height="128"
					loading="lazy"
				/>
				<h3 class="text-lg font-bold text-content mb-1">Grabby</h3>
				<span
					class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 mb-3"
				>
					Material Hungry
				</span>
				<p class="text-content-muted text-xs leading-relaxed">
					Opportunistic and sneaky. Calculates moves to capture your pieces and gain material
					superiority across the entire turn.
				</p>
			</div>

			<!-- Rolly -->
			<div
				class="flex flex-col items-center text-center p-6 rounded-2xl border border-border bg-surface/50"
			>
				<img
					src="/tv/rolly-badge-128.png"
					alt="Rolly portrait"
					class="w-24 h-24 rounded-2xl mb-4 border border-border/70 shadow-md object-cover bg-surface"
					width="128"
					height="128"
					loading="lazy"
				/>
				<h3 class="text-lg font-bold text-content mb-1">Rolly</h3>
				<span
					class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 mb-3"
				>
					Wild &amp; Opportunistic
				</span>
				<p class="text-content-muted text-xs leading-relaxed">
					Plays with spontaneous flair and rolls with fate. But let your guard down for one moment,
					and she will capture your king instantly.
				</p>
			</div>

			<!-- Rampage -->
			<div
				class="flex flex-col items-center text-center p-6 rounded-2xl border border-border bg-surface/50"
			>
				<img
					src="/tv/rampage-badge-128.png"
					alt="Rampage portrait"
					class="w-24 h-24 rounded-2xl mb-4 border border-border/70 shadow-md object-cover bg-surface"
					width="128"
					height="128"
					loading="lazy"
				/>
				<h3 class="text-lg font-bold text-content mb-1">Rampage</h3>
				<span
					class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-500 mb-3"
				>
					Aggressive Hunter
				</span>
				<p class="text-content-muted text-xs leading-relaxed">
					Relentless and formidable. Speaks with booming voice lines and relentlessly hunts down
					your king with surgical checkmate combinations.
				</p>
			</div>
		</div>
	</section>

	<!-- Visual Screenshots Gallery -->
	<section class="flex flex-col gap-8">
		<div class="text-center max-w-2xl mx-auto">
			<h2 class="text-2xl sm:text-4xl font-extrabold text-content tracking-tight mb-3">
				Gameplay in Action
			</h2>
			<p class="text-content-muted text-base sm:text-lg">
				Crisp vector graphics optimized for 1080p and 4K TV screens.
			</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
			<!-- Screenshot 1 -->
			<div
				class="flex flex-col gap-3 rounded-2xl border border-border bg-surface/60 p-3 sm:p-4 shadow-sm"
			>
				<img
					src="/tv/hotseat.png"
					alt="Hotseat game on Fire TV: Knight picked up with destinations dotted and dice beside board"
					class="rounded-xl w-full h-auto object-cover border border-border/50"
					width="1280"
					height="720"
					loading="lazy"
				/>
				<div class="px-2 pt-1">
					<h3 class="font-bold text-content text-base">Pass-the-remote Hot Seat</h3>
					<p class="text-content-muted text-xs leading-relaxed">
						Clear move dots, capture rings, and a dedicated roll display beside the board make every
						valid option instantly obvious from the couch.
					</p>
				</div>
			</div>

			<!-- Screenshot 2 -->
			<div
				class="flex flex-col gap-3 rounded-2xl border border-border bg-surface/60 p-3 sm:p-4 shadow-sm"
			>
				<img
					src="/tv/tutorial.png"
					alt="Thinkle's interactive tutorial on Fire TV with spoken dialogue and highlighted pawns"
					class="rounded-xl w-full h-auto object-cover border border-border/50"
					width="1280"
					height="720"
					loading="lazy"
				/>
				<div class="px-2 pt-1">
					<h3 class="font-bold text-content text-base">Interactive Voiced Tutorial</h3>
					<p class="text-content-muted text-xs leading-relaxed">
						New to the game? Thinkle guides your first moves step-by-step with spoken audio and
						on-screen hints before your first real match.
					</p>
				</div>
			</div>

			<!-- Screenshot 3 -->
			<div
				class="flex flex-col gap-3 rounded-2xl border border-border bg-surface/60 p-3 sm:p-4 shadow-sm"
			>
				<img
					src="/tv/play-black.png"
					alt="Playing Black against Grabby with board rotated to face Black at the bottom"
					class="rounded-xl w-full h-auto object-cover border border-border/50"
					width="1280"
					height="720"
					loading="lazy"
				/>
				<div class="px-2 pt-1">
					<h3 class="font-bold text-content text-base">Play as White or Black</h3>
					<p class="text-content-muted text-xs leading-relaxed">
						Choose your side or let the game pick at random. When you play Black, the board flips
						seamlessly so your pawns advance forward.
					</p>
				</div>
			</div>

			<!-- Screenshot 4 -->
			<div
				class="flex flex-col gap-3 rounded-2xl border border-border bg-surface/60 p-3 sm:p-4 shadow-sm"
			>
				<img
					src="/tv/opponents.png"
					alt="Opponent selection menu on Fire TV with character cards and high contrast remote focus"
					class="rounded-xl w-full h-auto object-cover border border-border/50"
					width="1280"
					height="720"
					loading="lazy"
				/>
				<div class="px-2 pt-1">
					<h3 class="font-bold text-content text-base">High-Contrast 10-Foot UI</h3>
					<p class="text-content-muted text-xs leading-relaxed">
						Vibrant cards, clear focus highlights, and volume sliders for sound effects, voices, and
						adaptive music.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Quality, Open Source & Zero Tracking -->
	<section
		class="rounded-3xl border border-border bg-gradient-to-br from-surface/90 to-surface/40 p-6 sm:p-10 shadow-sm"
	>
		<div class="grid grid-cols-1 md:grid-cols-3 gap-8">
			<div class="flex flex-col gap-2">
				<div class="flex items-center gap-2 text-primary font-bold text-base">
					<svg
						class="h-5 w-5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
					</svg>
					<span>100% Offline &amp; Private</span>
				</div>
				<p class="text-content-muted text-sm leading-relaxed">
					Zero telemetry, zero ads, no user accounts, and zero network calls during play. Complies
					strictly with COPPA guidelines for family play.
				</p>
			</div>

			<div class="flex flex-col gap-2">
				<div class="flex items-center gap-2 text-primary font-bold text-base">
					<svg
						class="h-5 w-5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="12" cy="12" r="10" />
						<line x1="2" y1="12" x2="22" y2="12" />
						<path
							d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
						/>
					</svg>
					<span>Open Source Rules Engine</span>
				</div>
				<p class="text-content-muted text-sm leading-relaxed">
					Every roll, legal move, and outcome is validated by Fortemate's verified
					<a
						href="https://github.com/fortemate/dicechess-engine"
						target="_blank"
						rel="noopener noreferrer"
						class="text-content underline hover:text-primary"
					>
						@fortemate/dicechess-engine
					</a>.
				</p>
			</div>

			<div class="flex flex-col gap-2">
				<div class="flex items-center gap-2 text-primary font-bold text-base">
					<svg
						class="h-5 w-5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M9 18V5l12-2v13" />
						<circle cx="6" cy="18" r="3" />
						<circle cx="18" cy="16" r="3" />
					</svg>
					<span>Adaptive Dynamic Soundtrack</span>
				</div>
				<p class="text-content-muted text-sm leading-relaxed">
					Original musical score composed by pepka-prygni featuring 4 dynamic themes that ramp up in
					urgency when kings enter direct danger.
				</p>
			</div>
		</div>
	</section>

	<!-- Web Version Callout -->
	<section
		class="relative rounded-3xl border border-primary/30 bg-primary/5 p-8 sm:p-12 text-center flex flex-col items-center gap-6 overflow-hidden"
	>
		<div class="max-w-xl flex flex-col gap-2">
			<span class="text-xs uppercase font-extrabold tracking-wider text-primary">
				Don't have a Fire TV?
			</span>
			<h2 class="text-2xl sm:text-4xl font-extrabold text-content tracking-tight">
				Try the Web Client in your browser
			</h2>
			<p class="text-content-muted text-sm sm:text-base leading-relaxed">
				Our browser application is currently in development. You can practice against bots right
				now, test opening rolls, or explore the community lobby.
			</p>
		</div>

		<div class="flex flex-wrap items-center justify-center gap-3">
			<a
				href={resolve('/practice')}
				class="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-content hover:bg-primary-hover font-bold shadow-md transition-colors text-sm"
			>
				<span>Start Practice Game (Instant)</span>
				<span>→</span>
			</a>
			<a
				href={resolve('/play')}
				class="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-border bg-surface hover:bg-surface-hover text-content font-bold transition-colors text-sm"
			>
				<span>Browse All Game Modes</span>
			</a>
			<a
				href={resolve('/table')}
				class="inline-flex items-center gap-2 px-4 py-3 rounded-xl text-content-muted hover:text-content text-sm font-semibold transition-colors"
			>
				<span>Live Table</span>
			</a>
		</div>
	</section>

	<!-- Technical Documentation Footnote Banner -->
	<section
		class="p-6 rounded-2xl border border-border bg-surface/30 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-content-muted"
	>
		<div class="flex items-center gap-3">
			<span class="text-lg">🛠️</span>
			<div>
				<strong class="text-content font-semibold block text-sm">
					Looking for technical documentation &amp; architecture?
				</strong>
				<span>
					Our detailed engineering documentation, Vega SDK findings, performance benchmarks, and
					friction logs live on the docs portal.
				</span>
			</div>
		</div>
		<a
			href="https://dicechess-tv.fortemate.com"
			target="_blank"
			rel="noopener noreferrer"
			class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-surface hover:bg-surface-hover text-content font-bold whitespace-nowrap transition-colors"
		>
			<span>Visit dicechess-tv.fortemate.com</span>
			<svg
				class="h-3.5 w-3.5"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
				<polyline points="15 3 21 3 21 9" />
				<line x1="10" y1="14" x2="21" y2="3" />
			</svg>
		</a>
	</section>
</div>
