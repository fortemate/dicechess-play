<script lang="ts">
	// The header's identity slot (ADR-0017). Deliberately quiet: this site is anonymous-first, so a
	// visitor who never signs in should not be nagged. That shapes each state:
	//
	//   - `loading`  — render nothing. A flash of "Sign in" that turns into a nickname is worse than
	//                  a beat of nothing, and the check is one request against play-api.
	//   - `unavailable` — render nothing at all. Offering a button that cannot work (no play-api, or a
	//                  deployment with auth switched off) would be a dead end, not an invitation.
	//   - `signed-out`  — one low-key text link. Signing in is optional and adds a rating; it is not a
	//                  gate in front of anything.
	//   - `signed-in`   — the nickname plus a locally derived initial. There is no Google avatar to
	//                  show: play-api's `/auth/me` returns no picture and no email by design.
	import { authStore } from '$lib/authStore.svelte';
	import { resolve } from '$app/paths';
</script>

{#if authStore.status === 'signed-in'}
	<a
		href={resolve('/me')}
		class="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-surface-hover"
		title="Your profile"
	>
		<span
			class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-content"
			aria-hidden="true"
		>
			{authStore.initial}
		</span>
		<span class="hidden max-w-[10ch] truncate text-[13px] font-bold text-content sm:inline">
			{authStore.nickname}
		</span>
	</a>
{:else if authStore.status === 'signed-out' && authStore.canSignIn}
	<button
		type="button"
		onclick={() => authStore.signIn()}
		class="rounded-lg px-2.5 py-1 text-[13px] font-bold text-content-muted transition-colors hover:bg-surface-hover hover:text-content"
	>
		Sign in
	</button>
{/if}
