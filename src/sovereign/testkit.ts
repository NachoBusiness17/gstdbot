/** Test helpers: build correctly signed task histories using independent identities. */
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { canonicalize, loadOrCreateIdentity, sha256Hex, signEnvelope, type Envelope, type NodeIdentity } from './crypto.js';
import { Board } from './board.js';

export function identity(): NodeIdentity { return loadOrCreateIdentity(mkdtempSync(join(tmpdir(), 'sov-id-'))); }

export function manifestPayload(overrides: Record<string, unknown> = {}) {
    return {
        kind: 'data.fetch', adapter: 'npm-registry', params: { package: 'left-pad' }, entity: 'npm:left-pad',
        funding: 'commercial', budgetNano: '1000000', minVerifiers: 1, leaseMs: 5000, deadline: Date.now() + 60_000,
        maxAttempts: 3, acceptance: 'verifier-hash-match', ...overrides,
    };
}

export function versionOf(content: unknown, fetchedAt = Date.now()) {
    return { entity: 'npm:left-pad', adapter: 'npm-registry', source: 'http://source.invalid/left-pad', fetchedAt, contentHash: sha256Hex(canonicalize(content)), content };
}

export function scenario(opts: { verdict?: 'match' | 'mismatch'; minVerifiers?: number; funding?: 'commercial' | 'subsidized'; budgetNano?: string } = {}) {
    const publisher = identity(); const worker = identity(); const verifier = identity();
    const content = { name: 'left-pad', distTags: { latest: '1.3.0' }, versions: [{ version: '1.3.0', publishedAt: null }] };
    const publish = signEnvelope(publisher, 'task.publish', manifestPayload({
        minVerifiers: opts.minVerifiers ?? 1, funding: opts.funding ?? 'commercial', budgetNano: opts.budgetNano ?? '1000000',
    }));
    const taskId = publish.id;
    const dataLease = signEnvelope(publisher, 'task.lease', { taskId, role: 'data', worker: worker.nodeId, epoch: 1, expiresAt: Date.now() + 5000 });
    const result = signEnvelope(worker, 'task.result', { taskId, leaseId: dataLease.id, version: versionOf(content) });
    const verifyLease = signEnvelope(publisher, 'task.lease', { taskId, role: 'verify', worker: verifier.nodeId, epoch: 1, expiresAt: Date.now() + 5000 });
    const attest = signEnvelope(verifier, 'task.attest', {
        taskId, resultId: result.id, verdict: opts.verdict ?? 'match',
        observedHash: opts.verdict === 'mismatch' ? sha256Hex('other') : result.payload.version.contentHash, reason: 'test',
    });
    return { publisher, worker, verifier, content, publish, taskId, dataLease, result, verifyLease, attest };
}

export function load(envs: Envelope[]): Board {
    const b = new Board();
    for (const e of envs) b.ingest(e);
    return b;
}
