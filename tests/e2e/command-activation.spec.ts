import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { activationEvents, arm, blank, commandReplies, digest, down, expectOneCommand, expectRecoveryCommitBefore, forked, held, installActivationProbe, mark, nativeButton, paint, release } from './command-activation-probe';

test.use({ viewport: { width: 1672, height: 941 }, trace: 'on' });
test.beforeEach(async ({ page }) => { await page.addInitScript(installActivationProbe); });
test.afterEach(async ({ page }, testInfo) => {
    if (page.isClosed()) return;
    const state = await page.evaluate(() => ({
        events: window.__activation?.events,
        view: document.querySelector('[data-testid="model-time"]')?.textContent,
        frontier: document.querySelector('[data-testid="recorded-frontier"]')?.textContent,
        status: document.querySelector('[data-testid="control-status"]')?.textContent,
        focus: document.activeElement?.outerHTML.slice(0, 300),
        buttons: Array.from(document.querySelectorAll('button')).filter(b => b.getBoundingClientRect().width).map(b => ({ name: b.getAttribute('aria-label') ?? b.textContent, disabled: b.disabled })),
    }));
    await testInfo.attach('native-command-state', { body: JSON.stringify(state, null, 2), contentType: 'application/json' });
    await testInfo.attach('real-final-screen', { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' });
});

async function comparePointer(page: Page, outside = false, alreadyArmed = false) {
    const button = page.getByRole('button', { name: 'Compare states', exact: true });
    const start = (await activationEvents(page)).length;
    if (!alreadyArmed) await arm(page);
    await mark(page, 'native-activation-start');
    await down(page, button);
    // Do not wait for recovery before input. It starts naturally between down/up.
    await held(page);
    if (outside) await page.mouse.move(3, 3);
    await page.mouse.up();
    await paint(page);
    return { button, start };
}

test('R2 Compare native pointer survives recovery and commits one real same-tick comparison', async ({ page }) => {
    await forked(page);
    const before = await digest(page);
    const { button, start } = await comparePointer(page);
    const during = (await activationEvents(page)).slice(start);
    expect(during.some(e => e.type === 'click' && e.name === 'Compare states' && e.trusted), 'Trusted native click must survive background recovery').toBe(true);
    expect(during.filter(e => e.type === 'command' && e.command === 'COMPARE')).toHaveLength(0);
    await expect(page.getByTestId('control-status')).toContainText(/waiting/i);
    await expect(page.getByRole('button', { name: 'Cancel pending command', exact: true })).toBeEnabled();
    await release(page);
    const result = await expectOneCommand(page, 'COMPARE', start);
    expectRecoveryCommitBefore(result.events, 'COMPARE');
    expect(result.ack.comparison).toEqual({ equal: true, tick: 10000, firstDifference: null });
    await expect(page.getByTestId('comparison')).toHaveText('Matched · no numeric difference');
    await expect(button).toBeEnabled();
    expect(await digest(page)).toEqual(before);
    expect(result.events.filter(e => e.type === 'command' && ['STEP', 'RUN'].includes(e.command ?? ''))).toHaveLength(0);
});

test('R2 release outside during recovery is cancelled native gesture and executes no Compare', async ({ page }) => {
    await forked(page);
    const before = await digest(page);
    const { start } = await comparePointer(page, true);
    expect((await activationEvents(page)).slice(start).filter(e => e.type === 'click' && e.name === 'Compare states')).toHaveLength(0);
    await release(page);
    await expect(page.getByRole('region', { name: 'Experiment status' }).getByText('View 1.00 s / recorded 1.00 s', { exact: true })).toBeVisible();
    expect((await activationEvents(page)).slice(start).filter(e => e.type === 'command' && e.command === 'COMPARE')).toHaveLength(0);
    expect(await digest(page)).toEqual(before);
});

for (const key of ['Enter', 'Space']) test(`R2 Compare ${key} native activation is bounded behind real recovery`, async ({ page }) => {
    await forked(page);
    const button = page.getByRole('button', { name: 'Compare states', exact: true });
    await expect(button).toBeEnabled(); await button.focus();
    const start = (await activationEvents(page)).length;
    await arm(page);
    if (key === 'Space') await page.keyboard.down('Space');
    await held(page);
    if (key === 'Space') await page.keyboard.up('Space');
    else await page.keyboard.press('Enter');
    await expect(page.getByTestId('control-status')).toContainText(/waiting/i);
    expect((await activationEvents(page)).slice(start).filter(e => e.type === 'click' && e.name === 'Compare states' && e.trusted)).toHaveLength(1);
    await release(page);
    const result = await expectOneCommand(page, 'COMPARE', start);
    expectRecoveryCommitBefore(result.events, 'COMPARE');
    expect(result.ack.comparison?.tick).toBe(10000);
    await expect(page.getByTestId('comparison')).toHaveText('Matched · no numeric difference');
});

test('R2 pending Compare rejects extra Enter and another command without queue growth', async ({ page }) => {
    await forked(page);
    const { start } = await comparePointer(page);
    await expect(page.getByTestId('control-status')).toContainText(/waiting/i);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: '+1 s', exact: true })).toHaveAttribute('aria-disabled', 'true');
    const other = page.getByRole('button', { name: '+1 s', exact: true });
    const box = await other.boundingBox(); if (!box) throw Error('No STEP hit box');
    // Real native input verifies rejection even when pending controls retain focusability.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await release(page);
    const { events } = await expectOneCommand(page, 'COMPARE', start);
    expect(events.filter(e => e.type === 'command' && e.command === 'STEP')).toHaveLength(0);
    await expect(page.getByTestId('model-time')).toHaveText('1.000 s');
});

