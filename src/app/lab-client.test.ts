import { afterEach, expect, it, vi } from 'vitest';
import { LabClient } from './lab-client';
import { SimulationHost } from '../worker-protocol/host';
class FakeWorker {
    onmessage: ((event: {
        data: unknown;
    }) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessageerror: (() => void) | null = null;
    postMessage = vi.fn();
    terminate = vi.fn();
}
afterEach(() => vi.useRealTimers());
it.each(['EXPORT_STATE', 'STEP'] as const)('keeps a user command arriving during %s until its ACK instead of silently dropping it', async (type) => {
    const { worker, client } = setup();
    const first = client.request(type === 'STEP' ? { type: 'STEP', payload: { ticks: 10000 } } : { type: 'EXPORT_STATE', payload: { id: 'record', name: 'record', savedAt: '2026-09-19T12:00:00.000Z', runtime: 'test', dataset: 'synthetic' } });
    let rejected = false;
    const next = client.request({ type: 'PAUSE', payload: {} }).catch(error => { rejected = true; return error; });
    await Promise.resolve();
    expect(rejected).toBe(false);
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    worker.onmessage!({ data: ack(client) });
    await first;
    await Promise.resolve();
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expect(client.pendingType).toBe('PAUSE');
    expect(worker.postMessage.mock.calls[1][0]).toMatchObject({ type: 'PAUSE', requestId: 2, expectedRevision: 1 });
    worker.onmessage!({ data: ack(client, { requestId: 2, revision: 2, sequence: 2 }) });
    await expect(next).resolves.toMatchObject({ kind: 'ACK' });
    client.dispose();
});
function setup() { const worker = new FakeWorker(), client = new LabClient(worker as unknown as Worker); return { worker, client }; }
const initialView = new SimulationHost().handle({ protocolVersion: 4, sessionId: 'fixture', epoch: 0, requestId: 1, expectedRevision: 0, type: 'INIT', payload: { seed: 42, dataset: 'synthetic' } }).view;
function ack(client: LabClient, extra = {}) { return { protocolVersion: 4, kind: 'ACK', sessionId: client.cursor.sessionId, epoch: 0, revision: 1, sequence: 1, requestId: 1, view: initialView, ...extra }; }
it('ignores old-session, epoch, request and sequence ACKs without accepting false export success', async () => {
    const { worker, client } = setup();
    const pending = client.request({ type: 'PAUSE', payload: {} });
    const busy = vi.fn();
    client.onBusy = busy;
    for (const extra of [{ sessionId: 'old-session' }, { epoch: 1 }, { requestId: 2 }, { sequence: -1 }])
        worker.onmessage!({ data: ack(client, extra) });
    expect(client.busy).toBe(true);
    expect(client.cursor.revision).toBe(0);
    worker.onmessage!({ data: ack(client) });
    await expect(pending).resolves.toMatchObject({ kind: 'ACK' });
    expect(busy).toHaveBeenCalledWith(false);
    client.dispose();
    worker.onmessage!({ data: ack(client, { revision: 99, sequence: 99 }) });
    expect(client.cursor.revision).toBe(1);
});
it.each(['onerror', 'onmessageerror'] as const)('terminates on %s and rejects pending save rather than returning Saved', async (event) => {
    const { worker, client } = setup();
    const pending = client.request({ type: 'PAUSE', payload: {} }), rejected = expect(pending).rejects.toThrow(/Worker/);
    worker[event]!();
    await rejected;
    expect(client.failed).toBe(true);
    expect(worker.terminate).toHaveBeenCalledOnce();
    worker.onmessage!({ data: ack(client) });
    expect(client.cursor.revision).toBe(0);
    await expect(client.request({ type: 'PAUSE', payload: {} })).rejects.toThrow(/unavailable/);
});
it('a missing ACK times out; closing a session rejects its pending command and ignores later errors', async () => {
    vi.useFakeTimers();
    const { worker, client } = setup();
    const pending = client.request({ type: 'PAUSE', payload: {} }), rejected = expect(pending).rejects.toThrow(/durable/);
    await vi.advanceTimersByTimeAsync(15000);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
    const second = setup(), onError = vi.fn();
    second.client.onError = onError;
    const command = second.client.request({ type: 'PAUSE', payload: {} }), closed = expect(command).rejects.toThrow(/Obsolete/);
    second.client.dispose();
    await closed;
    second.worker.onerror!();
    expect(onError).not.toHaveBeenCalled();
});
