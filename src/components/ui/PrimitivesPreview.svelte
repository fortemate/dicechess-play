<script lang="ts">
	/* eslint-disable local/no-untranslated-text -- developer-only preview of the primitives (#252) */
	// Every primitive of `src/components/ui/` in every state, for one theme. The preview route
	// renders it twice, once per theme, so a change to a primitive or to a token can be judged
	// in both at a glance. Development only: no visitor sees this text, so it is not translated.
	import {
		botTimeControlChoices,
		timeControlChoices,
		type TimeControlChoiceGroup,
	} from '#lib/live/timeControls.js';
	import GameSetupPanel from '../GameSetupPanel.svelte';
	import Button from './Button.svelte';
	import Card from './Card.svelte';
	import Chip from './Chip.svelte';
	import PageContainer from './PageContainer.svelte';
	import PageHeader from './PageHeader.svelte';
	import SegmentedControl from './SegmentedControl.svelte';
	import Tag from './Tag.svelte';

	let { theme }: { theme: 'light' | 'dark' } = $props();

	let filter = $state('all');
	let time = $state('5+3');
	let view = $state<'list' | 'boards'>('list');
	let armed = $state(false);

	const FILTERS = [
		['all', 'All'],
		['human', 'With a human'],
		['bots', 'Bots only'],
	];
	const TIMES = ['1+0', '3+2', '5+3', '10+5'];

	// The game setup panel (#253), configured the way each of its four pages does.
	const PRACTICE_TIMES: TimeControlChoiceGroup[] = [
		{ label: 'Casual', options: [{ value: 0, label: 'Unlimited' }] },
		{
			label: 'Blitz',
			options: [
				{ value: 1, label: '3 + 2' },
				{ value: 2, label: '5 min' },
				{ value: 3, label: '5 + 3' },
			],
		},
		{
			label: 'Rapid',
			options: [
				{ value: 4, label: '10 min' },
				{ value: 5, label: '10 + 5' },
			],
		},
	];
	const SEATS = { random: 'random', white: 'White', black: 'Black' } as const;
	let setup = $state({
		bot: { time: 3, color: 'random' as 'random' | 'White' | 'Black', rated: false },
		practice: { time: 0, color: 'White' as 'random' | 'White' | 'Black' },
		friend: { time: 0, color: 'Black' as 'random' | 'White' | 'Black' },
		table: { time: 2, rated: false },
	});
</script>

