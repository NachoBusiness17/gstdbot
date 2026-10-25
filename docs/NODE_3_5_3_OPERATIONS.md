# Node 3.5.3 discovery and health

- Persistent node identity is used by the public peer API and its HTTP peer manager.
- The current node URL and its aliases are excluded from peer discovery and routing.
- A peer is live only after a valid reciprocal heartbeat; a successful HTML response is not enough.
- Unreachable configured/GitHub seed URLs now trigger fallback to the current platform registry.
- Concurrent/recursive heartbeats to the same peer are coalesced.
- Health reports locally installed models separately from the static model catalogue.

These checks support truthful single-node operation and future bootstrap of another machine.
They do not claim an independent multi-host deployment has already been tested.

Validation: all 207 node tests and the TypeScript build pass on Linux ARM64.
