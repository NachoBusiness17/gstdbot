# GSTD compute node

Share AI compute, earn GSTD from funded accepted work, and use those credits on other nodes.

**Current production profile:** local inference, authenticated operator controls, signed worker identity and 85/10/5 platform accounting. Withdrawals use the external custody wallet through TonConnect; nodes hold no treasury keys. There is no guaranteed yield.

- [Supported features and security boundaries](docs/COMPUTE_PROFILE.md)
- [Platform payments](https://app.gstdtoken.com/payments)
- [Deployment and central dependencies](CENTRAL_DEPENDENCIES.md)

```bash
curl -fsSL https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh | bash
```

Set your externally controlled payout address with GSTD_WALLET_ADDRESS. Keep the dashboard PIN and setup token private. Default direct requests remain local; choose network routing explicitly when you want to share a prompt with other executors.


Historical design notes are archived in docs/ARCHIVED_NODE_README.md. They do not describe enabled production features.

## Operator dashboard

Manage local models, view CPU/RAM and compute slots, configure the first public payout address and update the node manually in the PIN-protected dashboard. [English and Russian operator guide](docs/OPERATOR_PANEL.md). Existing payout-address migration remains unavailable; the panel explains this limitation.
