import { defineConfig } from '@playwright/test';
import base from './playwright.config';
import { assertRun, browserOutputs, browserRunMode } from './scripts/verification-paths.mjs';

const mode = browserRunMode();
if (!['e2e', 'e2e-webkit', 'e2e-firefox', 'smoke'].includes(mode)) throw new Error('Browser tests require the portable runner');
const run = assertRun(process.env.FLYFORK_EVIDENCE_DIR ?? '');
const outputs = browserOutputs(base, run);
const use = { ...base.use };
delete use.channel;
const portableTests = ['command-activation.spec.ts', 'persistence.spec.ts', 'library-actions.spec.ts', 'library-transactions.spec.ts', 'storage-faults.spec.ts', 'guide-cancel.spec.ts'];
export default defineConfig(base, {
    ...outputs,
    use,
    ...(mode === 'smoke' ? { testDir: './tests/browser-smoke' } : mode === 'e2e' ? {} : { testMatch: portableTests }),
    projects: mode === 'smoke' ? [
        { name: 'chrome', use: { browserName: 'chromium', channel: 'chrome' } },
        { name: 'webkit', use: { browserName: 'webkit' } },
        { name: 'firefox', use: { browserName: 'firefox' } },
    ] : mode === 'e2e' ? [{ name: 'chrome', use: { browserName: 'chromium', channel: 'chrome' } }]
        : [{ name: mode.slice(4), use: { browserName: mode === 'e2e-webkit' ? 'webkit' : 'firefox' } }],
});
