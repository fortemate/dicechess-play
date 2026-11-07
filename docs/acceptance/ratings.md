# Versioned ratings acceptance (#124)

This suite runs the built SPA against deterministic, synthetic public API responses. The reserved
`ratings-staging.invalid` origin is intercepted locally; all other external requests are blocked.
It does not contact production, create games, apply ratings, or publish snapshots.

Build and run (POSIX shell):

```sh
VITE_PLAY_API_URL=https://ratings-staging.invalid npm run build
npx playwright test --config=playwright.ratings.config.ts
```

In PowerShell, set `$env:VITE_PLAY_API_URL='https://ratings-staging.invalid'` before the build.
Use the repository's pinned Node version. The separate config leaves the normal built-engine smoke
suite unchanged. Screenshots and failure traces are written to `test-results/ratings/`.

The fixtures cover a current competitive board whose higher raw rating ranks second, an unscheduled
bot, a saved snapshot from an earlier epoch, a sparse provisional training estimate with unknown
freshness, and unavailable history with a successful retry. Desktop and mobile assertions include
keyboard activation, no page overflow, exact snapshot permalink reload, and separate training records.
Replay fixtures verify the recorded training delta, captured anchor reference and archived speed,
plus a casual result that remains terminal with `applied=false`.
Colocated unit/component tests additionally cover nanosecond cutoff identity, equivalent ISO cutoff
formats, cancelled/stale requests, absent legacy metadata, skipped outcomes, and training polling when
`rated=false`.

The UI preserves the limits of API v0.9.0: published snapshots cover bots; competitive profile ratings
do not expose epoch, algorithm version, freshness or activity; live seat scalars do not expose their
uncertainty. Those fields remain explicitly unknown. Automatic ladder scheduling never implies
inactivity or a frozen rating, and a recent game's `rated=false` alone never implies Casual.

Selected rendered evidence is stored in `evidence/ratings/`. All names, values and epochs in these
images are synthetic.

Validation: 1,463 Vitest tests, six built-bundle smoke tests, and ten ratings acceptance tests passed.
Lint, formatting, type checks, rules-version alignment and the mandatory bundled-engine move and
continuation checks passed.

- [Current board, desktop](evidence/ratings/current-desktop.png)
- [Historical snapshot, desktop](evidence/ratings/history-desktop.png)
- [Training estimate, mobile](evidence/ratings/training-mobile.png)
- [Training result, mobile](evidence/ratings/result-mobile.png)
