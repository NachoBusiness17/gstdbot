import { configDefaults, defineConfig } from 'vitest/config';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const testConfigDir = mkdtempSync(join(tmpdir(), 'gstd-vitest-config-dir-'));

export default defineConfig({
    test: {
        // Vitest 4 no longer excludes compiled output, which contains *.test.js.
        exclude: [...configDefaults.exclude, 'dist/**'],
        env: {
            GSTD_CONFIG_DIR: testConfigDir,
        },
    },
});