test('R2 pending Cancel is visible, preserves recovery commit, then permits new native Compare', async ({ page }) => {
    await forked(page);
    const { start } = await comparePointer(page);
    await nativeButton(page, 'Cancel pending command');
    await expect(page.getByTestId('control-status')).toContainText(/cancel/i);
    await release(page);
    await expect(page.getByRole('region', { name: 'Experiment status' }).getByText('View 1.00 s / recorded 1.00 s', { exact: true })).toBeVisible();
    expect((await activationEvents(page)).slice(start).filter(e => e.type === 'command' && e.command === 'COMPARE')).toHaveLength(0);
    const next = (await activationEvents(page)).length;
    await nativeButton(page, 'Compare states');
    await expectOneCommand(page, 'COMPARE', next);
});

test('R2 Compare legitimate no-branch and Running blockers remain native disabled', async ({ page }) => {
    await blank(page);
    const compare = page.getByRole('button', { name: 'Compare states', exact: true });
    await expect(compare).toBeDisabled();
    await nativeButton(page, 'Capture snapshot'); await nativeButton(page, 'Fork A + B');
    await nativeButton(page, 'Start');
    await expect(page.getByTestId('run-status')).toHaveText('Running');
    await expect(compare).toBeDisabled();
    const start = (await activationEvents(page)).length;
    // A native mouse sequence on a disabled button produces no trusted click.
    const box = await compare.boundingBox(); if (!box) throw Error('No Compare hit box');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await nativeButton(page, 'Pause');
    expect((await activationEvents(page)).slice(start).filter(e => e.type === 'command' && e.command === 'COMPARE')).toHaveLength(0);
});

for (const fault of ['error', 'watchdog'] as const) test(`R2 pending Compare terminates visibly after real Worker ${fault}`, async ({ page }) => {
    await forked(page);
    const { start } = await comparePointer(page);
    await expect(page.getByTestId('control-status')).toContainText(/waiting/i);
    if (fault === 'error') await page.evaluate(() => window.__activation.failWorker());
    // Watchdog uses the unchanged production 15 s timeout; there is no fake clock.
    await expect(page.getByRole('alert').first()).toContainText(/Worker|stopped|failed|unavailable/i, { timeout: 18000 });
    await expect(page.getByRole('button', { name: 'Cancel pending command', exact: true })).toBeHidden();
    await expect(page.getByTestId('control-status')).not.toContainText(/waiting/i);
    const events = (await activationEvents(page)).slice(start);
    expect(events.filter(e => e.type === 'command' && e.command === 'COMPARE')).toHaveLength(0);
    expect(events.some(e => e.type === 'worker-terminated')).toBe(true);
});

