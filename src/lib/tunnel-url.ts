import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Shared across PM2 and systemd PrivateTmp. Legacy path supports running tunnels during upgrades. */
export function readTunnelUrl(): string {
    const primary = process.env.GSTD_TUNNEL_URL_FILE || join(process.env.GSTD_CONFIG_DIR || join(homedir(), '.config/gstdbot'), 'tunnel-url.txt');
    for (const file of [primary, '/tmp/gstd_tunnel_url.txt']) {
        try {
            const url = readFileSync(file, 'utf8').trim();
            const parsed = new URL(url);
            if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash) return parsed.origin;
        } catch { /* not available yet */ }
    }
    return '';
}
