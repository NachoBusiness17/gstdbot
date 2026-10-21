import { describe, it, expect, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { safeFetch, classifyAddress } from './safe-fetch.js';

describe('classifyAddress', () => {
    it('classifies ranges', () => {
        expect(classifyAddress('169.254.169.254')).toBe('always');
        expect(classifyAddress('0.0.0.0')).toBe('always');
        expect(classifyAddress('fe80::1')).toBe('always');
        expect(classifyAddress('::ffff:169.254.169.254')).toBe('always');
        expect(classifyAddress('127.0.0.1')).toBe('private');
        expect(classifyAddress('10.1.2.3')).toBe('private');
        expect(classifyAddress('172.20.0.1')).toBe('private');
        expect(classifyAddress('192.168.0.5')).toBe('private');
        expect(classifyAddress('fd00::1')).toBe('private');
        expect(classifyAddress('8.8.8.8')).toBeNull();
        expect(classifyAddress('172.32.0.1')).toBeNull();
    });
});

describe('safeFetch', () => {
    let hits = 0;
    const server = http.createServer((req, res) => {
        hits++;
        if (req.url === '/redir') { res.writeHead(302, { location: 'http://169.254.169.254/' }); return res.end(); }
        if (req.url === '/big') { res.end(Buffer.alloc(2048, 1)); return; }
        res.setHeader('content-type', 'application/json');
        res.end('{"ok":true}');
    });
    const ready = new Promise<number>(r => server.listen(0, '127.0.0.1', () => r((server.address() as AddressInfo).port)));
    afterAll(() => new Promise<void>(r => server.close(() => r())));

    it('blocks loopback by default and link-local always', async () => {
        const port = await ready;
        await expect(safeFetch(`http://127.0.0.1:${port}/`)).rejects.toThrow(/blocked/);
        await expect(safeFetch('http://localhost:1/')).rejects.toThrow(/blocked/);
        await expect(safeFetch('http://169.254.169.254/', { allowPrivate: true })).rejects.toThrow(/blocked/);
        await expect(safeFetch('http://metadata.google.internal/')).rejects.toThrow(/blocked/);
        expect(hits).toBe(0);
    });
    it('allows loopback when explicitly enabled and does not follow redirects', async () => {
        const port = await ready;
        const ok = await safeFetch(`http://127.0.0.1:${port}/`, { allowPrivate: true });
        expect(ok.status).toBe(200);
        expect(JSON.parse(ok.body.toString())).toEqual({ ok: true });
        const redir = await safeFetch(`http://127.0.0.1:${port}/redir`, { allowPrivate: true });
        expect(redir.status).toBe(302);
    });
    it('blocks hostnames that resolve to private addresses (rebinding)', async () => {
        await expect(safeFetch('http://localhost.localdomain:1/')).rejects.toThrow();
        await ready;
    });
    it('enforces response size and rejects bad input', async () => {
        const port = await ready;
        await expect(safeFetch(`http://127.0.0.1:${port}/big`, { allowPrivate: true, maxBytes: 1024 })).rejects.toThrow();
        await expect(safeFetch('ftp://example.com/')).rejects.toThrow(/protocol/);
        await expect(safeFetch('http://user:pw@example.com/')).rejects.toThrow(/credentials/);
    });
});