test('R2 pending owner disposal cannot execute Compare in a replacement experiment', async ({ page }) => {
    await forked(page);
    const old = await digest(page);
    await comparePointer(page);
    await expect(page.getByTestId('control-status')).toContainText(/waiting/i);
    await page.reload();
    await nativeButton(page, 'Start blank experiment');
    await expect(page.getByTestId('model-time')).toHaveText('0.000 s');
    const next = await digest(page);
    expect(next.sessionId).not.toBe(old.sessionId);
    expect((await activationEvents(page)).filter(e => e.type === 'command' && e.command === 'COMPARE')).toHaveLength(0);
    await expect(page.getByRole('button', { name: 'Cancel pending command', exact: true })).toBeHidden();
});

test('R2 completed command status cannot describe a replacement experiment', async ({ page }) => {
    await forked(page);
    const start = (await activationEvents(page)).length;
    await nativeButton(page, 'Compare states');
    const result = await expectOneCommand(page, 'COMPARE', start);
    expect(result.ack.tick).toBe(10000);
    await expect(page.getByTestId('control-status')).toHaveText('Compare states completed at 1.000 s.');
    const previous = await digest(page);
    await nativeButton(page, 'New experiment');
    await nativeButton(page, 'Create blank experiment');
    await nativeButton(page, 'Discard and continue');
    await expect(page.getByTestId('model-time')).toHaveText('0.000 s');
    expect((await digest(page)).sessionId).not.toBe(previous.sessionId);
    await expect(page.getByTestId('comparison')).toHaveText('Not checked');
    await expect(page.getByTestId('control-status')).toBeHidden();
    expect((await activationEvents(page)).filter(e => e.type === 'command' && e.command === 'COMPARE' && e.sessionId !== previous.sessionId)).toHaveLength(0);
});

test('R2 5 view / 12 frontier Compare preserves immutable/numeric state and own-history Replay', async ({ page }) => {
    await page.goto('/');
    await nativeButton(page, 'Run guided experiment');
    for (const name of ['Create same-state forks', 'Apply guided interventions', 'Compute to 12 s', 'Verify own histories', 'Finish guide']) await nativeButton(page, name);
    // Capture the next real recovery at 5s even if its ACK arrives before the UI assertion.
    await page.evaluate(() => window.__activation.arm(50000));
    await page.getByLabel('Seek time seconds').fill('5'); await nativeButton(page, 'Seek');
    await expect(page.getByTestId('model-time')).toHaveText('5.000 s');
    await expect(page.getByTestId('recorded-frontier')).toHaveText('Recorded to 12.000 s');
    const before = await digest(page);
    const { start } = await comparePointer(page, false, true);
    await expect(page.getByTestId('control-status')).toContainText(/waiting/i);
    await release(page);
    const result = await expectOneCommand(page, 'COMPARE', start);
    expect(result.ack.comparison?.tick).toBe(50000);
    expect(result.ack.comparison?.equal).toBe(false);
    expect(result.ack.frontier).toBe(120000);
    expect(await digest(page)).toEqual(before);
    expect(result.events.filter(e => e.type === 'command' && ['RUN', 'STEP'].includes(e.command ?? ''))).toHaveLength(0);
    await expect(page.getByTestId('comparison')).toHaveText('Branches differ');
    await expect(page.getByTestId('replay-status')).toHaveText('Not checked');
    const replayStart = (await activationEvents(page)).length;
    await nativeButton(page, 'Replay check');
    const replay = await expectOneCommand(page, 'REPLAY', replayStart);
    expect(replay.ack.tick).toBe(50000);
    expect(replay.ack.replay?.status).toBe('Matched');
    expect(await digest(page)).toEqual(before);
});

