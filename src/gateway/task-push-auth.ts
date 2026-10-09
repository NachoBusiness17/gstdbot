/**
 * Shared-secret authentication for platform task pushes.
 *
 * POST /api/v1/tasks/push runs inference on this node's backend, so it must
 * not be callable by arbitrary parties. Operators set GSTD_TASK_PUSH_SECRET;
 * the platform presents the same value in the X-GSTD-Task-Push-Secret header.
 *
 * Comparison is constant-time: both sides are hashed to a fixed 32-byte
 * length first, so the secret's length is not leaked through timing and
 * unequal-length inputs cannot make timingSafeEqual throw.
 */

import { createHash, timingSafeEqual } from 'crypto';

export const TASK_PUSH_SECRET_HEADER = 'x-gstd-task-push-secret';

/**
 * Returns true when the push is allowed.
 * - No secret configured (`expected` empty): allowed (deployments that have
 *   not opted in keep working; the gateway logs a warning at startup).
 * - Secret configured: the presented header must match it exactly.
 */
export function verifyTaskPushSecret(presented: unknown, expected: string): boolean {
    if (!expected) return true;
    if (typeof presented !== 'string' || presented.length === 0) return false;
    const presentedHash = createHash('sha256').update(presented).digest();
    const expectedHash  = createHash('sha256').update(expected).digest();
    return timingSafeEqual(presentedHash, expectedHash);
}
