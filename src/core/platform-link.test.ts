import { describe, it, expect, vi, afterEach } from 'vitest';
import { PlatformLink } from './platform-link.js';

function makePL(): PlatformLink {
    return new PlatformLink({
        platformUrl:   'http://localhost:9999',
        nodeId:        'test-node-id',
        walletAddress: 'EQtest',
        version:       '0.0.0',
    });
}

describe('PlatformLink._processCommands gate', () => {
    it('does not emit when sig field is missing', () => {
        const pl = makePL();
        const received: unknown[] = [];
        pl.on('command', (c) => received.push(c));

        (pl as any)._processCommands([{ type: 'restart', timestamp: Date.now() }]);

        expect(received).toHaveLength(0);
    });

    it('does not emit when timestamp is stale (>60 s old)', () => {
        const pl = makePL();
        const received: unknown[] = [];
        pl.on('command', (c) => received.push(c));

        (pl as any)._processCommands([
            { type: 'restart', timestamp: Date.now() - 70_000, sig: 'anysig' },
        ]);

        expect(received).toHaveLength(0);
    });

    it('does not emit when verifyFn returns false', () => {
        const pl      = makePL();
        const received: unknown[] = [];
        pl.on('command', (c) => received.push(c));
        const alwaysFail = () => false;

        (pl as any)._processCommands(
            [{ type: 'restart', timestamp: Date.now(), sig: 'badsig' }],
            alwaysFail,
        );

        expect(received).toHaveLength(0);
    });

    it('emits the command exactly once when verifyFn returns true', () => {
        const pl      = makePL();
        const received: unknown[] = [];
        pl.on('command', (c) => received.push(c));
        const alwaysPass = () => true;

        const cmd = { type: 'restart', timestamp: Date.now(), sig: 'validsig' };
        (pl as any)._processCommands([cmd], alwaysPass);

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual(cmd);
    });

    it('passes only valid commands from a mixed batch', () => {
        const pl      = makePL();
        const received: unknown[] = [];
        pl.on('command', (c) => received.push(c));
        const selective = (cmd: { sig?: string }) => cmd.sig === 'good';
        const ts = Date.now();

        (pl as any)._processCommands([
            { type: 'a', timestamp: ts, sig: 'good' },
            { type: 'b', timestamp: ts, sig: 'bad'  },
            { type: 'c', timestamp: ts              },   // no sig — dropped before verifyFn
        ], selective);

        expect(received).toHaveLength(1);
        expect((received[0] as any).type).toBe('a');
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

// Captures every fetch the node makes while processing one polled task.
// The poll response returns `task`; Ollama + /tasks/complete calls are recorded.
async function runPollTask(task: Record<string, unknown>): Promise<Array<{ url: string; body: any }>> {
    const pl = makePL();
    (pl as any).registered = true;
    const calls: Array<{ url: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
        if (String(url).includes('/tasks/poll')) {
            return { ok: true, json: async () => ({ task }) };
        }
        calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : {} });
        return { ok: true, json: async () => ({}) };
    }));
    await (pl as any).pollAndProcess();
    return calls;
}

describe('PlatformLink.pollAndProcess sampling params', () => {
    it('forwards temperature and max_tokens from the polled task to Ollama', async () => {
        const calls = await runPollTask({
            task_id: 't-params',
            model:   'llama3.2:3b',
            prompt:  'hello',
            temperature: 0.2,
            max_tokens: 128,
        });
        const ollama = calls.find(c => c.url.includes('/v1/chat/completions'));
        expect(ollama).toBeTruthy();
        expect(ollama!.body.temperature).toBe(0.2);
        expect(ollama!.body.max_tokens).toBe(128);
    });

    it('omits sampling params when the task carries none (backend defaults apply)', async () => {
        const calls = await runPollTask({
            task_id: 't-plain',
            model:   'llama3.2:3b',
            prompt:  'hello',
        });
        const ollama = calls.find(c => c.url.includes('/v1/chat/completions'));
        expect(ollama).toBeTruthy();
        expect(ollama!.body).not.toHaveProperty('temperature');
        expect(ollama!.body).not.toHaveProperty('max_tokens');
    });

    it('still reports completion to the platform with the task id', async () => {
        const calls = await runPollTask({
            task_id: 't-report',
            model:   'llama3.2:3b',
            prompt:  'hello',
            temperature: 0.9,
        });
        const complete = calls.find(c => c.url.includes('/tasks/complete'));
        expect(complete).toBeTruthy();
        expect(complete!.body.task_id).toBe('t-report');
        expect(complete!.body.node_id).toBe('test-node-id');
    });
});
