import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import type { Command, LabView, Reply } from '../../src/worker-protocol/protocol';

export interface ActivationEvent {
    type: string;
    time: number;
    name?: string;
    key?: string;
    trusted?: boolean;
    disabled?: boolean;
    command?: string;
    requestId?: number;
    sessionId?: string;
    epoch?: number;
    revision?: number;
    expectedRevision?: number;
    tick?: number;
    frontier?: number;
    running?: boolean;
    kind?: string;
    comparison?: LabView['comparison'];
    replay?: LabView['replay'];
    id?: number;
    store?: string;
    stores?: string[];
    mode?: string;
    status?: string;
    label?: string;
}
interface ActivationProbe {
    events: ActivationEvent[];
    armed: boolean;
    held: boolean;
    arm(tick?: number): void;
    release(): void;
    failWorker(): void;
    mark(label: string): void;
    digest(): Promise<{ numeric: string; immutable: string; tick: number; frontier: number; sessionId: string }>;
}
declare global { interface Window { __activation: ActivationProbe } }

// Runs only in an isolated Playwright page. It observes real commands and real
// IndexedDB commits; the only timing intervention retains one genuine ACK.
export function installActivationProbe() {
    const events: ActivationEvent[] = [];
    const log = (type: string, detail: Omit<ActivationEvent, 'type' | 'time'> = {}) => {
        if (events.length < 5000) events.push({ type, time: performance.now(), ...detail });
    };
    let latest: Reply | null = null;
    let heldTick: number | undefined;
    let heldReply: { worker: Worker; reply: Reply } | null = null;
    const workers = new Set<Worker>();
    const commands = new Map<string, string>();
    const digest = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))).map(b => b.toString(16).padStart(2, '0')).join('');
    const probe: ActivationProbe = {
        events, armed: false, held: false,
        arm(tick) { heldTick = tick; if (heldReply || probe.armed) throw Error('Only one retained ACK is allowed'); probe.armed = true; log('mark', { label: 'armed-next-real-recovery' }); },
        release() {
            if (!heldReply) throw Error('No real recovery ACK is retained');
            const { worker, reply } = heldReply;
            heldReply = null; probe.held = false;
            log('mark', { label: 'release-real-recovery', requestId: reply.requestId, sessionId: reply.sessionId });
            worker.dispatchEvent(new MessageEvent('message', { data: reply }));
        },
        failWorker() {
            const activeWorker = Array.from(workers).at(-1);
            if (!activeWorker) throw Error('No active real Worker');
            log('mark', { label: 'test-injected-native-worker-error' });
            activeWorker.dispatchEvent(new ErrorEvent('error', { message: 'R2 controlled Worker transport loss' }));
        },
        mark(label) { log('mark', { label }); },
        async digest() {
            if (!latest?.view) throw Error('No real acknowledged state');
            const v = latest.view;
            return {
                numeric: await digest([v.original, v.branch, v.branchB]),
                immutable: await digest([v.dataset.hash, v.configHash, v.seed, v.events, v.eventRevisions, v.recordRevision, v.snapshot, v.forkTick, v.highWater]),
                tick: v.original.tick, frontier: v.highWater, sessionId: latest.sessionId,
            };
        },
    };
    window.__activation = probe;
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click', 'keydown', 'keyup', 'submit']) {
        document.addEventListener(type, event => {
            const target = event.target instanceof Element ? event.target.closest('button,input,form') : null;
            if (!(target instanceof HTMLElement)) return;
            log(type, { name: target.getAttribute('aria-label') || target.textContent?.trim().slice(0, 80), key: event instanceof KeyboardEvent ? event.key : undefined, trusted: event.isTrusted, disabled: target instanceof HTMLButtonElement && target.disabled });
        }, true);
    }
    const Original = window.Worker;
    window.Worker = class extends Original {
        private holdId: number | null = null;
        constructor(url: string | URL, options?: WorkerOptions) {
            super(url, options); workers.add(this); log('worker-created');
            this.addEventListener('message', event => {
                const reply = event.data as Reply;
                if (reply.kind === 'ACK' && reply.requestId === this.holdId) {
                    event.stopImmediatePropagation(); this.holdId = null;
                    heldReply = { worker: this, reply }; probe.held = true;
                    log('recovery-ACK-held', { requestId: reply.requestId, sessionId: reply.sessionId, tick: reply.view?.original.tick, frontier: reply.view?.highWater });
                    return;
                }
                if (reply.view) latest = reply;
                if (reply.kind !== 'ACK' && reply.kind !== 'ERROR') return;
                log('reply', { command: commands.get(`${reply.sessionId}:${reply.requestId}`), kind: reply.kind, requestId: reply.requestId, sessionId: reply.sessionId, epoch: reply.epoch, revision: reply.revision, tick: reply.view?.original.tick, frontier: reply.view?.highWater, running: reply.view?.running, comparison: reply.view?.comparison, replay: reply.view?.replay });
                requestAnimationFrame(() => log('paint-opportunity', { requestId: reply.requestId, sessionId: reply.sessionId }));
            });
        }
        postMessage(data: Command) {
            commands.set(`${data.sessionId}:${data.requestId}`, data.type);
            log('command', { command: data.type, requestId: data.requestId, sessionId: data.sessionId, epoch: data.epoch, expectedRevision: data.expectedRevision, tick: latest?.view?.original.tick, frontier: latest?.view?.highWater, running: latest?.view?.running });
            if (probe.armed && data.type === 'EXPORT_STATE' && (heldTick === undefined || latest?.view?.original.tick === heldTick)) { probe.armed = false; this.holdId = data.requestId; }
            super.postMessage(data);
        }
        terminate() { workers.delete(this); log('worker-terminated'); super.terminate(); }
    };
    let transactionId = 0;
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof transaction>) {
        const tx = transaction.apply(this, args), id = ++transactionId;
        log('transaction', { id, stores: Array.from(tx.objectStoreNames), mode: tx.mode });
        for (const type of ['complete', 'abort', 'error']) tx.addEventListener(type, () => log(`transaction-${type}`, { id }));
        return tx;
    };
    for (const method of ['put', 'add'] as const) {
        const original = IDBObjectStore.prototype[method];
        IDBObjectStore.prototype[method] = function (...args: Parameters<typeof original>) {
            log(`idb-${method}`, { store: this.name });
            return original.apply(this, args);
        };
    }
    let previous = '';
    new MutationObserver(() => {
        const status = document.querySelector('[data-testid="control-status"]')?.textContent ?? '';
        if (status !== previous) { previous = status; log('control-status', { status }); }
    }).observe(document, { subtree: true, childList: true, characterData: true });
}

