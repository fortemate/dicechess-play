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
