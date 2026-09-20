import { evidencePath } from '../../tests/evidence-path';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createInitialState, stepTicks, snapshot } from './engine';
import { SYNTHETIC_CONFIG } from './config';
import type { ModelConfig, InputEvent } from './config';
import { loadDataset, modelConfig } from '../datasets/adapter';
import { seedCellStreams, randomStream } from './prng';
// Independent numerical method: classical RK4, no production integrator/constants imported.
function rk4(v: number, g: number, duration: number): [
    number,
    number
] {
    const h = .0001, steps = Math.round(duration / h);
    const derivative = (v: number, g: number): [
        number,
        number
    ] => [(-52 - v + g) / 20, -g / 5];
    for (let i = 0; i < steps; i++) {
        const a = derivative(v, g), b = derivative(v + h * a[0] / 2, g + h * a[1] / 2), c = derivative(v + h * b[0] / 2, g + h * b[1] / 2), d = derivative(v + h * c[0], g + h * c[1]);
        v += h * (a[0] + 2 * b[0] + 2 * c[0] + d[0]) / 6;
        g += h * (a[1] + 2 * b[1] + 2 * c[1] + d[1]) / 6;
    }
    return [v, g];
}
function micro(extra: Partial<ModelConfig> = {}): ModelConfig {
    return { ...SYNTHETIC_CONFIG, model: 'reference-micro-v1', datasetId: 'reference-micro', datasetHash: 'test-only', configHash: 'test-only', legacyRng: false, neurons: 2, inputs: [], outputs: [[], []], edges: [], ...extra };
}
it('frozen Synthetic v1 numeric golden remains byte-exact after schema metadata additions', () => {
    const s = createInitialState(42);
    stepTicks(s, 35801);
    const old = { version: 1, model: s.model, tick: s.tick, v: s.v, g: s.g, refractoryUntil: s.refractoryUntil, delay: s.delay, prng: s.prng, inputFilter: s.inputFilter, motorFilter: s.motorFilter, spikeCounts: s.spikeCounts, body: s.body, trail: s.trail, goalReachedTick: s.goalReachedTick };
    expect(createHash('sha256').update(JSON.stringify(old)).digest('hex')).toBe('6ffb0344ac9a34432af698c30b3bddd5d08e70d939820743adcb743155165b37');
});
it('passive, prescheduled synaptic and constant g input match independent RK4', () => {
    for (const kind of ['passive', 'scheduled', 'constant']) {
        const c = micro(), s = createInitialState(1, c);
        s.v[0] = -50;
        s.g[0] = kind === 'passive' ? 0 : 2;
        let v = s.v[0], g = s.g[0];
        for (let tick = 0; tick < 100; tick++) {
            const input = kind === 'constant' ? .03 : kind === 'scheduled' && [0, 13, 78].includes(tick) ? .7 : 0;
            s.delay[(tick % 19) * 2] += input;
            g += input;
            [v, g] = rk4(v, g, .1);
            stepTicks(s, 1, c);
            expect(Math.abs(s.v[0] - v)).toBeLessThan(1e-8);
            expect(Math.abs(s.g[0] - g)).toBeLessThan(1e-8);
        }
    }
});
it('threshold reset, refractory loss of external v and delayed excitatory/inhibitory transmission', () => {
    for (const weight of [3, -3]) {
        const c = micro({ inputs: [{ neuron: 0, side: 0, key: 'test' }], externalTarget: 'v', externalAmplitude: 68.75, events: [{ timeMs: 0, channel: 0 }, { timeMs: 1, channel: 0 }, { timeMs: 2.2, channel: 0 }, { timeMs: 2.3, channel: 0 }], edges: [{ from: 0, to: 1, weight }] });
        const s = createInitialState(1, c);
        stepTicks(s, 1, c);
        expect(s.spikeCounts[0]).toBe(1);
        expect(s.v[0]).toBe(-52);
        expect(s.g[0]).toBe(0);
        expect(s.refractoryUntil[0]).toBe(23);
        stepTicks(s, 18, c);
        expect(s.g[1]).toBe(0);
        stepTicks(s, 1, c);
        const [v, g] = rk4(-52, weight, .1);
        expect(s.v[1]).toBeCloseTo(v, 8);
        expect(s.g[1]).toBeCloseTo(g, 8);
        stepTicks(s, 3, c);
        expect(s.spikeCounts[0]).toBe(1);
        stepTicks(s, 1, c);
        expect(s.spikeCounts[0]).toBe(2);
        expect(s.inputEvents[0]).toBe(4);
        const frozen = snapshot(s);
        stepTicks(s, 1, c);
        expect(frozen.tick).toBe(24);
    }
});
it('dt .1/.05 uses identical physical input events and aligned body times with frozen tolerances', async () => {
    const d = await loadDataset(readFileSync('data/prepared/male-cns-dm1.json', 'utf8'), '38f691ce9d38faddb8277ada9f7ae70b198eb347742ede6b67fc8697925c2d0d');
    const base = await modelConfig(d), rng = seedCellStreams(42, base.inputs.map(i => i.key)), events: InputEvent[] = [];
    const rate = 150 * .02 / (.02 + .5), p = 1 - Math.exp(-rate * .1 / 1000);
    for (let tick = 0; tick < 10000; tick++)
        for (let channel = 0; channel < base.inputs.length; channel++)
            if (randomStream(rng, channel) < p)
                events.push({ timeMs: tick / 10, channel });
    const aConfig = await modelConfig(d, { dt: .1, concentration: [.02, .02], events }), bConfig = await modelConfig(d, { dt: .05, concentration: [.02, .02], events });
    const a = createInitialState(42, aConfig), b = createInitialState(42, bConfig);
    stepTicks(a, 10000, aConfig);
    stepTicks(b, 20000, bConfig);
    const differences = Array.from(a.spikeCounts, (count, i) => ({ id: d.neurons[i].id, a: count, b: b.spikeCounts[i], difference: Math.abs(count - b.spikeCounts[i]), tolerance: Math.max(2, count * .05) }));
    const pn = d.neurons.flatMap((n, i) => n.type === 'DM1_lPN' ? [i] : []), pnA = pn.reduce((sum, i) => sum + a.spikeCounts[i], 0), pnB = pn.reduce((sum, i) => sum + b.spikeCounts[i], 0);
    const proof = { eventCount: events.length, eventHash: createHash('sha256').update(JSON.stringify(events)).digest('hex'), differences, pnA, pnB, pathDelta: Math.abs(a.body.pathLength - b.body.pathLength), headingDelta: Math.abs(a.body.heading - b.body.heading), maxVoltageDifference: Math.max(...a.v.map((v, i) => Math.abs(v - b.v[i]))), bodySampleTimesEqual: a.trail.every((p, i) => p.tick * .1 === b.trail[i].tick * .05) };
    writeFileSync(evidencePath('regression-regression-dt-proof.json'), JSON.stringify(proof, null, 2));
    expect(differences.every(d => d.difference <= d.tolerance)).toBe(true);
    expect(Math.abs(pnA - pnB)).toBeLessThanOrEqual(Math.max(2, pnA * .05));
    expect(proof.pathDelta).toBeLessThanOrEqual(.2);
    expect(proof.headingDelta).toBeLessThanOrEqual(.1);
    expect(proof.bodySampleTimesEqual).toBe(true);
    expect(a.inputEvents).toEqual(b.inputEvents);
});
