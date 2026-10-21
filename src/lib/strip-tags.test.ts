import { describe, it, expect } from 'vitest';
import { stripTags } from './strip-tags.js';

describe('stripTags', () => {
    it('removes simple and nested tags', () => {
        expect(stripTags('a <b>bold</b> c')).toBe('a bold c');
        expect(stripTags('<scr<script>ipt>alert(1)</scr</script>ipt>')).toBe('alert(1)');
    });
    it('never leaves angle brackets', () => {
        expect(stripTags('1 < 2 > 0')).not.toMatch(/[<>]/);
    });
});
