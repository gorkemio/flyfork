import { evidencePath } from '../evidence-path';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { LabView } from '../../src/worker-protocol/protocol';

declare global {
    interface Window {
        __refinement: { view: LabView | null; workers: number; databases: number; contexts: number; commands: string[] };
    }
}
function observeRefinement() {
    const probe = window.__refinement = { view: null as LabView | null, workers: 0, databases: 0, contexts: 0, commands: [] as string[] };
    const WorkerClass = window.Worker;
    window.Worker = class extends WorkerClass {
        constructor(url: string | URL, options?: WorkerOptions) {
            super(url, options); probe.workers++;
            this.addEventListener('message', event => { if (event.data.view) probe.view = event.data.view as LabView; });
        }
        postMessage(message: { type: string }) { probe.commands.push(message.type); super.postMessage(message); }
    };
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args: Parameters<typeof open>) { probe.databases++; return open.apply(this, args); };
    const context = HTMLCanvasElement.prototype.getContext, seen = new WeakSet<HTMLCanvasElement>();
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof context>) {
        const result = context.apply(this, args);
        if (result && args[0].startsWith('webgl') && !seen.has(this)) { seen.add(this); probe.contexts++; }
        return result;
    } as typeof context;
}
async function click(page: Page, name: string) { const b = page.getByRole('button', { name, exact: true }); await expect(b).toBeEnabled(); await b.click(); await expect(page.getByTestId('control-status')).toContainText('completed'); }
async function magnitude(page: Page, value: number) {
    const r = page.getByLabel('Magnitude', { exact: true });
    await r.focus();
    await r.press('Home');
    for (let i = 0; i < Math.round(value / .05); i++)
        await r.press('ArrowRight');
}
async function fork(page: Page) {
    await page.goto('/');
    await page.getByRole('button', { name: 'Start blank experiment', exact: true }).click();
    await expect(page.getByText('80 neurons · 4,011 directed edges')).toBeVisible();
    await click(page, 'Start');
    await click(page, 'Pause');
    await click(page, 'Seek');
    await click(page, '+1 s');
    await click(page, '+1 s');
    await click(page, 'Capture snapshot');
    await click(page, 'Fork A + B');
}
async function apply(page: Page, branch: 'A' | 'B', operation: 'suppression' | 'odor-gain', magnitude: number) {
    await page.getByLabel('Intervention branch').selectOption(branch);
    await page.getByLabel('Operator', { exact: true }).selectOption(operation);
    if (operation === 'suppression')
        await page.getByLabel('Source group').selectOption('DM1_lPN L');
    await page.getByLabel('Magnitude', { exact: true }).focus();
    await page.getByLabel('Magnitude', { exact: true }).press('Home');
    for (let i = 0; i < Math.round(magnitude / .05); i++)
        await page.getByLabel('Magnitude', { exact: true }).press('ArrowRight');
    await page.getByLabel('Start after seconds').fill('1');
    await page.getByLabel('Duration seconds').fill('5');
    await click(page, 'Apply intervention');
}
async function bindings(page: Page) {
    return page.locator('canvas').getAttribute('data-bindings').then(s => JSON.parse(s ?? '[]') as {
        branch: string;
        tick: number;
        x: number;
        y: number;
        trailPoints: number;
    }[]);
}
for (const viewport of [{ width: 1672, height: 941 }, { width: 1440, height: 900 }])
    test(`stage3 real intervention flow and three bound viewports ${viewport.width}`, async ({ page, browser }) => {
        const errors: string[] = [], requests: string[] = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => {
            if (m.type() === 'error')
                errors.push(m.text());
        });
        page.on('request', r => requests.push(r.url()));
        await page.setViewportSize(viewport);
        await fork(page);
        await apply(page, 'A', 'suppression', 1);
        await apply(page, 'B', 'odor-gain', 0);
        await click(page, '+5 s');
        await click(page, '+5 s');
        await click(page, 'Compare states');
        await expect(page.getByTestId('comparison')).toContainText('Branches differ');
        await expect(page.getByTestId('replay-status')).toHaveText('Not checked');
        await click(page, 'Replay check');
        await expect(page.getByTestId('replay-status')).toHaveText('Matched');
        await click(page, 'Compare states');
        expect(await page.locator('canvas').count()).toBe(1);
        await expect.poll(async () => (await bindings(page)).length).toBe(3);
        const drawn = await bindings(page);
        for (const b of drawn) {
            const card = page.locator(`[data-branch="${b.branch}"]`);
            expect(Number(await card.getAttribute('data-tick'))).toBe(b.tick);
            expect(Number(await card.getAttribute('data-x'))).toBeCloseTo(b.x, 9);
            expect(Number(await card.getAttribute('data-y'))).toBeCloseTo(b.y, 9);
            expect(b.tick).toBe(120000);
            expect(b.trailPoints).toBe(1201);
        }
        expect(drawn[0].x !== drawn[1].x || drawn[0].y !== drawn[1].y).toBe(true);
        await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
        await page.screenshot({ path: evidencePath(`regression-triple-${viewport.width}x${viewport.height}.png`) });
        const bounds = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
        expect(bounds.width).toBe(viewport.width);
        expect(bounds.height).toBeGreaterThanOrEqual(viewport.height);
        await page.locator('.page-footer').scrollIntoViewIfNeeded();
        await expect(page.locator('.page-footer')).toBeInViewport();
        await page.getByRole('button', { name: 'Resume', exact: true }).scrollIntoViewIfNeeded();
        await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeInViewport();
        const seekStart = Date.now();
        await page.getByLabel('Seek time seconds').fill('5');
        await click(page, 'Seek');
        const seekMs = Date.now() - seekStart;
        await expect(page.getByTestId('original-tick')).toHaveText('50000');
        await expect(page.getByTestId('fork-b-tick')).toHaveText('50000');
        await expect(page.getByText('2.00–5.00 s · 10 ms samples')).toBeVisible();
        await expect(page.getByTestId('replay-status')).toHaveText('Not checked');
        await expect(page.getByRole('button', { name: 'Apply intervention', exact: true })).toBeDisabled();
        await click(page, 'Replay check');
        await expect(page.getByTestId('replay-status')).toHaveText('Matched');
        await page.screenshot({ path: evidencePath(`regression-seek-active-${viewport.width}.png`) });
        await page.getByLabel('Seek time seconds').fill('12');
        await click(page, 'Seek');
        await click(page, 'Resume');
        await click(page, 'Pause');
        await expect(page.getByTestId('replay-status')).toHaveText('Not checked');
        await click(page, 'Replay check');
        await expect(page.getByTestId('replay-status')).toHaveText('Matched');
        expect(errors).toEqual([]);
        expect(requests.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
        writeFileSync(evidencePath(`regression-browser-${viewport.width}.json`), JSON.stringify({ browser: browser.version(), headless: true, viewport, drawn, seekMs, errors, requests, renderStats: JSON.parse(await page.locator('canvas').getAttribute('data-render-stats') ?? '{}') }, null, 2));
    });
