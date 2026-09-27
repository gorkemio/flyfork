import { evidencePath } from '../../tests/evidence-path';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { loadDataset, modelConfig } from '../datasets/adapter';
import { Experiment } from './experiment';
import { snapshot } from '../simulation/engine';
const cases = [['no-op', null, 0], ['suppression-0', 'suppression', 0], ['suppression-.5', 'suppression', .5], ['suppression-1', 'suppression', 1], ['odor-0', 'odor-gain', 0], ['odor-.5', 'odor-gain', .5], ['odor-1', 'odor-gain', 1], ['odor-2', 'odor-gain', 2]] as const;
it('reports every preregistered real intervention condition without changing baseline parameters', async () => {
    const d = await loadDataset(readFileSync('data/prepared/male-cns-dm1.json', 'utf8'), '38f691ce9d38faddb8277ada9f7ae70b198eb347742ede6b67fc8697925c2d0d'), c = await modelConfig(d);
    const targets = d.neurons.filter(n => n.type === 'DM1_lPN' && n.side === 'L').map(n => n.id), rows = [];
    for (const seed of [1, 42, 2026])
        for (const [name, operation, magnitude] of cases) {
            const e = new Experiment(seed, c, d.neurons.map(n => n.id));
            e.advanceTo(20000);
            e.fork(snapshot(e.original.state));
            if (operation)
                e.schedule({ id: 'matrix-1', branch: 'A', model: c.model, datasetHash: c.datasetHash, configHash: c.configHash, operatorVersion: 1, operation, sourceIds: operation === 'suppression' ? targets : [], sensoryChannel: operation === 'odor-gain' ? 'odor' : null, magnitude, startTick: 30000, endTick: 80000, sequence: 1 });
            const begin = performance.now();
            e.advanceTo(120000);
            const elapsedMs = performance.now() - begin, compared = e.compare(), metrics = e.metrics();
            const replay = e.replay();
            while (!replay.next().done) { /* independent recomputation */ }
            expect(e.replayStatus.status).toBe('Matched');
            expect(compared.B.equal).toBe(true);
            if (name === 'no-op' || name === 'suppression-0' || name === 'odor-1')
                expect(compared.A.equal).toBe(true);
            rows.push({ seed, name, targets, metrics, comparison: compared, replay: e.replayStatus, elapsedMs, threeBranchModelSecondsPerWallSecond: 10000 / elapsedMs, memory: e.memory(), pnSpikeCounts: d.neurons.flatMap((n, i) => n.type === 'DM1_lPN' ? [{ id: n.id, original: e.original.state.spikeCounts[i], A: e.branches.A!.state.spikeCounts[i] }] : []) });
        }
    const preregistrationSha256 = 'ea9b5b7803bb1eba43e6c26510e3c7e00506e0deec40bc6fc84551d69b1e0457';
    const testingSpecificationSha256 = createHash('sha256').update(readFileSync('docs/testing/intervention-matrix.md')).digest('hex');
    writeFileSync(evidencePath('regression-intervention-matrix.json'), JSON.stringify({ datasetHash: d.hash, configHash: c.configHash, preregistrationSha256, testingSpecificationSha256, seeds: [1, 42, 2026], forkTick: 20000, eventInterval: [30000, 80000], endTick: 120000, rows }, null, 2));
    writeFileSync(evidencePath('regression-intervention-matrix.md'), '# All preregistered results\n\nHorizon 2–12 s; event 3–8 s. PN soma L suppression. u=model units. All replay computations Matched.\n\n|Seed|Condition|A PN L/R Hz|A raw ratio|A cap %|A stall %|A path u|A−O divergence|A cost|A−O numeric|\n|---|---|---|---|---|---|---|---|---|---|\n' + rows.map(r => { const a = r.metrics.branches.A!; return `|${r.seed}|${r.name}|${a.leftHz.toFixed(2)} / ${a.rightHz.toFixed(2)}|${a.rawRatio.toFixed(3)}|${(100 * a.capFraction).toFixed(1)}|${(100 * a.stallFraction).toFixed(1)}|${a.path.toFixed(4)}|${r.metrics.divergence.AO!.toFixed(7)}|${a.cost.toFixed(5)}|${r.comparison.A.equal ? 'Equal' : 'Different'}|`; }).join('\n') + '\n');
}, 120000);
