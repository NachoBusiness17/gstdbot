/**
 * Data-source adapters. A task names an adapter and validated parameters; it
 * never carries code, URLs or commands. The source base URL is node-local
 * configuration, so a task cannot redirect a node to an internal address.
 */

import { canonicalize, sha256Hex } from './crypto.js';
import type { DataVersion } from './board.js';

export interface AdapterConfig {
    npmRegistry: string;
    timeoutMs: number;
    maxBytes: number;
}

export const DEFAULT_ADAPTER_CONFIG: AdapterConfig = {
    npmRegistry: 'https://registry.npmjs.org',
    timeoutMs: 8000,
    maxBytes: 2 * 1024 * 1024,
};

async function boundedJson(url: string, cfg: AdapterConfig): Promise<unknown> {
    const resp = await fetch(url, {
        redirect: 'error',
        headers: { accept: 'application/json', 'user-agent': 'gstd-sovereign-node/1' },
        signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    if (!resp.ok) throw new Error(`source returned HTTP ${resp.status}`);
    const declared = Number(resp.headers.get('content-length') || 0);
    if (declared > cfg.maxBytes) throw new Error('source response too large');
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > cfg.maxBytes) throw new Error('source response too large');
    return JSON.parse(buf.toString('utf-8'));
}

/** Normalized, deterministic projection of an npm registry document. */
export function normalizeNpmDocument(doc: unknown): { name: string; distTags: Record<string, string>; versions: Array<{ version: string; publishedAt: string | null }> } {
    const d = doc as { name?: unknown; 'dist-tags'?: Record<string, unknown>; versions?: Record<string, unknown>; time?: Record<string, unknown> };
    if (!d || typeof d.name !== 'string' || typeof d.versions !== 'object' || d.versions === null) throw new Error('unexpected registry document');
    const distTags: Record<string, string> = {};
    for (const [k, v] of Object.entries(d['dist-tags'] ?? {})) if (typeof v === 'string') distTags[k] = v;
    const versions = Object.keys(d.versions).sort().slice(0, 5000).map(version => {
        const t = d.time?.[version];
        return { version, publishedAt: typeof t === 'string' ? t : null };
    });
    return { name: d.name, distTags, versions };
}

export async function fetchNpmVersion(pkg: string, cfg: AdapterConfig, now: number = Date.now()): Promise<DataVersion> {
    const base = cfg.npmRegistry.replace(/\/+$/, '');
    const url = `${base}/${pkg.replace('/', '%2f')}`;
    const content = normalizeNpmDocument(await boundedJson(url, cfg));
    return {
        entity: `npm:${pkg}`,
        adapter: 'npm-registry',
        source: url,
        fetchedAt: now,
        contentHash: sha256Hex(canonicalize(content)),
        content,
    };
}
