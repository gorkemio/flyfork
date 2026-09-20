import { evidencePath } from '../evidence-path';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
async function click(page: Page, name: string) { const b = page.getByRole('button', { name, exact: true }); await expect(b).toBeEnabled(); await b.click(); await expect(page.getByText(/Applying command at a safe tick boundary|Computing (step|seek|replay)/)).toBeHidden(); }
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
        expect(bounds.height).toBeLessThanOrEqual(viewport.height);
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
