<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	// Open-source license disclosures (#14). Identifies all bundled software, third-party
	// assets, respective licenses, copyright notices, and upstream source code links.
	import { resolve } from '$app/paths';
	import { CANONICAL_ORIGIN, SITE_ORIGIN } from '$lib/rules/seo';

	const sections = [
		{ id: 'play-client', title: 'Dice Chess Play Client' },
		{ id: 'chessground', title: 'Chessground (Lichess)' },
		{ id: 'engine', title: 'Dice Chess Engine' },
		{ id: 'pieces', title: 'Chess Piece Graphics' },
		{ id: 'dependencies', title: 'Third-Party Libraries' },
		{ id: 'source-notice', title: 'Source Code & AGPL-3.0 Notice' },
	] as const;
</script>

<svelte:head>
	<title>Open Source Licenses & Disclosures | Dice Chess Play</title>
	<meta
		name="description"
		content="Open source license disclosures for the Dice Chess play client, Chessground, the Dice Chess engine, and bundled third-party assets."
	/>
	<link rel="canonical" href="{CANONICAL_ORIGIN}/licenses" />
	<link rel="alternate" hreflang="en" href="{CANONICAL_ORIGIN}/licenses" />
	<link rel="alternate" hreflang="x-default" href="{CANONICAL_ORIGIN}/licenses" />
	<meta property="og:type" content="article" />
	<meta property="og:site_name" content="Dice Chess — Play" />
	<meta property="og:title" content="Open Source Licenses & Disclosures" />
	<meta
		property="og:description"
		content="Open source license disclosures for the Dice Chess play client, Chessground, the Dice Chess engine, and bundled third-party assets."
	/>
	<meta property="og:url" content="{SITE_ORIGIN}/licenses" />
	<meta property="og:image" content="{SITE_ORIGIN}/pwa-512x512.png" />
	<meta name="twitter:card" content="summary" />
</svelte:head>

