import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppManager } from './manager.js';

describe('AppManager input validation', () => {
    let dir: string;
    let manager: AppManager;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'gstd-apps-'));
        manager = new AppManager(dir);
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it.each(['../evil', 'a; rm -rf /', 'x$(id)', '', 'UPPER', '..\\..\\win', 'unknown-app'])(
        'rejects unsafe or unknown app id %j in every lifecycle call',
        async (id) => {
            expect(await manager.install(id)).toBe(false);
            expect(await manager.uninstall(id)).toBe(false);
            expect(await manager.start(id)).toBe(false);
            expect(await manager.stop(id)).toBe(false);
        },
    );

    it('rejects non-string app ids', async () => {
        expect(await manager.install({ toString: () => 'x' } as unknown as string)).toBe(false);
    });
});
