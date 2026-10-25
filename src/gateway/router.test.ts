import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/demand-tracker.js', () => ({ demandTracker: { record: vi.fn() } }));
import { NeuralRouter } from './router.js';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const response = (body: unknown, status=200) => new Response(JSON.stringify(body), {status});
describe('NeuralRouter canonical task queue', () => {
  it('submits the current payload contract and reads the accepted public result', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/network/stats')) return response({ active_workers: 1 });
      if (url.endsWith('/tasks/submit')) return response({ task_id: 'task/1' });
      if (url.includes('/tasks/result?')) return response({ready:true,result:'real answer',node_id:'worker'});
      throw Error('Unexpected endpoint: '+url);
    });
    vi.stubGlobal('fetch',request);
    const router = new NeuralRouter('',false);
    const messages = [{role:'user' as const,content:'hello'}];
    const pending = router.route('llama3.2:3b', messages, undefined, {maxTokens:12,temperature:0});
    await vi.advanceTimersByTimeAsync(2001);
    expect(await pending).toMatchObject({content:'real answer',nodeId:'worker',tier:'gstd'});
    expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({
      type:'inference',payload:{model:'llama3.2:3b',prompt:JSON.stringify(messages),max_tokens:12,temperature:0,telegram_id:0},
    });
    expect(request.mock.calls[2][0]).toContain('/tasks/result?task_id=task%2F1');
  });
  it('does not reuse an answer across different conversation context or models', async () => {
    const request = vi.fn().mockImplementation(async (url: string) =>
      url.endsWith('/network/stats') ? response({active_workers:0}) : response({
        model:'llama3.2:3b',choices:[{message:{content:'computed answer'}}],usage:{},
      }));
    vi.stubGlobal('fetch',request);
    const router = new NeuralRouter('',false);
    const first = [{role:'system' as const,content:'context one'},{role:'user' as const,content:'same question'}];
    const second = [{role:'system' as const,content:'context two'},{role:'user' as const,content:'same question'}];
    await router.route('llama3.2:3b',first);
    expect((await router.route('llama3.2:3b',first)).tier).toBe('cache');
    expect((await router.route('llama3.2:3b',second)).tier).toBe('gstd');
    expect((await router.route('other:model',second)).tier).toBe('gstd');
    expect(request).toHaveBeenCalledTimes(6);
  });
  it('preserves the requested generation limits on local fallback', async () => {
    const request = vi.fn().mockResolvedValueOnce(response({active_workers:0})).mockResolvedValueOnce(response({
      choices:[{message:{content:'short answer'}}],usage:{},
    }));
    vi.stubGlobal('fetch',request);
    await new NeuralRouter('',false).route('llama3.2:3b',[{role:'user',content:'hello'}],undefined,{maxTokens:9,temperature:0});
    expect(JSON.parse(request.mock.calls[1][1].body)).toMatchObject({max_tokens:9,temperature:0});
  });
});
