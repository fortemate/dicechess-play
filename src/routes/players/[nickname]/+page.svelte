<script lang="ts">
	// A person's public profile (#207, #262). The page owns the address; everything else is the
	// one profile template shared with `/bots/[team]/[name]`.
	import { page } from '$app/state';
	import Profile from '../../../components/Profile.svelte';

	const subject = $derived({ kind: 'player' as const, nickname: page.params.nickname ?? '' });
</script>

<Profile {subject} />
