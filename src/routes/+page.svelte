<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import ShowcaseMark from '../components/showcase/ShowcaseMark.svelte';

	const storeUrl = 'https://www.amazon.com/dp/B0HL6K9N47/';
	const cast = [
		{ name: 'Thinkle', portrait: 'thinkle-badge-128', role: m.tv_thinkle },
		{ name: 'Grabby', portrait: 'grabby-badge-128', role: m.tv_grabby },
		{ name: 'Rolly', portrait: 'rolly-badge-128', role: m.tv_rolly },
		{ name: 'Rampage', portrait: 'rampage-badge-128', role: m.tv_rampage },
	];

	// Older installations can still launch at /. Following the brand link within the app
	// is an intentional visit to the storefront, so only redirect an initial navigation.
	afterNavigate(({ type }) => {
		if (type === 'enter' && window.matchMedia('(display-mode: standalone)').matches) {
			void goto(resolve('/play'), { replaceState: true });
		}
	});

	onMount(() => {
		const themeColor = document.querySelector<HTMLMetaElement>('#theme-color-meta');
		const previousColor = themeColor?.content;
		if (themeColor) themeColor.content = '#10251f';
		return () => {
			if (themeColor && previousColor) themeColor.content = previousColor;
		};
	});
</script>

<svelte:head>
	<title>{m.tv_title()}</title>
	<meta name="description" content={m.tv_intro()} />
	<meta property="og:title" content={m.tv_title()} />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="https://fortemate.com/social-preview-1200x630.png" />
	<meta property="og:description" content={m.tv_intro()} />
</svelte:head>

