/**
 * Outbound HTTP for user- or peer-supplied URLs.
 * The address check happens inside the socket's DNS lookup, so a hostname cannot pass a pre-check and then
 * rebind to an internal address. Redirects are never followed and the response size is bounded.
 */
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import dns from 'node:dns';

export interface SafeFetchOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Buffer;
    timeoutMs?: number;
    maxBytes?: number;
    /** Loopback / RFC1918 / ULA targets (LAN meshes). Link-local, metadata and unspecified addresses are always blocked. */
    allowPrivate?: boolean;
}

export interface SafeFetchResponse {
    status: number;
    contentType: string | null;
    body: Buffer;
}

function ipv4Parts(ip: string): number[] | null {
    const p = ip.split('.').map(Number);
    return p.length === 4 && p.every(n => Number.isInteger(n) && n >= 0 && n <= 255) ? p : null;
}

/** Returns the block category for an IP literal, or null when it is publicly routable. */
export function classifyAddress(address: string): 'always' | 'private' | null {
    let ip = address.toLowerCase().replace(/^\[|\]$/g, '');
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    if (mapped) ip = mapped[1];
    if (net.isIPv4(ip)) {
        const p = ipv4Parts(ip);
        if (!p) return 'always';
        const [a, b] = p;
        if (a === 0 || a === 169 && b === 254 || a >= 224) return 'always';
        if (ip === '100.100.100.200') return 'always';
        if (a === 10 || a === 127 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31 || a === 100 && b >= 64 && b <= 127) return 'private';
        return null;
    }
    if (net.isIPv6(ip)) {
        if (ip === '::' || /^fe[89ab]/.test(ip) || /^ff/.test(ip)) return 'always';
        if (ip === '::1' || /^f[cd]/.test(ip)) return 'private';
        return null;
    }
    return 'always';
}

function isBlocked(address: string, allowPrivate: boolean): boolean {
    const c = classifyAddress(address);
    return c === 'always' || (c === 'private' && !allowPrivate);
}

export function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResponse> {
    const allowPrivate = opts.allowPrivate === true;
    const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
    return new Promise<SafeFetchResponse>((resolve, reject) => {
        let url: URL;
        try { url = new URL(rawUrl); } catch { return reject(new Error('invalid url')); }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return reject(new Error('unsupported protocol'));
        if (url.username || url.password) return reject(new Error('credentials in url not allowed'));
        const host = url.hostname.replace(/^\[|\]$/g, '');
        if (host.toLowerCase() === 'metadata.google.internal') return reject(new Error('blocked host'));
        if (net.isIP(host) && isBlocked(host, allowPrivate)) return reject(new Error('blocked address'));

        const lookup: net.LookupFunction = (hostname, options, cb) => {
            dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
                if (err) return (cb as any)(err);
                const list = (addrs as dns.LookupAddress[]).filter(a => !isBlocked(a.address, allowPrivate));
                if (list.length === 0 || list.length !== (addrs as dns.LookupAddress[]).length) return (cb as any)(new Error('blocked address'));
                if ((options as { all?: boolean }).all) return (cb as any)(null, list);
                (cb as any)(null, list[0].address, list[0].family);
            });
        };

        const mod = url.protocol === 'https:' ? https : http;
        const req = mod.request(url, {
            method: opts.method ?? 'GET',
            headers: opts.headers,
            lookup,
            timeout: opts.timeoutMs ?? 10_000,
        }, res => {
            const chunks: Buffer[] = [];
            let size = 0;
            let failed = false;
            res.on('data', (c: Buffer) => {
                if (failed) return;
                size += c.length;
                if (size > maxBytes) {
                    failed = true;
                    reject(new Error('response too large'));
                    res.destroy();
                    req.destroy();
                    return;
                }
                chunks.push(c);
            });
            res.on('end', () => { if (!failed) resolve({
                status: res.statusCode ?? 0,
                contentType: typeof res.headers['content-type'] === 'string' ? res.headers['content-type'] : null,
                body: Buffer.concat(chunks),
            }); });
            res.on('error', e => { if (!failed) reject(e); });
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
        if (opts.body !== undefined) req.write(opts.body);
        req.end();
    });
}
