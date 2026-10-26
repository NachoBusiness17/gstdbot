/**
 * GSTD P2P — Persistent Peer Identity
 *
 * Generates and saves an Ed25519 keypair on first boot so the node always
 * advertises the same stable peerId across restarts. Without this, a new
 * multiaddr is minted on every restart, breaking every bootstrap pointer.
 *
 * Storage: ~/.config/gstdbot/p2p-identity.json
 * Format:  { "type": "Ed25519", "protobuf": "<base64>" }
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const IDENTITY_PATH = join(homedir(), '.config', 'gstdbot', 'p2p-identity.json');

export interface P2PIdentity {
    /** The private key object — pass directly to createLibp2p({ privateKey }) */
    privateKey: any;
    /** Hex-encoded public key (for logging) */
    pubkeyHex: string;
    /** Whether this identity was freshly generated this boot */
    isNew: boolean;
}

export async function loadOrCreateP2PIdentity(directory=process.env.GSTD_IDENTITY_DIR || join(homedir(),'.config','gstdbot')): Promise<P2PIdentity> {
    const IDENTITY_PATH=join(directory,'p2p-identity.json');
    const { keys } = await import('@libp2p/crypto');
    const { peerIdFromPrivateKey } = await import('@libp2p/peer-id');

    // ── Load existing identity ──────────────────────────────────────
    if (existsSync(IDENTITY_PATH)) {
        try {
            const raw = JSON.parse(readFileSync(IDENTITY_PATH, 'utf-8'));
            if (raw.type === 'Ed25519' && raw.protobuf) {
                const bytes = Buffer.from(raw.protobuf, 'base64');
                const privateKey = keys.privateKeyFromProtobuf(new Uint8Array(bytes));
                const peerId = peerIdFromPrivateKey(privateKey);
                const pubkeyHex = Buffer.from(peerId.publicKey?.raw ?? new Uint8Array()).toString('hex');
                return { privateKey, pubkeyHex, isNew: false };
            }
        } catch {throw new Error('Saved P2P identity is corrupt; restore its backup. Refusing to replace it.');}
        throw new Error('Saved P2P identity has an unsupported format; refusing to replace it.');
    }

    // ── Generate fresh identity ─────────────────────────────────────
    const privateKey = await keys.generateKeyPair('Ed25519');
    const protobuf = Buffer.from(keys.privateKeyToProtobuf(privateKey)).toString('base64');
    const peerId = peerIdFromPrivateKey(privateKey);
    const pubkeyHex = Buffer.from(peerId.publicKey?.raw ?? new Uint8Array()).toString('hex');

    try {
        mkdirSync(directory, { recursive: true, mode:0o700 });
        writeFileSync(IDENTITY_PATH, JSON.stringify({ type: 'Ed25519', protobuf }, null, 2), { mode: 0o600, flag:'wx' });
        console.log(`    ✓ P2P identity created → ${IDENTITY_PATH}`);
    } catch (e: any) {
        if(e.code==='EEXIST')return loadOrCreateP2PIdentity(directory);
        throw new Error('Could not persist P2P identity; refusing an ephemeral identity');
    }

    return { privateKey, pubkeyHex, isNew: true };
}

/** Returns the stable peerId string (or null if identity file is missing/corrupt) */
export async function getStablePeerId(): Promise<string | null> {
    try {
        const { keys } = await import('@libp2p/crypto');
        const { peerIdFromPrivateKey } = await import('@libp2p/peer-id');
        if (!existsSync(IDENTITY_PATH)) return null;
        const raw = JSON.parse(readFileSync(IDENTITY_PATH, 'utf-8'));
        const bytes = Buffer.from(raw.protobuf, 'base64');
        const privateKey = keys.privateKeyFromProtobuf(new Uint8Array(bytes));
        return peerIdFromPrivateKey(privateKey).toString();
    } catch {
        return null;
    }
}
