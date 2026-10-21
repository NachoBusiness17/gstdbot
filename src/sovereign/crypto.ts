/**
 * Sovereign network primitives: deterministic serialization, node identity and
 * signed envelopes. Everything that must be identical on every node (ids,
 * hashes, ledger entries) goes through canonicalize() + sha256Hex().
 */

import {
    createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes,
    sign as edSign, verify as edVerify, type KeyObject,
} from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export function canonicalize(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('non-finite number in canonical JSON');
        if (typeof value === 'bigint') throw new Error('bigint must be serialized as string');
        return JSON.stringify(value) ?? 'null';
    }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',')}}`;
}

export function sha256Hex(data: string | Buffer): string {
    return createHash('sha256').update(data).digest('hex');
}

export interface NodeIdentity {
    /** 32-byte Ed25519 public key, hex. This is the node id. */
    nodeId: string;
    privateKey: KeyObject;
}

function publicKeyFromHex(hex: string): KeyObject {
    return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(hex, 'hex').toString('base64url') }, format: 'jwk' });
}

export function loadOrCreateIdentity(dataDir: string): NodeIdentity {
    mkdirSync(dataDir, { recursive: true });
    const file = join(dataDir, 'identity.json');
    if (existsSync(file)) {
        const { pkcs8 } = JSON.parse(readFileSync(file, 'utf-8'));
        const privateKey = createPrivateKey({ key: Buffer.from(pkcs8, 'base64'), format: 'der', type: 'pkcs8' });
        const jwk = createPublicKey(privateKey).export({ format: 'jwk' }) as { x: string };
        return { nodeId: Buffer.from(jwk.x, 'base64url').toString('hex'), privateKey };
    }
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
    writeFileSync(file, JSON.stringify({ pkcs8, createdAt: new Date().toISOString() }), { mode: 0o600 });
    const jwk = publicKey.export({ format: 'jwk' }) as { x: string };
    return { nodeId: Buffer.from(jwk.x, 'base64url').toString('hex'), privateKey };
}

export interface Envelope<P = unknown> {
    v: 1;
    type: string;
    payload: P;
    signer: string;
    ts: number;
    nonce: string;
    id: string;
    sig: string;
}

export const MAX_ENVELOPE_BYTES = 256 * 1024;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

function unsignedBody(e: Pick<Envelope, 'v' | 'type' | 'payload' | 'signer' | 'ts' | 'nonce'>): string {
    return canonicalize({ v: e.v, type: e.type, payload: e.payload, signer: e.signer, ts: e.ts, nonce: e.nonce });
}

export function signEnvelope<P>(identity: NodeIdentity, type: string, payload: P, ts: number = Date.now()): Envelope<P> {
    const base = { v: 1 as const, type, payload, signer: identity.nodeId, ts, nonce: randomBytes(8).toString('hex') };
    const id = sha256Hex(unsignedBody(base));
    const sig = edSign(null, Buffer.from(id, 'hex'), identity.privateKey).toString('hex');
    return { ...base, id, sig };
}

export type EnvelopeCheck = { ok: true } | { ok: false; reason: string };

export function verifyEnvelope(e: unknown, now: number = Date.now()): EnvelopeCheck {
    if (!e || typeof e !== 'object') return { ok: false, reason: 'not an object' };
    const env = e as Envelope;
    if (env.v !== 1) return { ok: false, reason: 'unsupported protocol version' };
    if (typeof env.type !== 'string' || env.type.length > 64) return { ok: false, reason: 'bad type' };
    if (typeof env.signer !== 'string' || !/^[0-9a-f]{64}$/.test(env.signer)) return { ok: false, reason: 'bad signer' };
    if (typeof env.sig !== 'string' || !/^[0-9a-f]{128}$/.test(env.sig)) return { ok: false, reason: 'bad signature encoding' };
    if (typeof env.nonce !== 'string' || !/^[0-9a-f]{16}$/.test(env.nonce)) return { ok: false, reason: 'bad nonce' };
    if (!Number.isInteger(env.ts) || env.ts <= 0) return { ok: false, reason: 'bad timestamp' };
    if (env.ts > now + MAX_FUTURE_SKEW_MS) return { ok: false, reason: 'timestamp too far in the future' };
    let body: string;
    try { body = unsignedBody(env); } catch { return { ok: false, reason: 'payload not canonicalizable' }; }
    if (Buffer.byteLength(body) > MAX_ENVELOPE_BYTES) return { ok: false, reason: 'envelope too large' };
    if (sha256Hex(body) !== env.id) return { ok: false, reason: 'id mismatch' };
    try {
        if (!edVerify(null, Buffer.from(env.id, 'hex'), publicKeyFromHex(env.signer), Buffer.from(env.sig, 'hex'))) {
            return { ok: false, reason: 'invalid signature' };
        }
    } catch {
        return { ok: false, reason: 'signature check failed' };
    }
    return { ok: true };
}
