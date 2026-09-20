import { evidencePath } from '../../tests/evidence-path';
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { loadDataset, modelConfig } from '../datasets/adapter';
import { Experiment } from './experiment';
import { snapshot, compareStates } from '../simulation/engine';
it('three real branches respect 120 s, 64 MiB checkpoint pool and eviction preserves replay/seek', async () => {
    const d = await loadDataset(readFileSync('data/prepared/male-cns-dm1.json', 'utf8'), '38f691ce9d38faddb8277ada9f7ae70b198eb347742ede6b67fc8697925c2d0d'), c = await modelConfig(d), e = new Experiment(42, c, d.neurons.map(n => n.id));
    e.advanceTo(20000);
    e.fork(snapshot(e.original.state));
    const begin = performance.now();
    e.advanceTo(1200000);
    const elapsedMs = performance.now() - begin;
    expect(e.original.state.trail.length).toBe(12001);
    expect(e.branches.A!.state.tick).toBe(1200000);
    expect(e.branches.B!.state.tick).toBe(1200000);
    expect(compareStates(e.original.state, e.branches.B!.state).equal).toBe(true);
    const memory = e.memory();
    expect(memory.cacheBytes + memory.anchorBytes).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(memory.checkpointCount).toBeLessThan(180);
    expect(() => e.advanceTo(1200001)).toThrow();
    const terminal = snapshot(e.branches.A!.state);
    e.checkpoints.clear();
    const job = e.seek(1200000);
    while (!job.next().done) { /* no cached history */ }
    expect(compareStates(terminal, e.branches.A!.state).equal).toBe(true);
    writeFileSync(evidencePath('regression-budget.json'), JSON.stringify({ environment: 'Node headless calculation, not physical GPU/browser FPS', elapsedMs, threeBranchModelSecondsPerWallSecond: 118000 / elapsedMs, memory, trailSamples: 12001, seekWithEvictedCacheExact: true }, null, 2));
}, 120000);
