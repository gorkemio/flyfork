import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { Vector3, OrthographicCamera } from 'three';
import { evidencePath } from '../evidence-path';
import { axe } from './a11y';

type Binding = { branch: string; tick: number; x: number; y: number; heading: number; pathLength: number; gait: number[]; trailPoints: number; exposure: number; rect: { x: number; y: number; width: number; height: number } };
const bindings = (page: Page): Promise<Binding[]> => page.locator('canvas').getAttribute('data-bindings').then(s => JSON.parse(s ?? '[]'));
const stats = (page: Page) => page.locator('canvas').getAttribute('data-render-stats').then(s => JSON.parse(s ?? '{}'));
async function frames(page: Page, n = 4) {
    await page.evaluate(count => new Promise<void>(resolve => { const next = () => --count <= 0 ? resolve() : requestAnimationFrame(next); requestAnimationFrame(next); }), n);
}
async function click(page: Page, name: string) {
    const button = page.getByRole('button', { name, exact: true }); await expect(button).toBeEnabled(); await button.click();
    await expect(page.getByText(/Applying command at a safe tick boundary|Computing (step|seek|replay)/)).toBeHidden();
}
async function seek(page: Page, seconds: number) {
    await page.getByLabel('Seek time seconds').fill(String(seconds)); await click(page, 'Seek');
    await expect.poll(async () => (await bindings(page))[0]?.tick).toBe(seconds * 10000); await frames(page);
}

