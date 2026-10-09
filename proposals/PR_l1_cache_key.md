## Problem

The L1 response cache keys entries on `makeKey()` in `src/gateway/router.ts`:

```ts
makeKey(messages: ChatMessage[]) {
    const last = messages.filter(m => m.role === 'user').pop();
    return (last?.content?.trim().toLowerCase().slice(0, 200)) || '';
}
```

Two collision classes:

1. **Truncation.** Only the first 200 chars of the last user message are keyed. Distinct prompts that share a long common prefix (long pasted configs, contracts, documents, "here is my code, now question N...") map to the same key.
2. **No model dimension.** The key ignores the model entirely, so the same prompt asked of two different models returns whichever answer happened to be cached first (with the wrong `model` attached).

Observed while operating a live node: three distinct prompts sharing a long common prefix were served one sibling's cached answer within the 5-minute TTL.

### Repro

```js
// src/gateway/router.ts (current main)
const cache = new ResponseCache();            // via a NeuralRouter instance
const prefix = 'x'.repeat(400);
cache.set(cache.makeKey([{ role: 'user', content: prefix + ' ONE' }]), 'answer-one', 'llama3.2:3b');
cache.get(cache.makeKey([{ role: 'user', content: prefix + ' TWO' }]));
// expected: null    actual: { content: 'answer-one', model: 'llama3.2:3b' }
```

## Fix

Key the cache on `sha256(model + '\0' + fullNormalizedMessage)`:

- full message text (no 200-char truncation)
- resolved Ollama model id included (the backend call that would actually be made)
- trim + lowercase normalization preserved, so genuine repeat hits behave exactly as before

Model resolution moves above the L1 lookup in `routeInternal` so the key can include it.

## Tests

New `src/gateway/router.test.ts` (6 tests). On current main, 4 fail (both collision classes + both regression cases); with this patch all 6 pass. Full suite: 92 tests / 11 files green.
