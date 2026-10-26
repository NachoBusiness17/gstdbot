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
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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
    it('uses authenticated GET without a body when legacy Worker polling is configured', async () => {
        vi.stubEnv('GSTD_TASK_POLL_METHOD', 'GET');
        const pl = makePL();
        (pl as any).registered = true;
        (pl as any).nodeId = 'node /?&';
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ task: null }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        await (pl as any).pollAndProcess();
        const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://localhost:9999/api/v1/tasks/poll?node_id=node%20%2F%3F%26');
        expect(options.method).toBe('GET');
        expect(options.body).toBeUndefined();
        expect(new Headers(options.headers).get('x-wallet-address')).toBe('EQtest');
    });

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
                    payload: { model: 'llama3.2:1b', prompt: 'hello', max_tokens: 12, temperature: 0 },
                },
            }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                message: { content: 'hello back' },
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

        const [, inferenceOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
        expect(JSON.parse(String(inferenceOptions.body))).toMatchObject({
            model: 'llama3.2:1b', keep_alive: -1, options: {num_ctx: 2048, num_predict: 12, temperature: 0},
            messages: [{ role: 'user', content: 'hello' }],
        });
        const [completionUrl, completionOptions] = fetchMock.mock.calls[2] as [string, RequestInit];
        expect(completionUrl).toBe('http://localhost:9999/api/v1/tasks/complete');
        expect(new Headers(completionOptions.headers).get('x-wallet-address')).toBe('EQtest');
        expect(JSON.parse(String(completionOptions.body))).toEqual({
            task_id: 'task-1',
            node_id: 'test-node-id',
            result: 'hello back',
            model: 'llama3.2:1b',
            latency_ms: expect.any(Number),
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
                message: { content: '' },
            }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        await (pl as any).pollAndProcess();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(taskError).toHaveBeenCalledOnce();
    });
});

describe('PlatformLink request budget', () => {
    it('polls idle work once per 30 seconds and wakes immediately for a real chat', async () => {
        vi.useFakeTimers();
        const pl = makePL();
        (pl as any).registered = true;
        const request = vi.fn(async () => new Response(JSON.stringify({task:null})));
        vi.stubGlobal('fetch', request);
        pl.startTaskLoop();
        await vi.advanceTimersByTimeAsync(29_000);
        expect(request).not.toHaveBeenCalled();
        await pl.wakeTaskLoop();
        expect(request).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(29_000);
        expect(request).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(request).toHaveBeenCalledTimes(2);
        await pl.stop();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(request).toHaveBeenCalledTimes(2);
    });

    it('honors Retry-After and does not let chat wakeups bypass a quota backoff', async () => {
        vi.useFakeTimers();
        const pl = makePL();
        (pl as any).registered = true;
        const request = vi.fn()
            .mockResolvedValueOnce(new Response('', {status:429, headers:{'retry-after':'120'}}))
            .mockImplementation(async () => new Response(JSON.stringify({task:null})));
        vi.stubGlobal('fetch', request);
        pl.startTaskLoop();
        await pl.wakeTaskLoop();
        await pl.wakeTaskLoop();
        await vi.advanceTimersByTimeAsync(119_000);
        expect(request).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(request).toHaveBeenCalledTimes(2);
        await pl.stop();
    });
});

describe('PlatformLink local compute failure', () => {
    it('keeps quota backoff separate from a failed model so a new chat can wake the worker', async () => {
        vi.useFakeTimers();
        const pl = makePL();
        (pl as any).registered = true;
        const request = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({task:{task_id:'failed-task',payload:{prompt:'hello'}}})))
            .mockResolvedValueOnce(new Response('model failed',{status:500}))
            .mockResolvedValueOnce(new Response(JSON.stringify({task:null})));
        vi.stubGlobal('fetch',request);
        pl.startTaskLoop();
        await pl.wakeTaskLoop();
        expect((pl as any).taskBackoffUntil).toBe(0);
        await pl.wakeTaskLoop();
        expect(request).toHaveBeenCalledTimes(3);
        await pl.stop();
    });
});
