import { evidencePath } from '../../tests/evidence-path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { createInitialState, stepTicks, snapshot, restore, compareStates } from './engine';
import { loadDataset, modelConfig } from '../datasets/adapter';
const text = readFileSync('data/prepared/male-cns-dm1.json', 'utf8');
const hash = '38f691ce9d38faddb8277ada9f7ae70b198eb347742ede6b67fc8697925c2d0d';
it('loads exact source-derived dimensions and rejects hash, number, ID and edge corruption', async () => {
    const d = await loadDataset(text, hash);
    expect(d.neurons).toHaveLength(80);
    expect(d.edges).toHaveLength(4011);
    await expect(loadDataset(text + ' ', hash)).rejects.toThrow();
    for (const change of [(d: Record<string, unknown>) => d.neurons = [], (d: Record<string, unknown>) => d.edges = [[0, 800, 3, 1]]]) {
        const bad = JSON.parse(text) as Record<string, unknown>;
        change(bad);
        const raw = JSON.stringify(bad);
        await expect(loadDataset(raw, createHash('sha256').update(raw).digest('hex'))).rejects.toThrow();
    }
});
it('real active state owns dynamic streams and matches snapshot/fork continuation', async () => {
    const c = await modelConfig(await loadDataset(text, hash));
    const a = createInitialState(42, c);
    stepTicks(a, 12345, c);
    expect(a.prng).toHaveLength(74 * 4);
    expect(a.v).toHaveLength(80);
    expect(a.delay).toHaveLength(80 * 19);
    expect(a.spikeCounts.some(Boolean)).toBe(true);
    expect(a.g.some(Boolean)).toBe(true);
    expect(a.delay.some(Boolean)).toBe(true);
    const saved = snapshot(a);
    const b = restore(saved, c);
    stepTicks(a, 7777, c);
    stepTicks(b, 7777, c);
    expect(compareStates(a, b).equal).toBe(true);
    expect(() => restore(saved)).toThrow();
    for (const k of ['v', 'g', 'delay', 'prng', 'inputFilter', 'motorFilter', 'spikeCounts', 'refractoryUntil', 'inputEvents'] as const) {
        expect(b[k].buffer).not.toBe(saved[k].buffer);
    }
});
it('real streams retain source identity and every snapshot dimension is checked atomically', async () => {
    const d = await loadDataset(text, hash), c = await modelConfig(d), s = createInitialState(42, c);
    const changed = await modelConfig(d, { inputGain: 0 });
    stepTicks(s, 12345, c);
    const before = snapshot(s);
    const variants = [{ datasetHash: 'wrong' }, { datasetId: 'wrong' }, { configHash: 'wrong' }, { neurons: 8 }, { edgeCount: 1 }, { sensorChannels: 1 }, { delaySlots: 18 }, { dt: .05 }, { inputChannels: 2 }, { outputChannels: 1 }, { inputEvents: new Uint32Array(2) }, { eventCursor: 1 }, { prng: new Uint32Array(c.inputs.length * 4) }, { v: new Float64Array(80).fill(Infinity) }];
    for (const change of variants) {
        expect(() => restore({ ...s, ...change }, c)).toThrow();
        expect(compareStates(s, before).equal).toBe(true);
    }
    expect(() => restore(s, changed)).toThrow();
    expect(() => stepTicks(s, 100, changed)).toThrow();
    expect(compareStates(s, before).equal).toBe(true);
    const a = seedCellStreams(42, c.inputs.map(i => i.key));
    const b = seedCellStreams(42, c.inputs.map(i => i.key).reverse());
    c.inputs.forEach((_, i) => expect(a.slice(i * 4, i * 4 + 4)).toEqual(b.slice((c.inputs.length - 1 - i) * 4, (c.inputs.length - i) * 4)));
    expect(() => seedCellStreams(42, ['duplicate', 'duplicate'])).toThrow();
});
import { seedCellStreams } from './prng';
import { SimulationHost } from '../worker-protocol/host';
import { replySchema } from '../worker-protocol/protocol';
import { PoseBuffer } from '../rendering/pose-buffer';
import { writeFileSync } from 'node:fs';
it('real Worker speed, render observation, no-op and mutated branch isolation preserve the full future', async () => {
    const d = await loadDataset(text, hash), c = await modelConfig(d), host = new SimulationHost(c, d);
    let id = 0;
    const send = (type: string, payload: object = {}) => host.handle({ protocolVersion: 1, requestId: ++id, sessionId: 'real', epoch: 0, expectedRevision: host.revision, type, payload });
    send('INIT', { seed: 42, dataset: 'malecns' });
    send('STEP', { ticks: 12345 });
    send('SNAPSHOT');
    send('FORK');
    for (const speed of [.5, 1, 2, 4]) {
        send('RUN', { speed });
        host.pulse();
        send('PAUSE');
    }
    const reply = send('COMPARE');
    expect(replySchema.safeParse(reply).success).toBe(true);
    expect(reply.view?.comparison?.equal).toBe(true);
    const reference = createInitialState(42, c);
    stepTicks(reference, host.original.tick, c);
    expect(compareStates(reference, host.original).equal).toBe(true);
    for (const fps of [0, 15, 144]) {
        const s = createInitialState(42, c), buffer = new PoseBuffer();
        let frame = 0;
        for (let tick = 0; tick < 20000; tick += 500) {
            stepTicks(s, 500, c);
            buffer.push({ tick: s.tick, ...s.body }, 'real', tick / 10);
            while (fps > 0 && frame * 1000 / fps < tick / 10 + 50) {
                buffer.sample(frame * 1000 / fps);
                frame++;
            }
        }
        const expected = createInitialState(42, c);
        stepTicks(expected, 20000, c);
        expect(compareStates(s, expected).equal).toBe(true);
        expect(frame).toBe(fps * 2);
    }
    const saved = host.saved!, control = snapshot(host.original), branch = host.branch!;
    for (const k of ['v', 'g', 'delay', 'prng', 'inputFilter', 'motorFilter', 'spikeCounts', 'refractoryUntil', 'inputEvents'] as const)
        branch[k][0] += 1;
    branch.body.x += .1;
    branch.trail[0].x += .1;
    stepTicks(branch, 1000, c);
    stepTicks(host.original, 1000, c);
    stepTicks(control, 1000, c);
    expect(compareStates(control, host.original).equal).toBe(true);
    expect(compareStates(host.original, branch).equal).toBe(false);
    expect(saved.tick).toBe(12345);
    const oldOriginal = snapshot(host.original), oldBranch = snapshot(branch);
    host.saved = { ...saved, datasetHash: 'incompatible' };
    expect(send('RESTORE').kind).toBe('ERROR');
    expect(compareStates(oldOriginal, host.original).equal).toBe(true);
    expect(compareStates(oldBranch, host.branch!).equal).toBe(true);
    host.saved = saved;
    expect(send('RESTORE').kind).toBe('ACK');
    expect(send('INIT', { seed: 42, dataset: 'synthetic' }).kind).toBe('ERROR');
    const bad = structuredClone(reply);
    if (bad.view)
        bad.view.original.v.pop();
    expect(replySchema.safeParse(bad).success).toBe(false);
    writeFileSync(evidencePath('regression-regression-real-reproducibility.json'), JSON.stringify({ datasetHash: hash, configHash: c.configHash, snapshotTick: saved.tick, activePotentials: saved.v.filter(v => v !== -52).length, pendingSignals: saved.delay.filter(Boolean).length, inputEvents: Array.from(saved.inputEvents).reduce((a, b) => a + b, 0), pnFilters: Array.from(saved.motorFilter), streams: saved.prng.length / 4, noOp: reply.view?.comparison, baselineUninterruptedEqual: true, branchMutationIsolated: true, speeds: [.5, 1, 2, 4], rendererObservationFps: [0, 15, 144], incompatibleRestoreAtomic: true }, null, 2));
});
it('rejects rehashed invalid cell identity, signs, duplicate edges and manifest totals', async () => {
    const valid = await loadDataset(text, hash);
    const changes: ((d: typeof valid) => void)[] = [d => d.neurons[0].id = '', d => d.neurons[1].id = d.neurons[0].id, d => d.neurons[0].sign = -d.neurons[0].sign as -1 | 1, d => d.neurons[0].ntConfidence = -1, d => d.edges.push(d.edges[0]), d => d.edges[0][2] = .5, d => d.edges[0][3] = -d.edges[0][3] as -1 | 1, d => d.cuts.internal++, d => d.sourceSha256 = {}];
    for (const change of changes) {
        const d = JSON.parse(text) as typeof valid;
        change(d);
        const raw = JSON.stringify(d);
        await expect(loadDataset(raw, createHash('sha256').update(raw).digest('hex'))).rejects.toThrow();
    }
    for (const options of [{ concentration: [NaN, 0] as const }, { inputGain: 2 }, { events: [{ timeMs: -1, channel: 0 }] }, { events: [{ timeMs: 0, channel: 1000 }] }])
        await expect(modelConfig(valid, options)).rejects.toThrow();
});
it('restores scheduled physical events exactly at fractional millisecond boundaries', async () => {
    const d = await loadDataset(text, hash);
    const c = await modelConfig(d, { events: [{ timeMs: .3, channel: 0 }, { timeMs: .7, channel: 1 }] });
    const a = createInitialState(42, c);
    stepTicks(a, 3, c);
    const b = restore(snapshot(a), c);
    expect(b.eventCursor).toBe(0);
    stepTicks(a, 10, c);
    stepTicks(b, 10, c);
    expect(compareStates(a, b).equal).toBe(true);
    expect(a.eventCursor).toBe(2);
});
