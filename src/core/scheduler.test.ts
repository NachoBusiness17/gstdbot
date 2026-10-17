import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scheduler } from './scheduler.js';

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('Scheduler', () => {
    it('does not run the same scheduled task concurrently', async () => {
        const scheduler = new Scheduler();
        let releaseFirstRun!: () => void;
        const task = vi.fn()
            .mockImplementationOnce(() => new Promise<void>(resolve => { releaseFirstRun = resolve; }))
            .mockResolvedValue(undefined);
        scheduler.register('slow-task', {
            name: 'Slow task',
            interval: 1000,
            category: 'system',
            fn: task,
        });

        const firstRun = scheduler.runNow('slow-task');
        await Promise.resolve();
        await scheduler.runNow('slow-task');
        expect(task).toHaveBeenCalledOnce();

        releaseFirstRun();
        await firstRun;
        await scheduler.runNow('slow-task');
        expect(task).toHaveBeenCalledTimes(2);
        scheduler.stop();
    });

    it('waits for an active task to finish during shutdown', async () => {
        const scheduler = new Scheduler();
        let releaseTask!: () => void;
        scheduler.register('active-task', {
            name: 'Active task',
            interval: 1000,
            category: 'system',
            fn: () => new Promise<void>(resolve => { releaseTask = resolve; }),
        });

        const run = scheduler.runNow('active-task');
        await Promise.resolve();
        let stopped = false;
        const stop = scheduler.stop().then(() => { stopped = true; });
        await Promise.resolve();
        expect(stopped).toBe(false);

        releaseTask();
        await Promise.all([run, stop]);
        expect(stopped).toBe(true);
    });

    it('clears staggered and recurring timers when stopped', async () => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const scheduler = new Scheduler();
        const task = vi.fn().mockResolvedValue(undefined);
        scheduler.register('task', {
            name: 'Task',
            interval: 1000,
            category: 'system',
            fn: task,
        });

        scheduler.startAll();
        scheduler.stop();
        await vi.advanceTimersByTimeAsync(10_000);

        expect(task).not.toHaveBeenCalled();
    });
});
