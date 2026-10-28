import { afterEach, expect, it, vi } from 'vitest';
vi.mock('node:fs', () => ({ readFileSync: vi.fn() }));
import { readFileSync } from 'node:fs';
import { readTunnelUrl } from './tunnel-url.js';
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
it('reads the shared config path before a legacy temporary URL', () => {
 vi.stubEnv('GSTD_CONFIG_DIR','/custom/config');
 vi.mocked(readFileSync).mockImplementation((file:any) => {
  if(file === '/custom/config/tunnel-url.txt') return 'https://current.example.com\n';
  return 'https://stale.example.com';
 });
 expect(readTunnelUrl()).toBe('https://current.example.com');
 expect(readFileSync).toHaveBeenCalledTimes(1);
});
it('supports an already running legacy tunnel during upgrade', () => {
 vi.mocked(readFileSync).mockImplementation((file:any) => {
  if(file === '/tmp/gstd_tunnel_url.txt') return 'https://legacy.example.com';
  throw Error('missing');
 });
 expect(readTunnelUrl()).toBe('https://legacy.example.com');
});
it('rejects credentials, insecure URLs and non-origin values', () => {
 for(const url of ['http://node.example.com','https://user:pass@node.example.com','https://node.example.com/path']) {
  vi.mocked(readFileSync).mockReturnValue(url);
  expect(readTunnelUrl()).toBe('');
 }
});
