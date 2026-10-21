import { describe, expect, it } from 'vitest';
import { normalizePeerUrl } from './peers.js';

describe('normalizePeerUrl', () => {
    it('keeps only the origin of http(s) URLs', () => {
        expect(normalizePeerUrl('https://peer.example.com/some/path?x=1')).toBe('https://peer.example.com');
        expect(normalizePeerUrl('http://192.168.1.20:3000/')).toBe('http://192.168.1.20:3000');
    });

    it.each(['file:///etc/passwd', 'ftp://x.example.com', 'https://user:pw@peer.example.com', 'nope', '', 42, undefined])(
        'rejects %j',
        (value) => {
            expect(normalizePeerUrl(value)).toBeNull();
        },
    );
});