test('responsive branch switching preserves one experiment and keyboard-seek; draft edits never apply silently', async ({ page }) => {
    await page.setViewportSize({ width: 1672, height: 941 });
    await fork(page);
    await click(page, '+1 s');
    await click(page, 'Compare states');
    await expect(page.getByTestId('comparison')).toContainText('Matched');
    await magnitude(page, 1);
    await click(page, '+1 s');
    await click(page, 'Compare states');
    await expect(page.getByTestId('comparison')).toContainText('Matched');
    for (const width of [768, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await click(page, 'Fork B');
        await expect(page.getByTestId('fork-b-tick')).toHaveText('40000');
        await expect.poll(async () => (await bindings(page)).length).toBe(width < 1280 ? 1 : 3);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        if (width === 390)
            await page.screenshot({ path: evidencePath('regression-mobile-390.png'), fullPage: true });
    }
    await page.getByLabel('Seek time seconds').fill('1');
    await page.getByRole('button', { name: 'Seek', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('original-tick')).toHaveText('10000');
    await expect(page.getByTestId('fork-b-tick')).toHaveText('—');
    await page.getByLabel('Seek time seconds').fill('4');
    await click(page, 'Seek');
    await click(page, 'Replay check');
    await expect(page.getByTestId('replay-status')).toHaveText('Matched');
});

test('UI refinement: real PN and divergence readouts, stable instances and explicit seek', async ({ page }) => {
    await page.addInitScript(observeRefinement);
    await page.setViewportSize({ width: 1440, height: 900 });
    await fork(page);
    await apply(page, 'A', 'suppression', 1);
    await apply(page, 'B', 'odor-gain', 0);
    await click(page, '+5 s');
    await click(page, '+5 s');
    await expect(page.getByRole('table', { name: 'Current filtered PN output at viewing time' })).toBeVisible();
    const view = await page.evaluate(() => window.__refinement.view!);
    for (const [id, telemetry] of [['original', view.original], ['A', view.branch!], ['B', view.branchB!]] as const) {
        await expect(page.getByTestId(`pn-${id}-left`)).toHaveText(telemetry.motorFilter[0].toFixed(1));
        await expect(page.getByTestId(`pn-${id}-right`)).toHaveText(telemetry.motorFilter[1].toFixed(1));
    }
    for (const pair of ['AO', 'BO', 'AB'] as const) await expect(page.getByTestId(`divergence-${pair}`)).toHaveText(view.metrics.divergence[pair]!.toFixed(3));
    await page.getByLabel('Magnitude', { exact: true }).fill('0.35');
    await page.getByLabel('Intervention branch').selectOption('A');
    const resources = await page.evaluate(() => ({ workers: window.__refinement.workers, databases: window.__refinement.databases, contexts: window.__refinement.contexts }));
    const before = await page.evaluate(() => JSON.stringify([window.__refinement.view!.original, window.__refinement.view!.branch, window.__refinement.view!.branchB, window.__refinement.view!.events]));
    for (const [width, height] of [[1672, 941], [1440, 900], [768, 1024], [390, 844], [320, 844]]) {
        await page.setViewportSize({ width, height });
        await page.getByRole('button', { name: 'Fork B', exact: true }).click();
        await expect.poll(async () => (await bindings(page)).length).toBe(width < 1280 ? 1 : 3);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        expect(await page.locator('.lab-grid > *').evaluateAll(nodes => nodes.map(n => n.matches('.pn-card') ? 'pn' : n.matches('.arenas') ? 'arenas' : 'editor'))).toEqual(['pn', 'arenas', 'editor']);
        expect(await page.locator('.stage3-metrics').evaluate(column => {
            const bounds = column.getBoundingClientRect();
            return Array.from(column.children).every(card => { const box = card.getBoundingClientRect(); return box.left >= bounds.left && box.right <= bounds.right + 1; });
        })).toBe(true);
        expect(await page.locator('.stage3-metrics').evaluate(details => Boolean(document.querySelector('.lab-grid')!.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
        await expect(page.getByRole('complementary', { name: 'Measured branch outcomes' })).toHaveCount(1);
        await expect(page.locator('.decoder-card .motor-values')).toHaveCount(0);
        await expect(page.locator('.decoder-card h2')).toHaveText('Decoder · Fork B');
        const inspector = page.getByRole('button', { name: 'Fork B', exact: true });
        await inspector.focus();
        await page.keyboard.press('Tab');
        if (width < 768) {
            await expect(page.locator('.intervention-drawer > summary')).toBeFocused();
            await page.keyboard.press('Tab');
        }
        await expect(page.getByLabel('Intervention branch')).toBeFocused();
        await expect(page.getByLabel('Magnitude', { exact: true })).toHaveValue('0.35');
        await expect(page.getByLabel('Intervention branch')).toHaveValue('A');
        const aligned = await page.locator('canvas').evaluate(canvas => {
            const origin = canvas.getBoundingClientRect();
            const drawn = JSON.parse(canvas.getAttribute('data-bindings') ?? '[]') as { branch: string; rect: { x: number; width: number; height: number } }[];
            return drawn.every(b => { const box = document.querySelector(`[data-branch="${b.branch}"]`)!.getBoundingClientRect(); return Math.abs(box.left + 1 - origin.left - b.rect.x) < 1 && Math.abs(box.width - 2 - b.rect.width) < 1 && Math.abs(origin.height - b.rect.height) < 1; });
        });
        expect(aligned).toBe(true);
    }
    await page.getByText('Decoder and motion details', { exact: true }).click();
    await page.getByText('Goal proximity, entry and cost', { exact: true }).click();
    await page.getByLabel('Timeline seek', { exact: true }).fill('5');
    await expect(page.getByTestId('model-time')).toHaveText('12.000 s');
    expect(await page.evaluate(() => JSON.stringify([window.__refinement.view!.original, window.__refinement.view!.branch, window.__refinement.view!.branchB, window.__refinement.view!.events]))).toBe(before);
    expect(await page.evaluate(() => ({ workers: window.__refinement.workers, databases: window.__refinement.databases, contexts: window.__refinement.contexts }))).toEqual(resources);
    await page.getByRole('button', { name: 'Seek', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('model-time')).toHaveText('5.000 s');
    await expect(page.getByTestId('recorded-frontier')).toHaveText('Recorded to 12.000 s');
    await expect(page.getByRole('button', { name: 'Apply intervention', exact: true })).toBeDisabled();
});

test('UI refinement: missing branch telemetry stays unavailable before S0', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await fork(page);
    await page.getByRole('button', { name: 'Fork B', exact: true }).click();
    await page.getByLabel('Seek time seconds').fill('1');
    await click(page, 'Seek');
    await expect(page.getByTestId('pn-B-left')).toHaveText('—');
    await expect(page.getByTestId('pn-B-right')).toHaveText('—');
    await expect(page.locator('.decoder-card .state-checks').first()).toContainText('— → — u/s');
    await expect(page.locator('.decoder-card')).toContainText('Readout unavailable');
    await expect(page.locator('.decoder-card')).not.toContainText('Below speed limit');
    await expect(page.getByTestId('divergence-BO')).toHaveText('—');
    await expect(page.getByTestId('model-time')).toHaveText('1.000 s');
});

test('UI refinement: controlled initialization, empty branches and long names remain readable', async ({ page }) => {
    // Retain the genuine Worker script request to inspect initialization; no
    // numeric fixture or fabricated reply is supplied to the experiment.
    let release = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/simulation.worker.ts*', async route => { await gate; await route.continue(); });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    try {
        await expect(page.getByTestId('run-status')).toHaveText('Initializing');
        await expect(page.getByTestId('model-time')).toHaveText('—');
        await expect(page.getByTestId('pn-original-left')).toHaveText('—');
        await expect(page.getByTestId('comparison')).toHaveText('Not checked');
        await expect(page.getByRole('button', { name: 'Start blank experiment', exact: true })).toBeDisabled();
        await page.screenshot({ path: evidencePath('controlled-initializing-320.png') });
    } finally { release(); }
    await page.getByRole('button', { name: 'Start blank experiment', exact: true }).click();
    await expect(page.getByTestId('model-time')).toHaveText('0.000 s');
    await expect(page.getByTestId('pn-A-left')).toHaveText('—');
    await expect(page.getByTestId('pn-B-right')).toHaveText('—');
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No matching local records', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await save.focus();
    await page.keyboard.press('Enter');
    const name = 'LongExperimentName'.repeat(6).slice(0, 100);
    await page.getByLabel('Experiment name', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Save to Library', exact: true }).click();
    await expect(page.getByTestId('save-status')).toHaveText('Saved');
    // Save is disabled while the modal closes. Preserve Dialog's existing
    // first usable toolbar fallback, the mobile More actions summary.
    writeFileSync(evidencePath('long-name-save-focus.json'), JSON.stringify(await page.evaluate(() => document.activeElement?.outerHTML)));
    await expect(page.getByText('More actions', { exact: true })).toBeFocused();
    for (const [width, height] of [[1672, 941], [1440, 900], [768, 1024], [390, 844], [320, 844]]) {
        await page.setViewportSize({ width, height });
        await expect(page.locator('.record-name strong')).toHaveText(name);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        expect(await page.locator('.record-name strong').evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
        await page.getByRole('button', { name: 'Start', exact: true }).focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeFocused();
        expect(await page.getByRole('button', { name: 'Start', exact: true }).evaluate(e => getComputedStyle(e).outlineStyle)).not.toBe('none');
        await page.screenshot({ path: evidencePath(`long-name-focus-${width}.png`) });
    }
});

test('UI refinement: synthetic circuit has no fabricated membrane bars before branch creation', async ({ page }) => {
    await page.goto('/?dataset=synthetic');
    await page.getByRole('button', { name: 'Start blank experiment', exact: true }).click();
    for (const name of ['+1 s', 'Capture snapshot', 'Fork A + B']) await click(page, name);
    await page.getByRole('button', { name: 'Fork B', exact: true }).click();
    await page.getByLabel('Seek time seconds').fill('0');
    await click(page, 'Seek');
    await expect(page.locator('.circuit-panel')).toContainText('membrane telemetry unavailable');
    await expect(page.locator('.potentials code')).toHaveText(Array(8).fill('—'));
    await expect(page.locator('.potentials .meter i')).toHaveCount(0);
});
