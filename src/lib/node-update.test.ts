import { describe, expect, it, vi } from 'vitest';
import { fastForwardNodeUpdate, rollbackNodeUpdate, type GitRunner } from './node-update.js';

const currentHash = 'a'.repeat(40);
const targetHash = 'b'.repeat(40);

describe('fastForwardNodeUpdate', () => {
    it('updates a clean checkout only by fast-forward', () => {
        const run = vi.fn<GitRunner>((args) => {
            if (args[0] === 'rev-parse' && args[1] === 'HEAD') return currentHash;
            if (args[0] === 'rev-parse' && args[1] === '--is-shallow-repository') return 'false';
            if (args[0] === 'rev-parse' && args[1] === 'FETCH_HEAD') return targetHash;
            return '';
        });

        expect(fastForwardNodeUpdate('node-dir', 'main', run)).toEqual({
            previousHash: currentHash,
            updatedHash: targetHash,
            output: '',
        });
        expect(run).toHaveBeenCalledWith(['merge', '--ff-only', targetHash], 'node-dir');
        expect(run).not.toHaveBeenCalledWith(['reset', '--hard', expect.anything()], 'node-dir');
    });

    it('refuses to update when tracked local changes exist', () => {
        const run = vi.fn<GitRunner>(() => ' M src/local-change.ts');

        expect(() => fastForwardNodeUpdate('node-dir', 'main', run))
            .toThrow('Tracked local changes detected');
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('refuses a divergent remote history', () => {
        const run = vi.fn<GitRunner>((args) => {
            if (args[0] === 'status') return '';
            if (args[0] === 'rev-parse' && args[1] === 'HEAD') return currentHash;
            if (args[0] === 'rev-parse' && args[1] === '--is-shallow-repository') return 'false';
            if (args[0] === 'rev-parse' && args[1] === 'FETCH_HEAD') return targetHash;
            if (args[0] === 'merge-base') throw Object.assign(new Error('not ancestor'), { status: 1 });
            return '';
        });

        expect(() => fastForwardNodeUpdate('node-dir', 'main', run))
            .toThrow('Local HEAD diverges from origin/main');
        expect(run).not.toHaveBeenCalledWith(['merge', '--ff-only', targetHash], 'node-dir');
    });
});

describe('rollbackNodeUpdate', () => {
    it('uses a non-destructive merge reset to restore the snapshot', () => {
        const run = vi.fn<GitRunner>(() => '');

        rollbackNodeUpdate('node-dir', currentHash, run);

        expect(run).toHaveBeenCalledWith(['reset', '--merge', currentHash], 'node-dir');
    });

    it('rejects invalid rollback refs', () => {
        const run = vi.fn<GitRunner>(() => '');

        expect(() => rollbackNodeUpdate('node-dir', 'HEAD; rm -rf /', run))
            .toThrow('Invalid rollback commit');
        expect(run).not.toHaveBeenCalled();
    });
});