test('R2 Compare waiting owns the foreground slot and Save cannot overtake it', async ({ page }) => {
    await forked(page);
    const { start } = await comparePointer(page);
    await expect(page.getByTestId('control-status')).toContainText(/waiting/i);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await release(page);
    const result = await expectOneCommand(page, 'COMPARE', start);
    expectRecoveryCommitBefore(result.events, 'COMPARE');
    expect(result.events.filter(e => e.type === 'command' && e.command === 'EXPORT_STATE')).toHaveLength(1);
    await nativeButton(page, 'Save');
    await page.getByLabel('Experiment name', { exact: true }).fill('R2 after Compare');
    await nativeButton(page, 'Save to Library');
    await expect(page.getByTestId('save-status')).toHaveText('Saved');
    const events = await activationEvents(page);
    expect(events.some(e => e.type === 'idb-put' && e.store === 'entries')).toBe(true);
    await page.reload(); await nativeButton(page, 'Open Library or import');
    await nativeButton(page, 'Preview R2 after Compare'); await nativeButton(page, 'Load experiment');
    await expect(page.getByTestId('model-time')).toHaveText('1.000 s');
});

test('R2 Save waiting owns the same slot and Compare cannot enter behind the modal', async ({ page }) => {
    await forked(page);
    await nativeButton(page, 'Save');
    await page.getByLabel('Experiment name', { exact: true }).fill('R2 Save first');
    const submit = page.getByRole('button', { name: 'Save to Library', exact: true });
    const start = (await activationEvents(page)).length;
    await arm(page); await down(page, submit); await held(page); await page.mouse.up();
    await expect(page.getByText('Waiting for the current recovery record…', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Compare states', exact: true, includeHidden: true })).toBeDisabled();
    await release(page); await expect(page.getByTestId('save-status')).toHaveText('Saved');
    expect((await activationEvents(page)).slice(start).filter(e => e.type === 'command' && e.command === 'COMPARE')).toHaveLength(0);
    const next = (await activationEvents(page)).length;
    await nativeButton(page, 'Compare states'); await expectOneCommand(page, 'COMPARE', next);
});

test('R2 healthy memory-only experiment can Compare without any persistent DB owner', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('R2 controlled private storage unavailable', 'SecurityError'); } });
    });
    await forked(page, true);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(page.getByText(/Storage unavailable: memory-only/).first()).toBeVisible();
    const before = await digest(page), start = (await activationEvents(page)).length;
    await nativeButton(page, 'Compare states');
    const result = await expectOneCommand(page, 'COMPARE', start);
    expect(result.ack.comparison).toEqual({ equal: true, tick: 20000, firstDifference: null });
    expect(await digest(page)).toEqual(before);
    expect(result.events.some(e => e.type === 'transaction' && e.mode === 'readwrite')).toBe(false);
});

