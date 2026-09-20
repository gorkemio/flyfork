import { evidencePath } from '../evidence-path';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
async function click(page: Page, name: string) { const b = page.getByRole('button', { name, exact: true }); await expect(b).toBeEnabled(); await b.click(); await expect(page.getByText(/Applying command at a safe tick boundary|Computing (step|seek|replay)/)).toBeHidden(); }
test('real module worker: start, pause, snapshot, fork, equal-tick compare and restore', async ({ page, browser }) => {
    const errors: string[] = [];
    const requested: string[] = [];
    page.on('request', r => requested.push(r.url()));
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {
        if (m.type() === 'error')
            errors.push(m.text());
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Start blank experiment', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Selected subgraph', exact: true })).toBeVisible();
    await expect(page.getByText('80 neurons · 4,011 directed edges')).toBeVisible();
    await expect(page.getByText('male-cns-dm1-lif-v1', { exact: true })).toBeVisible();
    await click(page, 'Start');
    await expect(page.getByTestId('run-status')).toHaveText('Running');
    await expect.poll(async () => Number(await page.getByTestId('original-tick').textContent())).toBeGreaterThan(0);
    await click(page, 'Pause');
    await expect(page.getByTestId('run-status')).toHaveText('Paused');
    const snapshotTick = await page.getByTestId('original-tick').textContent();
    await click(page, 'Capture snapshot');
    await click(page, 'Fork A + B');
    await click(page, '+1 s');
    await click(page, 'Compare states');
    await expect(page.getByTestId('comparison')).toContainText('Matched');
    const originalTick = await page.getByTestId('original-tick').textContent();
    await expect(page.getByTestId('fork-tick')).toHaveText(originalTick ?? '');
    await click(page, 'Fork A');
    await expect(page.getByRole('button', { name: 'Fork A', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Render', { exact: true }).uncheck();
    await click(page, '+1 s');
    await click(page, 'Compare states');
    await expect(page.getByTestId('comparison')).toContainText('Matched');
    await page.getByLabel('Render', { exact: true }).check();
    await page.getByLabel('Motion trail').uncheck();
    await click(page, 'Original');
    await page.getByLabel('Simulation speed').selectOption('4');
    await click(page, 'Resume');
    await click(page, 'Pause');
    await click(page, 'Compare states');
    await expect(page.getByTestId('comparison')).toContainText('Matched');
    await click(page, 'Restore S₀');
    await expect(page.getByTestId('original-tick')).toHaveText(snapshotTick ?? '');
    await expect(page.getByTestId('fork-tick')).toHaveText(snapshotTick ?? '');
    await expect(page.getByTestId('comparison')).toContainText('Not checked');
    expect(errors).toEqual([]);
    expect(requested.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
    writeFileSync(evidencePath('regression-regression-runtime-requests.json'), JSON.stringify(requested, null, 2));
    writeFileSync(evidencePath('regression-regression-browser-environment.json'), JSON.stringify({ browserVersion: browser.version(), headless: true, productionPreview: Boolean(process.env.FLYFORK_PREVIEW), ...(await page.evaluate(() => ({ userAgent: navigator.userAgent, devicePixelRatio: devicePixelRatio, webgl2: Boolean(document.querySelector('canvas')?.getContext('webgl2')) }))) }, null, 2));
});
for (const viewport of [{ width: 1672, height: 941 }, { width: 1440, height: 900 }])
    test(`visual capture ${viewport.width}×${viewport.height}`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.setViewportSize(viewport);
        await page.goto('/');
        await page.getByRole('button', { name: 'Start blank experiment', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Selected subgraph', exact: true })).toBeVisible();
        await expect(page.getByText('80 neurons · 4,011 directed edges')).toBeVisible();
        await expect(page.getByText('male-cns-dm1-lif-v1', { exact: true })).toBeVisible();
        for (let i = 0; i < 2; i++)
            await click(page, '+1 s');
        await click(page, 'Capture snapshot');
        await click(page, 'Fork A + B');
        for (let i = 0; i < 4; i++)
            await click(page, '+1 s');
        await click(page, 'Compare states');
        await click(page, 'Fork A');
        await expect(page.locator('canvas')).toBeVisible();
        await expect(page.getByTestId('comparison')).toContainText('Matched');
        // Wait for confirmed pose and a completed WebGL frame, independent of simulation ticks.
        await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
        await page.screenshot({ path: evidencePath(`regression-regression-real-${viewport.width}x${viewport.height}.png`), fullPage: false });
        const size = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
        expect(size.w).toBe(viewport.width);
        expect(size.h).toBeLessThanOrEqual(viewport.height);
        expect(errors).toEqual([]);
    });
// Fixture is explicit; changing dataset creates a new Worker through the dirty-state guard.
test('explicit fixture and fresh real dataset sessions never mix states', async ({ page }) => {
    await page.goto('/?dataset=synthetic');
    await page.getByRole('button', { name: 'Start blank experiment', exact: true }).click();
    await expect(page.getByText('8 neurons · 12 directed connections')).toBeVisible();
    await click(page, '+1 s');
    await click(page, 'New experiment');
    await page.getByRole('combobox', { name: 'Dataset', exact: true }).selectOption('malecns');
    await page.getByRole('button', { name: 'Create blank experiment', exact: true }).click();
    await page.getByRole('button', { name: 'Discard and continue', exact: true }).click();
    await expect(page.getByText('80 neurons · 4,011 directed edges')).toBeVisible();
    await expect(page.getByTestId('original-tick')).toHaveText('0');
    await expect(page.getByRole('button', { name: 'Fork A + B', exact: true })).toBeDisabled();
});
test('corrupt real dataset hash produces a visible load error with no fixture fallback', async ({ page }) => {
    await page.route(url => url.pathname.includes('/simulation.worker'), async (route) => {
        const response = await route.fetch();
        const body = await response.text();
        const hash = '38f691ce9d38faddb8277ada9f7ae70b198eb347742ede6b67fc8697925c2d0d';
        expect(body).toContain(hash);
        await route.fulfill({ response, body: body.replace(hash, '0'.repeat(64)) });
    });
    await page.goto('/');
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('MaleCNS load failed');
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled();
    await expect(page.getByText('Synthetic fixture', { exact: true })).toBeHidden();
});
