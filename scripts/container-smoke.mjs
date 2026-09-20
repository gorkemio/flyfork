import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { reserve, inside, noSymlinks } from './r3-output.mjs';
import { verificationRoot, admitEnvironment } from './verification-paths.mjs';

// Standalone, narrow production test: no dev server, injected harness or CSP bypass.
if (process.argv.length !== 4) throw new Error('Usage: node scripts/container-smoke.mjs http://127.0.0.1:<port> <exported-dist>');
const base = new URL(process.argv[2]);
if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('Only local loopback root URLs are permitted');
admitEnvironment(process.env);
const dist = resolve(process.argv[3]); noSymlinks(dist);
const out = reserve(verificationRoot(), `container-smoke-${Date.now()}-${randomUUID().slice(0, 8)}`);
const path = name => inside(out, resolve(out, name));
const put = (name, value) => writeFileSync(path(name), JSON.stringify(value, null, 2), { flag: 'wx' });
const hash = data => createHash('sha256').update(data).digest('hex');
put('plan.json', { base: base.href, dist, outputs: ['http.json', 'browser.json', 'result.json', 'first-context.zip', 'import-context.zip', 'runtime.png', 'saved.flyfork.json', 'imported.flyfork.json', 'replayed.flyfork.json'], browser: 'installed Google Chrome, headless', bypassCSP: false, retries: 0 });
put('command.json', { argv: process.argv.slice(1), node: process.version, platform: process.platform, arch: process.arch, startedAt: new Date().toISOString() });
console.log(`START container smoke: ${out}`);
const http = [], browserLog = { requests: [], responses: [], failedRequests: [], console: [], pageErrors: [], workers: [], crashes: [] };
let browser; const contexts = []; let result;
try {
    const infoBytes = readFileSync(resolve(dist, 'build-info.json'));
    const info = JSON.parse(infoBytes);
    const expected = { ...info.payload, 'build-info.json': hash(infoBytes) };
    assert.equal(hash(JSON.stringify(info.payload)), info.payloadManifestSha256);
    for (const [file, sha] of Object.entries(expected)) {
        assert.equal(hash(readFileSync(inside(dist, resolve(dist, file)))), sha, file);
        for (const method of ['GET', 'HEAD']) {
            const res = await fetch(new URL(file, base), { method, signal: AbortSignal.timeout(10000) });
            const headers = Object.fromEntries(res.headers), bytes = Buffer.from(await res.arrayBuffer());
            http.push({ file, method, status: res.status, headers, bytes: bytes.length });
            assert.equal(res.status, 200, file);
            const mime = file.endsWith('.js') ? /javascript/ : file.endsWith('.css') ? /text\/css/ : file.endsWith('.json') ? /application\/json/ : file.endsWith('.html') ? /text\/html/ : file.endsWith('.jpg') ? /image\/jpeg/ : file.endsWith('.svg') ? /image\/svg\+xml/ : /text\/plain/;
            assert.match(headers['content-type'], mime, file);
            const immutable = /^assets\/[^/]+-[\w-]{8}\.(js|css)$/.test(file);
            assert.equal(headers['cache-control'], immutable ? 'public, max-age=31536000, immutable' : ['index.html','build-info.json'].includes(file) ? 'no-store' : 'no-cache', file);
            assert.equal(headers['x-content-type-options'], 'nosniff');
            assert.match(headers['content-security-policy'], /worker-src 'self'/);
            assert.doesNotMatch(headers['content-security-policy'], /unsafe-eval|script-src[^;]*unsafe-inline|blob:|data:/);
            assert.equal(bytes.length, method === 'HEAD' ? 0 : Number(headers['content-length']));
            if (method === 'GET') assert.equal(hash(bytes), sha, file);
        }
    }
    for (const method of ['GET', 'HEAD']) {
        const home = await fetch(base, { method });
        assert.equal(home.status, 200);
        if (method === 'GET') assert.equal(hash(Buffer.from(await home.arrayBuffer())), expected['index.html']);
        const health = await fetch(new URL('/healthz', base), { method });
        assert.equal(health.status, 200);
        assert.match(health.headers.get('content-type'), /text\/plain/);
        assert.equal(await health.text(), method === 'GET' ? 'ok\n' : '');
        http.push({ file: '/healthz', method, status: health.status, headers: Object.fromEntries(health.headers) });
    }
    for (const file of ['/assets/missing-12345678.js', '/assets/simulation.worker-missing.js', '/assets/lab/missing.jpg', '/missing-page', '/src/app/App.tsx', '/tests/', '/docs/evidence/stage-4/round-trip.flyfork.json', '/data/prepared/', '/SOURCE_MANIFEST.json', '/package.json', '/pnpm-lock.yaml', '/.env', '/.git/config', '/.tools/', '/artifacts/', '/assets/']) {
        for (const method of ['GET', 'HEAD']) {
            const res = await fetch(new URL(file, base), { method });
            const text = await res.text();
            http.push({ file, method, status: res.status, headers: Object.fromEntries(res.headers) });
            assert.ok(file === '/assets/' ? [403, 404].includes(res.status) : res.status === 404, file);
            assert.ok(!text.includes('<div id="root">'), 'no HTML app fallback');
            assert.equal(res.headers.get('cache-control'), 'no-cache');
            assert.ok(res.headers.get('content-security-policy'), 'headers also on errors');
        }
    }
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    browserLog.engine = 'Google Chrome'; browserLog.version = browser.version(); browserLog.platform = process.platform; browserLog.bypassCSP = false;
    async function newPage(label) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: false });
        contexts.push({ context, label });
        await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
        const page = await context.newPage(); page.setDefaultTimeout(60000);
        page.on('request', r => browserLog.requests.push({ context: label, url: r.url(), type: r.resourceType() }));
        page.on('response', r => browserLog.responses.push({ context: label, url: r.url(), status: r.status() }));
        page.on('requestfailed', r => browserLog.failedRequests.push({ context: label, url: r.url(), error: r.failure() }));
        page.on('console', m => browserLog.console.push({ context: label, type: m.type(), text: m.text() }));
        page.on('pageerror', e => browserLog.pageErrors.push({ context: label, error: e.message }));
        page.on('worker', w => browserLog.workers.push({ context: label, url: w.url() }));
        page.on('crash', () => browserLog.crashes.push(label));
        await page.goto(base.href);
        assert.equal(await page.evaluate(() => isSecureContext && Boolean(crypto.subtle) && Boolean(navigator.locks)), true);
        return page;
    }
    const page = await newPage('first');
    const click = (p, name) => p.getByRole('button', { name, exact: true }).click();
    const text = (p, id, value) => expect(p.getByTestId(id)).toHaveText(value, { timeout: 60000 });
    const pose = p => p.locator('.branch-window').evaluateAll(nodes => nodes.map(n => [n.getAttribute('data-x'), n.getAttribute('data-y')]));
    const exportFile = async (p, name) => {
        const download = p.waitForEvent('download'); await click(p, 'Export file');
        await (await download).saveAs(path(name)); return JSON.parse(readFileSync(path(name), 'utf8'));
    };
    await click(page, 'Run guided experiment');
    for (const name of ['Create same-state forks', 'Apply guided interventions', 'Compute to 12 s', 'Verify own histories', 'Finish guide']) await click(page, name);
    await text(page, 'model-time', '12.000 s'); await text(page, 'replay-status', 'Matched');
    await text(page, 'comparison', 'Branches differ');
    const pose12 = await pose(page);
    await page.getByLabel('Seek time seconds').fill('5'); await click(page, 'Seek');
    await text(page, 'model-time', '5.000 s'); await text(page, 'recorded-frontier', 'Recorded to 12.000 s');
    const pose5 = await pose(page);
    await click(page, 'Save'); await page.getByLabel('Experiment name', { exact: true }).fill('Container 5 view 12 frontier');
    await click(page, 'Save to Library'); await text(page, 'save-status', 'Saved');
    await page.reload(); await click(page, 'Open Library or import'); await click(page, 'Preview Container 5 view 12 frontier');
    await expect(page.getByRole('dialog')).toContainText('Not checked'); await click(page, 'Load experiment');
    await text(page, 'model-time', '5.000 s'); await text(page, 'recorded-frontier', 'Recorded to 12.000 s'); await text(page, 'replay-status', 'Not checked');
    assert.deepEqual(await pose(page), pose5);
    const saved = await exportFile(page, 'saved.flyfork.json');
    assert.equal(saved.content.playhead, 50000); assert.equal(saved.content.frontier, 120000); assert.equal(saved.content.metadata.dataset, 'malecns');
    const imported = await newPage('import');
    await click(imported, 'Open Library or import'); await imported.getByLabel('Import .flyfork.json').setInputFiles(path('saved.flyfork.json'));
    await expect(imported.getByRole('dialog')).toContainText('Not checked'); await click(imported, 'Load experiment');
    await text(imported, 'model-time', '5.000 s'); await text(imported, 'recorded-frontier', 'Recorded to 12.000 s'); await text(imported, 'replay-status', 'Not checked');
    assert.deepEqual(await pose(imported), pose5);
    const importedFile = await exportFile(imported, 'imported.flyfork.json');
    const history = file => { const { metadata, ...content } = file.content; assert.equal(metadata.dataset, 'malecns'); return content; };
    assert.deepEqual(history(importedFile), history(saved), 'all numerical buffers, events, proofs, dataset/config IDs and times survive import');
    await click(imported, 'Replay check'); await text(imported, 'replay-status', 'Matched');
    await imported.getByLabel('Seek time seconds').fill('12'); await click(imported, 'Seek'); await text(imported, 'model-time', '12.000 s');
    await click(imported, 'Replay check'); await text(imported, 'replay-status', 'Matched'); await click(imported, 'Compare states'); await text(imported, 'comparison', 'Branches differ');
    assert.deepEqual(await pose(imported), pose12);
    const replayed = await exportFile(imported, 'replayed.flyfork.json');
    const terminals = file => file.content.records.map(r => ({ branch: r.branch, start: file.content.snapshots[r.start], terminal: file.content.snapshots[r.terminal], proofs: r.proofs }));
    assert.deepEqual(terminals(replayed), terminals(saved), 'recorded numerical histories and events survive replay');
    assert.equal(replayed.content.frontier, 120000); assert.equal(replayed.content.playhead, 120000);
    await imported.screenshot({ path: path('runtime.png') });
    assert.equal(await imported.getByText(/WebGL unavailable|WebGL context lost/).count(), 0);
    assert.deepEqual(browserLog.pageErrors, []); assert.deepEqual(browserLog.crashes, []); assert.deepEqual(browserLog.failedRequests, []);
    assert.deepEqual(browserLog.console.filter(m => m.type === 'error'), []);
    assert.deepEqual(browserLog.requests.filter(r => new URL(r.url).origin !== base.origin), []);
    assert.deepEqual(browserLog.responses.filter(r => r.status >= 400), []);
    assert.ok(browserLog.workers.length >= 2 && browserLog.workers.every(w => /^\/assets\/simulation\.worker-[\w-]{8}\.js$/.test(new URL(w.url).pathname)));
    result = { code: 0, sourceManifestSha256: info.sourceManifestSha256, buildInfoSha256: expected['build-info.json'], sameRuntimeReplay: [5, 12], historyEqualAfterImport: true, terminalHistoryEqualAfterReplay: true, pose5, pose12, physicalPerformance: 'NOT_RUN', crossRuntimeEquality: 'NOT_CLAIMED' };
} catch (error) {
    result = { code: 1, error: String(error), stack: error.stack };
} finally {
    for (const { context, label } of contexts) {
        await context.tracing.stop({ path: path(`${label}-context.zip`) }); await context.close();
    }
    await browser?.close();
    put('http.json', http); put('browser.json', browserLog); put('result.json', result);
}
console.log(JSON.stringify(result)); console.log(`END container smoke: ${out}`);
process.exitCode = result.code;
