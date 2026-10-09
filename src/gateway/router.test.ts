import { describe, it, expect } from 'vitest';
import { NeuralRouter, ChatMessage } from './router.js';

function userMsg(content: string): ChatMessage[] {
    return [{ role: 'user', content }];
}

function routerCache() {
    const router = new NeuralRouter('', false);
    return (router as any).cache;
}

describe('L1 response cache key (ResponseCache.makeKey)', () => {
    it('distinguishes prompts that share a >200-char common prefix', () => {
        const cache = routerCache();
        const prefix = 'please analyse the following contract carefully: '.repeat(8); // > 200 chars
        const keyOne = cache.makeKey(userMsg(prefix + 'QUESTION ONE'), 'llama3.2:3b');
        const keyTwo = cache.makeKey(userMsg(prefix + 'QUESTION TWO'), 'llama3.2:3b');
        expect(keyOne).not.toBe(keyTwo);
    });

    it('distinguishes the same prompt across models', () => {
        const cache = routerCache();
        const msgs = userMsg('what is the block height of TON?');
        expect(cache.makeKey(msgs, 'llama3.2:3b')).not.toBe(cache.makeKey(msgs, 'llama3.1:8b'));
    });

    it('is stable for identical prompt + model', () => {
        const cache = routerCache();
        const msgs = userMsg('what is the block height of TON?');
        expect(cache.makeKey(msgs, 'llama3.2:3b')).toBe(cache.makeKey(msgs, 'llama3.2:3b'));
    });

    it('keeps the case/whitespace normalisation (same prompt in different casing hits)', () => {
        const cache = routerCache();
        expect(cache.makeKey(userMsg('  Hello World  '), 'llama3.2:3b'))
            .toBe(cache.makeKey(userMsg('hello world'), 'llama3.2:3b'));
    });

    it('does not serve a sibling answer when prompts share a long prefix (regression)', () => {
        const cache = routerCache();
        const prefix = 'x'.repeat(400);
        cache.set(cache.makeKey(userMsg(prefix + ' ONE'), 'llama3.2:3b'), 'answer-one', 'llama3.2:3b');

        const sibling = cache.get(cache.makeKey(userMsg(prefix + ' TWO'), 'llama3.2:3b'));
        expect(sibling).toBeNull();

        const original = cache.get(cache.makeKey(userMsg(prefix + ' ONE'), 'llama3.2:3b'));
        expect(original?.content).toBe('answer-one');
    });

    it('does not serve an answer cached for a different model (regression)', () => {
        const cache = routerCache();
        const msgs = userMsg('same question, different engine');
        cache.set(cache.makeKey(msgs, 'llama3.2:3b'), 'small-model-answer', 'llama3.2:3b');

        expect(cache.get(cache.makeKey(msgs, 'qwen2.5:7b'))).toBeNull();
        expect(cache.get(cache.makeKey(msgs, 'llama3.2:3b'))?.content).toBe('small-model-answer');
    });
});
