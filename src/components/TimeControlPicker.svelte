<script lang="ts">
	import { timeControlGroups } from '$lib/live/timeControls';

	// Bound to the selected preset index. Native radios in a fieldset give keyboard nav + focus for free.
	let { selected = $bindable(0) }: { selected?: number } = $props();
</script>

<fieldset class="flex flex-col gap-3">
	<legend class="sr-only">Time control</legend>
	{#each timeControlGroups as g (g.label)}
		<div class="flex flex-col gap-1.5">
			<span class="text-[10px] font-bold tracking-widest text-content-muted/80 uppercase">
				{g.label}
			</span>
			<div class="flex flex-wrap gap-2">
				{#each g.presets as e (e.preset.label)}
					<label
						class="cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-bold tabular-nums transition-colors focus-within:ring-2 focus-within:ring-primary/50
							{selected === e.index
							? 'border-primary bg-primary text-primary-content'
							: 'border-border bg-surface text-content-muted hover:text-content'}"
					>
						<input
							type="radio"
							name="timeControl"
							value={e.index}
							bind:group={selected}
							class="sr-only"
						/>
						{e.preset.label}
					</label>
				{/each}
			</div>
		</div>
	{/each}
</fieldset>
