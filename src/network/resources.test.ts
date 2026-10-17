import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceSharing, type NodeResources } from './resources.js';
import type { NodeConfig } from '../index.js';

const config: NodeConfig = {
    version: '3.5.0',
    mode: 'cloud',
    nodeId: 'node-test',
    nodeName: 'test-node',
    installDir: '',
    swarm: { enabled: true, maxCPU: 80, maxRAM: 70, apiUrl: 'https://platform.example/api/v1' },
    dashboard: { host: '127.0.0.1', port: 8080, enabled: true },
    models: { available: ['llama3.2:1b'] },
    memory: { redisUrl: '', chromaUrl: '', enabled: false },
    apps: { enabled: false, dataDir: '' },
    tonconnect: { enabled: false, network: 'mainnet', bridgeUrl: '' },
    mobileNode: { enabled: false },
};

const availableResources: NodeResources = {
    nodeId: 'node-test',
    compute: {
        cpuCores: 4,
        cpuFreeMhz: 2400,
        ramFreeMb: 2048,
        gpuAvailable: true,
        gpuModel: 'Test GPU',
        gpuVramMb: 8192,
    },
    storage: { availableGb: 50, readSpeedMbps: 500, writeSpeedMbps: 300 },
    network: { bandwidthMbps: 100, latencyMs: 10, region: 'test' },
    models: ['llama3.2:1b'],
    pricePerUnit: {
        cpuHour: 0.05,
        gpuHour: 0.5,
        storageGbDay: 0.01,
        inferenceQuery: 0.001,
        embeddingQuery: 0.0005,
        bandwidthGb: 0.02,
    },
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('ResourceSharing.publishResources', () => {
    it('publishes measured capacity through the registered-node heartbeat contract', async () => {
        const sharing = new ResourceSharing(config, 'EQwallet');
        vi.spyOn(sharing, 'getAvailableResources').mockReturnValue(availableResources);
        const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        await sharing.publishResources();

        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://platform.example/api/v1/nodes/heartbeat');
        expect(options.method).toBe('POST');
        expect(new Headers(options.headers).get('x-wallet-address')).toBe('EQwallet');
        expect(JSON.parse(String(options.body))).toMatchObject({
            node_id: 'node-test',
            wallet_address: 'EQwallet',
            storage_free_gb: 50,
            ram_free_mb: 2048,
            gpu_vram_mb: 8192,
            capabilities: ['llama3.2:1b'],
        });
    });

    it('does not send unauthenticated resource updates', async () => {
        const sharing = new ResourceSharing(config, '');
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await sharing.publishResources();

        expect(fetchMock).not.toHaveBeenCalled();
        expect(warning).toHaveBeenCalledOnce();
    });
});
