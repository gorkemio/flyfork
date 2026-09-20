import { expect, test } from '@playwright/test';
test('exit during a delayed real STEP acknowledgement prevents the remaining guide commands', async ({ page }) => {
    await page.addInitScript(() => {
        const Original = window.Worker;
        window.Worker = class extends Original {
            constructor(url: string | URL, options?: WorkerOptions) {
                super(url, options);
                this.addEventListener('message', event => {
                    if (event.data.kind === 'ACK' && Reflect.get(this, 'holdStep')) {
                        event.stopImmediatePropagation();
                        Reflect.set(this, 'holdStep', false);
                        Reflect.set(window, 'heldGuideAck', () => this.dispatchEvent(new MessageEvent('message', { data: event.data })));
                    }
                });
            }
            postMessage(data: unknown) {
                if ((data as {
                    type: string;
                }).type === 'STEP')
                    Reflect.set(this, 'holdStep', true);
                super.postMessage(data);
            }
        };
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Run guided experiment', exact: true }).click();
    await page.getByRole('button', { name: 'Create same-state forks', exact: true }).click();
    await expect.poll(() => page.evaluate(() => typeof Reflect.get(window, 'heldGuideAck'))).toBe('function');
    await page.getByRole('button', { name: 'Exit guide', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.evaluate(() => (Reflect.get(window, 'heldGuideAck') as () => void)());
    await expect(page.getByRole('button', { name: 'Capture snapshot', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Fork A + B', exact: true })).toBeDisabled();
    await expect(page.getByTestId('model-time')).toHaveText('2.000 s');
    await expect(page.getByTestId('run-status')).toHaveText('Paused');
    await expect(page.getByText('Guide cancelled. The computed experiment remains paused.', { exact: true })).toBeVisible();
});
