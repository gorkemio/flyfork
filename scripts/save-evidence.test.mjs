import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { correlateNamedSave, compareReopenedExport, loadFileValidators, sha256 } from './save-evidence.mjs';
import { installSaveObserver } from './save-observer.mjs';

const original = readFileSync('docs/evidence/stage-4/round-trip.flyfork.json', 'utf8');
const content = JSON.parse(original).content;
const validators = await loadFileValidators();
const identity = { pageId: 'page-one', workerId: 2, sessionId: 'session-one', epoch: 0 };
function fixture() {
    const c = content, m = c.metadata;
    const entry = { id: m.id, name: m.name, savedAt: m.savedAt, dataset: m.dataset, model: c.snapshots[0].state.model, playhead: c.playhead, frontier: c.frontier, branches: c.records.length, bytes: Buffer.byteLength(original), revision: 1 };
    const branches = Object.fromEntries([['original', 'original'], ['A', 'branch'], ['B', 'branchB']].map(([id, key]) => {
        const state = c.live.map(i => c.snapshots[i]).find(b => b.branch === id)?.state;
        return [key, state ? { tick: state.tick, body: state.body } : null];
    }));
    const view = { ...branches, seed: c.seed, dataset: { kind: m.dataset, hash: c.snapshots[0].state.datasetHash, model: c.snapshots[0].state.model }, configHash: c.snapshots[0].state.configHash, highWater: c.frontier, forkTick: c.forkTick, recordRevision: c.recordRevision, snapshot: c.anchor ? { tick: c.anchor.tick } : null, events: c.records.flatMap(r => c.snapshots[r.terminal].events) };
    const events = [
        { type: 'click', name: 'Save', trusted: true },
        { type: 'click', name: 'Save to Library', trusted: true },
        { type: 'submit', formName: m.name, trusted: true, running: true },
        { type: 'command', command: 'EXPORT_STATE', metadata: m, requestId: 15, expectedRevision: 14 },
        { type: 'reply', command: 'EXPORT_STATE', requestId: 15, kind: 'ACK', revision: 15, fileRef: 0, view },
        { type: 'transaction', txId: 7, dbId: 1, stores: ['entries', 'payloads'], mode: 'readwrite' },
        { type: 'put', txId: 7, dbId: 1, store: 'payloads', id: m.id, fileRef: 0 },
        { type: 'put', txId: 7, dbId: 1, store: 'entries', entry },
        { type: 'transaction-complete', txId: 7, dbId: 1, tick: c.playhead + 1000 },
    ].map(e => ({ ...identity, ...e }));
    return { events, files: [original], stored: original, entry };
}

test('real v1 metadata uses savedAt and rejects imaginary updatedAt', () => {
    assert.deepEqual(Object.keys(content.metadata).sort(), ['dataset', 'id', 'name', 'runtime', 'savedAt']);
    assert.equal(validators.metadataSchema.safeParse(content.metadata).success, true);
    assert.equal(validators.metadataSchema.safeParse({ ...content.metadata, updatedAt: content.metadata.savedAt }).success, false);
});

test('named Save joins native intent/request/ACK to exact transaction id, record id and revision', () => {
    const result = correlateNamedSave(fixture(), content.metadata.name);
    assert.equal(result.request.requestId, 15);
    assert.equal(result.transaction.txId, 7);
    assert.equal(result.entry.revision, 1);
});

test('recovery before, interleaved and after Save never becomes a named ACK', () => {
    const f = fixture(), recovery = requestId => [
        { ...identity, type: 'command', command: 'EXPORT_STATE', requestId, metadata: { ...content.metadata, name: 'Recovery title' } },
        { ...identity, type: 'reply', command: 'EXPORT_STATE', requestId, kind: 'ACK', fileRef: 0 },
    ];
    f.events.unshift(...recovery(13));
    f.events.splice(6, 0, ...recovery(14));
    f.events.push(...recovery(16));
    const result = correlateNamedSave(f, content.metadata.name);
    assert.equal(result.request.requestId, 15);
    assert.equal(result.totalExportACKs, 4);
});

test('same request numbers from another session, epoch, page or Worker owner are not matched', () => {
    for (const field of ['pageId', 'workerId', 'sessionId', 'epoch']) {
        const f = fixture(), foreign = f.events.slice(3, 5).map(e => ({ ...e, [field]: 'different' }));
        f.events.splice(4, 0, ...foreign);
        assert.equal(correlateNamedSave(f, content.metadata.name).request.requestId, 15);
        f.events = f.events.filter(e => !(e.type === 'reply' && e[field] !== 'different'));
        assert.throws(() => correlateNamedSave(f, content.metadata.name), /named ACK/);
    }
});

