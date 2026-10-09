import { describe, it, expect } from 'vitest';
import { verifyTaskPushSecret, TASK_PUSH_SECRET_HEADER } from './task-push-auth.js';

const SECRET = 'test-push-secret-value';

describe('verifyTaskPushSecret', () => {
    it('allows any push when no secret is configured (opt-in auth)', () => {
        expect(verifyTaskPushSecret(undefined, '')).toBe(true);
        expect(verifyTaskPushSecret('anything', '')).toBe(true);
    });

    it('accepts the exact shared secret', () => {
        expect(verifyTaskPushSecret(SECRET, SECRET)).toBe(true);
    });

    it('rejects a wrong value', () => {
        expect(verifyTaskPushSecret('wrong', SECRET)).toBe(false);
        expect(verifyTaskPushSecret(SECRET + 'x', SECRET)).toBe(false);
        expect(verifyTaskPushSecret(SECRET.slice(0, -1), SECRET)).toBe(false);
    });

    it('rejects a missing or malformed header when a secret is configured', () => {
        expect(verifyTaskPushSecret(undefined, SECRET)).toBe(false);
        expect(verifyTaskPushSecret('', SECRET)).toBe(false);
        expect(verifyTaskPushSecret([SECRET], SECRET)).toBe(false); // duplicated header -> array
        expect(verifyTaskPushSecret(12345, SECRET)).toBe(false);
    });

    it('handles secrets of any length without throwing (length is not an oracle)', () => {
        expect(() => verifyTaskPushSecret('a', 'a-very-much-longer-secret-value')).not.toThrow();
        expect(() => verifyTaskPushSecret('x'.repeat(5000), SECRET)).not.toThrow();
        expect(verifyTaskPushSecret('x'.repeat(5000), SECRET)).toBe(false);
    });

    it('exposes the header name in the lowercase form express matches', () => {
        expect(TASK_PUSH_SECRET_HEADER).toBe('x-gstd-task-push-secret');
    });
});
