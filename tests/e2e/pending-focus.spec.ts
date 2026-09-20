import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { evidencePath } from '../evidence-path';
import { arm, forked, held, installActivationProbe, release } from './command-activation-probe';

for (const width of [390, 1440]) {
    for (const outcome of ['complete', 'input', 'dialog', 'cancel', 'error'] as const) {
        test(`pending focus ${width} ${outcome}: owned return without stealing focus`, async ({ page, browserName }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.addInitScript(installActivationProbe);
            await forked(page);
            const apply = page.getByRole('button', { name: 'Apply intervention', exact: true });
            await apply.focus();
            await arm(page);
            await page.keyboard.down('Space');
            await held(page);
            await page.keyboard.up('Space');
            const cancel = page.getByRole('button', { name: 'Cancel pending command', exact: true });
            await expect(cancel).toBeVisible();
            // Start at the adjacent Seek input, whose order is stable in both
            // responsive layouts. Never assume Tab wraps through browser chrome.
            // WebKit's native Option-Tab includes buttons without host preference changes.
            const backwards = browserName === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab';
            const forwards = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
            await page.getByLabel('Seek time seconds', { exact: true }).focus();
            for (let i = 0; i < 6 && !await cancel.evaluate(e => e === document.activeElement); i++) await page.keyboard.press(forwards);
            await expect(cancel).toBeFocused();
            await page.keyboard.press(backwards);
            await page.keyboard.press(forwards);
            await expect(cancel).toBeFocused();
            if (outcome === 'input') await page.getByLabel('Magnitude', { exact: true }).focus();
            if (outcome === 'dialog') {
                if (width === 390) await page.getByText('More actions', { exact: true }).click();
                await page.getByRole('button', { name: 'Model & limitations', exact: true }).filter({ visible: true }).click();
            }
            if (outcome === 'cancel') await page.keyboard.press(width === 390 ? 'Enter' : 'Space');
            if (outcome === 'error') await page.evaluate(() => window.__activation.failWorker());
            else await release(page);
            try {
                await expect(cancel).toBeHidden();
                if (outcome === 'complete') {
                    await expect(page.getByTestId('control-status')).toContainText('completed');
                    await expect(apply).toBeFocused();
                } else if (outcome === 'input') await expect(page.getByLabel('Magnitude', { exact: true })).toBeFocused();
                else if (outcome === 'dialog') expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
                else if (outcome === 'cancel') await expect(apply).toBeFocused();
                else await expect(page.getByRole('button', { name: 'New experiment', exact: true })).toBeFocused();
            } finally {
                writeFileSync(evidencePath(`pending-focus-${width}-${outcome}.json`), JSON.stringify(await page.evaluate(() => ({ focus: document.activeElement?.outerHTML, events: window.__activation.events })), null, 2));
            }
        });
    }
}