test('R2 real recovery transaction abort settles before Compare and preserves the prior durable record', async ({ page }) => {
    await page.addInitScript(() => {
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
            const request = original.call(this, value, key);
            if (this.name === 'recovery' && Reflect.get(window, 'abortNextR2Recovery') && (value as { file?: string }).file) {
                Reflect.set(window, 'abortNextR2Recovery', false);
                window.__activation.mark('test-abort-real-recovery-transaction');
                this.transaction.abort();
                window.__activation.mark('real-recovery-abort-returned');
            }
            return request;
        };
    });
    await forked(page);
    // Establish the prior durable record, then change the real experiment before
    // starting the new input race. No wait masks the recovery under examination.
    await expect(page.getByRole('region', { name: 'Experiment status' }).getByText('View 1.00 s / recorded 1.00 s', { exact: true })).toBeVisible({ timeout: 12000 });
    async function durableDigest() {
        return page.evaluate(() => new Promise<string>((resolve, reject) => {
            const open = indexedDB.open('flyfork-library');
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const db = open.result, transaction = db.transaction('recovery'), get = transaction.objectStore('recovery').get('slot');
                transaction.oncomplete = () => db.close();
                get.onerror = () => reject(get.error);
                get.onsuccess = () => {
                    const record = get.result as { file: string; revision: number; sequence: number; owner: string };
                    void crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(record))).then(hash => resolve(Array.from(new Uint8Array(hash)).map(n => n.toString(16).padStart(2, '0')).join('')));
                };
            };
        }));
    }
    const durable = await durableDigest();
    await nativeButton(page, '+1 s'); await expect(page.getByTestId('model-time')).toHaveText('2.000 s');
    await page.evaluate(() => Reflect.set(window, 'abortNextR2Recovery', true));
    const before = await digest(page), { start } = await comparePointer(page);
    await expect(page.getByTestId('control-status')).toContainText(/waiting/i);
    await release(page);
    const result = await expectOneCommand(page, 'COMPARE', start);
    const abortedTransaction = result.events.find(e => e.type === 'transaction' && e.mode === 'readwrite' && e.stores?.includes('recovery'));
    expect(abortedTransaction, 'The real recovery write transaction was created').toBeDefined();
    const abortReturnedIndex = result.events.findIndex(e => e.type === 'mark' && e.label === 'real-recovery-abort-returned');
    const compareIndex = result.events.findIndex(e => e.type === 'command' && e.command === 'COMPARE');
    expect(abortReturnedIndex, 'Native abort returned after rollback and finishing the transaction').toBeGreaterThan(-1);
    expect(compareIndex).toBeGreaterThan(abortReturnedIndex);
    // Native abort notifications are queued after rollback. They may be delivered
    // after Dexie rejects its request and the now-settled recovery permits Compare.
    await expect.poll(async () => (await activationEvents(page)).some(e => e.type === 'transaction-abort' && e.id === abortedTransaction?.id)).toBe(true);
    expect((await activationEvents(page)).some(e => e.type === 'transaction-complete' && e.id === abortedTransaction?.id)).toBe(false);
    expect(result.ack.comparison?.tick).toBe(20000);
    expect(await digest(page)).toEqual(before);
    expect(await durableDigest()).toBe(durable);
    await expect(page.getByRole('button', { name: 'Cancel pending command', exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Compare states', exact: true })).toBeEnabled();
});

test('R2 two genuinely separate native STEP activations each advance once', async ({ page }) => {
    await forked(page);
    const step = page.getByRole('button', { name: '+1 s', exact: true });
    const start = (await activationEvents(page)).length;
    await arm(page); await down(page, step); await held(page); await page.mouse.up();
    await expect(page.getByTestId('control-status')).toContainText(/waiting/i);
    await release(page);
    const first = await expectOneCommand(page, 'STEP', start);
    expect(first.ack.tick).toBe(20000);
    await expect(step).toBeEnabled();
    const next = (await activationEvents(page)).length;
    await step.click();
    const second = await expectOneCommand(page, 'STEP', next);
    expect(second.ack.tick).toBe(30000);
    expect(second.sent.requestId).not.toBe(first.sent.requestId);
    expect(second.sent.sessionId).toBe(first.sent.sessionId);
    await expect(page.getByTestId('model-time')).toHaveText('3.000 s');
});

for (const finish of ['complete', 'cancel'] as const) test(`R2 390 px pending ${finish} is reachable with native keyboard and retains focus`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await forked(page);
    const button = page.getByRole('button', { name: 'Compare states', exact: true });
    await button.scrollIntoViewIfNeeded(); await button.focus();
    const start = (await activationEvents(page)).length;
    await arm(page); await page.keyboard.down('Space'); await held(page); await page.keyboard.up('Space');
    await expect(page.getByTestId('control-status')).toContainText(/waiting/i);
    await testInfo.attach('390-pending', { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    if (finish === 'cancel') {
        const cancel = page.getByRole('button', { name: 'Cancel pending command', exact: true });
        await cancel.focus(); await page.keyboard.press('Enter');
        await expect(page.getByTestId('control-status')).toContainText(/cancel/i);
    }
    await release(page);
    if (finish === 'complete') await expectOneCommand(page, 'COMPARE', start);
    else {
        await expect(page.getByRole('region', { name: 'Experiment status' }).getByText('View 1.00 s / recorded 1.00 s', { exact: true })).toBeVisible();
        expect(await commandReplies(page, 'COMPARE', start)).toHaveLength(0);
        await expect(page.getByTestId('control-status')).toHaveText('Command cancelled.');
    }
    await expect(button).toBeEnabled();
    const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, disabled: document.activeElement instanceof HTMLButtonElement && document.activeElement.disabled }));
    expect(focus.tag).not.toBe('BODY'); expect(focus.disabled).toBe(false);
});

