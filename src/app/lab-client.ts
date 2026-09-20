import { acceptReply } from '../worker-protocol/protocol';
import type { Action, Cursor, LabView, Reply } from '../worker-protocol/protocol';
export class LabClient {
    readonly cursor: Cursor = { sessionId: crypto.randomUUID(), epoch: 0, revision: 0, sequence: -1 };
    view: LabView | null = null;
    closed = false;
    failed = false;
    onView: (view: LabView) => void = () => { };
    onBusy: (busy: boolean) => void = () => { };
    onError: (message: string, fatal: boolean) => void = () => { };
    private requestId = 0;
    private inFlight: Promise<Reply> | null = null;
    private queued = false;
    private pending: {
        id: number;
        type: Action['type'];
        resolve(reply: Reply): void;
        reject(error: Error): void;
    } | null = null;
    private timeout: ReturnType<typeof setTimeout> | undefined;
    constructor(private worker: Worker) {
        worker.onmessage = event => {
            if (this.closed || this.failed)
                return;
            const reply = acceptReply(event.data, this.cursor, this.pending?.id ?? null);
            if (!reply)
                return;
            this.cursor.revision = reply.revision;
            this.cursor.sequence = reply.sequence;
            if (reply.kind === 'PROGRESS')
                this.watchdog();
            if (reply.view) {
                this.view = reply.view;
                this.onView(reply.view);
            }
            if (reply.kind === 'ACK' || reply.kind === 'ERROR') {
                clearTimeout(this.timeout);
                const pending = this.pending;
                this.pending = null;
                this.inFlight = null;
                this.onBusy(this.queued);
                if (reply.kind === 'ERROR') {
                    const message = reply.error ?? 'Worker command failed';
                    this.onError(message, false);
                    pending?.reject(new Error(message));
                }
                else
                    pending?.resolve(reply);
            }
        };
        worker.onerror = () => this.fail('Simulation Worker stopped. Recover the last durable record or start a new experiment.');
        worker.onmessageerror = () => this.fail('Worker message could not be decoded. Recover the last durable record.');
    }
    get busy() { return this.pending !== null || this.queued; }
    get pendingType() { return this.pending?.type; }
    private watchdog() { clearTimeout(this.timeout); this.timeout = setTimeout(() => this.fail('Worker response stopped. Only the last durable record can be recovered.'), 15000); }
    private fail(message: string) {
        if (this.closed || this.failed)
            return;
        this.failed = true;
        this.worker.terminate();
        clearTimeout(this.timeout);
        this.pending?.reject(new Error(message));
        this.pending = null;
        this.onBusy(false);
        this.onError(message, true);
    }
    request(action: Action): Promise<Reply> {
        if (this.closed || this.failed)
            return Promise.reject(new Error('Worker unavailable or busy'));
        // A click can arrive before React paints a pending command's disabled state.
        // Preserve one action behind its ACK, then use the acknowledged revision.
        if (this.pending && !this.queued) {
            this.queued = true;
            return this.inFlight!.catch(() => { }).then(() => {
                this.queued = false;
                return this.request(action);
            });
        }
        if (this.busy) {
            this.onError('A command is already pending. Wait for its acknowledgement.', false);
            return Promise.reject(new Error('Worker busy'));
        }
        const result = new Promise<Reply>((resolve, reject) => {
            this.pending = { id: ++this.requestId, type: action.type, resolve, reject };
            this.onBusy(true);
            this.watchdog();
            this.worker.postMessage({ ...action, protocolVersion: 4, requestId: this.requestId, sessionId: this.cursor.sessionId, epoch: this.cursor.epoch, expectedRevision: this.cursor.revision });
        });
        this.inFlight = result;
        return result;
    }
    dispose() { this.closed = true; clearTimeout(this.timeout); this.worker.terminate(); this.pending?.reject(new Error('Obsolete Worker session closed')); this.pending = null; }
}
