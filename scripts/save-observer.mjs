// Passive, test-context-only observation. Native methods run with unchanged args,
// return values and event delivery; no Worker/IDB delays or product state hooks.
export function installSaveObserver() {
    const pageId = crypto.randomUUID(), events = [], files = [];
    let workerCount = 0, transactionCount = 0, databaseCount = 0, latest = null, overflow = false;
    const databases = new WeakMap(), transactions = new WeakMap();
    const fileRef = file => { files.push(file); return files.length - 1; };
    const log = (type, fields = {}) => {
        if (events.length >= 12000) { overflow = true; return; }
        const event = { type, order: events.length, time: performance.now(), pageId, ...latest?.owner, tick: latest?.view.original.tick, frontier: latest?.view.highWater, running: latest?.view.running, ...fields };
        events.push(event); return event;
    };
    for (const type of ['click', 'submit']) document.addEventListener(type, e => {
        const el = e.target instanceof Element ? e.target.closest('button,form') : null;
        if (el) log(type, { name: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 80), formName: type === 'submit' ? el.querySelector('input')?.value : undefined, trusted: e.isTrusted });
    }, true);
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
        constructor(...args) {
            super(...args);
            const workerId = ++workerCount, requests = new Map();
            this.observation = { workerId, requests };
            log('worker-created', { workerId, url: String(args[0]) });
            this.addEventListener('message', e => {
                const m = e.data, owner = { pageId, workerId, sessionId: m.sessionId, epoch: m.epoch };
                if (m.view) latest = { owner, view: m.view };
                if (!['ACK', 'ERROR'].includes(m.kind)) return;
                const command = requests.get(`${m.sessionId}:${m.epoch}:${m.requestId}`);
                log('reply', { ...owner, requestId: m.requestId, kind: m.kind, command, revision: m.revision, sequence: m.sequence, fileRef: typeof m.file === 'string' ? fileRef(m.file) : undefined, view: ['EXPORT_STATE', 'LOAD'].includes(command) ? m.view : undefined });
            });
        }
        postMessage(...args) {
            const m = args[0], { workerId, requests } = this.observation;
            requests.set(`${m.sessionId}:${m.epoch}:${m.requestId}`, m.type);
            log('command', { workerId, sessionId: m.sessionId, epoch: m.epoch, requestId: m.requestId, command: m.type, expectedRevision: m.expectedRevision, metadata: m.type === 'EXPORT_STATE' ? { ...m.payload } : undefined, fileRef: m.type === 'LOAD' ? fileRef(m.payload.file) : undefined });
            return super.postMessage(...args);
        }
        terminate() { log('worker-terminated', { workerId: this.observation.workerId }); return super.terminate(); }
    };
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
        const tx = transaction.apply(this, args);
        if (!databases.has(this)) databases.set(this, ++databaseCount);
        const identity = { txId: ++transactionCount, dbId: databases.get(this) };
        transactions.set(tx, identity);
        log('transaction', { ...identity, database: this.name, stores: [...tx.objectStoreNames], mode: tx.mode });
        for (const type of ['complete', 'abort', 'error']) tx.addEventListener(type, () => log('transaction-' + type, identity));
        return tx;
    };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
        const result = put.apply(this, args), value = args[0];
        log('put', { ...transactions.get(this.transaction), store: this.name, id: value.id, entry: this.name === 'entries' ? { ...value } : undefined, recoveryOwner: this.name === 'recovery' ? value.owner : undefined, recoverySequence: this.name === 'recovery' ? value.sequence : undefined, fileRef: typeof value.file === 'string' ? fileRef(value.file) : undefined });
        return result;
    };
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (...args) {
        const result = get.apply(this, args);
        log('get', { ...transactions.get(this.transaction), store: this.name, key: args[0] });
        return result;
    };
    window.__saveEvidence = {
        events, files,
        snapshot: () => ({ pageId, owner: latest?.owner, tick: latest?.view.original.tick, frontier: latest?.view.highWater, running: latest?.view.running, view: latest?.view, visible: document.visibilityState, active: document.hasFocus(), overflow }),
    };
}
