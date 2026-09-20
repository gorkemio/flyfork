import { expect, test } from '@playwright/test';
test('paused triple rendering reuses GPU buffers instead of allocating a new trail buffer each frame', async ({ page }) => {
    await page.addInitScript(() => {
        const counts = { created: 0, deleted: 0 };
        Reflect.set(window, '__flyforkTestGPU', counts);
        const proto = WebGL2RenderingContext.prototype, create = proto.createBuffer, remove = proto.deleteBuffer;
        proto.createBuffer = function (this: WebGL2RenderingContext) { counts.created++; return create.call(this); };
        proto.deleteBuffer = function (this: WebGL2RenderingContext, buffer: WebGLBuffer | null) { counts.deleted++; return remove.call(this, buffer); };
    });
    await page.setViewportSize({ width: 1672, height: 941 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Start blank experiment', exact: true }).click();
    for (const name of ['+1 s', 'Capture snapshot', 'Fork A + B', '+1 s']) {
        const b = page.getByRole('button', { name, exact: true });
        await expect(b).toBeEnabled();
        await b.click();
        await expect(page.getByText(/Applying command at a safe tick boundary|Computing (step|seek|replay)/)).toBeHidden();
    }
    const frames = () => page.evaluate(() => new Promise<void>(resolve => {
        let n = 0;
        const next = () => {
            if (++n === 90)
                resolve();
            else
                requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
    }));
    await frames();
    const before = await page.evaluate(() => ({ ...Reflect.get(window, '__flyforkTestGPU') }));
    await frames();
    const after = await page.evaluate(() => ({ ...Reflect.get(window, '__flyforkTestGPU') }));
    expect(after.created).toBe(before.created);
    expect(after.deleted).toBe(before.deleted);
});
