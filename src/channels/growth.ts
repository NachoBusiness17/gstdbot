/**
 * Growth helpers for the Telegram bot. Everything here is built from real
 * network numbers; nothing is invented and nothing is sent to users who did
 * not opt in (announcements go only to the configured community chat).
 */

export interface PublicStats {
    nodes_online?: number;
    total_tasks_completed?: number;
    queue_depth?: number;
    total_gstd_paid?: number;
}

export function inviteLink(botUsername: string, userId: string | number): string {
    return `https://t.me/${botUsername}?start=ref_${userId}`;
}

/** Referral payload from /start; accepts only plain Telegram numeric ids. */
export function parseReferrer(payload: string, selfId: string | number | undefined): string | null {
    const m = /^ref_(\d{3,15})$/.exec(payload.trim());
    if (!m || m[1] === String(selfId)) return null;
    return m[1];
}

export function buildAnnouncement(stats: PublicStats, botUsername: string): string {
    const nodes = stats.nodes_online ?? 0;
    const done = stats.total_tasks_completed ?? 0;
    const queue = stats.queue_depth ?? 0;
    const lines = [
        '🐝 <b>GSTD network status</b>',
        `🖥 Nodes online: <b>${nodes}</b>`,
        `✅ Tasks completed: <b>${done}</b>`,
        `⏳ Tasks waiting for a node: <b>${queue}</b>`,
    ];
    if (queue > 0 && nodes === 0) {
        lines.push('', 'Tasks are waiting and no node is online. Run a node to serve them: https://github.com/gstdcoin/gstdbot');
    }
    lines.push('', `Join: https://t.me/${botUsername}`);
    return lines.join('\n');
}

/** Stable fingerprint so the same numbers are never announced twice in a row. */
export function statsFingerprint(stats: PublicStats): string {
    return [stats.nodes_online ?? 0, stats.total_tasks_completed ?? 0, stats.queue_depth ?? 0].join(':');
}

export class Announcer {
    private timer: NodeJS.Timeout | null = null;
    private last = '';

    constructor(
        private readonly fetchStats: () => Promise<PublicStats>,
        private readonly send: (text: string) => Promise<void>,
        private readonly botUsername: () => string,
        private readonly intervalMs = 24 * 3600_000,
    ) {}

    async tick(): Promise<boolean> {
        const stats = await this.fetchStats();
        const fp = statsFingerprint(stats);
        if (fp === this.last) return false;
        await this.send(buildAnnouncement(stats, this.botUsername()));
        this.last = fp;
        return true;
    }

    start(): void {
        if (this.timer) return;
        this.timer = setInterval(() => { this.tick().catch(() => {}); }, this.intervalMs);
        this.timer.unref?.();
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }
}
