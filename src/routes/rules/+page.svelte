<script lang="ts">
	// The rules of the Dice Chess dialect this site plays (#254). Every rule stated here is
	// verified against the engine's actual behavior (dicechess-engine-scala) and play-api's
	// server rules — when in doubt, the engine is the source of truth, not other sites' docs.
	import { m } from '$lib/paraglide/messages.js';
	import { ParaglideMessage } from '@inlang/paraglide-js-svelte';
	import { resolve } from '$app/paths';
	import { CANONICAL_ORIGIN, SITE_ORIGIN } from '$lib/rules/seo';

	const sections = [
		{ id: 'glance', title: m.rules_section_glance_title },
		{ id: 'dice', title: m.rules_section_dice_title },
		{ id: 'turns', title: m.rules_section_turns_title },
		{ id: 'winning', title: m.rules_section_winning_title },
		{ id: 'no-check', title: m.rules_section_no_check_title },
		{ id: 'special-moves', title: m.rules_section_special_moves_title },
		{ id: 'draws', title: m.rules_section_draws_title },
		{ id: 'time', title: m.rules_section_time_title },
		{ id: 'fair-dice', title: m.rules_section_fair_dice_title },
		{ id: 'dialects', title: m.rules_section_dialects_title },
	] as const;
</script>

