import { readFileSync } from 'node:fs';

/** Missing configuration is a first run; damaged saved identity must never become a new node. */
export function readSavedNodeConfig(path: string): Record<string, any> | null {
    let raw: string;
    try { raw = readFileSync(path, 'utf8'); }
    catch (error: any) {
        if (error?.code === 'ENOENT') return null;
        throw new Error('Saved node configuration is unreadable; restore its backup. Refusing to replace the node identity.');
    }
    try {
        const saved = JSON.parse(raw);
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)
            || typeof saved.nodeId !== 'string' || !saved.nodeId.trim()) throw new Error('Invalid saved identity');
        for (const key of ['swarm', 'dashboard', 'models', 'memory', 'apps', 'tonconnect', 'mobileNode']) {
            if (saved[key] !== undefined && (!saved[key] || typeof saved[key] !== 'object' || Array.isArray(saved[key]))) {
                throw new Error('Invalid saved section');
            }
        }
        return saved;
    } catch {
        // Do not include raw configuration or parser errors: saved config may contain credentials.
        throw new Error('Saved node configuration is corrupt; restore its backup. Refusing to replace the node identity.');
    }
}
