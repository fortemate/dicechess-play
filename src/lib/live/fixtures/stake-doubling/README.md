# Stake-doubling wire fixtures

Content-identical copies of the canonical play-api contract examples under
`dicechess-play-api/docs/public/contracts/stake-doubling/v1/examples/` (ADR-0019, reserved contract).
They are test input only: the live client renders staked games strictly from what the server sends,
so these files are the authority on the shapes of `PublicGameState.doubling`, `DoubleAccepted` and
`DoubleDeclined`. Refresh them from play-api when the contract changes; never edit them here.
