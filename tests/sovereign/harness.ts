/**
 * Harness for multi-process sovereign-network tests. Every node is a separate
 * OS process talking to the others over real sockets; the only "external"
 * dependency is a local HTTP server that plays the open-data source.
 */

import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import http from 'http';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

export interface Source {
    url: string;
    setVersions(pkg: string, versions: string[]): void;
    hits(): number;
    close(): Promise<void>;
}

export async function startSource(): Promise<Source> {
    const docs = new Map<string, string[]>();
    let hits = 0;
    const server = http.createServer((req, res) => {
        hits++;
        const name = decodeURIComponent((req.url ?? '/').slice(1));
        const versions = docs.get(name);
        if (!versions) { res.writeHead(404); res.end('{}'); return; }
        const doc = {
            name,
            'dist-tags': { latest: versions[versions.length - 1] },
            versions: Object.fromEntries(versions.map(v => [v, {}])),
            time: Object.fromEntries(versions.map((v, i) => [v, `2020-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`])),
        };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(doc));
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    return {
        url: `http://127.0.0.1:${port}`,
        setVersions: (pkg, versions) => { docs.set(pkg, versions); },
        hits: () => hits,
        close: () => new Promise<void>(r => { server.close(() => r()); server.closeAllConnections(); }),
    };
}

export interface NodeHandle {
    name: string;
    url: string;
    port: number;
    nodeId: string;
    dataDir: string;
    proc: ChildProcess;
    logs: string[];
    kill(): Promise<void>;
    get(path: string): Promise<any>;
    post(path: string, body: unknown): Promise<any>;
    admin(path: string, body?: unknown): Promise<any>;
}

export interface SpawnOpts {
    name: string;
    source: Source;
    roles: string[];
    peers?: string[];
    dataDir?: string;
    price?: string;
    env?: Record<string, string>;
}

export async function spawnNode(o: SpawnOpts): Promise<NodeHandle> {
    const dataDir = o.dataDir ?? mkdtempSync(join(tmpdir(), `sov-${o.name}-`));
    const args = [
        '--import', 'tsx', join(ROOT, 'src', 'sovereign', 'cli.ts'),
        '--data-dir', dataDir, '--port', '0', '--roles', o.roles.join(','),
        '--npm-registry', o.source.url, '--loop-ms', '250', '--price-nano', o.price ?? '0',
    ];
    if (o.peers?.length) args.push('--peers', o.peers.join(','));
    const proc = spawn(process.execPath, args, {
        cwd: ROOT,
        env: {
            ...process.env,
            GSTD_SOV_ALLOW_PRIVATE_PEERS: '1',
            // Central services deliberately point at dead endpoints: nothing may depend on them.
            GSTD_API_URL: 'http://127.0.0.1:9', GSTD_SWARM_URL: 'http://127.0.0.1:9',
            ...o.env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const logs: string[] = [];
    const ready = await new Promise<{ port: number; nodeId: string }>((res, rej) => {
        const timer = setTimeout(() => rej(new Error(`node ${o.name} did not start: ${logs.join('\n')}`)), 20_000);
        let buf = '';
        proc.stdout!.on('data', d => {
            buf += d.toString();
            for (const line of buf.split('\n')) {
                logs.push(line);
                try { const j = JSON.parse(line); if (j.ready) { clearTimeout(timer); res(j); } } catch { /* not the ready line */ }
            }
            buf = buf.slice(buf.lastIndexOf('\n') + 1);
        });
        proc.stderr!.on('data', d => logs.push(d.toString()));
        proc.on('exit', code => { clearTimeout(timer); rej(new Error(`node ${o.name} exited early (${code}): ${logs.join('\n')}`)); });
    });
    const url = `http://127.0.0.1:${ready.port}`;
    const token = readFileSync(join(dataDir, 'admin.token'), 'utf-8').trim();
    const json = async (r: Response) => ({ status: r.status, ...(await r.json() as object) });
    const handle: NodeHandle = {
        name: o.name, url, port: ready.port, nodeId: ready.nodeId, dataDir, proc, logs,
        kill: () => new Promise<void>(r => {
            if (proc.exitCode !== null || proc.signalCode !== null) return r();
            proc.once('exit', () => r());
            proc.kill();
        }),
        get: async p => json(await fetch(`${url}${p}`)),
        post: async (p, body) => json(await fetch(`${url}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })),
        admin: async (p, body) => json(await fetch(`${url}${p}`, {
            method: body === undefined ? 'GET' : 'POST',
            headers: { 'content-type': 'application/json', 'x-sov-admin': token },
            body: body === undefined ? undefined : JSON.stringify(body),
        })),
    };
    return handle;
}

export async function waitFor<T>(what: string, fn: () => Promise<T | false | undefined | null>, timeoutMs = 30_000): Promise<T> {
    const start = Date.now();
    let last: unknown;
    while (Date.now() - start < timeoutMs) {
        try { const v = await fn(); if (v) return v; } catch (e) { last = e; }
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`timed out waiting for ${what}${last ? `: ${(last as Error).message}` : ''}`);
}

export function cleanup(nodes: NodeHandle[]): Promise<void[]> {
    return Promise.all(nodes.map(async n => { await n.kill(); try { rmSync(n.dataDir, { recursive: true, force: true }); } catch { /* best effort */ } }));
}

export async function taskStatus(n: NodeHandle, taskId: string): Promise<string | undefined> {
    const r = await n.get('/sov/tasks');
    return (r.tasks as Array<{ taskId: string; status: string }>).find(t => t.taskId === taskId)?.status;
}
