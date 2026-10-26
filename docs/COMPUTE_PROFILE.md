# GSTD compute profile

A node is an AI compute worker, not a financial custodian or a general-purpose remote administration panel.

## Supported
- Local Ollama inference and an OpenAI-compatible HTTP endpoint.
- Signed node identity, registration, bounded task polling, result delivery and platform-confirmed earnings.
- P2P discovery and the existing verified-task core. Its offline/quorum tests are software simulations; they are not evidence of a multi-host production network or real GSTD settlement.
- Operator-authenticated diagnostics, model management and code update with rollback.
- An external, watch-only payout address. New nodes do not create a token spending seed.

## Retired or quarantined
The compute runtime does not start experimental training, arbitrary container compute, storage markets, traffic relay, NaaS, remote host control, node-local Telegram bots or the uptime reward daemon. Their archived sources are retained for reference; their HTTP surfaces return 410. Bot credentials belong only on the platform. Host reset, SSH/OS management, bridge and app installation endpoints are outside the node profile.

Non-core APIs require a dashboard operator session, including usage records and events. Being behind a localhost tunnel does not authenticate a caller. WebSockets require operator authentication and have connection/payload bounds. This release limits JSON bodies to 512 KiB. Source tests cover denied routes and private routing.

## Privacy
Direct node requests default to local inference. If it cannot answer, it does not upload the prompt. Explicit privacy: network permits forwarding to the task network/peers. Cross-request response caching is off unless explicitly enabled by an internal caller. Collective memory is off by default; public knowledge publication additionally requires GSTD_SHARE_KNOWLEDGE=true. Do not use this flag for private user conversations.

A selected executor necessarily processes the plaintext question. We do not claim encrypted computation, a trusted execution environment, or immunity to a malicious operator. Platform payments retain response text for at most ten minutes for retry; the owner can delete it sooner. Financial receipts retain hashes and amounts.

## Real earnings
Only the platform's funded, accepted work creates GSTD claims. Local fee estimates and usage counters do not mint balances. The split is 85/10/5, and moving earned credits into spendable credits charges no additional fee. Earned credits can pay for another node or request an owner-signed mainnet withdrawal in https://app.gstdtoken.com/payments.

No hourly reward, uptime multiplier, staking APY or guaranteed profitability is offered. Operators must account for hardware, electricity, bandwidth, token liquidity and demand. The current production setup has one physical node and centralized platform/custody dependencies; it is not unstoppable or fully decentralized. See CENTRAL_DEPENDENCIES.md.

## Installation and control
Use the canonical install.sh from this repository. Configure GSTD_WALLET_ADDRESS with an external wallet you control, then log in to the node's PIN-protected dashboard. Keep signing keys off the node. Existing wallet files are preserved, never automatically wiped.

Code pushes run CI only. Container publication requires an explicit workflow dispatch. Update a production node only after CI passes; rollback remains available.

Automatic source updates are off by default; GSTD_AUTO_UPDATE=true is an explicit operator opt-in. The HTTP inference path permits one active request by default (configurable up to four). Operator PINs use salted scrypt; a successful legacy login migrates its digest without changing the PIN.