const sharedControls = [
    { name: 'Replay check', command: 'REPLAY', setup: 'advanced', tick: 20000 },
    { name: '+1 s', command: 'STEP', setup: 'forked', tick: 20000 },
    { name: '+5 s', command: 'STEP', setup: 'forked', tick: 60000 },
    { name: 'Seek', command: 'SEEK', setup: 'advanced', tick: 10000 },
    { name: 'Capture snapshot', command: 'SNAPSHOT', setup: 'blank', tick: 10000 },
    { name: 'Fork A + B', command: 'FORK', setup: 'snapshot', tick: 10000 },
    { name: 'Restore S₀', command: 'RESTORE', setup: 'advanced', tick: 10000 },
    { name: 'Apply intervention', command: 'SCHEDULE_INTERVENTION', setup: 'forked', tick: 10000 },
    { name: 'Start', command: 'RUN', setup: 'zero', tick: 0 },
    { name: 'Resume', command: 'RUN', setup: 'forked', tick: 10000 },
    { name: 'Pause', command: 'PAUSE', setup: 'running', tick: null },
] as const;
for (const control of sharedControls) test(`R2 shared native activation: ${control.name} across real recovery`, async ({ page }) => {
    if (control.setup === 'zero') await blank(page);
    else if (control.setup === 'blank' || control.setup === 'snapshot') {
        await blank(page); await nativeButton(page, '+1 s');
        await expect(page.getByTestId('model-time')).toHaveText('1.000 s');
        if (control.setup === 'snapshot') await nativeButton(page, 'Capture snapshot');
    } else await forked(page, control.setup === 'advanced');
    if (control.name === 'Seek') await page.getByLabel('Seek time seconds').fill('1');
    if (control.setup === 'running') await nativeButton(page, 'Resume');
    const button = page.getByRole('button', { name: control.name, exact: true });
    const start = (await activationEvents(page)).length;
    await arm(page); await down(page, button); await held(page); await page.mouse.up(); await paint(page);
    const during = (await activationEvents(page)).slice(start);
    expect(during.some(e => e.type === 'click' && e.name?.includes(control.name) && e.trusted), `${control.name} native click survives recovery`).toBe(true);
    expect(during.filter(e => e.type === 'command' && e.command === control.command)).toHaveLength(0);
    await release(page);
    const result = await expectOneCommand(page, control.command, start);
    expectRecoveryCommitBefore(result.events, control.command);
    if (control.tick !== null) expect(result.ack.tick).toBe(control.tick);
    if (control.command === 'RUN') { expect(result.ack.running).toBe(true); await nativeButton(page, 'Pause'); }
    if (control.command === 'PAUSE') expect(result.ack.running).toBe(false);
    if (control.command === 'REPLAY') expect(result.ack.replay?.status).toBe('Matched');
    if (control.command === 'SCHEDULE_INTERVENTION') await expect(page.getByText('Applied events (1)', { exact: true })).toBeVisible();
});
