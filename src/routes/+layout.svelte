<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- i18n debt: not yet migrated (#8) */
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { chromeStore } from '$lib/stores/chromeStore.svelte';
	import { authStore } from '$lib/authStore.svelte';
	import { attachStaleBundleRecovery } from '$lib/staleBundleRecovery';
	import AuthMenu from '../components/AuthMenu.svelte';
	import FirstLoginOnboarding from '../components/FirstLoginOnboarding.svelte';
	import ThemeMenu from '../components/ThemeMenu.svelte';
	import ToastContainer from '../components/ToastContainer.svelte';
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { pwaInfo } from 'virtual:pwa-info';
	import { useRegisterSW } from 'virtual:pwa-register/svelte';

	// This layout also renders at build time when the static content pages (/rules,
	// #254) are prerendered, so browser-only boot work is gated on `browser`.
	if (browser) {
		// registerType: 'autoUpdate' (vite.config.ts) — registering is enough, the
		// service worker reloads the page itself once a new version activates.
		useRegisterSW();

		// Tell app.html's boot watchdog (#223) that the module graph made it: from here on a
		// failed import is a runtime matter for staleBundleRecovery, never a wedged boot.
		window.__dcBooted = true;

		// The service worker only protects clients it already controls. A deploy mid-session
		// deletes the hash-named chunks everyone else may still lazy-load; recover from that
		// failed import with one full reload instead of a dead UI.
		attachStaleBundleRecovery();
	}

	// Ask play-api who we are, once per page load. There is no local shortcut: the session is an
	// HttpOnly cookie on play-api's host, so the SPA cannot inspect it and a stale local flag would
	// survive an expired or revoked session. `fetchMe` short-circuits without a request when no
	// play-api base URL is configured, so this costs nothing on a build without live play.
	$effect(() => {
		void authStore.refresh();
	});

	let { children }: { children: Snippet } = $props();

	const matches = (path: string) =>
		page.url.pathname === path || page.url.pathname.startsWith(`${path}/`);
	// Pages without a nav item of their own light the hub they belong to (#217): /practice
	// and /bots are ways to start a game (the Play hub); /live (friend-by-link setup and
	// live boards) is part of the lobby.
	const isActive = (path: string) =>
		matches(path) ||
		(path === '/play' && (matches('/practice') || matches('/bots'))) ||
		(path === '/lobby' && matches('/live'));

	const links = [
		{ path: '/play', label: 'Play' },
		{ path: '/lobby', label: 'Lobby' },
		{ path: '/games', label: 'Games' },
		{ path: '/me', label: 'Profile' },
	] as const;

	// Leaderboard and Rules are desktop-nav only (#211): the mobile bottom bar stays at
	// these four primary loops — a fifth tab would crowd it, and the lobby/bots/home links
	// already get a phone there in one tap. On mobile the rules are reachable through the
	// "How to play" link in the game hub.
	const desktopLinks = [
		...links,
		{ path: '/leaderboard', label: 'Leaderboard' },
		{ path: '/rules', label: 'Rules' },
	] as const;
</script>

<svelte:head>
	{#if pwaInfo}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- build-generated from our own vite.config.ts, not user input -->
		{@html pwaInfo.webManifest.linkTag}
	{/if}
</svelte:head>

{#snippet navIcon(path: string)}
	<svg
		viewBox="0 0 24 24"
		class="h-[21px] w-[21px]"
		fill="none"
		stroke="currentColor"
		stroke-width="1.7"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#if path === '/play'}
			<path d="M4 11l8-6.5 8 6.5" /><path d="M6 10v9h12v-9" />
		{:else if path === '/lobby'}
			<circle cx="9" cy="8" r="3" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><path
				d="M16 6.4a3 3 0 0 1 0 5.4M17 14.3c2.4.5 4 2.3 4 4.7"
			/>
		{:else if path === '/games'}
			<rect x="4" y="4" width="7" height="7" rx="1.5" /><rect
				x="13"
				y="4"
				width="7"
				height="7"
				rx="1.5"
			/><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect
				x="13"
				y="13"
				width="7"
				height="7"
				rx="1.5"
			/>
		{:else}
			<circle cx="12" cy="8" r="3.4" /><path d="M5 19.5c0-3.4 3-6 7-6s7 2.6 7 6" />
		{/if}
	</svg>
{/snippet}

<div class="min-h-screen flex flex-col bg-background text-content transition-colors duration-300">
	{#if !chromeStore.zen}
		<header class="w-full border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-40">
			<div class="max-w-5xl mx-auto px-3 sm:px-6 h-12 flex items-center justify-between gap-3">
				<div class="flex items-center gap-3 sm:gap-5 min-w-0">
					<a
						href={resolve('/')}
						class="flex items-center gap-2 hover:opacity-80 transition-opacity"
					>
						<span
							class="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-md shadow-primary/20"
						>
							<span class="text-sm">🎲</span>
						</span>
						<span
							class="text-xs font-bold tracking-widest text-content uppercase whitespace-nowrap"
						>
							Dice Chess <span class="text-primary">Play</span>
						</span>
					</a>

					<nav class="hidden sm:flex items-center gap-0.5">
						{#each desktopLinks as l (l.path)}
							<a
								href={resolve(l.path)}
								class="px-2.5 py-1 rounded-lg text-[13px] font-bold transition-colors {isActive(
									l.path,
								)
									? 'bg-surface-hover text-content'
									: 'text-content-muted hover:text-content'}"
							>
								{l.label}
							</a>
						{/each}
					</nav>
				</div>

				<div class="flex items-center gap-1">
					<AuthMenu />
					<ThemeMenu />
				</div>
			</div>
		</header>
	{/if}

	<main
		class="flex-grow w-full mx-auto px-3 sm:px-6 {chromeStore.zen
			? 'max-w-[1800px] py-3 sm:py-4'
			: 'max-w-5xl py-6 sm:py-8 pb-20 sm:pb-8'}"
	>
		{@render children()}
	</main>

	{#if !chromeStore.zen}
		<footer
			class="hidden sm:block w-full border-t border-border bg-surface/40 py-5 text-center text-xs text-content-muted"
		>
			<div
				class="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2"
			>
				<p>
					Dice Chess — Play · anonymous, free ·
					<a class="hover:text-content hover:underline" href={resolve('/rules')}>How to play</a>
				</p>
				<p class="text-[10px] text-content-muted/60">
					<a
						class="hover:text-content hover:underline"
						href="https://github.com/fortemate/dicechess-play/blob/main/LICENSE"
					>
						AGPL-3.0
					</a>
					· powered by the open-source
					<a
						class="hover:text-content hover:underline"
						href="https://github.com/fortemate/dicechess-engine"
					>
						Dice Chess engine
					</a>
				</p>
			</div>
		</footer>

		<nav
			class="sm:hidden fixed bottom-0 inset-x-0 z-40 flex border-t border-border bg-surface/95 backdrop-blur-md"
			aria-label="Primary"
		>
			{#each links as l (l.path)}
				<a
					href={resolve(l.path)}
					class="flex flex-1 flex-col items-center gap-0.5 pt-2 pb-2.5 text-[10px] font-semibold transition-colors {isActive(
						l.path,
					)
						? 'text-primary'
						: 'text-content-muted'}"
					aria-current={isActive(l.path) ? 'page' : undefined}
				>
					{@render navIcon(l.path)}
					{l.label}
				</a>
			{/each}
		</nav>
	{/if}

	<ToastContainer />
	<!-- In the layout, not on a page: play-api redirects back to PLAY_FRONTEND_URL after Google, which
	     is the site root today but need not stay that way. Mounting it here means onboarding finds the
	     person wherever they land. -->
	<FirstLoginOnboarding />
</div>
