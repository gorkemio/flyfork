import { evidencePath } from '../../tests/evidence-path';
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { loadDataset, modelConfig } from '../datasets/adapter';
import type { ModelOptions } from '../datasets/adapter';
import { createInitialState, stepTicks } from './engine';
it('records every preregistered seed/stimulus and circuit ablation before UI integration', async () => {
    const d = await loadDataset(readFileSync('data/prepared/male-cns-dm1.json', 'utf8'), '38f691ce9d38faddb8277ada9f7ae70b198eb347742ede6b67fc8697925c2d0d');
    const conditions: {
        name: string;
        options: ModelOptions;
    }[] = [
        { name: 'C=.02', options: { concentration: [.02, .02] } }, { name: 'C=.2', options: { concentration: [.2, .2] } }, { name: 'C=1', options: { concentration: [1, 1] } }, { name: 'arena', options: {} },
        { name: 'input_off', options: { inputGain: 0 } }, { name: 'ORN_PN_cut', options: { cutOrnPn: true } }, { name: 'PN_readout_cut', options: { cutReadout: true } }, { name: 'local_inactive', options: { inactiveLocal: true } }, { name: 'shuffle', options: { shuffle: true } },
    ];
    const rows = [];
    for (const seed of [1, 42, 2026])
        for (const condition of conditions) {
            const c = await modelConfig(d, condition.options), s = createInitialState(seed, c);
            let stalls = 0, speedSum = 0, turnSum = 0, speedClamped = 0, maxSpeed = 0, maxTurn = 0;
            for (let i = 0; i < 200; i++) {
                const before = s.body.pathLength;
                stepTicks(s, 100, c);
                if (s.body.speed > 0 && s.body.pathLength === before)
                    stalls++;
                speedSum += s.body.speed;
                turnSum += s.body.angularVelocity;
                maxSpeed = Math.max(maxSpeed, s.body.speed);
                maxTurn = Math.max(maxTurn, Math.abs(s.body.angularVelocity));
                if (s.body.speed === 6)
                    speedClamped++;
            }
            const groups = d.types.map(type => { const indices = d.neurons.flatMap((n, i) => n.type === type ? [i] : []); return { type, spikes: indices.reduce((sum, i) => sum + s.spikeCounts[i], 0), meanHz: indices.reduce((sum, i) => sum + s.spikeCounts[i], 0) / indices.length / 2, silentCells: indices.filter(i => s.spikeCounts[i] === 0).length }; });
            const pn = d.neurons.flatMap((n, i) => n.type === 'DM1_lPN' ? [{ id: n.id, side: n.side, hz: s.spikeCounts[i] / 2, filteredHz: s.motorFilter[n.side === 'L' ? 0 : 1] }] : []);
            rows.push({ seed, condition: condition.name, configHash: c.configHash, inputEvents: Array.from(s.inputEvents).reduce((a, b) => a + b, 0), inputEventsPerCell: Array.from(s.inputEvents), spikesPerCell: Array.from(s.spikeCounts), groups, pn, pnSaturated: pn.some(n => n.hz >= .9 * 1000 / 2.2), pnDifference: pn.find(n => n.side === 'R')!.hz - pn.find(n => n.side === 'L')!.hz, meanSpeed: speedSum / 200, meanTurn: turnSum / 200, maxSpeed, maxAbsTurn: maxTurn, speedClampedSteps: speedClamped, wallStalledSteps: stalls, path: s.body.pathLength, displacement: Math.hypot(s.body.x - 20, s.body.y - 66), body: s.body, finite: [...s.v, ...s.g, ...s.motorFilter, s.body.x, s.body.y].every(Number.isFinite) });
        }
    const meaningful = rows.some(r => r.condition.startsWith('C=') && r.pn.every(n => n.hz > 0) && !r.pnSaturated);
    const cuts = rows.filter(r => r.condition === 'input_off' || r.condition === 'PN_readout_cut').every(r => r.path === 0 && (r.condition !== 'input_off' || r.groups.every(g => g.spikes === 0)));
    const finite = rows.every(r => r.finite), pass = meaningful && cuts && finite;
    writeFileSync(evidencePath('regression-regression-feasibility.json'), JSON.stringify({ status: pass ? 'LIMITED_FEASIBILITY_PASS' : 'MODEL_REVIEW_REQUIRED', durationSeconds: 2, seeds: [1, 42, 2026], preregisteredConditions: conditions, criteria: { meaningful, cuts, finite }, rows }, null, 2));
    expect(pass).toBe(true);
}, 30000);
