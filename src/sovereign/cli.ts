#!/usr/bin/env node
/**
 * Run one sovereign node process.
 *   node --import tsx src/sovereign/cli.ts --data-dir ./node1 --port 0 --roles data,verify --peers http://host:port
 * Prints one JSON line {"ready":true,"port":N,"nodeId":"..."} when listening.
 */

import { cpus, totalmem } from 'os';
import { defaultConfig, SovereignNode, suggestRoles } from './node.js';
import { ROLES, type Role } from './board.js';

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
    const dataDir = arg('data-dir');
    if (!dataDir) { console.error('usage: --data-dir <dir> [--port N] [--host H] [--roles a,b] [--peers u1,u2] [--npm-registry URL] [--price-nano N] [--public-url URL]'); process.exit(2); }

    const cfg = defaultConfig(dataDir);
    cfg.host = arg('host') ?? cfg.host;
    cfg.port = Number(arg('port') ?? 0);
    cfg.roles = arg('roles')
        ? arg('roles')!.split(',').map(s => s.trim()).filter((r): r is Role => (ROLES as readonly string[]).includes(r))
        : suggestRoles(cpus().length, totalmem() / 2 ** 30);
    cfg.bootstrap = (arg('peers') ?? process.env.GSTD_SOV_BOOTSTRAP ?? '').split(',').map(s => s.trim()).filter(Boolean);
    cfg.adapter.npmRegistry = arg('npm-registry') ?? process.env.GSTD_SOV_NPM_REGISTRY ?? cfg.adapter.npmRegistry;
    cfg.priceNano = arg('price-nano') ?? cfg.priceNano;
    cfg.publicUrl = arg('public-url');
    cfg.loopMs = Number(arg('loop-ms') ?? cfg.loopMs);
    cfg.allowPrivatePeers = process.env.GSTD_SOV_ALLOW_PRIVATE_PEERS === '1';
    cfg.fetchDelayMs = Number(process.env.GSTD_SOV_FETCH_DELAY_MS ?? 0);
    cfg.rewardParams.subsidyBudgetNano = BigInt(process.env.GSTD_SOV_SUBSIDY_BUDGET_NANO ?? '0');
    if (process.env.GSTD_SOV_FAULT_INJECTION === '1' && process.env.GSTD_SOV_TAMPER === '1') cfg.faultInjection = { tamperResults: true };

    const node = new SovereignNode(cfg);
    const port = await node.start();
    console.log(JSON.stringify({ ready: true, port, nodeId: node.nodeId, roles: cfg.roles }));
    const stop = () => { void node.stop().then(() => process.exit(0)); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
}

void main();