export async function activationEvents(page: Page) { return page.evaluate(() => window.__activation.events); }
export async function nativeButton(page: Page, name: string) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeEnabled();
    await button.click();
}
export async function blank(page: Page) {
    await page.goto('/');
    await nativeButton(page, 'Start blank experiment');
    await expect(page.getByTestId('model-time')).toHaveText('0.000 s');
}
export async function forked(page: Page, advanced = false) {
    await blank(page);
    await nativeButton(page, '+1 s');
    await expect(page.getByTestId('model-time')).toHaveText('1.000 s');
    await nativeButton(page, 'Capture snapshot');
    await nativeButton(page, 'Fork A + B');
    await expect(page.locator('[data-branch="B"]')).toHaveAttribute('data-tick', '10000');
    if (advanced) { await nativeButton(page, '+1 s'); await expect(page.getByTestId('model-time')).toHaveText('2.000 s'); }
}
export async function arm(page: Page) { await page.evaluate(() => window.__activation.arm()); }
export async function held(page: Page) { await page.waitForFunction(() => window.__activation.held, undefined, { timeout: 12000 }); }
export async function release(page: Page) { await page.evaluate(() => window.__activation.release()); }
export async function mark(page: Page, label: string) { await page.evaluate(label => window.__activation.mark(label), label); }
export async function digest(page: Page) { return page.evaluate(() => window.__activation.digest()); }
export async function down(page: Page, button: Locator) {
    await expect(button).toBeEnabled();
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    if (!box) throw Error('Native target has no hit box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
}
export async function paint(page: Page) { await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => r()))); }
export async function commandReplies(page: Page, command: string, after: number) {
    return (await activationEvents(page)).slice(after).filter(e => e.type === 'reply' && e.command === command && e.kind === 'ACK');
}
export async function expectOneCommand(page: Page, command: string, after: number) {
    await expect.poll(async () => (await commandReplies(page, command, after)).length).toBe(1);
    const events = (await activationEvents(page)).slice(after);
    const sent = events.filter(e => e.type === 'command' && e.command === command);
    expect(sent).toHaveLength(1);
    const ack = events.find(e => e.type === 'reply' && e.command === command && e.kind === 'ACK')!;
    expect([ack.requestId, ack.sessionId, ack.epoch]).toEqual([sent[0].requestId, sent[0].sessionId, sent[0].epoch]);
    return { events, sent: sent[0], ack };
}
export function expectRecoveryCommitBefore(events: ActivationEvent[], command: string) {
    const releaseIndex = events.findIndex(e => e.type === 'mark' && e.label === 'release-real-recovery');
    const dispatchIndex = events.findIndex(e => e.type === 'command' && e.command === command);
    const recoveryTx = events.find((e, i) => i > releaseIndex && e.type === 'transaction' && e.mode === 'readwrite' && e.stores?.includes('recovery'));
    expect(recoveryTx, 'Real recovery write transaction exists').toBeDefined();
    const commitIndex = events.findIndex(e => e.type === 'transaction-complete' && e.id === recoveryTx?.id);
    expect(commitIndex, 'The real recovery transaction committed before command dispatch').toBeGreaterThan(releaseIndex);
    expect(dispatchIndex).toBeGreaterThan(commitIndex);
}