test('4.5B real guide: pose, gait, resize, context recovery and bounded GPU resources', async ({ page, browser }) => {
    test.setTimeout(90000);
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
        const live: Record<string, Map<object, WebGL2RenderingContext>> = {}, created: Record<string, number> = {};
        const proto = WebGL2RenderingContext.prototype;
        for (const type of ['Buffer', 'Texture', 'Framebuffer', 'Renderbuffer', 'Program']) {
            live[type] = new Map(); created[type] = 0;
            const create = Reflect.get(proto, `create${type}`), remove = Reflect.get(proto, `delete${type}`);
            Reflect.set(proto, `create${type}`, function (this: WebGL2RenderingContext) { const item = create.call(this); if (item) { live[type].set(item, this); created[type]++; } return item; });
            Reflect.set(proto, `delete${type}`, function (this: WebGL2RenderingContext, item: object) { live[type].delete(item); return remove.call(this, item); });
        }
        let workers = 0;
        window.Worker = new Proxy(window.Worker, { construct(target, args) { workers++; return Reflect.construct(target, args); } });
        Reflect.set(window, '__visualResources', () => ({ live: Object.fromEntries(Object.entries(live).map(([key, value]) => [key, [...value.values()].filter(gl => !gl.isContextLost()).length])), created: { ...created }, workers }));
        // Invalidate only this canvas's old generation; other/new contexts remain observable.
        window.addEventListener('webglcontextlost', event => Object.values(live).forEach(map => { for (const [item, gl] of map) if (gl.canvas === event.target) map.delete(item); }), true);
    });
    const resources = () => page.evaluate(() => Reflect.get(window, '__visualResources')());
    await page.setViewportSize({ width: 1672, height: 941 }); await page.goto('/');
    await click(page, 'Run guided experiment');
    for (const name of ['Create same-state forks', 'Apply guided interventions', 'Compute to 12 s', 'Verify own histories', 'Finish guide']) await click(page, name);
    await expect(page.getByTestId('replay-status')).toHaveText('Matched');
    await expect.poll(async () => (await bindings(page)).length).toBe(3); await frames(page);
    const atTwelve = await bindings(page), initialStats = await stats(page);
    expect(atTwelve.map(b => b.tick)).toEqual([120000, 120000, 120000]);
    expect(new Set(atTwelve.map(b => b.exposure)).size).toBe(1);
    const beforePause = await resources(); await frames(page, 40);
    expect(await bindings(page)).toEqual(atTwelve); expect(await resources()).toEqual(beforePause);
    await page.screenshot({ path: evidencePath('visual-slice-1672x941.png') });
    await axe(page, 'visual-slice-main');
    const canvas = await page.locator('canvas').boundingBox(); expect(canvas).not.toBeNull();
    const b = atTwelve[1], rect = b.rect;
    await page.screenshot({ path: evidencePath('arena-closeup.png'), clip: { x: canvas!.x + rect.x, y: canvas!.y, width: rect.width, height: rect.height } });
    const span = Math.max(83, 43 * rect.height / rect.width);
    const camera = new OrthographicCamera(-span * rect.width / rect.height / 2, span * rect.width / rect.height / 2, span / 2, -span / 2, .1, 250);
    camera.position.set(20, 110, 70); camera.lookAt(20, 0, 40); camera.updateMatrixWorld();
    const projected = new Vector3(b.x, .8, b.y).project(camera);
    const flyX = canvas!.x + rect.x + (projected.x + 1) * rect.width / 2, flyY = canvas!.y + (1 - projected.y) * rect.height / 2;
    await page.screenshot({ path: evidencePath('fly-closeup-native.png'), clip: { x: flyX - 45, y: flyY - 45, width: 90, height: 90 } });
    await seek(page, 5); const atFive = await bindings(page);
    await seek(page, 12); await seek(page, 5); expect(await bindings(page)).toEqual(atFive);
    expect(atFive.every(b => b.trailPoints === 501)).toBe(true);
    await seek(page, 12);
    const resizeStats = [];
    // Warm both layouts before comparing resource counts; DOM rects remain the camera source.
    for (const width of [390, 1672]) { await page.setViewportSize({ width, height: width === 390 ? 900 : 941 }); await frames(page); }
    const warmed = await resources();
    for (let i = 0; i < 12; i++) {
        const width = [1440, 390, 1672][i % 3], height = width === 1672 ? 941 : 900;
        await page.setViewportSize({ width, height }); await frames(page);
        const s = await stats(page), drawn = await bindings(page);
        expect(drawn.length).toBe(width < 1280 ? 1 : 3);
        expect(drawn.every(b => b.tick === 120000)).toBe(true);
        expect(Math.abs(s.target.width / s.target.height - drawn[0].rect.width / drawn[0].rect.height)).toBeLessThan(2 / s.target.height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        if (i < 3) resizeStats.push({ width, height, ...s });
        if (i === 0) await page.screenshot({ path: evidencePath('visual-slice-1440x900.png') });
        if (i === 1) { await click(page, 'Fork A'); await frames(page); await page.screenshot({ path: evidencePath('visual-slice-390.png'), fullPage: true }); }
    }
    const afterResize = await resources(); expect(afterResize.live).toEqual(warmed.live); expect(afterResize.workers).toBe(warmed.workers);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1672, height: 941, deviceScaleFactor: 2, mobile: false }); await frames(page, 8);
    const dprStats = await stats(page), dprBindings = await bindings(page);
    expect(dprStats.target.effectiveScale).toBe(1.25);
    expect(Math.abs(dprStats.target.width / dprStats.target.height - dprBindings[0].rect.width / dprBindings[0].rect.height)).toBeLessThan(2 / dprStats.target.height);
    expect(dprBindings.map(b => [b.x, b.y, b.pathLength, b.gait])).toEqual(atTwelve.map(b => [b.x, b.y, b.pathLength, b.gait]));
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1672, height: 941, deviceScaleFactor: 1, mobile: false }); await frames(page); await cdp.detach();
    await page.emulateMedia({ reducedMotion: 'reduce' }); await frames(page);
    expect((await bindings(page)).every(b => b.gait.every(angle => angle === 0))).toBe(true);
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await frames(page);
    expect((await bindings(page)).map(b => b.gait)).toEqual(atTwelve.map(b => b.gait));
    for (let i = 0; i < 4; i++) { await page.getByLabel('Render', { exact: true }).uncheck(); await frames(page); await page.getByLabel('Render', { exact: true }).check(); await frames(page); }
    expect((await resources()).live).toEqual(warmed.live);
    await click(page, '+1 s'); const atThirteen = await bindings(page);
    expect(atThirteen[0].pathLength).toBe(atTwelve[0].pathLength);
    expect(atThirteen[0].gait).toEqual(atTwelve[0].gait); // Actual guide Original collides with the north wall.
    await seek(page, 12);
    // Loss/recovery rebuilds only the renderer. The existing Worker and recorded frontier survive.
    const beforeRecovery = await resources();
    const recovered = [];
    for (let i = 0; i < 3; i++) {
        await page.evaluate(() => {
            const gl = document.querySelector('canvas')!.getContext('webgl2')!;
            const extension = gl.getExtension('WEBGL_lose_context'); if (!extension) throw new Error('Context loss extension unavailable');
            extension.loseContext(); setTimeout(() => extension.restoreContext(), 150);
        });
        await expect(page.getByText(/WebGL context lost/)).toBeVisible();
        await expect(page.getByText(/WebGL context lost/)).toBeHidden();
        await expect.poll(async () => (await bindings(page)).length).toBe(3); await frames(page, 8);
        const counts = await resources(); recovered.push(counts); expect(counts.workers).toBe(beforeRecovery.workers);
        expect(counts.live).toEqual(warmed.live);
        expect((await bindings(page)).map(b => [b.x, b.y, b.pathLength, b.gait])).toEqual(atTwelve.map(b => [b.x, b.y, b.pathLength, b.gait]));
    }
    await click(page, 'Replay check'); await expect(page.getByTestId('replay-status')).toHaveText('Matched');
    expect(errors).toEqual([]);
    writeFileSync(evidencePath('visual-slice-verification.json'), JSON.stringify({ browser: browser.version(), atTwelve, atFive, atThirteen, initialStats, resizeStats, dprStats, beforePause, warmed, afterResize, recovered, errors, crop: { type: 'Native screenshot crops, no camera enlargement', flyX, flyY } }, null, 2));
});
