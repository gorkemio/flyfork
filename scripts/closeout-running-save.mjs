import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { reserve, inside } from './r3-output.mjs';
import { assertRun, admitEnvironment } from './verification-paths.mjs';
import { installSaveObserver } from './save-observer.mjs';
import { sha256, sameRequest, sameOwner, correlateNamedSave, assertViewContent, compareReopenedExport, loadFileValidators } from './save-evidence.mjs';

admitEnvironment(process.env);
const [baseURL, parentArg] = process.argv.slice(2);
if (process.argv.length !== 4) throw Error('loopbackURL active-closeout-root required');
const url = new URL(baseURL);
if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw Error('Loopback root required');
const parent = assertRun(parentArg);
if (!existsSync(resolve(parent, 'plan.json')) || existsSync(resolve(parent, 'result.json'))) throw Error('Active closeout root required');
const identity = JSON.parse(readFileSync(inside(parent, resolve(parent, 'h01-image.json'))));
assert.equal(identity.baseURL, baseURL);
const preflight = JSON.parse(readFileSync(inside(parent, resolve(parent, 'h01-preflight.json'))));
assert.equal(preflight.code, 0, 'small helper tests must pass before the browser run');
for (const [path, digest] of Object.entries(preflight.inputs)) assert.equal(sha256(readFileSync(path)), digest, `preflight changed: ${path}`);
const run = reserve(parent, `running118-${Date.now()}-${randomUUID().slice(0, 8)}`);
const path = n => inside(run, resolve(run, n));
const raw = (n, bytes) => writeFileSync(path(n), bytes, { flag: 'wx', mode: 0o600 });
const put = (n, value) => raw(n, JSON.stringify(value, null, 2) + '\n');
const name = 'Closeout running118 ' + randomUUID().slice(0, 8);
put('plan.json', { created: new Date().toISOString(), identity, baseURL, case: 'running118', name, channel: 'installed Google Chrome', headless: false, foreground: true, isolatedContext: true, bypassCSP: false, viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1, seed: 42, dataset: 'MaleCNS DM1', quality: 'Standard default', speed: 2, branches: ['original', 'A', 'B'], guide: 'existing real six-step guide', trigger: 'first observed tick >= 1180000, then one native Save open and named submit; record actual ticks', correlation: 'native form intent + page/Worker/session/epoch/request + exact request metadata + ACK bytes + named IDB connection/transaction/record id/revision', comparison: 'real inspectExperiment/deserializeExperiment; canonical whole export equals stored after only content.metadata.savedAt transformation; id/name/runtime/dataset and all scientific content unchanged', timeouts: { defaultActionMs: 60000, runTo118Ms: 65000, expectMs: 5000 }, retries: 0, trace: 'before initial navigation', privateEvidence: ['raw ACK files', 'named committed payload', 'expected transformed export', 'downloaded export', 'entry', 'Worker/input/IDB events', 'screenshots', 'trace'], replay118: 'NOT_RUN', performanceClaim: false, observer: 'test context only, no delays or product state mutation; reference capture plus small metadata copies' });
put('command.json', { argv: process.argv, node: process.version, platform: process.platform, arch: process.arch, scriptSha256: sha256(readFileSync(import.meta.filename)), preflight });
const result = { status: 'NOT_RUN', gates: { ackStored: 'NOT_RUN', reloadLoad: 'NOT_RUN', exportEquality: 'NOT_RUN', replay118: 'NOT_RUN' }, errors: [], console: [] };
let browser, context, page;
const snap = () => page.evaluate(() => window.__saveEvidence.snapshot());
async function collect() {
    return page.evaluate(async expectedName => {
        const observed = window.__saveEvidence;
        const db = await new Promise((ok, fail) => { const request = indexedDB.open('flyfork-library'); request.onsuccess = () => ok(request.result); request.onerror = () => fail(request.error); });
        try {
            return await new Promise((ok, fail) => {
                const tx = db.transaction(['entries', 'payloads'], 'readonly'), entries = tx.objectStore('entries').getAll(), payloads = tx.objectStore('payloads').getAll();
                tx.oncomplete = () => {
                    const rows = entries.result.filter(e => e.name === expectedName), entry = rows[0];
                    ok({ entry, matches: rows.length, stored: payloads.result.find(f => f.id === entry?.id)?.file, events: observed.events, files: observed.files, snapshot: observed.snapshot() });
                };
                tx.onerror = () => fail(tx.error);
            });
        } finally { db.close(); }
    }, name);
}
function persist(prefix, captured) {
    const { files, stored, ...summary } = captured;
    put(prefix + '-events.json', summary);
    const inventory = files.map((text, i) => { const name = `${prefix}-file-${i}.flyfork.json`; raw(name, text); return { ref: i, path: name, bytes: Buffer.byteLength(text), sha256: sha256(text) }; });
    if (stored) { raw(prefix + '-stored.flyfork.json', stored); inventory.push({ path: prefix + '-stored.flyfork.json', bytes: Buffer.byteLength(stored), sha256: sha256(stored) }); }
    put(prefix + '-inventory.json', inventory);
}
try {
    const validators = await loadFileValidators();
    const response = await fetch(new URL('build-info.json', baseURL)), info = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200); assert.equal(sha256(info), identity.buildInfoSha256);
    raw('served-build-info.json', info);
    browser = await chromium.launch({ channel: 'chrome', headless: false });
    result.browser = browser.version();
    context = await browser.newContext({ baseURL, viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1, bypassCSP: false });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    page = await context.newPage(); page.setDefaultTimeout(60000); await page.addInitScript(installSaveObserver);
    page.on('pageerror', e => result.errors.push(e.message));
    page.on('console', m => { if (result.console.length < 300) result.console.push({ type: m.type(), text: m.text() }); });
    const click = title => page.getByRole('button', { name: title, exact: true }).click();
    await page.goto('/'); await page.bringToFront();
    result.initialPage = await snap();
    for (const title of ['Run guided experiment', 'Create same-state forks', 'Apply guided interventions', 'Compute to 12 s', 'Verify own histories', 'Finish guide']) await click(title);
    await expect(page.getByTestId('model-time')).toHaveText('12.000 s');
    await expect(page.getByLabel('Three real branch arenas, Standard visual quality', { exact: true })).toBeVisible();
    result.ready = await snap();
    assert.equal(result.ready.view.seed, 42); assert.equal(result.ready.view.dataset.kind, 'malecns');
    assert.ok(result.ready.view.branch && result.ready.view.branchB);
    await page.getByLabel('Simulation speed').selectOption('2'); await click('Resume');
    await page.waitForFunction(() => window.__saveEvidence.snapshot().tick >= 1180000, undefined, { timeout: 65000 });
    result.before = await snap();
    assert.equal(result.before.running, true); assert.equal(result.before.visible, 'visible'); assert.equal(result.before.active, true);
    result.phase = 'save';
    await click('Save'); await page.getByLabel('Experiment name', { exact: true }).fill(name); await click('Save to Library');
    await page.waitForFunction(expectedName => {
        const events = window.__saveEvidence.events;
        const entry = events.find(e => e.type === 'put' && e.store === 'entries' && e.entry.name === expectedName);
        return entry && events.some(e => e.type === 'transaction-complete' && e.txId === entry.txId && e.dbId === entry.dbId);
    }, name);
    await expect(page.getByRole('dialog')).toBeHidden();
    const captured = await collect();
    persist('pre-reload', captured); // Raw payloads survive even a subsequent assertion failure.
    assert.equal(captured.matches, 1); assert.equal(captured.snapshot.overflow, false);
    const commit = correlateNamedSave(captured, name);
    raw('expected-ack.flyfork.json', captured.files[commit.ack.fileRef]);
    put('named-commit.json', commit);
    const validated = await validators.validateFile(captured.stored), content = validated.file.content;
    assert.deepEqual(content.records.map(r => r.branch), ['original', 'A', 'B']);
    assert.equal(content.seed, 42);
    result.gates.ackStored = 'PASS';
    result.commit = { request: commit.request, transaction: commit.transaction, entry: commit.entry, submitTick: commit.submit.tick, openTick: commit.open.tick, liveCommitTick: commit.commit.tick, liveCommitRunning: commit.commit.running, storedSha256: commit.storedSha256, storedBytes: commit.storedBytes, totalExportACKs: commit.totalExportACKs };
    result.phase = 'reloadLoad';
    await page.reload(); await page.bringToFront();
    await click('Open Library or import'); await click('Preview ' + name);
    await expect(page.getByRole('button', { name: 'Load experiment', exact: true })).toBeEnabled();
    const preview = await page.evaluate(() => ({ events: window.__saveEvidence.events, files: window.__saveEvidence.files, snapshot: window.__saveEvidence.snapshot() }));
    persist('preview', preview);
    const loads = preview.events.filter(e => e.type === 'command' && e.command === 'LOAD');
    assert.equal(loads.length, 1); const load = loads[0];
    assert.equal(preview.files[load.fileRef], captured.stored, 'native Library preview loaded the selected record bytes');
    assert.notEqual(load.pageId, commit.request.pageId);
    const reads = preview.events.filter(e => e.type === 'get' && e.key === captured.entry.id);
    assert.ok(reads.some(e => e.store === 'entries') && reads.some(e => e.store === 'payloads'), 'selected Library record identity was read');
    const loadACKs = preview.events.filter(e => e.type === 'reply' && sameRequest(e, load));
    assert.equal(loadACKs.length, 1); const loadACK = loadACKs[0];
    assert.equal(loadACK.kind, 'ACK'); assert.equal(loadACK.revision, load.expectedRevision + 1);
    assertViewContent(loadACK.view, content); assert.equal(loadACK.view.running, false); assert.equal(loadACK.view.replay.status, 'Not checked');
    await page.screenshot({ path: path('library-preview.png') });
    await click('Load experiment'); await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('model-time')).toHaveText((content.playhead / 10000).toFixed(3) + ' s');
    await expect(page.getByTestId('recorded-frontier')).toHaveText('Recorded to ' + (content.frontier / 10000).toFixed(3) + ' s');
    await expect(page.getByTestId('replay-status')).toHaveText('Not checked');
    await expect(page.getByTestId('save-status')).toHaveText('Saved');
    const beforeExport = await page.evaluate(() => window.__saveEvidence.events.length);
    const pending = page.waitForEvent('download'); await click('Export file');
    await (await pending).saveAs(path('reopened-export.flyfork.json'));
    const after = await page.evaluate(() => ({ events: window.__saveEvidence.events, files: window.__saveEvidence.files, snapshot: window.__saveEvidence.snapshot() }));
    persist('reopened', after);
    const exported = readFileSync(path('reopened-export.flyfork.json'), 'utf8');
    const exportRequests = after.events.slice(beforeExport).filter(e => e.type === 'command' && e.command === 'EXPORT_STATE' && sameOwner(e, load) && e.metadata.id === captured.entry.id && e.metadata.name === name);
    assert.equal(exportRequests.length, 1); const request = exportRequests[0];
    const exportACKs = after.events.filter(e => e.type === 'reply' && sameRequest(e, request));
    assert.equal(exportACKs.length, 1); assert.equal(exportACKs[0].kind, 'ACK');
    assert.equal(after.files[exportACKs[0].fileRef], exported);
    assertViewContent(exportACKs[0].view, content); assert.equal(exportACKs[0].view.replay.status, 'Not checked');
    result.gates.reloadLoad = 'PASS'; // The installed client, not only preview/UI text, served this export.
    result.phase = 'exportEquality';
    const comparison = await compareReopenedExport(captured.stored, exported, request, validators);
    const { expectedText, ...summary } = comparison;
    raw('expected-reopened-export.flyfork.json', expectedText);
    put('comparison.json', { ...summary, installedWorker: load, exportRequest: request, downloadedBytes: Buffer.byteLength(exported) });
    result.comparison = summary; result.gates.exportEquality = 'PASS';
    result.reopened = after.snapshot;
    assert.equal(after.snapshot.overflow, false); assert.deepEqual(result.errors, []);
    await page.screenshot({ path: path('reopened.png') });
    result.status = 'PASS';
} catch (error) {
    result.status = page ? 'FAIL' : 'NOT_RUN_ENVIRONMENT'; result.error = error.stack;
    if (result.phase) result.gates[result.phase === 'save' ? 'ackStored' : result.phase] = 'FAIL';
    if (page) {
        try { const captured = await collect(); persist('first-failure', captured); result.firstFailure = captured.snapshot; } catch (captureError) { result.captureError = String(captureError); }
        try { await page.screenshot({ path: path('first-failure.png') }); } catch (screenshotError) { result.screenshotError = String(screenshotError); }
    }
} finally {
    if (context) {
        try { await context.tracing.stop({ path: path('trace.zip') }); } catch (error) { result.traceError = String(error); result.status = 'FAIL'; }
        await context.close();
    }
    if (browser) await browser.close();
    put('result.json', result);
    console.log(JSON.stringify({ run, status: result.status, gates: result.gates, error: result.error, commit: result.commit && { tick: result.commit.entry.playhead, requestId: result.commit.request.requestId, storedSha256: result.commit.storedSha256 } }));
    process.exitCode = result.status === 'PASS' ? 0 : 1;
}