test('duplicate reply, wrong request, wrong commit owner/revision and payload mismatch fail closed', () => {
    for (const mutate of [
        f => f.events.push({ ...f.events[4] }),
        f => { f.events[4].requestId = 14; },
        f => { f.events[8].dbId = 2; },
        f => { f.entry = { ...f.entry, revision: 2 }; },
        f => { f.events[6].fileRef = 1; f.files.push('different'); },
        f => { f.events[3].metadata = { ...content.metadata, id: 'wrong-record' }; },
    ]) {
        const f = fixture(); mutate(f);
        assert.throws(() => correlateNamedSave(f, content.metadata.name));
    }
});

function exported(c) {
    return validators.canonical({ format: 'FlyFork', version: 1, content: c, sha256: sha256(validators.canonical(c)) });
}
test('actual inspect/deserialize accepts the predeclared savedAt-only full-file transformation', async () => {
    const next = { ...content, metadata: { ...content.metadata, savedAt: '2026-09-21T00:00:00.000Z' } };
    const result = await compareReopenedExport(original, exported(next), { command: 'EXPORT_STATE', metadata: next.metadata }, validators);
    assert.equal(result.fullContentEqual, true);
    assert.equal(result.replay, 'Not checked');
});

test('metadata id/name/runtime/dataset changes and full-state changes are not broadly excluded', async () => {
    for (const [field, value] of [['id', 'other-id'], ['name', 'other-name'], ['runtime', 'other-runtime'], ['dataset', content.metadata.dataset === 'malecns' ? 'synthetic' : 'malecns']]) {
        const next = { ...content, metadata: { ...content.metadata, savedAt: '2026-09-21T00:00:00.000Z', [field]: value } };
        await assert.rejects(compareReopenedExport(original, exported(next), { command: 'EXPORT_STATE', metadata: next.metadata }, validators));
    }
    const next = structuredClone(content);
    next.metadata.savedAt = '2026-09-21T00:00:00.000Z';
    next.snapshots.at(-1).state.body.heading += 0.01;
    await assert.rejects(compareReopenedExport(original, exported(next), { command: 'EXPORT_STATE', metadata: next.metadata }, validators));
    const good = { ...content, metadata: { ...content.metadata, savedAt: '2026-09-21T00:00:00.000Z' } };
    await assert.rejects(compareReopenedExport(original, exported(good).replace(/"sha256":"[a-f0-9]+"/, '"sha256":"' + '0'.repeat(64) + '"'), { command: 'EXPORT_STATE', metadata: good.metadata }, validators), /hash mismatch/);
});

test('passive observer forwards native Worker/IDB calls and correlates transaction writes without changing arguments', () => {
    const calls = [], answer = {}, tx = new EventTarget();
    tx.objectStoreNames = ['entries', 'payloads']; tx.mode = 'readwrite';
    class Worker {
        addEventListener(type, listener) { assert.equal(type, 'message'); this.listener = listener; }
        postMessage(...args) { calls.push(args); return answer; }
        terminate() { return answer; }
    }
    class Database { constructor() { this.name = 'flyfork-library'; } transaction(...args) { calls.push(args); return tx; } }
    class Store { constructor(name) { this.name = name; this.transaction = tx; } put(...args) { calls.push(args); return answer; } get(...args) { calls.push(args); return answer; } }
    const window = { Worker }, document = { addEventListener() {}, visibilityState: 'visible', hasFocus: () => true };
    runInNewContext(`(${installSaveObserver.toString()})()`, { window, document, crypto, performance, IDBDatabase: Database, IDBObjectStore: Store });
    const worker = new window.Worker('loopback-worker'), command = { type: 'EXPORT_STATE', payload: content.metadata, sessionId: 'one', epoch: 0, requestId: 1, expectedRevision: 0 };
    assert.equal(worker.postMessage(command), answer); assert.equal(calls[0][0], command);
    worker.listener({ data: { kind: 'ACK', sessionId: 'one', epoch: 0, requestId: 1, revision: 1, sequence: 1, view: { original: { tick: 0 }, highWater: 0, running: true }, file: original } });
    const db = new Database(); assert.equal(db.transaction(['entries', 'payloads'], 'readwrite'), tx);
    const payload = { id: content.metadata.id, file: original };
    assert.equal(new Store('payloads').put(payload), answer); assert.equal(calls.at(-1)[0], payload);
    assert.equal(new Store('entries').get(payload.id), answer);
    tx.dispatchEvent(new Event('complete'));
    const events = window.__saveEvidence.events, start = events.find(e => e.type === 'transaction'), write = events.find(e => e.type === 'put'), commit = events.find(e => e.type === 'transaction-complete');
    assert.equal(write.txId, start.txId); assert.equal(commit.dbId, start.dbId);
    assert.equal(window.__saveEvidence.files[write.fileRef], original);
    assert.equal(worker.terminate(), answer);
});
