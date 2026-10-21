import { describe, expect, it } from 'vitest';
import { canonicalize, sha256Hex, signEnvelope, verifyEnvelope, type Envelope } from './crypto.js';
import { Board, verifyProofBundle } from './board.js';
import { identity, load, scenario, versionOf } from './testkit.js';

describe('envelopes', () => {
    it('accepts a valid signature and rejects tampering', () => {
        const id = identity();
        const env = signEnvelope(id, 'node.announce', { roles: ['verify'], adapters: [], priceNano: '0', protocol: 1 });
        expect(verifyEnvelope(env).ok).toBe(true);
        expect(verifyEnvelope({ ...env, payload: { ...env.payload, priceNano: '1' } }).ok).toBe(false);
        expect(verifyEnvelope({ ...env, signer: identity().nodeId }).ok).toBe(false);
        expect(verifyEnvelope({ ...env, sig: '0'.repeat(128) }).ok).toBe(false);
    });

    it('rejects far-future timestamps', () => {
        const env = signEnvelope(identity(), 'node.announce', {}, Date.now() + 3_600_000);
        expect(verifyEnvelope(env)).toEqual({ ok: false, reason: 'timestamp too far in the future' });
    });

    it('canonicalization is key-order independent', () => {
        expect(canonicalize({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonicalize({ a: [2, { c: 2, d: 1 }], b: 1 }));
    });
});

describe('board', () => {
    it('accepts a task only after an independent verifier reproduces the hash', () => {
        const s = scenario();
        const withoutAttest = load([s.publish, s.dataLease, s.result, s.verifyLease]);
        expect(withoutAttest.evaluate(s.taskId).status).toBe('awaiting-verification');
        const full = load([s.publish, s.dataLease, s.result, s.verifyLease, s.attest]);
        const ev = full.evaluate(s.taskId);
        expect(ev.status).toBe('accepted');
        expect(ev.worker).toBe(s.worker.nodeId);
        expect(full.history('npm:left-pad')).toHaveLength(1);
    });

    it('gives the same answer for any delivery order', () => {
        const s = scenario();
        const all = [s.publish, s.dataLease, s.result, s.verifyLease, s.attest];
        const reference = JSON.stringify(load(all).evaluate(s.taskId));
        for (let i = 0; i < 20; i++) {
            const shuffled = [...all].sort(() => Math.random() - 0.5);
            expect(JSON.stringify(load(shuffled).evaluate(s.taskId))).toBe(reference);
        }
    });

    it('ignores results from a node that holds no lease (two executors claiming one task)', () => {
        const s = scenario();
        const intruder = identity();
        const stolen = signEnvelope(intruder, 'task.result', { taskId: s.taskId, leaseId: s.dataLease.id, version: versionOf(s.content) });
        const b = load([s.publish, s.dataLease, stolen]);
        expect(b.results(s.taskId)).toHaveLength(0);
        expect(b.evaluate(s.taskId).status).toBe('leased');
    });

    it('ignores leases not signed by the publisher', () => {
        const s = scenario();
        const rogue = identity();
        const fake = signEnvelope(rogue, 'task.lease', { taskId: s.taskId, role: 'data', worker: rogue.nodeId, epoch: 1, expiresAt: Date.now() + 5000 });
        expect(load([s.publish, fake]).leases(s.taskId)).toHaveLength(0);
    });

    it('rejects a result whose content does not match its hash', () => {
        const s = scenario();
        const bad = signEnvelope(s.worker, 'task.result', { taskId: s.taskId, leaseId: s.dataLease.id, version: { ...versionOf(s.content), content: { forged: true } } });
        expect(new Board().ingest(bad)).toEqual({ added: false, reason: 'content hash mismatch' });
    });

    it('does not let a worker verify itself', () => {
        const s = scenario();
        const selfLease = signEnvelope(s.publisher, 'task.lease', { taskId: s.taskId, role: 'verify', worker: s.worker.nodeId, epoch: 1, expiresAt: Date.now() + 5000 });
        const selfAttest = signEnvelope(s.worker, 'task.attest', { taskId: s.taskId, resultId: s.result.id, verdict: 'match', observedHash: s.result.payload.version.contentHash, reason: 'self' });
        expect(load([s.publish, s.dataLease, s.result, selfLease, selfAttest]).evaluate(s.taskId).status).toBe('awaiting-verification');
    });

    it('counts one vote per verifier and requires the configured quorum', () => {
        const s = scenario({ minVerifiers: 2 });
        const again = signEnvelope(s.verifier, 'task.attest', { taskId: s.taskId, resultId: s.result.id, verdict: 'match', observedHash: s.result.payload.version.contentHash, reason: 'again' });
        const b = load([s.publish, s.dataLease, s.result, s.verifyLease, s.attest, again]);
        expect(b.evaluate(s.taskId).status).toBe('awaiting-verification');
    });

    it('rejects a result that independent verifiers cannot reproduce', () => {
        const s = scenario({ verdict: 'mismatch' });
        const ev = load([s.publish, s.dataLease, s.result, s.verifyLease, s.attest]).evaluate(s.taskId);
        expect(ev.status).toBe('rejected');
        expect(ev.mismatchVerifiers).toEqual([s.verifier.nodeId]);
    });

    it('keeps an accepted task stable when a late duplicate result from an older lease arrives', () => {
        const s = scenario();
        const lateWorker = identity();
        const lateLease = signEnvelope(s.publisher, 'task.lease', { taskId: s.taskId, role: 'data', worker: lateWorker.nodeId, epoch: 2, expiresAt: Date.now() + 5000 });
        const lateResult = signEnvelope(lateWorker, 'task.result', { taskId: s.taskId, leaseId: lateLease.id, version: versionOf(s.content, Date.now() + 10) });
        const finalize = signEnvelope(s.publisher, 'task.finalize', { taskId: s.taskId, decision: 'accepted', reason: 'ok', resultId: s.result.id });
        const b = load([s.publish, s.dataLease, s.result, s.verifyLease, s.attest, finalize, lateLease, lateResult]);
        expect(b.evaluate(s.taskId).resultId).toBe(s.result.id);
    });

    it('marks a task expired after its deadline without a verified result', () => {
        const s = scenario();
        const b = load([s.publish, s.dataLease]);
        expect(b.evaluate(s.taskId, Date.now() + 10 * 60_000).status).toBe('expired');
    });

    it('builds history with a hash chain and collapses unchanged observations', () => {
        const a = scenario();
        const b = new Board();
        for (const e of [a.publish, a.dataLease, a.result, a.verifyLease, a.attest]) b.ingest(e);
        const entry = b.history('npm:left-pad')[0];
        expect(entry.prevChainHash).toBeNull();
        expect(entry.chainHash).toBe(sha256Hex(`|${entry.contentHash}`));
    });
});

describe('proof bundles', () => {
    it('verify offline and fail when an envelope is removed or altered', () => {
        const s = scenario();
        const b = load([s.publish, s.dataLease, s.result, s.verifyLease, s.attest]);
        const bundle = b.proofBundle(s.taskId)!;
        expect(verifyProofBundle(bundle).ok).toBe(true);
        expect(verifyProofBundle({ ...bundle, envelopes: bundle.envelopes.filter(e => e.type !== 'task.attest') }).ok).toBe(false);
        const tampered = bundle.envelopes.map(e => (e.type === 'task.result' ? { ...e, payload: { ...(e.payload as object), leaseId: sha256Hex('x') } } : e));
        expect(verifyProofBundle({ ...bundle, envelopes: tampered as Envelope[] }).ok).toBe(false);
    });
});
