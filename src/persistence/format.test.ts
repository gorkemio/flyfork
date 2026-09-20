import { expect, it } from 'vitest';
import { Experiment } from '../experiments/experiment';
import { snapshot, compareStates } from '../simulation/engine';
import { SYNTHETIC_CONFIG as config } from '../simulation/config';
import { captureExperiment, restoreExperiment } from './recording';
import { serializeExperiment, deserializeExperiment, readExperimentFile, MAX_FILE_BYTES } from './format';
const ids = Array.from({ length: 8 }, (_, i) => `fixture-${i}`);
const metadata = { id: 'experiment-test', name: '<b>Real text</b>', savedAt: '2026-09-19T12:00:00.000Z', runtime: 'Vitest Node', dataset: 'synthetic' as const };
function setup() {
    const e = new Experiment(42, config, ids);
    e.advanceTo(20000);
    const anchor = snapshot(e.original.state);
    e.fork(anchor);
    e.schedule({ id: 'a', branch: 'A', model: config.model, datasetHash: config.datasetHash, configHash: config.configHash, operatorVersion: 1, operation: 'suppression', sourceIds: ['fixture-6'], sensoryChannel: null, magnitude: 1, startTick: 30000, endTick: 80000, sequence: 1 });
    e.schedule({ id: 'future', branch: 'B', model: config.model, datasetHash: config.datasetHash, configHash: config.configHash, operatorVersion: 1, operation: 'odor-gain', sourceIds: [], sensoryChannel: 'odor', magnitude: .5, startTick: 150000, endTick: 180000, sequence: 1 });
    return { e, anchor };
}
it('round trips 12 s frontier / 5 s playhead and pre-S0 views without losing histories or exposing future metrics', async () => {
    const { e, anchor } = setup();
    e.advanceTo(120000);
    for (const playhead of [50000, 10000]) {
        for (const p of e.seek(playhead))
            void p;
        const text = await serializeExperiment(captureExperiment(e, anchor, 42), metadata);
        const loaded = await deserializeExperiment(text, config, ids);
        const copy = loaded.experiment;
        expect(copy.original.state.tick).toBe(playhead);
        expect(copy.highWater).toBe(120000);
        expect(copy.forkTick).toBe(20000);
        expect(copy.records.B!.start.events[0].id).toBe('future');
        expect(copy.replayStatus.status).toBe('Not checked');
        expect(copy.metrics().endTick).toBe(playhead);
        expect(compareStates(e.original.state, copy.original.state).equal).toBe(true);
        expect(copy.branches.A === null).toBe(playhead < 20000);
        for (const p of copy.seek(120000))
            void p;
        for (const p of copy.replay())
            void p;
        expect(copy.replayStatus.status).toBe('Matched');
        expect(copy.original.state.v).not.toBe(e.original.state.v);
    }
});
it('active intervention load continues exactly like the unsaved reference; initial and unforked anchors survive', async () => {
    const { e, anchor } = setup();
    e.advanceTo(50000);
    const loaded = await deserializeExperiment(await serializeExperiment(captureExperiment(e, anchor, 42), metadata), config, ids);
    expect(loaded.experiment.branches.A!.capture().activeIds).toEqual(['a']);
    e.advanceTo(190000);
    loaded.experiment.advanceTo(190000);
    for (const branch of ['original', 'A', 'B'] as const)
        expect(compareStates(e.branches[branch]!.state, loaded.experiment.branches[branch]!.state).equal).toBe(true);
    const blank = new Experiment(42, config, ids);
    expect(restoreExperiment(captureExperiment(blank, null, 42), config, ids).anchor).toBeNull();
    blank.advanceTo(12345);
    const restored = restoreExperiment(captureExperiment(blank, snapshot(blank.original.state), 42), config, ids);
    expect(restored.anchor!.tick).toBe(12345);
    expect(restored.experiment.forkTick).toBeNull();
});
it('rejects tampering, oversized files before reading, deep structures and incompatible schemas', async () => {
    const { e, anchor } = setup();
    e.advanceTo(50000);
    const text = await serializeExperiment(captureExperiment(e, anchor, 42), metadata);
    const changed = JSON.parse(text);
    changed.content.metadata.name = 'changed';
    await expect(deserializeExperiment(JSON.stringify(changed), config, ids)).rejects.toThrow(/hash/i);
    let read = false;
    await expect(readExperimentFile({ size: MAX_FILE_BYTES + 1, text: async () => { read = true; return text; } })).rejects.toThrow(/16 MiB/);
    expect(read).toBe(false);
    await expect(deserializeExperiment('['.repeat(30) + '0' + ']'.repeat(30), config, ids)).rejects.toThrow(/depth/i);
    await expect(deserializeExperiment('{"__proto__":{}}', config, ids)).rejects.toThrow(/key/i);
    changed.version = 99;
    await expect(deserializeExperiment(JSON.stringify(changed), config, ids)).rejects.toThrow();
});
it('rejects incompatible buffers, identities, horizons, event phases and duplicate structures before restoring a live experiment', async () => {
    const { e, anchor } = setup();
    e.advanceTo(120000);
    for (const p of e.seek(50000))
        void p;
    const text = await serializeExperiment(captureExperiment(e, anchor, 42), metadata);
    const { canonical } = await import('./format');
    const invalid: ((file: ReturnType<typeof JSON.parse>) => void)[] = [
        f => { f.content.snapshots[0].state.v.length = 100000; },
        f => { f.content.snapshots[0].state.v.data = '!!!!'; },
        f => { f.content.snapshots[0].state.v.type = 'Uint32'; },
        f => { f.content.snapshots[0].state.v.endian = 'BE'; },
        f => { f.content.snapshots[0].state.model = 'unknown'; },
        f => { f.content.snapshots[0].state.datasetHash = '0'.repeat(64); },
        f => { f.content.frontier = 40000; },
        f => { f.content.live = [0, 0]; },
        f => { f.content.records[1].branch = 'original'; },
        f => { f.content.snapshots[f.content.live[1]].activeIds = []; },
        f => { f.content.snapshots[f.content.records[1].start].events[0].sourceIds = ['not-a-source']; },
        f => { f.content.snapshots[f.content.records[1].start].events[0].endTick = 1200001; },
        f => { f.content.records[1].proofs = [[80000, '0'.repeat(16)], [60000, '0'.repeat(16)]]; },
        f => { f.content.records[1].start = 15; },
        f => { f.content.records[1].proofs = []; },
        f => { f.content.replay = { status: 'Matched' }; },
        f => { f.content.snapshots[0].state.v.data = Buffer.from(new Float64Array([NaN, 0, 0, 0, 0, 0, 0, 0]).buffer).toString('base64'); },
        f => { f.content.snapshots[0].state.v.data = Buffer.from(new Float64Array([0, 0, 0, 0, 0, 0, 0, 0]).buffer).toString('base64'); },
        f => { f.content.snapshots[f.content.live[1]].samples.data = 'A'.repeat(f.content.snapshots[f.content.live[1]].samples.data.length); },
        f => { f.content.snapshots[f.content.records[2].start].events[0].id = 'a'; f.content.snapshots[f.content.records[2].terminal].events[0].id = 'a'; }
    ];
    for (const change of invalid) {
        const file = JSON.parse(text);
        change(file);
        file.sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(file.content)))), b => b.toString(16).padStart(2, '0')).join('');
        await expect(deserializeExperiment(canonical(file), config, ids)).rejects.toThrow();
    }
});
it('retains exact signed zero and independently detects a forged terminal after a valid content hash', async () => {
    const { e, anchor } = setup();
    e.advanceTo(40000);
    e.original.state.body.angularVelocity = -0;
    const text = await serializeExperiment(captureExperiment(e, anchor, 42), metadata);
    const loaded = await deserializeExperiment(text, config, ids);
    expect(Object.is(loaded.experiment.original.state.body.angularVelocity, -0)).toBe(true);
    // Valid container integrity cannot certify that recorded results were produced by the model.
    loaded.experiment.records.A!.terminal.state.v[0] += .125;
    const forged = await serializeExperiment(captureExperiment(loaded.experiment, loaded.anchor, 42), metadata);
    const check = await deserializeExperiment(forged, config, ids);
    for (const p of check.experiment.replay())
        void p;
    expect(check.experiment.replayStatus.status).toBe('Mismatch');
});
it('keeps a 120 s record with a late anchor and separate near-frontier view within the fixed file budget', async () => {
    const e = new Experiment(42, config, ids);
    e.advanceTo(1180000);
    const anchor = snapshot(e.original.state);
    e.fork(anchor);
    e.advanceTo(1200000);
    for (const p of e.seek(1190000))
        void p;
    const text = await serializeExperiment(captureExperiment(e, anchor, 42), metadata);
    expect(new TextEncoder().encode(text).length).toBeLessThan(MAX_FILE_BYTES);
    const loaded = await deserializeExperiment(text, config, ids);
    expect(loaded.experiment.highWater).toBe(1200000);
    expect(loaded.experiment.original.state.tick).toBe(1190000);
    for (const p of loaded.experiment.seek(1200000))
        void p;
    for (const p of loaded.experiment.replay())
        void p;
    expect(loaded.experiment.replayStatus.status).toBe('Matched');
}, 30000);
