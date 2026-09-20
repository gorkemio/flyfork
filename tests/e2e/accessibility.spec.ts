import { evidencePath } from '../evidence-path';
import { expect, test } from '@playwright/test';
import { axe } from './a11y';
test('responsive real history, accessible dialogs, keyboard trap/return and touch targets', async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1672, height: 941 });
    await page.goto('/');
    await axe(page, 'welcome');
    await page.getByRole('button', { name: 'Run guided experiment', exact: true }).click();
    for (const name of ['Create same-state forks', 'Apply guided interventions', 'Compute to 12 s', 'Verify own histories', 'Finish guide'])
        await page.getByRole('button', { name, exact: true }).click();
    const states = await page.locator('.branch-window').evaluateAll(nodes => nodes.map(n => [n.getAttribute('data-x'), n.getAttribute('data-y'), n.getAttribute('data-tick')]));
    for (const [width, height] of [[1672, 941], [1440, 900], [768, 1024], [390, 844]]) {
        await page.setViewportSize({ width, height });
        await page.getByRole('button', { name: 'Fork B', exact: true }).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        expect(await page.locator('.branch-window').evaluateAll(nodes => nodes.map(n => [n.getAttribute('data-x'), n.getAttribute('data-y'), n.getAttribute('data-tick')]))).toEqual(states);
        await expect.poll(async () => JSON.parse(await page.locator('canvas').getAttribute('data-bindings') ?? '[]').length).toBe(width < 1280 ? 1 : 3);
        await axe(page, `lab-${width}`);
        await page.screenshot({ path: evidencePath(`responsive-${width}.png`), fullPage: width < 1280 });
        const targets = await page.locator('.workspace-tools>button,.branch-tabs button,.primary-controls button,.seek-control input,.seek-control button').evaluateAll(nodes => nodes.filter(n => n.getBoundingClientRect().width > 0).map(n => ({ name: n.getAttribute('aria-label') || n.textContent, width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height })));
        expect(targets.filter(t => t.width < 44 || t.height < 44)).toEqual([]);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Replay check', exact: true }).click();
    await expect(page.getByTestId('replay-status')).toHaveText('Matched');
    await expect(page.getByRole('button', { name: 'Library', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Library', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await axe(page, 'library-mobile');
    for (let i = 0; i < 14; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Library', exact: true })).toBeFocused();
    await page.getByText('More actions', { exact: true }).click();
    await page.getByRole('button', { name: 'Model & limitations', exact: true }).click();
    await axe(page, 'model-mobile');
    await page.getByLabel('Inspect source group').selectOption('DM1_lPN L');
    await expect(page.getByRole('dialog').getByRole('table').first()).toContainText('1 cells');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Model & limitations', exact: true })).toBeFocused();
});
