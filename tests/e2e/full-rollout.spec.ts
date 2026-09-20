import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { evidencePath } from '../evidence-path';
import { axe } from './a11y';

test('4.5C workspace surfaces: guide progress, dialog focus, local record and narrow reflow', async ({ page }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1672, height: 941 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Run guided experiment', exact: true }).click();
    await expect(page.locator('.guide-progress [aria-current=step]')).toHaveText('1Snapshot');
    await page.screenshot({ path: evidencePath('guide-1672.png') });
    await axe(page, 'guide');
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({ path: evidencePath('guide-390.png') });
    await page.setViewportSize({ width: 1672, height: 941 });
    for (const name of ['Create same-state forks', 'Apply guided interventions', 'Compute to 12 s', 'Verify own histories']) {
        await page.getByRole('button', { name, exact: true }).click();
    }
    await expect(page.locator('.guide-progress [aria-current=step]')).toHaveText('5Keep');
    await page.getByRole('button', { name: 'Finish guide', exact: true }).click();
    await expect(page.getByTestId('replay-status')).toHaveText('Matched');
    const positions = await page.locator('.branch-window').evaluateAll(nodes => nodes.map(n => [n.getAttribute('data-tick'), n.getAttribute('data-x'), n.getAttribute('data-y')]));
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByLabel('Experiment name', { exact: true }).fill('Same state · three recorded futures');
    await page.screenshot({ path: evidencePath('save-1672.png') });
    await page.getByRole('button', { name: 'Save to Library', exact: true }).click();
    await expect(page.getByTestId('save-status')).toHaveText('Saved');
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Same state · three recorded futures', exact: true })).toBeVisible();
    await page.screenshot({ path: evidencePath('library-1672.png') });
    await axe(page, 'library');
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({ path: evidencePath('library-390.png') });
    const buttons = await page.locator('.library-list .button').evaluateAll(nodes => nodes.map(n => ({ height: n.clientHeight, content: n.scrollHeight })));
    expect(buttons.every(b => b.content <= b.height)).toBe(true);
    await expect(page.getByLabel('Search local records')).toBeVisible();
    await page.getByLabel('Search local records').fill('no matching title');
    await expect(page.getByRole('heading', { name: 'No matching local records' })).toBeVisible();
    await page.screenshot({ path: evidencePath('library-empty-390.png') });
    // Native search consumes Escape to clear its query before the dialog handles cancel.
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Search local records')).toHaveValue('');
    await page.getByRole('button', { name: 'Close dialog' }).focus();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Library', exact: true })).toBeFocused();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'Model & limitations', exact: true }).click();
    await page.screenshot({ path: evidencePath('model-1440.png') });
    await axe(page, 'model');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('dialog').locator(':focus')).toHaveCount(1);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({ path: evidencePath('model-390.png') });
    const layout = [];
    for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const size = await page.getByRole('dialog').evaluate(dialog => ({ width: dialog.clientWidth, scrollWidth: dialog.scrollWidth, pageWidth: document.documentElement.scrollWidth }));
        expect(size.scrollWidth).toBeLessThanOrEqual(size.width);
        expect(size.pageWidth).toBe(width);
        layout.push({ viewportWidth: width, ...size });
    }
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.screenshot({ path: evidencePath('tablet-1024.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024);
    expect(await page.locator('.branch-window').evaluateAll(nodes => nodes.map(n => [n.getAttribute('data-tick'), n.getAttribute('data-x'), n.getAttribute('data-y')]))).toEqual(positions);
    expect(errors).toEqual([]);
    writeFileSync(evidencePath('workspace-surfaces.json'), JSON.stringify({ positions, layout, errors }, null, 2));
});
