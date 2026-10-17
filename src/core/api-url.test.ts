import { describe, expect, it } from 'vitest';
import { DEFAULT_GSTD_API_URL, normalizeGstdApiUrl } from './api-url.js';

describe('normalizeGstdApiUrl', () => {
    it('defaults to the deployed application API', () => {
        expect(normalizeGstdApiUrl()).toBe(DEFAULT_GSTD_API_URL);
    });

    it('migrates the legacy platform host, including a trailing slash', () => {
        expect(normalizeGstdApiUrl('https://platform.gstdtoken.com/api/v1/'))
            .toBe(DEFAULT_GSTD_API_URL);
    });

    it('preserves explicitly configured custom API hosts', () => {
        expect(normalizeGstdApiUrl('https://api.example.test/v1'))
            .toBe('https://api.example.test/v1');
    });
});
