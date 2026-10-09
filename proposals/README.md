# Upstream proposals from a live-node operator

Four change proposals found while dogfooding a live desktop node. Each branch
below is push-ready; open the compare link to review or create the PR (the
submitting account's token cannot open PRs/issues on this repository).

| Artifact | Branch / type | One-click compare |
|---|---|---|
| L1 response cache collides on shared message prefixes | `fix/l1-cache-key-collision` | https://github.com/gstdcoin/gstdbot/compare/main...NachoBusiness17:gstdbot:fix/l1-cache-key-collision |
| Task sampling params (temperature/max_tokens) dropped before inference | `fix/task-sampling-params-dropped` | https://github.com/gstdcoin/gstdbot/compare/main...NachoBusiness17:gstdbot:fix/task-sampling-params-dropped |
| Authenticate POST /api/v1/tasks/push (shared secret) | `security/task-push-auth` | https://github.com/gstdcoin/gstdbot/compare/main...NachoBusiness17:gstdbot:security/task-push-auth |
| Rate limiting behind tunnels/proxies | issue draft (no code) | see `ISSUE_rate_limit_behind_tunnels.md` |

The four markdown files in this directory are the exact PR bodies / issue body
to use when creating the artifacts upstream.