<article class="mx-auto flex w-full max-w-3xl flex-col gap-10">
	<header class="flex flex-col gap-4">
		<h1 class="text-3xl font-bold text-content sm:text-4xl">Open Source Licenses</h1>
		<p class="leading-relaxed text-content-muted">
			Dice Chess Play is free and open-source software. We believe in software freedom, open
			collaboration, and transparent disclosure of all included open-source components that power
			this client.
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

	<section
		id="play-client"
		class="flex flex-col gap-4 rounded-2xl border border-border bg-surface/40 p-6"
	>
		<div class="flex flex-col gap-1">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-xl font-bold text-content">Dice Chess Play Client</h2>
				<span
					class="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-primary"
				>
					AGPL-3.0
				</span>
			</div>
			<p class="text-xs text-content-muted">
				Package: <code class="font-mono">dicechess-play</code>
			</p>
		</div>

		<p class="leading-relaxed text-content-muted">
			The public browser play client for Dice Chess. Fully client-side SvelteKit application
			supporting anonymous play against local bots and online play via server connection.
		</p>

		<div class="flex flex-col gap-2 text-sm">
			<div>
				<span class="font-semibold text-content">Copyright:</span>
				<span class="text-content-muted"> © 2026 Fortemate / Jegors Čemisovs</span>
			</div>
			<div>
				<span class="font-semibold text-content">License:</span>
				<a
					class="font-semibold text-primary hover:underline"
					href="https://github.com/fortemate/dicechess-play/blob/main/LICENSE"
					target="_blank"
					rel="noopener noreferrer"
				>
					GNU Affero General Public License v3.0 (AGPL-3.0)
				</a>
			</div>
			<div>
				<span class="font-semibold text-content">Source Code:</span>
				<a
					class="font-semibold text-primary hover:underline"
					href="https://github.com/fortemate/dicechess-play"
					target="_blank"
					rel="noopener noreferrer"
				>
					https://github.com/fortemate/dicechess-play
				</a>
			</div>
		</div>
	</section>

	<section
		id="chessground"
		class="flex flex-col gap-4 rounded-2xl border border-border bg-surface/40 p-6"
	>
		<div class="flex flex-col gap-1">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-xl font-bold text-content">Chessground</h2>
				<span
					class="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-primary"
				>
					GPL-3.0-or-later
				</span>
			</div>
			<p class="text-xs text-content-muted">
				Package: <code class="font-mono">@lichess-org/chessground 10.1.1</code>
			</p>
		</div>

		<p class="leading-relaxed text-content-muted">
			Interactive chessboard UI, piece animation, and board rendering library created by
			lichess.org. Used under the terms of the GNU General Public License version 3 or later.
		</p>

		<div class="flex flex-col gap-2 text-sm">
			<div>
				<span class="font-semibold text-content">Copyright:</span>
				<span class="text-content-muted">
					Copyright © Lichess Team (&lt;contact@lichess.org&gt;)</span
				>
			</div>
			<div>
				<span class="font-semibold text-content">License:</span>
				<a
					class="font-semibold text-primary hover:underline"
					href="https://github.com/lichess-org/chessground/blob/master/LICENSE"
					target="_blank"
					rel="noopener noreferrer"
				>
					GNU General Public License v3.0 or later (GPL-3.0-or-later)
				</a>
			</div>
			<div>
				<span class="font-semibold text-content">Upstream Project:</span>
				<a
					class="font-semibold text-primary hover:underline"
					href="https://github.com/lichess-org/chessground"
					target="_blank"
					rel="noopener noreferrer"
				>
					https://github.com/lichess-org/chessground
				</a>
			</div>
		</div>
	</section>

	<section
		id="engine"
		class="flex flex-col gap-4 rounded-2xl border border-border bg-surface/40 p-6"
	>
		<div class="flex flex-col gap-1">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-xl font-bold text-content">Dice Chess Engine</h2>
				<span
					class="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-primary"
				>
					AGPL-3.0
				</span>
			</div>
			<p class="text-xs text-content-muted">
				Package: <code class="font-mono">@fortemate/dicechess-engine 0.7.2</code>
			</p>
		</div>

		<p class="leading-relaxed text-content-muted">
			High-performance core Dice Chess engine, move generator, and bot algorithms compiled to
			Scala.js and WebAssembly.
		</p>

		<div class="flex flex-col gap-2 text-sm">
			<div>
				<span class="font-semibold text-content">Copyright:</span>
				<span class="text-content-muted"> Copyright © Fortemate / Jegors Čemisovs</span>
			</div>
			<div>
				<span class="font-semibold text-content">License:</span>
				<a
					class="font-semibold text-primary hover:underline"
					href="https://github.com/fortemate/dicechess-engine/blob/main/LICENSE"
					target="_blank"
					rel="noopener noreferrer"
				>
					GNU Affero General Public License v3.0 (AGPL-3.0)
				</a>
			</div>
			<div>
				<span class="font-semibold text-content">Upstream Project:</span>
				<a
					class="font-semibold text-primary hover:underline"
					href="https://github.com/fortemate/dicechess-engine"
					target="_blank"
					rel="noopener noreferrer"
				>
					https://github.com/fortemate/dicechess-engine
				</a>
			</div>
		</div>
	</section>

	<section
		id="pieces"
		class="flex flex-col gap-4 rounded-2xl border border-border bg-surface/40 p-6"
	>
		<div class="flex flex-col gap-1">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-xl font-bold text-content">Chess Piece Graphics (cburnett)</h2>
				<span
					class="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-primary"
				>
					CC BY-SA 3.0 / GPL
				</span>
			</div>
			<p class="text-xs text-content-muted">
				Asset: <code class="font-mono">/pieces/cburnett/*.svg</code>
			</p>
		</div>

		<p class="leading-relaxed text-content-muted">
			The standard chess piece vector SVG graphics set designed by Colin M.L. Burnett, distributed
			under Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0) and GNU General
			Public License.
		</p>

		<div class="flex flex-col gap-2 text-sm">
			<div>
				<span class="font-semibold text-content">Author:</span>
				<span class="text-content-muted"> Colin M.L. Burnett</span>
			</div>
			<div>
				<span class="font-semibold text-content">License:</span>
				<a
					class="font-semibold text-primary hover:underline"
					href="https://creativecommons.org/licenses/by-sa/3.0/"
					target="_blank"
					rel="noopener noreferrer"
				>
					Creative Commons Attribution-ShareAlike 3.0 (CC BY-SA 3.0)
				</a>
			</div>
		</div>
	</section>

	<section
		id="dependencies"
		class="flex flex-col gap-4 rounded-2xl border border-border bg-surface/40 p-6"
	>
		<div class="flex flex-col gap-1">
			<h2 class="text-xl font-bold text-content">Additional Third-Party Libraries</h2>
			<p class="text-xs text-content-muted">
				Direct runtime dependencies bundled with the client application
			</p>
		</div>

		<div class="overflow-x-auto">
			<table class="w-full text-left text-sm text-content-muted">
				<thead class="border-b border-border text-xs uppercase text-content">
					<tr>
						<th class="py-2.5 pr-4 font-semibold">Package</th>
						<th class="py-2.5 pr-4 font-semibold">Version</th>
						<th class="py-2.5 pr-4 font-semibold">License</th>
						<th class="py-2.5 font-semibold">Upstream</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border/50">
					<tr>
						<td class="py-2.5 pr-4 font-mono font-medium text-content">idb</td>
						<td class="py-2.5 pr-4 font-mono text-xs">^8.0.3</td>
						<td class="py-2.5 pr-4 font-mono text-xs">ISC</td>
						<td class="py-2.5">
							<a
								class="text-primary hover:underline"
								href="https://github.com/jakearchibald/idb"
								target="_blank"
								rel="noopener noreferrer"
							>
								jakearchibald/idb
							</a>
						</td>
					</tr>
					<tr>
						<td class="py-2.5 pr-4 font-mono font-medium text-content">uuid</td>
						<td class="py-2.5 pr-4 font-mono text-xs">^14.0.1</td>
						<td class="py-2.5 pr-4 font-mono text-xs">MIT</td>
						<td class="py-2.5">
							<a
								class="text-primary hover:underline"
								href="https://github.com/uuidjs/uuid"
								target="_blank"
								rel="noopener noreferrer"
							>
								uuidjs/uuid
							</a>
						</td>
					</tr>
					<tr>
						<td class="py-2.5 pr-4 font-mono font-medium text-content">@sentry/sveltekit</td>
						<td class="py-2.5 pr-4 font-mono text-xs">^10.70.0</td>
						<td class="py-2.5 pr-4 font-mono text-xs">MIT</td>
						<td class="py-2.5">
							<a
								class="text-primary hover:underline"
								href="https://github.com/getsentry/sentry-javascript"
								target="_blank"
								rel="noopener noreferrer"
							>
								getsentry/sentry-javascript
							</a>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</section>

	<section
		id="source-notice"
		class="flex flex-col gap-4 rounded-2xl border border-border bg-surface/40 p-6"
	>
		<h2 class="text-xl font-bold text-content">Source Code & AGPL-3.0 Section 13 Notice</h2>
		<p class="leading-relaxed text-content-muted">
			In accordance with Section 13 of the GNU Affero General Public License (AGPLv3), users
			interacting with this application remotely through a computer network are entitled to receive
			the Corresponding Source code of this application.
		</p>
		<p class="leading-relaxed text-content-muted">
			You can inspect, clone, fork, and contribute to the complete source code of this application
			at
			<a
				class="font-semibold text-primary hover:underline"
				href="https://github.com/fortemate/dicechess-play"
				target="_blank"
				rel="noopener noreferrer"
			>
				https://github.com/fortemate/dicechess-play</a
			>. For game rules and dialect specifications, see our
			<a class="font-semibold text-primary hover:underline" href={resolve('/rules')}>
				Rules of Dice Chess</a
			> page.
		</p>
	</section>
</article>
