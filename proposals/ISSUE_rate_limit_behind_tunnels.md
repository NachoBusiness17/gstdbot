# Rate limiting behind tunnels/reverse proxies: all traffic shares one per-IP bucket

## Observed

Operating a node behind a cloudflared tunnel (the documented `tunnel.sh` deployment style), the global rate limiter throttles legitimate users to an effective throughput of roughly **1 request per 10-15 seconds** during ordinary internet background scanning. Scanners alone exhaust the shared bucket; real users then receive `429 Too many requests` continuously.

## Cause

`src/gateway/server.ts` (global middleware, ~line 452):

```ts
const ip = req.ip || req.socket.remoteAddress || 'unknown';
```

with `RATE_LIMIT = 120` per `RATE_WINDOW = 60000` ms, keyed strictly on that `ip`.

Express only honors `X-Forwarded-For` when `app.set('trust proxy', ...)` is configured, and the gateway never sets it. Behind any tunnel or reverse proxy (cloudflared, nginx, Caddy), every inbound request arrives on the proxy's loopback connection, so **every visitor and every scanner shares the same single 120 req/min bucket** keyed to the proxy's local address.

## Proposals

1. **Opt-in proxy trust.** Add an env flag, e.g. `TRUST_PROXY=1`, that sets `app.set('trust proxy', 1)` so exactly the first hop's `X-Forwarded-For` is honored (cloudflared stamps the real client IP there). This must stay opt-in: enabling it while directly exposed would let clients spoof the header and mint a fresh bucket per request.
2. **Identity-based buckets for machine traffic.** The platform push path (`POST /api/v1/tasks/push`) and similar machine endpoints could be limited per authenticated node/platform identity rather than per IP, so platform pushes never compete with (or get starved by) anonymous web traffic.
3. **Considerations.**
   - Exempt or widen `/health` (or give it its own bucket) so monitoring does not consume the user budget.
   - Add `Retry-After` to the 429 response so well-behaved clients back off correctly.
   - Keep the cleanup interval in mind: with proxy trust on, cardinality grows with distinct client IPs.

## Environment

- Node deployed behind cloudflared per `tunnel.sh`
- Direct-exposure deployments (no proxy) are unaffected: `req.ip` is already the client address there.
