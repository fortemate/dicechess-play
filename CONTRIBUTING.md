# Contributing

## Contributor License Agreement

Before your first pull request can be accepted, you must sign the project's
[Contributor License Agreement](CLA.md). Signing is self-service: append yourself to the `signatures`
array in [`.github/cla-signatures.json`](.github/cla-signatures.json) in the same pull request
(see [CLA.md](CLA.md), "How to Sign"). The `CI: CLA` status check fails until the
entry is present. Repository-owner and bot pull requests are exempt.

Why a CLA: the project follows an open-core model. The public repositories are
AGPL-3.0, and the project owner retains the ability to combine the code with
closed-source modules and to offer it under additional licenses. The CLA preserves
that option while your contribution always remains available under AGPL-3.0 — and
you keep the copyright to your work. A plain DCO (`Signed-off-by`) would not grant
relicensing rights, which is why a CLA is used instead.

## Development Workflow

See the [README](README.md) for local setup. Branch naming follows the shared Dice
Chess convention: `<type>/<short-desc>` with type one of `task` / `feat` / `bug`
(issue-driven) or `refactor` / `chore` / `docs` / `ci` / `test` / `perf` (issueless).
Run `npm run lint`, `npm run check`, and `npm run test` before opening a PR.

## Internationalisation (i18n)

**The site is English-only and ships no translations.** What exists is the _capability_:
[Paraglide JS](https://paraglidejs.com) is wired in, so a locale can be added later as a
catalog-only change instead of a codebase-wide refactor. Do not add a non-English catalog
without agreeing it first — the UI copy is still changing, and translating it now would be
work thrown away.

### Where things live

| Path                           | What                                                      |
| ------------------------------ | --------------------------------------------------------- |
| `messages/<namespace>.en.json` | Hand-edited catalogs, one file per surface                |
| `project.inlang/settings.json` | Locale list and the `pathPattern` namespace list          |
| `src/lib/paraglide/`           | **Generated** — compiler output, gitignored, never edited |

Catalogs are split per surface on purpose: parallel migration PRs each touch their own JSON
file and therefore never conflict. Pick the namespace matching the surface you are migrating
(`game`, `nav`, `lobby`, `games`, `bots`, `profile`, `leaderboard`, `rules`, or `common` for
components shared across surfaces). `messages/en.json` is the catch-all and must stay **last**
in `pathPattern` — inlang tooling writes exported messages back to the last entry.

### Migrating a component

Import `m` and replace each user-facing string. `src/components/DicePanel.svelte` and
`src/components/WdlSummaryCard.svelte` are the reference implementations.

```svelte
<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	let { total = 0 }: { total?: number } = $props();
</script>

<!-- plain message -->
<h2>{m.common_win_rate()}</h2>

<!-- interpolation: ONE object argument, keys match the {placeholders} in the JSON -->
<span>{m.common_total_games({ total })}</span>

<!-- a user-facing ATTRIBUTE takes a mustache, not a quoted string -->
<div aria-label={m.game_dice_region()}></div>
```

```json
{
	"$schema": "https://inlang.com/schema/inlang-message-format",
	"common_win_rate": "win rate",
	"common_total_games": "{total} games"
}
```

Rules, in the order they get broken:

1. **Attributes**: `title="Foo"` becomes `title={m.key()}`. Quotes become braces. The
   user-facing ones are `alt`, `title`, `placeholder`, and the `aria-*` text attributes.
2. **Interpolation**: one object argument; its keys must match the `{name}` placeholders.
3. **Key naming**: `<namespace>_<what>`, snake_case, a valid JS identifier.
4. **Never reword the copy while migrating.** Move the string verbatim. Copy changes are a
   product decision and belong in their own PR.
5. **Text split by an interpolation is one message, not two.** `<p>You have {n} moves left.</p>`
   becomes a single `"You have {n} moves left."`, never `"You have"` + `"moves left."` —
   fragments cannot be reordered by a translation and often cannot even be translated.
6. **Messages containing markup** (`<a>`, `<b>`) must not use `@html`. They need
   `@inlang/paraglide-js-svelte`'s `ParaglideMessage` with snippets, which is not installed
   yet — leave those strings alone and raise it on the epic.

### Adding a namespace

Add the file `messages/<name>.en.json` and one `pathPattern` entry in
`project.inlang/settings.json`, **above** the `./messages/{locale}.json` catch-all.

### Adding a locale later

- `project.inlang/settings.json` — add the code to `locales`.
- `messages/*.<code>.json` — new files, content only.
- A language switcher — none exists yet; it should read the locale list from
  `$lib/paraglide/runtime.js` rather than hardcoding one.
- `src/app.html` — an inline `<html lang>` bootstrap (mirroring the existing theme script) plus
  an `$effect` in the root layout, so first paint has the right `lang`.

**No component files change.** That is the whole point of doing this now.

### Two constraints worth knowing before you hit them

- **No `localStorage` strategy.** Paraglide's generated runtime calls `localStorage.getItem`
  bare, guarded only by `typeof window === 'undefined'`. Any context where `window` exists but
  storage does not — privacy modes, sandboxed iframes, and this repo's own vitest environment —
  throws on the _first_ message call and takes the page with it. The strategy is
  `['preferredLanguage', 'baseLocale']`; persisting an explicit user choice is a problem to solve
  properly when the switcher is built. See the comment in `vite.config.ts`.
- **The prerendered `/rules` page can only ever emit the base locale.** During prerender
  `isServer` is true, so every browser-side strategy is skipped and the chain falls to
  `baseLocale`. A crawlable non-English `/rules` later needs the `url` strategy, locale-prefixed
  `urlPatterns`, per-locale prerender `entries()`, and `paths: { relative: false }` in
  `svelte.config.js`. Not needed now; not free later.
