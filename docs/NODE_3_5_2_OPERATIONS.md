# Node 3.5.2 integration fixes

This patch follows the 3.5.1 operational release.

- Execute model, prompt/messages, token limit and temperature from the nested public task payload, while preserving the existing top-level contract.
- Keep zero presence reward rates as zero rather than substituting a default hourly rate.
- Register the uptime reporter with the same persistent public key, current package version and node hardware/mode metadata as the task client.

Validation: all 203 node tests and the TypeScript build pass on Linux ARM64.
The platform integration tests separately verify signed task ownership, result retrieval and zero reward for unfunded tasks.
On-chain settlement and an independent multi-host mesh are separate verification gates.
