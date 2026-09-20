import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { build } from 'vite';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const one = (rows, label) => { assert.equal(rows.length, 1, `${label}: expected exactly one`); return rows[0]; };
const ownerKeys = ['pageId', 'workerId', 'sessionId', 'epoch'];
export const sameOwner = (a, b) => ownerKeys.every(k => a[k] !== undefined && a[k] === b[k]);
export const sameRequest = (a, b) => sameOwner(a, b) && a.requestId === b.requestId;

export async function loadFileValidators() {
    const result = await build({ configFile: false, logLevel: 'error', build: { write: false, minify: false, lib: { entry: resolve(import.meta.dirname, 'save-file-validator-source.mjs'), formats: ['es'] } } });
    const bundle = Array.isArray(result) ? result[0] : result;
    const code = one(bundle.output.filter(p => p.type === 'chunk'), 'validator bundle').code;
    return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

export function assertViewContent(view, content) {
    assert.equal(view.seed, content.seed);
    assert.equal(view.dataset.kind, content.metadata.dataset);
    assert.equal(view.dataset.hash, content.snapshots[0].state.datasetHash);
    assert.equal(view.dataset.model, content.snapshots[0].state.model);
    assert.equal(view.configHash, content.snapshots[0].state.configHash);
    assert.equal(view.original.tick, content.playhead);
    assert.equal(view.highWater, content.frontier);
    assert.equal(view.recordRevision, content.recordRevision);
    assert.equal(view.forkTick, content.forkTick);
    assert.equal(view.snapshot?.tick ?? null, content.anchor?.tick ?? null);
    for (const [branch, key] of [['original', 'original'], ['A', 'branch'], ['B', 'branchB']]) {
        const live = content.live.map(i => content.snapshots[i]).find(b => b.branch === branch);
        assert.equal(view[key]?.tick ?? null, live?.state.tick ?? null);
        if (live) assert.deepEqual(view[key].body, live.state.body);
    }
    assert.deepEqual(view.events, content.records.flatMap(r => content.snapshots[r.terminal].events));
}

export function correlateNamedSave({ events, files, stored, entry }, expectedName) {
    const content = JSON.parse(stored).content;
    const submit = one(events.filter(e => e.type === 'submit' && e.formName === expectedName), 'native named submit');
    assert.equal(submit.trusted, true);
    assert.equal(submit.running, true);
    assert.equal(entry.name, expectedName);
    assert.equal(entry.id, content.metadata.id);
    assert.equal(entry.revision, 1, 'new isolated named record revision');
    assert.equal(entry.savedAt, content.metadata.savedAt);
    assert.equal(entry.bytes, Buffer.byteLength(stored));
    assert.equal(entry.branches, content.records.length);
    assert.equal(entry.dataset, content.metadata.dataset);
    assert.equal(entry.model, content.snapshots[0].state.model);
    assert.deepEqual([entry.playhead, entry.frontier], [content.playhead, content.frontier]);
    const click = one(events.filter(e => e.type === 'click' && e.name === 'Save to Library' && sameOwner(e, submit)), 'native named click');
    const open = one(events.filter(e => e.type === 'click' && e.name === 'Save' && sameOwner(e, submit)), 'native Save open');
    assert.equal(click.trusted && open.trusted, true);
    assert.ok(events.indexOf(open) < events.indexOf(click) && events.indexOf(click) < events.indexOf(submit));
    const request = one(events.filter(e => e.type === 'command' && e.command === 'EXPORT_STATE' && sameOwner(e, submit) && e.metadata?.id === entry.id && e.metadata?.name === expectedName && e.metadata?.savedAt === entry.savedAt), 'named request');
    assert.ok(events.indexOf(request) > events.indexOf(submit));
    assert.deepEqual(request.metadata, content.metadata, 'request metadata identifies captured named file');
    const ack = one(events.filter(e => e.type === 'reply' && sameRequest(e, request)), 'named ACK');
    assert.equal(ack.kind, 'ACK');
    assert.equal(ack.revision, request.expectedRevision + 1);
    assert.ok(events.indexOf(ack) > events.indexOf(request));
    assert.equal(files[ack.fileRef], stored, 'exact named ACK/stored bytes');
    assertViewContent(ack.view, content);
    const entryWrite = one(events.filter(e => e.type === 'put' && e.store === 'entries' && e.entry?.id === entry.id), 'named entry write');
    assert.deepEqual(entryWrite.entry, entry);
    const tx = one(events.filter(e => e.type === 'transaction' && e.txId === entryWrite.txId && e.dbId === entryWrite.dbId), 'named transaction');
    assert.equal(sameOwner(tx, request), true, 'named transaction belongs to the observed Save owner');
    assert.equal(events.filter(e => e.type === 'transaction' && e.pageId === request.pageId && e.mode === 'readwrite' && e.stores.includes('entries') && e.stores.includes('payloads')).length, 1, 'one named transaction in this isolated page');
    assert.equal(tx.mode, 'readwrite');
    assert.deepEqual([...tx.stores].sort(), ['entries', 'payloads']);
    assert.equal(tx.pageId, request.pageId);
    const payloadWrite = one(events.filter(e => e.type === 'put' && e.store === 'payloads' && e.txId === tx.txId && e.dbId === tx.dbId), 'named payload write');
    assert.equal(payloadWrite.id, entry.id);
    assert.equal(files[payloadWrite.fileRef], stored);
    const commit = one(events.filter(e => e.type === 'transaction-complete' && e.txId === tx.txId && e.dbId === tx.dbId), 'named commit');
    assert.equal(events.filter(e => ['transaction-abort', 'transaction-error'].includes(e.type) && e.txId === tx.txId && e.dbId === tx.dbId).length, 0);
    assert.ok(events.indexOf(ack) < events.indexOf(tx) && events.indexOf(tx) < events.indexOf(payloadWrite) && events.indexOf(payloadWrite) < events.indexOf(entryWrite) && events.indexOf(entryWrite) < events.indexOf(commit));
    assert.equal(events.slice(events.indexOf(open), events.indexOf(commit) + 1).filter(e => e.type === 'command' && e.command === 'PAUSE' && sameOwner(e, request)).length, 0);
    assert.ok(commit.tick >= content.playhead);
    return { request, ack, submit, open, click, transaction: tx, commit, entry, storedSha256: sha256(stored), storedBytes: Buffer.byteLength(stored), totalExportACKs: events.filter(e => e.type === 'reply' && e.command === 'EXPORT_STATE' && e.kind === 'ACK').length };
}

export async function compareReopenedExport(stored, exported, request, validators) {
    const expected = await validators.validateFile(stored), actual = await validators.validateFile(exported);
    assert.equal(expected.replay, 'Not checked');
    assert.equal(actual.replay, 'Not checked');
    assert.equal(request.command, 'EXPORT_STATE');
    assert.deepEqual(actual.file.content.metadata, request.metadata);
    assert.ok(Date.parse(actual.file.content.metadata.savedAt) >= Date.parse(expected.file.content.metadata.savedAt));
    // The exporter calls capture(id, name): only savedAt changes on this same-browser
    // Library load. All other metadata AND all content must remain identical.
    const content = { ...expected.file.content, metadata: { ...expected.file.content.metadata, savedAt: request.metadata.savedAt } };
    assert.deepEqual(actual.file.content, content);
    const expectedText = validators.canonical({ format: expected.file.format, version: expected.file.version, content, sha256: sha256(validators.canonical(content)) });
    assert.equal(exported, expectedText, 'canonical full file after the sole predeclared savedAt transformation');
    return { expectedText, storedSha256: sha256(stored), exportedSha256: sha256(exported), changedField: 'content.metadata.savedAt', storedMetadata: expected.file.content.metadata, exportedMetadata: actual.file.content.metadata, fullContentEqual: true, actualValidation: 'inspectExperiment + deserializeExperiment', replay: actual.replay };
}
