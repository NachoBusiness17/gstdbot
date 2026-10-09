# security(gateway): optional shared-secret auth for POST /api/v1/tasks/push

Branch: `security/task-push-auth`

## Class of issue

`POST /api/v1/tasks/push` (M4 push-primary path, `src/gateway/server.ts`) is unauthenticated and drives inference on the node's local backend: any caller who can reach the port can submit a task by id with an arbitrary prompt, spend the node's GPU/compute, and steer the completion callback. Found while operating a live node during dogfooding; not exploited. Describing the class only — no weaponized repro.

## Fix (opt-in, backward compatible)

New `src/gateway/task-push-auth.ts`:

- Operators set `GSTD_TASK_PUSH_SECRET` on the node; the platform presents the same value in the `X-GSTD-Task-Push-Secret` header.
- Compare is constant-time: both sides are SHA-256-hashed to a fixed 32 bytes before `timingSafeEqual`, so secret length is not leaked through timing and unequal-length inputs cannot throw.
- Malformed headers (missing, duplicated -> array, non-string) fail closed with `401`.
- With the env var unset the endpoint behaves exactly as today, and the gateway logs a one-time startup warning that push auth is off. This keeps every existing deployment working on upgrade while giving operators the switch.

## Ops impact

Once a node sets `GSTD_TASK_PUSH_SECRET`, the platform must send the header on every push (and verification push) to that node — a coordinated rollout: nodes set the secret, platform starts sending it, then nodes can enforce. Deliberately a plain shared secret to match the single-platform push model; it can be swapped for the existing signed-command channel later.

## Tests

New `src/gateway/task-push-auth.test.ts` (6 tests): open-when-unset, exact-match accept, wrong-value reject, missing/malformed header reject, any-length inputs never throw, header name contract. Full suite 92 tests / 11 files green. The endpoint wiring itself is not unit-bootable in isolation (see the gateway server module size); a runtime check is: set `GSTD_TASK_PUSH_SECRET=test` on a node, then `curl -X POST .../api/v1/tasks/push` without the header returns 401, with `-H "X-GSTD-Task-Push-Secret: test"` behaves as before.
