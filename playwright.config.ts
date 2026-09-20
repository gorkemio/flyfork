import { evidencePath } from './tests/evidence-path';
import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/e2e', fullyParallel: false, workers: 1, retries: 0, timeout: 60000,
    outputDir: evidencePath('test-results'),
    reporter: [['list'], ['json', { outputFile: evidencePath('regression-playwright-results.json') }]],
    use: { baseURL: process.env.FLYFORK_PREVIEW ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173', channel: 'chrome', headless: true, trace: 'retain-on-failure' },
    webServer: { command: process.env.FLYFORK_PREVIEW ? 'pnpm preview --port 4173 --strictPort' : 'pnpm dev --port 5173 --strictPort', url: process.env.FLYFORK_PREVIEW ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 30000 } });