<section data-theme={theme} aria-label="{theme} theme" class="bg-background py-8 text-content">
	<PageContainer class="flex flex-col gap-6">
		<PageHeader title="Primitives" lead="The {theme} theme. Every control is at least 44 px tall.">
			{#snippet actions()}
				<Button variant="secondary">Secondary</Button>
				<Button variant="primary">Primary</Button>
			{/snippet}
		</PageHeader>

		<PageHeader
			plain
			title="falcon-v1-0"
			lead="A title that contains a name uses the sans-serif face."
		/>

		<div class="grid gap-6 md:grid-cols-2">
			<Card as="section" aria-label="Buttons" class="flex flex-col gap-4">
				<h2 class="m-0 text-xs font-bold tracking-widest text-content-muted uppercase">Buttons</h2>
				<div class="flex flex-wrap items-center gap-3">
					<Button variant="primary">Primary</Button>
					<Button variant="secondary">Secondary</Button>
					<Button variant="danger" filled={armed} onclick={() => (armed = !armed)}>
						{armed ? 'Press again to resign' : 'Resign'}
					</Button>
				</div>
				<div class="flex flex-wrap items-center gap-3">
					<Button variant="primary" disabled>Primary</Button>
					<Button variant="secondary" disabled>Secondary</Button>
					<Button variant="danger" disabled>Resign</Button>
					<Button variant="danger" filled>Press again to resign</Button>
				</div>
				<div class="flex flex-wrap items-center gap-3">
					<Button variant="secondary" href="#link">A link</Button>
					<Button variant="secondary" aria-label="Flip board">⇅</Button>
				</div>
				<Button variant="primary" size="lg" block>Start game</Button>
			</Card>

			<Card as="section" raised aria-label="Chips and segments" class="flex flex-col gap-4">
				<h2 class="m-0 text-xs font-bold tracking-widest text-content-muted uppercase">
					Chips and segments · a raised card
				</h2>
				<div class="flex flex-wrap gap-2" role="group" aria-label="Filter">
					{#each FILTERS as [value, label] (value)}
						<Chip pressed={filter === value} onclick={() => (filter = value)}>{label}</Chip>
					{/each}
					<Chip pressed={false} disabled>Disabled</Chip>
				</div>
				<div class="flex flex-wrap gap-2" role="group" aria-label="Time control">
					{#each TIMES as value (value)}
						<Chip shape="box" pressed={time === value} onclick={() => (time = value)}>{value}</Chip>
					{/each}
					<Chip shape="box" pressed disabled>Disabled</Chip>
				</div>
				<SegmentedControl
					label="View"
					bind:value={view}
					options={[
						{ value: 'list', label: 'List' },
						{ value: 'boards', label: 'Boards' },
					]}
				/>
				<SegmentedControl
					label="Appearance"
					value="system"
					disabled
					options={[
						{ value: 'system', label: 'System' },
						{ value: 'light', label: 'Light' },
						{ value: 'dark', label: 'Dark' },
					]}
				/>
			</Card>

			<Card as="section" aria-label="Tags" class="flex flex-col gap-4">
				<h2 class="m-0 text-xs font-bold tracking-widest text-content-muted uppercase">Tags</h2>
				<div class="flex flex-wrap items-center gap-3">
					<Tag>Bot</Tag>
					<Tag tone="highlight">Player</Tag>
					<Tag tone="accent">You</Tag>
					<Tag tone="success">Live</Tag>
					<Tag tone="danger">Lost</Tag>
				</div>
				<p class="m-0 flex items-center gap-2 text-base font-semibold">
					cedar-3 <Tag>Bot</Tag>
					<span class="font-normal text-content-muted">a tag next to a name</span>
				</p>
			</Card>

			<Card as="section" padding="none" aria-label="A card without padding">
				<ul class="m-0 list-none divide-y divide-border p-0">
					{#each ['A card without padding', 'for a list', 'with dividers'] as row (row)}
						<li class="px-4 py-3 text-sm">{row}</li>
					{/each}
				</ul>
			</Card>
		</div>

		<h2 class="m-0 text-xs font-bold tracking-widest text-content-muted uppercase">
			Game setup · one panel, four modes
		</h2>
		<div class="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
			<Card as="section" aria-label="Setup: a catalog bot" class="flex flex-col gap-4">
				<h3 class="m-0 text-base font-bold">A catalog bot</h3>
				<GameSetupPanel
					name="preview-bot-{theme}"
					timeGroups={botTimeControlChoices()}
					bind:time={setup.bot.time}
					colorValues={SEATS}
					bind:color={setup.bot.color}
					rating="choice"
					bind:rated={setup.bot.rated}
					actionLabel="Start game"
					onstart={() => {}}
				/>
			</Card>
			<Card as="section" aria-label="Setup: a practice game" class="flex flex-col gap-4">
				<h3 class="m-0 text-base font-bold">A practice game</h3>
				<GameSetupPanel
					name="preview-practice-{theme}"
					timeGroups={PRACTICE_TIMES}
					bind:time={setup.practice.time}
					colorValues={SEATS}
					bind:color={setup.practice.color}
					rating="unrated"
					actionLabel="Start game"
					onstart={() => {}}
				/>
			</Card>
			<Card as="section" aria-label="Setup: a game by link" class="flex flex-col gap-4">
				<h3 class="m-0 text-base font-bold">A game by link</h3>
				<GameSetupPanel
					name="preview-friend-{theme}"
					timeGroups={timeControlChoices()}
					bind:time={setup.friend.time}
					colorValues={SEATS}
					bind:color={setup.friend.color}
					rating="casual"
					actionLabel="Create game"
					onstart={() => {}}
					error="Live play is unavailable right now — try again in a minute."
				/>
			</Card>
			<Card as="section" aria-label="Setup: an open table" class="flex flex-col gap-4">
				<h3 class="m-0 text-base font-bold">An open table</h3>
				<GameSetupPanel
					name="preview-table-{theme}"
					timeGroups={timeControlChoices()}
					bind:time={setup.table.time}
					rating="choice"
					bind:rated={setup.table.rated}
					actionLabel="Open a table"
					busyLabel="Opening…"
					busy
					onstart={() => {}}
				/>
			</Card>
		</div>
	</PageContainer>
</section>