{#snippet storeButton()}
	<a class="store-link" href={storeUrl}>{m.tv_store()} <span aria-hidden="true">↗</span></a>
{/snippet}

<div class="tv">
	<header class="wrap masthead">
		<span class="brand"><ShowcaseMark class="size-5" />{m.home_brand_name()}</span>
		<a class="browser-link" href={resolve('/play')}
			>{m.tv_browser()} <span aria-hidden="true">↗</span></a
		>
	</header>
	<main>
		<section class="wrap hero" aria-labelledby="tv-title">
			<div class="intro">
				<p class="eyebrow">{m.tv_eyebrow()}</p>
				<h1 id="tv-title">{m.tv_name()}<br /><em>{m.tv_platform()}</em></h1>
				<p class="lead">{m.tv_intro()}</p>
			</div>
			<figure>
				<div class="screen">
					<img
						src="/tv/hotseat.png"
						alt={m.tv_screen_alt()}
						width="1280"
						height="720"
						fetchpriority="high"
					/>
				</div>
				<figcaption><span>{m.tv_caption_label()}</span> {m.tv_caption()}</figcaption>
			</figure>
			<div class="action">
				{@render storeButton()}
				<p>{m.tv_offline()}</p>
			</div>
		</section>
		<section class="cast-section">
			<div class="wrap cast-layout">
				<div class="cast-intro">
					<p class="eyebrow">{m.tv_solo()}</p>
					<h2>{m.tv_cast_title()}</h2>
					<p>{m.tv_cast_intro()}</p>
				</div>
				<ul class="cast">
					{#each cast as character (character.name)}
						<li>
							<img
								src={'/tv/' + character.portrait + '.png'}
								alt=""
								width="128"
								height="128"
								loading="lazy"
							/>
							<strong>{character.name}</strong>
							<span>{character.role()}</span>
						</li>
					{/each}
				</ul>
			</div>
		</section>
		<section class="wrap closing">
			<div>
				<p class="eyebrow">{m.tv_available()}</p>
				<h2>{m.tv_closing()}</h2>
			</div>
			{@render storeButton()}
		</section>
	</main>
	<footer class="wrap">
		<span>{m.tv_title()}</span>
		<div>
			<a href="https://dicechess-tv.fortemate.com">{m.tv_docs()}</a>
			<a href={resolve('/licenses')}>{m.home_nav_licenses()}</a>
		</div>
	</footer>
</div>

<style>
	.tv {
		--paper: #f7eddb;
		--gold: #f3bf74;
		--muted: #c1cdc1;
		background: #10251f;
		color: var(--paper);
		color-scheme: dark;
		font-family: system-ui, sans-serif;
		min-height: 100svh;
	}
	.wrap {
		width: min(100% - 3rem, 81rem);
		margin-inline: auto;
	}
	.masthead,
	footer,
	.closing {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
	}
	.masthead {
		padding-block: 1.25rem;
		border-bottom: 1px solid #395046;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.65rem;
		font-size: 1.08rem;
		font-weight: 750;
		letter-spacing: -0.045em;
	}
	.browser-link,
	footer a {
		padding-block: 0.55rem;
		color: var(--muted);
		font-size: 0.875rem;
	}
	.browser-link span {
		margin-left: 0.35rem;
	}
	.tv a:hover {
		text-decoration: underline;
		text-underline-offset: 0.22em;
	}
	.tv a:focus-visible {
		outline: 3px solid var(--gold);
		outline-offset: 5px;
		border-radius: 0.2rem;
	}
	.hero {
		display: grid;
		grid-template-columns: minmax(0, 0.84fr) minmax(0, 1.3fr);
		grid-template-areas: 'intro screen' 'action screen';
		align-content: center;
		column-gap: clamp(2rem, 5vw, 5rem);
		row-gap: 1.75rem;
		padding-block: clamp(3rem, 7vw, 7rem);
	}
	.intro {
		grid-area: intro;
		align-self: end;
	}
	.eyebrow,
	figcaption span {
		font-size: 0.72rem;
		font-weight: 750;
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}
	.eyebrow {
		color: var(--gold);
	}
	h1,
	h2 {
		font-family: Georgia, 'Times New Roman', serif;
		font-weight: 400;
		text-wrap: balance;
	}
	h1 {
		margin-block: 1rem 1.35rem;
		font-size: clamp(3.8rem, 6.9vw, 6.6rem);
		letter-spacing: -0.062em;
		line-height: 0.98;
	}
	h1 em {
		color: var(--gold);
		font-weight: 400;
	}
	.lead,
	.cast-intro > p:last-child {
		max-width: 37ch;
		font-size: clamp(1rem, 1.4vw, 1.15rem);
		line-height: 1.6;
		color: var(--muted);
	}
	.action {
		grid-area: action;
	}
	.store-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 1.3rem;
		background: var(--gold);
		color: #17251c;
		padding: 0.85rem 1.2rem;
		border-radius: 0.45rem;
		font-size: 0.97rem;
		font-weight: 720;
	}
	.store-link:hover {
		background: #ffd39a;
	}
	.action p {
		margin-top: 0.8rem;
		color: var(--muted);
		font-size: 0.82rem;
	}
	figure {
		grid-area: screen;
		align-self: center;
		min-width: 0;
	}
	.screen {
		position: relative;
		padding: clamp(4px, 0.65vw, 10px);
		border: 1px solid #637369;
		border-radius: 0.85rem;
		background: #0b130f;
		box-shadow: 0 1.2rem 3rem #05120d55;
	}
	.screen:before,
	.screen:after {
		content: '';
		position: absolute;
		bottom: -0.58rem;
		width: 1.5rem;
		height: 0.55rem;
		background: #718175;
		transform: skew(-30deg);
	}
	.screen:before {
		left: 14%;
	}
	.screen:after {
		right: 14%;
		transform: skew(30deg);
	}
	.screen img {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 0.34rem;
	}
	figcaption {
		margin-top: 1.35rem;
		font-size: 0.81rem;
		line-height: 1.55;
		color: var(--muted);
	}
	figcaption span {
		color: var(--gold);
		font-size: 0.65rem;
		margin-right: 0.7rem;
	}
	.cast-section {
		background: #eae0cb;
		color: #1e3329;
	}
	.cast-layout {
		display: grid;
		grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.4fr);
		gap: 3rem;
		align-items: center;
		padding-block: clamp(3rem, 5vw, 5rem);
	}
	.cast-intro .eyebrow {
		color: #536347;
	}
	h2 {
		font-size: clamp(2.3rem, 4vw, 3.8rem);
		line-height: 1.05;
		letter-spacing: -0.045em;
	}
	.cast-intro h2,
	.closing h2 {
		margin-block: 0.65rem;
	}
	.cast-intro > p:last-child {
		color: #475448;
		font-size: 1rem;
	}
	.cast {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 1.2rem;
	}
	.cast li {
		display: grid;
		align-content: start;
		justify-items: center;
		text-align: center;
	}
	.cast img {
		width: min(100%, 7rem);
		height: auto;
	}
	.cast strong {
		font-family: Georgia, serif;
		font-weight: 600;
		font-size: 1.2rem;
		margin-top: 0.55rem;
	}
	.cast li span {
		color: #475448;
		font-size: 0.8rem;
	}
	.closing {
		padding-block: clamp(2.6rem, 5vw, 5rem);
	}
	footer {
		border-top: 1px solid #395046;
		padding-block: 1.1rem;
		color: var(--muted);
		font-size: 0.85rem;
	}
	footer div {
		display: flex;
		gap: 1.2rem;
	}
	@media (max-width: 48rem) {
		.wrap {
			width: min(100% - 2.25rem, 37rem);
		}
		.hero {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: 'intro' 'screen' 'action';
			gap: 1.4rem;
			padding-block: 2rem 2.5rem;
		}
		h1 {
			margin-block: 0.65rem 0.85rem;
			font-size: clamp(3.65rem, 11vw, 5rem);
		}
		.cast-layout {
			grid-template-columns: 1fr;
			gap: 1.7rem;
		}
		.cast {
			gap: 0.5rem;
		}
		.cast strong {
			font-size: 1rem;
		}
		.closing {
			align-items: flex-start;
			flex-direction: column;
		}
		footer {
			align-items: flex-start;
			flex-wrap: wrap;
			gap: 0.25rem 1rem;
		}
	}
	@media (max-width: 22rem) {
		.cast {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			row-gap: 1.25rem;
		}
	}
</style>
