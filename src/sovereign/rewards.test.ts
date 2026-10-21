import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { signEnvelope, type Envelope } from './crypto.js';
import { computeAccruals, DEFAULT_PARAMS, Ledger, simulatePayout } from './rewards.js';
import { identity, load, manifestPayload, scenario, versionOf } from './testkit.js';

const accepted = (opts = {}) => {
    const s = scenario(opts);
    return { s, board: load([s.publish, s.dataLease, s.result, s.verifyLease, s.attest]) };
};

describe('reward formula', () => {
    it('is reproducible and splits the operator pool by proven role', () => {
        const { s, board } = accepted();
        const a = computeAccruals(s.taskId, board);
        const b = computeAccruals(s.taskId, load(board.all()));
        expect(a).toEqual(b);
        const pool = 1_000_000n * 8500n / 10000n;
        const exec = a.find(x => x.role === 'execute')!;
        const verify = a.find(x => x.role === 'verify')!;
        expect(exec.node).toBe(s.worker.nodeId);
        expect(BigInt(exec.amountNano)).toBe(pool * 7000n / 10000n);
        expect(verify.node).toBe(s.verifier.nodeId);
        expect(BigInt(exec.amountNano) + BigInt(verify.amountNano)).toBeLessThanOrEqual(pool);
    });

    it('pays nothing for pending, rejected or unverified work', () => {
        const s = scenario();
        expect(computeAccruals(s.taskId, load([s.publish, s.dataLease, s.result]))).toEqual([]);
        const m = scenario({ verdict: 'mismatch' });
        expect(computeAccruals(m.taskId, load([m.publish, m.dataLease, m.result, m.verifyLease, m.attest]))).toEqual([]);
    });

    it('pays nothing for registration or capability announcements', () => {
        const id = identity();
        const ann = signEnvelope(id, 'node.announce', { roles: ['data', 'verify'], adapters: ['npm-registry'], priceNano: '0', protocol: 1 });
        expect(load([ann]).taskIds()).toEqual([]);
        expect(new Ledger(null).list()).toEqual([]);
    });

    it('does not reward a publisher that executes or verifies its own task', () => {
        const publisher = identity();
        const s = scenario();
        const publish = signEnvelope(publisher, 'task.publish', manifestPayload());
        const taskId = publish.id;
        const lease = signEnvelope(publisher, 'task.lease', { taskId, role: 'data', worker: publisher.nodeId, epoch: 1, expiresAt: Date.now() + 5000 });
        const result = signEnvelope(publisher, 'task.result', { taskId, leaseId: lease.id, version: versionOf(s.content) });
        const vLease = signEnvelope(publisher, 'task.lease', { taskId, role: 'verify', worker: s.verifier.nodeId, epoch: 1, expiresAt: Date.now() + 5000 });
        const attest = signEnvelope(s.verifier, 'task.attest', { taskId, resultId: result.id, verdict: 'match', observedHash: result.payload.version.contentHash, reason: 't' });
        const accruals = computeAccruals(taskId, load([publish, lease, result, vLease, attest]));
        expect(accruals.map(a => a.role)).toEqual(['verify']);
    });

    it('never allocates more than the operator pool, whatever the verifier count', () => {
        const s = scenario({ minVerifiers: 3, budgetNano: '999999' });
        const extra = [identity(), identity()];
        const envs: Envelope[] = [s.publish, s.dataLease, s.result, s.verifyLease, s.attest];
        for (const v of extra) {
            envs.push(signEnvelope(s.publisher, 'task.lease', { taskId: s.taskId, role: 'verify', worker: v.nodeId, epoch: 1, expiresAt: Date.now() + 5000 }));
            envs.push(signEnvelope(v, 'task.attest', { taskId: s.taskId, resultId: s.result.id, verdict: 'match', observedHash: s.result.payload.version.contentHash, reason: 't' }));
        }
        const accruals = computeAccruals(s.taskId, load(envs));
        const total = accruals.reduce((sum, a) => sum + BigInt(a.amountNano), 0n);
        expect(accruals.filter(a => a.role === 'verify')).toHaveLength(3);
        expect(total).toBeLessThanOrEqual(999_999n * 8500n / 10000n);
    });
});

describe('ledger', () => {
    it('cannot accrue the same confirmed event twice', () => {
        const { s, board } = accepted();
        const ledger = new Ledger(null);
        const first = ledger.accrueTask(s.taskId, board);
        const second = ledger.accrueTask(s.taskId, board);
        expect(first.applied).toHaveLength(2);
        expect(second.applied).toHaveLength(0);
        expect(second.skipped.every(x => x.reason === 'duplicate accrual')).toBe(true);
        expect(ledger.list()).toHaveLength(2);
    });

    it('does not accrue a second result for an already-accrued task', () => {
        const { s, board } = accepted();
        const ledger = new Ledger(null);
        ledger.accrueTask(s.taskId, board);
        const forged = { ...computeAccruals(s.taskId, board)[0], resultId: 'f'.repeat(64), accrualId: 'e'.repeat(64) };
        expect(ledger.apply([forged]).skipped[0].reason).toBe('task already accrued for a different result');
    });

    it('survives restart without re-accruing', () => {
        const file = join(mkdtempSync(join(tmpdir(), 'sov-ledger-')), 'ledger.jsonl');
        const { s, board } = accepted();
        new Ledger(file).accrueTask(s.taskId, board);
        const reopened = new Ledger(file);
        expect(reopened.accrueTask(s.taskId, board).applied).toHaveLength(0);
        expect(reopened.list()).toHaveLength(2);
    });

    it('enforces the subsidy budget cap and leaves commercial tasks to their own budget', () => {
        const sub = accepted({ funding: 'subsidized', budgetNano: '1000000' });
        const capped = new Ledger(null, { ...DEFAULT_PARAMS, subsidyBudgetNano: 100n });
        expect(capped.accrueTask(sub.s.taskId, sub.board).applied).toHaveLength(0);
        const funded = new Ledger(null, { ...DEFAULT_PARAMS, subsidyBudgetNano: 10_000_000n });
        expect(funded.accrueTask(sub.s.taskId, sub.board).applied.length).toBeGreaterThan(0);
        expect(funded.subsidyRemaining()).toBeLessThan(10_000_000n);
        const com = accepted();
        expect(new Ledger(null).accrueTask(com.s.taskId, com.board).applied.length).toBeGreaterThan(0);
    });

    it('simulates payouts without executing any transfer', () => {
        const { s, board } = accepted();
        const ledger = new Ledger(null);
        ledger.accrueTask(s.taskId, board);
        const sim = simulatePayout(ledger);
        expect(sim.realTransfersExecuted).toBe(0);
        expect(Object.keys(sim.perNode).sort()).toEqual([s.verifier.nodeId, s.worker.nodeId].sort());
    });
});
