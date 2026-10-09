# fix(gateway): forward task sampling params to Ollama

Branch: `fix/task-sampling-params-dropped`

## Problem

Both task-execution paths accept a task payload but build the Ollama chat-completions body from only `task_id`/`model`/`prompt`, silently dropping `temperature` and `max_tokens` the task carries:

1. `POST /api/v1/tasks/push` handler (`src/gateway/server.ts`, M4 push-primary path) — body sent to Ollama is `{ model, messages, stream: false }`.
2. `PlatformLink.pollAndProcess` (`src/core/platform-link.ts`, fallback poll path) — destructures `{ task_id, model, prompt }` from the polled task, same minimal Ollama body.

Meanwhile the swarm path (`SwarmAgent.processInference`) and the direct `/v1/ollama/completions` endpoint both honor these fields. Net effect: a submitter can set sampling params, but every node runs the task with backend defaults — e.g. a low-temperature verification request is not actually run at that temperature, and `max_tokens` caps are ignored.

### Repro (curl, push path)

```bash
# node with OLLAMA reachable; watch the request the backend receives
curl -s http://NODE:8080/api/v1/tasks/push -H 'Content-Type: application/json' \
  -d '{"task_id":"t1","prompt":"hi","model":"llama3.2:3b","temperature":0.1,"max_tokens":16}'
```

Expected: the Ollama `/v1/chat/completions` call includes `"temperature":0.1,"max_tokens":16`.
Actual: the call body is `{"model":"llama3.2:3b","messages":[...],"stream":false}` — params dropped.

## Fix

Forward `temperature` and `max_tokens` from the task payload into the backend call in both paths. `JSON.stringify` drops undefined keys, so tasks that carry no params produce an identical body to today — nothing changes for existing deployments.

## Tests

`src/core/platform-link.test.ts` gains a `pollAndProcess` suite (fetch stubbed at global scope): forwards both params when present, omits them cleanly when absent, and still reports completion with the right task/node ids. The forwarding test fails on current main and passes with the patch. The push-handler half of the change is a two-line body edit in a 4.7k-line server module that is not unit-bootable in isolation; the curl repro above covers it.
