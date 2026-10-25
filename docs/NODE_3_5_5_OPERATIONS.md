# Node 3.5.5 operational changes

The public OpenAI-compatible gateway now uses the canonical task API: inference payload submission and accepted result retrieval by task_id. The task worker executes locally in Ollama, so processing a queued task does not recurse through the gateway. Generation limits and temperature reach both queued execution and local fallback.

Cache keys include the model, complete message history and generation options. Identical last questions in different conversation contexts no longer share an answer.

Three router regressions cover the queue contract, context/model cache separation and local generation limits. The targeted router/PlatformLink suite passes 13 tests, and the ARM64 TypeScript build passes. CI runs the complete suite.

The node remains a single physical worker. An unfunded accepted task earns zero GSTD. Result acceptance and ledger accounting do not demonstrate on-chain settlement. The current public tunnel is temporary; discovery should use the persistent signed node identity in the canonical registry.