<svelte:head>
	<title>{m.rules_meta_title()}</title>
	<meta name="description" content={m.rules_meta_description()} />
	<link rel="canonical" href="{CANONICAL_ORIGIN}/rules" />
	<link rel="alternate" hreflang="en" href="{CANONICAL_ORIGIN}/rules" />
	<link rel="alternate" hreflang="x-default" href="{CANONICAL_ORIGIN}/rules" />
	<meta property="og:type" content="article" />
	<meta property="og:site_name" content="Dice Chess — Play" />
	<meta property="og:title" content={m.rules_og_title()} />
	<meta property="og:description" content={m.rules_og_description()} />
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
			<ParaglideMessage message={m.rules_intro_p1}>
				{#snippet link({ children })}
					<a class="font-semibold text-primary hover:underline" href={resolve('/play')}>
						{@render children?.()}
					</a>
				{/snippet}
			</ParaglideMessage>
		</p>
		<nav aria-label={m.rules_toc_label()} class="rounded-2xl border border-border bg-surface/40 p-4">
			<ul class="flex flex-col gap-1.5 text-sm sm:grid sm:grid-cols-2">
				{#each sections as s (s.id)}
					<li>
						<a class="text-content-muted transition-colors hover:text-content" href="#{s.id}">
							{s.title()}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</header>

	<section id="glance" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">{m.rules_section_glance_title()}</h2>
		<ul class="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-content-muted">
			<li>
				{m.rules_glance_li1()}
			</li>
			<li>
				<ParaglideMessage message={m.rules_glance_li2}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
				</ParaglideMessage>
			</li>
			<li>
				<ParaglideMessage message={m.rules_glance_li3}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
				</ParaglideMessage>
			</li>
			<li>
				<ParaglideMessage message={m.rules_glance_li4}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
				</ParaglideMessage>
			</li>
		</ul>
	</section>

	<section id="dice" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">{m.rules_section_dice_title()}</h2>
		<p class="leading-relaxed text-content-muted">
			<ParaglideMessage message={m.rules_dice_p1}>
				{#snippet i({ children })}
					<i>{@render children?.()}</i>
				{/snippet}
				{#snippet em({ children })}
					<em>{@render children?.()}</em>
				{/snippet}
			</ParaglideMessage>
		</p>
		<p class="leading-relaxed text-content-muted">
			<ParaglideMessage message={m.rules_dice_p2}>
				{#snippet i({ children })}
					<i>{@render children?.()}</i>
				{/snippet}
				{#snippet link({ children })}
					<a class="text-primary hover:underline" href="#special-moves">
						{@render children?.()}
					</a>
				{/snippet}
			</ParaglideMessage>
		</p>
	</section>

	<section id="turns" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">
			{m.rules_section_turns_title()}
		</h2>
		<p class="leading-relaxed text-content-muted">
			<ParaglideMessage message={m.rules_turns_p1}>
				{#snippet b({ children })}
					<b class="text-content">{@render children?.()}</b>
				{/snippet}
			</ParaglideMessage>
		</p>
		<p class="leading-relaxed text-content-muted">
			<ParaglideMessage message={m.rules_turns_p2}>
				{#snippet i({ children })}
					<i>{@render children?.()}</i>
				{/snippet}
			</ParaglideMessage>
		</p>
		<ul class="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-content-muted">
			<li>
				<ParaglideMessage message={m.rules_turns_li1}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
				</ParaglideMessage>
			</li>
			<li>
				<ParaglideMessage message={m.rules_turns_li2}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
					{#snippet i({ children })}
						<i>{@render children?.()}</i>
					{/snippet}
				</ParaglideMessage>
			</li>
			<li>
				<ParaglideMessage message={m.rules_turns_li3}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
				</ParaglideMessage>
			</li>
		</ul>
	</section>

	<section id="winning" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">{m.rules_section_winning_title()}</h2>
		<p class="leading-relaxed text-content-muted">{m.rules_winning_intro()}</p>
		<ul class="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-content-muted">
			<li>
				<ParaglideMessage message={m.rules_winning_li1}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
				</ParaglideMessage>
			</li>
			<li>
				<ParaglideMessage message={m.rules_winning_li2}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
				</ParaglideMessage>
			</li>
			<li>
				<ParaglideMessage message={m.rules_winning_li3}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
					{#snippet link({ children })}
						<a class="text-primary hover:underline" href="#time">{@render children?.()}</a>
					{/snippet}
				</ParaglideMessage>
			</li>
		</ul>
	</section>

	<section id="no-check" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">{m.rules_section_no_check_title()}</h2>
		<p class="leading-relaxed text-content-muted">
			{m.rules_no_check_p1()}
		</p>
		<ul class="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-content-muted">
			<li>{m.rules_no_check_li1()}</li>
			<li>{m.rules_no_check_li2()}</li>
			<li>{m.rules_no_check_li3()}</li>
			<li>{m.rules_no_check_li4()}</li>
		</ul>
		<p class="leading-relaxed text-content-muted">
			{m.rules_no_check_p2()}
		</p>
	</section>

	<section id="special-moves" class="flex flex-col gap-5">
		<h2 class="text-xl font-bold text-content sm:text-2xl">
			{m.rules_section_special_moves_title()}
		</h2>
		<div class="flex flex-col gap-2">
			<h3 class="font-bold text-content">{m.rules_special_moves_castling_title()}</h3>
			<p class="leading-relaxed text-content-muted">
				<ParaglideMessage message={m.rules_special_moves_castling_p}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
					{#snippet i({ children })}
						<i>{@render children?.()}</i>
					{/snippet}
				</ParaglideMessage>
			</p>
		</div>
		<div class="flex flex-col gap-2">
			<h3 class="font-bold text-content">{m.rules_special_moves_promotion_title()}</h3>
			<p class="leading-relaxed text-content-muted">
				<ParaglideMessage message={m.rules_special_moves_promotion_p}>
					{#snippet i({ children })}
						<i>{@render children?.()}</i>
					{/snippet}
				</ParaglideMessage>
			</p>
		</div>
		<div class="flex flex-col gap-2">
			<h3 class="font-bold text-content">{m.rules_special_moves_en_passant_title()}</h3>
			<p class="leading-relaxed text-content-muted">
				<ParaglideMessage message={m.rules_special_moves_en_passant_p}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
					{#snippet i({ children })}
						<i>{@render children?.()}</i>
					{/snippet}
				</ParaglideMessage>
			</p>
		</div>
	</section>

	<section id="draws" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">{m.rules_section_draws_title()}</h2>
		<div class="flex flex-col gap-2">
			<h3 class="font-bold text-content">{m.rules_draws_agreement_title()}</h3>
			<p class="leading-relaxed text-content-muted">
				<ParaglideMessage message={m.rules_draws_agreement_p}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
				</ParaglideMessage>
			</p>
		</div>
		<div class="flex flex-col gap-2">
			<h3 class="font-bold text-content">{m.rules_draws_auto_title()}</h3>
			<p class="leading-relaxed text-content-muted">
				<ParaglideMessage message={m.rules_draws_auto_p1}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
				</ParaglideMessage>
			</p>
			<p class="leading-relaxed text-content-muted">
				<ParaglideMessage message={m.rules_draws_auto_p2}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
				</ParaglideMessage>
			</p>
		</div>
	</section>

	<section id="time" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">{m.rules_section_time_title()}</h2>
		<ul class="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-content-muted">
			<li>{m.rules_time_li1()}</li>
			<li>
				<ParaglideMessage message={m.rules_time_li2}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
				</ParaglideMessage>
			</li>
			<li>{m.rules_time_li3()}</li>
			<li>{m.rules_time_li4()}</li>
			<li>
				<ParaglideMessage message={m.rules_time_li5}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
				</ParaglideMessage>
			</li>
			<li>{m.rules_time_li6()}</li>
		</ul>
	</section>

	<section id="fair-dice" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">{m.rules_section_fair_dice_title()}</h2>
		<p class="leading-relaxed text-content-muted">
			{m.rules_fair_dice_p1()}
		</p>
		<p class="leading-relaxed text-content-muted">
			<ParaglideMessage message={m.rules_fair_dice_p2}>
				{#snippet link({ children })}
					<a
						class="text-primary hover:underline"
						href="https://bots.fortemate.com/provably-fair/"
						rel="external"
					>
						{@render children?.()}
					</a>
				{/snippet}
			</ParaglideMessage>
		</p>
	</section>

	<section id="dialects" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">{m.rules_section_dialects_title()}</h2>
		<p class="leading-relaxed text-content-muted">
			<ParaglideMessage message={m.rules_dialects_p1}>
				{#snippet link({ children })}
					<a
						class="text-primary hover:underline"
						href="https://github.com/fortemate/dicechess-engine"
						rel="external"
					>
						{@render children?.()}
					</a>
				{/snippet}
			</ParaglideMessage>
		</p>
		<ul class="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-content-muted">
			<li>
				<ParaglideMessage message={m.rules_dialects_li1}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
				</ParaglideMessage>
			</li>
			<li>
				<ParaglideMessage message={m.rules_dialects_li2}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
				</ParaglideMessage>
			</li>
			<li>
				<ParaglideMessage message={m.rules_dialects_li3}>
					{#snippet b({ children })}
						<b class="text-content">{@render children?.()}</b>
					{/snippet}
				</ParaglideMessage>
			</li>
		</ul>
		<p class="leading-relaxed text-content-muted">
			<ParaglideMessage message={m.rules_dialects_p2}>
				{#snippet link({ children })}
					<a
						class="text-primary hover:underline"
						href="https://github.com/fortemate/dicechess-play/issues"
						rel="external"
					>
						{@render children?.()}
					</a>
				{/snippet}
			</ParaglideMessage>
		</p>
	</section>

	<section
		class="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface/40 p-6 text-center"
	>
		<h2 class="text-xl font-bold text-content">{m.rules_cta_title()}</h2>
		<p class="max-w-xl leading-relaxed text-content-muted">
			{m.rules_cta_p()}
		</p>
		<div class="flex flex-wrap items-center justify-center gap-3">
			<a
				href={resolve('/play')}
				class="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-content transition-colors hover:bg-primary-hover"
			>
				{m.rules_cta_play_now()}
			</a>
			<a
				href={resolve('/lobby')}
				class="rounded-xl border border-border px-5 py-2.5 text-sm font-bold text-content-muted transition-colors hover:border-primary hover:text-content"
			>
				{m.rules_cta_play_human()}
			</a>
		</div>
	</section>
</article>
