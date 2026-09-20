import { evidencePath } from '../evidence-path';
import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'vite';
import { expect, test } from '@playwright/test';
import type * as Storage from '../../src/persistence/library';
let harness = '';
test.beforeAll(async () => {
    // Compile the actual Library module for browser-only transaction tests. Never ship this harness.
    const result = await build({ configFile: false, logLevel: 'error', build: { write: false, minify: false, lib: { entry: 'src/persistence/library.ts', formats: ['iife'], name: 'StorageUnderTest' } } });
    const bundle = Array.isArray(result) ? result[0] : result;
    if (!('output' in bundle))
        throw new Error('Unexpected test bundle');
    harness = bundle.output.find(part => part.type === 'chunk')!.code;
});
test('real IndexedDB rolls back obsolete saves and recovery writes even after payload put', async ({ page }) => {
    await page.goto('/');
    await page.addScriptTag({ content: harness });
    const result = await page.evaluate(async (file) => {
        const storage = Reflect.get(window, 'StorageUnderTest') as typeof Storage, db = new storage.Library(() => { }, 'stage4-transaction-test');
        await db.open();
        const prepared = await storage.prepareFile(file);
        const saved = await db.save(prepared, null), before = await db.read(saved.id);
        let calls = 0, saveError = '';
        try {
            await db.save(prepared, saved.revision, () => ++calls === 1);
        }
        catch (error) {
            saveError = String(error);
        }
        const after = await db.read(saved.id);
        await db.claimRecovery('first', null);
        await db.saveRecovery(prepared, 'first', 1);
        const recoveryBefore = await db.recovery.get('slot');
        let recoveryCalls = 0, recoveryError = '';
        try {
            await db.saveRecovery(prepared, 'first', 2, () => ++recoveryCalls === 1);
        }
        catch (error) {
            recoveryError = String(error);
        }
        const recoveryAfter = await db.recovery.get('slot'), rejections: string[] = [];
        for (const [owner, sequence] of [['first', 1], ['other', 5]] as const) {
            try {
                await db.saveRecovery(prepared, owner, sequence);
            }
            catch (error) {
                rejections.push(String(error));
            }
        }
        await db.claimRecovery('second', recoveryAfter!.revision);
        const transferred = await db.recovery.get('slot');
        try {
            await db.saveRecovery(prepared, 'first', 20);
        }
        catch (error) {
            rejections.push(String(error));
        }
        const final = await db.recovery.get('slot');
        db.close();
        return { before, after, calls, saveError, recoveryBefore, recoveryAfter, recoveryCalls, recoveryError, rejections, transferred, final };
    }, readFileSync('docs/evidence/stage-4/round-trip.flyfork.json', 'utf8'));
    expect(result.saveError).toContain('Obsolete');
    expect(result.calls).toBe(2);
    expect(result.after).toEqual(result.before);
    expect(result.recoveryError).toContain('Obsolete');
    expect(result.recoveryCalls).toBe(2);
    expect(result.recoveryAfter).toEqual(result.recoveryBefore);
    expect(result.rejections).toHaveLength(3);
    expect(result.final).toEqual(result.transferred);
    expect(result.final!.file).toBe(result.recoveryBefore!.file);
    writeFileSync(evidencePath('transaction-guards.json'), JSON.stringify({ saveChecks: result.calls, recoveryChecks: result.recoveryCalls, saveRollback: true, recoveryRollback: true, ownerAndSequenceRejections: result.rejections, previousPayloadKeptOnTransfer: true }, null, 2));
});
