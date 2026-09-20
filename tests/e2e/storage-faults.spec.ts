import { evidencePath } from '../evidence-path';
import { axe } from './a11y';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
test('corrupt recovery metadata leaves the welcome screen and named Library usable', async ({ page }) => {
    await blank(page);
    await step(page);
    await save(page, 'Safe named record');
    await expect(page.getByText(/Last durable recovery: view 1.00 s/)).toBeVisible({ timeout: 12000 });
    await page.evaluate(() => new Promise<void>((resolve, reject) => { const q = indexedDB.open('flyfork-library'); q.onerror = () => reject(q.error); q.onsuccess = () => { const db = q.result, tx = db.transaction('recovery', 'readwrite'), store = tx.objectStore('recovery'), get = store.get('slot'); get.onsuccess = () => store.put({ ...get.result, entry: null }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; }));
    await page.reload();
    await expect(page.getByRole('button', { name: 'Open Library or import', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Open Library or import', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Recovery metadata is corrupt');
    await page.getByRole('button', { name: 'Preview Safe named record', exact: true }).click();
    await page.getByRole('button', { name: 'Load experiment', exact: true }).click();
    await expect(page.getByTestId('model-time')).toHaveText('1.000 s');
});
async function blank(page: Page) { await page.goto('/'); await page.getByRole('button', { name: 'Start blank experiment', exact: true }).click(); await expect(page.getByRole('button', { name: '+1 s', exact: true })).toBeEnabled(); }
async function step(page: Page) { await page.getByRole('button', { name: '+1 s', exact: true }).click(); await expect(page.getByTestId('run-status')).not.toHaveText('Computing'); }
async function save(page: Page, name: string) { await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.getByLabel('Experiment name', { exact: true }).fill(name); await page.getByRole('button', { name: 'Save to Library', exact: true }).click(); await expect(page.getByTestId('save-status')).toHaveText('Saved'); }
async function payloads(page: Page) { return page.evaluate(() => new Promise<unknown[]>((resolve, reject) => { const request = indexedDB.open('flyfork-library'); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result; const tx = db.transaction('payloads'); const query = tx.objectStore('payloads').getAll(); query.onsuccess = () => resolve(query.result); tx.oncomplete = () => db.close(); }; })); }
test('quota and transaction abort preserve the previous durable Library record', async ({ page }) => {
    await page.addInitScript(() => {
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
            if (Reflect.get(window, 'failStore') === this.name)
                throw new DOMException('Injected storage failure', Reflect.get(window, 'failKind') as string);
            return original.call(this, value, key);
        };
    });
    await blank(page);
    await step(page);
    await save(page, 'Durable');
    const before = await payloads(page);
    await step(page);
    for (const [store, kind] of [['payloads', 'QuotaExceededError'], ['entries', 'AbortError']]) {
        await page.evaluate(({ store, kind }) => { Reflect.set(window, 'failStore', store); Reflect.set(window, 'failKind', kind); }, { store, kind });
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await page.getByRole('button', { name: 'Save to Library', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText(kind === 'QuotaExceededError' ? 'quota' : 'Injected storage failure');
        expect(await payloads(page)).toEqual(before);
        await expect(page.getByTestId('save-status')).toHaveText('Unsaved history');
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    await page.evaluate(() => Reflect.set(window, 'failStore', ''));
    await save(page, 'Durable');
    expect(await payloads(page)).not.toEqual(before);
});
test('two tabs detect optimistic revision conflicts and preserve independent recovery ownership', async ({ page, context }) => {
    await blank(page);
    await step(page);
    await save(page, 'Shared');
    const second = await context.newPage();
    await second.goto(new URL('/', page.url()).href);
    await second.getByRole('button', { name: 'Open Library or import', exact: true }).click();
    await second.getByRole('button', { name: 'Preview Shared', exact: true }).click();
    await second.getByRole('button', { name: 'Load experiment', exact: true }).click();
    await step(page);
    await save(page, 'Shared');
    const before = await payloads(page);
    await step(second);
    await second.getByRole('button', { name: 'Save', exact: true }).click();
    await second.getByRole('button', { name: 'Save to Library', exact: true }).click();
    await expect(second.getByRole('alert')).toContainText('Conflict');
    expect(await payloads(page)).toEqual(before);
    await second.getByRole('dialog').getByRole('button', { name: 'Save as copy', exact: true }).click();
    await second.getByRole('button', { name: 'Save to Library', exact: true }).click();
    await expect(second.getByTestId('save-status')).toHaveText('Saved');
    expect(await payloads(page)).toHaveLength(2);
    await expect(second.getByText(/Automatic recovery unavailable here or owned by another tab/)).toBeVisible();
    await second.close();
});
test('unavailable IndexedDB is memory-only, while real simulation and file export work', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('Private storage unavailable', 'SecurityError'); } }); });
    await blank(page);
    await step(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export file', exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/\.flyfork\.json$/);
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('memory-only');
});
test('Worker error recovers only the last durable cursor and remains paused; WebGL loss preserves the motor', async ({ page }) => {
    test.setTimeout(60000);
    await page.addInitScript(() => {
        const Original = window.Worker, workers: Worker[] = [];
        Reflect.set(window, 'testWorkers', workers);
        window.Worker = class extends Original {
            constructor(url: string | URL, options?: WorkerOptions) { super(url, options); workers.push(this); }
        };
    });
    await blank(page);
    await page.getByRole('button', { name: '+5 s', exact: true }).click();
    await expect(page.getByTestId('model-time')).toHaveText('5.000 s');
    await expect(page.getByText(/Last durable recovery: view 5.00 s/)).toBeVisible({ timeout: 12000 });
    await step(page);
    await expect(page.getByTestId('model-time')).toHaveText('6.000 s');
    await page.evaluate(() => { const workers = Reflect.get(window, 'testWorkers') as Worker[]; workers.at(-1)!.dispatchEvent(new ErrorEvent('error', { message: 'Injected Worker failure' })); });
    await expect(page.getByRole('alert')).toContainText('Worker stopped');
    await page.getByRole('button', { name: 'Review recovery', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('5.000 s');
    await expect(page.getByRole('dialog')).toContainText('1.000 s of later computed history will be lost');
    await axe(page, 'recovery-preview');
    await page.screenshot({ path: evidencePath('recovery-preview.png') });
    await page.getByRole('button', { name: 'Load experiment', exact: true }).click();
    await page.getByRole('button', { name: 'Discard and continue', exact: true }).click();
    await expect(page.getByTestId('model-time')).toHaveText('5.000 s');
    await expect(page.getByTestId('run-status')).toHaveText('Paused');
    await page.evaluate(() => { const gl = document.querySelector('canvas')!.getContext('webgl2')!; const extension = gl.getExtension('WEBGL_lose_context')!; Reflect.set(window, 'lostExtension', extension); extension.loseContext(); });
    await expect(page.getByText(/WebGL context lost/)).toBeVisible();
    await step(page);
    await expect(page.getByTestId('model-time')).toHaveText('6.000 s');
    await page.evaluate(() => (Reflect.get(window, 'lostExtension') as WEBGL_lose_context).restoreContext());
    await expect(page.getByText(/WebGL context lost/)).toBeHidden();
});
test('blocked upgrade and versionchange preserve data and clearly disable storage until reopened', async ({ page }) => {
    await page.addInitScript(() => {
        const request = indexedDB.open('flyfork-library', 1);
        request.onupgradeneeded = () => {
            for (const name of ['entries', 'payloads', 'recovery'])
                request.result.createObjectStore(name, { keyPath: 'id' });
        };
        request.onsuccess = () => { Reflect.set(window, 'blockingDatabase', request.result); };
    });
    await blank(page);
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('upgrade blocked');
    await page.evaluate(() => (Reflect.get(window, 'blockingDatabase') as IDBDatabase).close());
    await expect(page.getByRole('dialog')).toContainText('Local Library');
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await step(page);
    await save(page, 'Keep through upgrade');
    const before = await payloads(page);
    await page.evaluate(() => new Promise<void>((resolve, reject) => { const q = indexedDB.open('flyfork-library', 11); q.onerror = () => reject(q.error); q.onsuccess = () => { q.result.close(); resolve(); }; }));
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Storage changed in another tab');
    expect(await payloads(page)).toEqual(before);
});
test('corrupt recovery cannot replace the live state or delete a sound named Library record', async ({ page }) => {
    await blank(page);
    await step(page);
    await save(page, 'Named durable record');
    await expect(page.getByText(/Last durable recovery: view 1.00 s/)).toBeVisible({ timeout: 12000 });
    const before = await payloads(page);
    await page.evaluate(() => new Promise<void>((resolve, reject) => { const q = indexedDB.open('flyfork-library'); q.onerror = () => reject(q.error); q.onsuccess = () => { const db = q.result, tx = db.transaction('recovery', 'readwrite'), store = tx.objectStore('recovery'), get = store.get('slot'); get.onsuccess = () => store.put({ ...get.result, file: '{}' }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; }));
    await page.reload();
    await page.getByRole('button', { name: 'Review recovery', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByTestId('model-time')).toHaveText('0.000 s');
    expect(await payloads(page)).toEqual(before);
    await page.getByRole('button', { name: 'Open Library or import', exact: true }).click();
    await page.getByRole('button', { name: 'Preview Named durable record', exact: true }).click();
    await page.getByRole('button', { name: 'Load experiment', exact: true }).click();
    await expect(page.getByTestId('model-time')).toHaveText('1.000 s');
});
