<script lang="ts">
	// A bot's public profile (#152, #262). The page owns the address; everything else is the
	// one profile template shared with `/players/[nickname]`.
	import { page } from '$app/state';
	import Profile from '../../../../components/Profile.svelte';

	const subject = $derived({
		kind: 'bot' as const,
		team: page.params.team ?? '',
		name: page.params.name ?? '',
	});
</script>

<Profile {subject} />
