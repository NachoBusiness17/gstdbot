import { afterEach, describe, it, expect, vi } from 'vitest';
import { PlatformLink } from './platform-link.js';

function makePL(): PlatformLink {
    return new PlatformLink({
        platformUrl:   'http://localhost:9999',
        nodeId:        'test-node-id',
        walletAddress: 'EQtest',
        version:       '0.0.0',
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

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

describe('PlatformLink registration retries', () => {
    it('retries transient registration failures before the heartbeat interval', async () => {
        vi.useFakeTimers();
        const pl = makePL();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('temporary failure', { status: 503 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        await (pl as any).register();
        expect((pl as any).registered).toBe(false);

        await vi.advanceTimersByTimeAsync(1000);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect((pl as any).registered).toBe(true);
        await pl.stop();
    });
});

describe('PlatformLink task delivery', () => {
    it('waits for an in-flight task poll before stopping', async () => {
        const pl = makePL();
        (pl as any).registered = true;
        let resolvePoll!: (response: Response) => void;
        vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { resolvePoll = resolve; })));

        const poll = (pl as any).runTaskPoll();
        await Promise.resolve();
        let stopped = false;
        const stop = pl.stop().then(() => { stopped = true; });
        await Promise.resolve();
        expect(stopped).toBe(false);

        resolvePoll(new Response(JSON.stringify({ task: null }), { status: 200 }));
        await Promise.all([poll, stop]);
        expect(stopped).toBe(true);
    });

    it('uses the authenticated POST poll contract and submits successful results', async () => {
        const pl = makePL();
        (pl as any).registered = true;
        pl.setCapabilitiesProvider(() => ({
            models: ['llama3.2:1b'],
            channels: [],
            apps: 0,
            memory: false,
            openclaw: false,
            dln: false,
            maxConcurrentTasks: 1,
        }));

        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                task: {
                    task_id: 'task-1',
                    type: 'inference',
                    payload: { model: 'llama3.2:1b', prompt: 'hello' },
                },
            }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                choices: [{ message: { content: 'hello back' } }],
            }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        await (pl as any).pollAndProcess();

        expect(fetchMock).toHaveBeenCalledTimes(3);
        const [pollUrl, pollOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(pollUrl).toBe('http://localhost:9999/api/v1/tasks/poll');
        expect(pollOptions.method).toBe('POST');
        expect(new Headers(pollOptions.headers).get('x-wallet-address')).toBe('EQtest');
        expect(JSON.parse(String(pollOptions.body))).toMatchObject({
            node_id: 'test-node-id',
            capabilities: ['inference', 'llama3.2:1b'],
        });

        const [completionUrl, completionOptions] = fetchMock.mock.calls[2] as [string, RequestInit];
        expect(completionUrl).toBe('http://localhost:9999/api/v1/tasks/complete');
        expect(new Headers(completionOptions.headers).get('x-wallet-address')).toBe('EQtest');
        expect(JSON.parse(String(completionOptions.body))).toEqual({
            task_id: 'task-1',
            node_id: 'test-node-id',
            result: 'hello back',
        });
    });

    it('does not submit an empty inference result as a completed task', async () => {
        const pl = makePL();
        (pl as any).registered = true;
        const taskError = vi.fn();
        pl.on('task:error', taskError);
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                task: { task_id: 'task-2', payload: { prompt: 'hello' } },
            }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                choices: [{ message: { content: '' } }],
            }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        await (pl as any).pollAndProcess();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(taskError).toHaveBeenCalledOnce();
    });
});
