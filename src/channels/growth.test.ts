import { describe, it, expect, vi } from 'vitest';
import { parseReferrer, buildAnnouncement, Announcer, inviteLink } from './growth.js';

describe('growth helpers', () => {
    it('parses only numeric referral payloads and rejects self-referral', () => {
        expect(parseReferrer('ref_123456', 999)).toBe('123456');
        expect(parseReferrer('ref_123456', 123456)).toBeNull();
        expect(parseReferrer('ref_<script>', 1)).toBeNull();
        expect(parseReferrer('sponsor-x-10', 1)).toBeNull();
    });

    it('builds invite links', () => {
        expect(inviteLink('gstdaibot', 42)).toBe('https://t.me/gstdaibot?start=ref_42');
    });

    it('announces real numbers and flags idle queues honestly', () => {
        const text = buildAnnouncement({ nodes_online: 0, total_tasks_completed: 0, queue_depth: 3 }, 'bot');
        expect(text).toContain('Nodes online: <b>0</b>');
        expect(text).toContain('no node is online');
    });

    it('does not repeat an unchanged announcement', async () => {
        const send = vi.fn(async () => {});
        const a = new Announcer(async () => ({ nodes_online: 1 }), send, () => 'bot');
        expect(await a.tick()).toBe(true);
        expect(await a.tick()).toBe(false);
        expect(send).toHaveBeenCalledTimes(1);
    });
});
