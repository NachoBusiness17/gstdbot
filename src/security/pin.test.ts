import { describe,it,expect } from 'vitest';
import { createHash } from 'node:crypto';
import { hashPin,verifyPin } from './pin.js';
describe('operator PIN protection',()=>{
    it('salts password hashes and verifies without storing the PIN',()=>{
        const a=hashPin('12345678'),b=hashPin('12345678');
        expect(a).not.toBe(b);expect(a).not.toContain('12345678');
        expect(verifyPin('12345678',a)).toBe(true);expect(verifyPin('87654321',a)).toBe(false);
    });
    it('accepts an existing operator digest for migration but rejects malformed hashes',()=>{
        const old=createHash('sha256').update('1234gstd-node-salt-2026').digest('hex');
        expect(verifyPin('1234',old)).toBe(true);expect(verifyPin('0000',old)).toBe(false);
        expect(verifyPin('1234','scrypt$wrong$wrong')).toBe(false);
    });
});
