import { evidencePath } from '../../tests/evidence-path';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createInitialState, stepTicks, snapshot, restore, fork, compareStates } from './engine';
function activeState() {
    const s = createInitialState(42);
    stepTicks(s, 12345);
    expect(s.v.some(v => v !== -52)).toBe(true);
    expect(s.g.some(g => g !== 0)).toBe(true);
    expect(s.delay.some(g => g !== 0)).toBe(true);
    expect(s.motorFilter.every(v => v > 0)).toBe(true);
    expect(s.inputFilter.every(v => v > 0)).toBe(true);
    expect(s.prng).not.toEqual(createInitialState(42).prng);
    return s;
}
describe('active synthetic LIF state', () => {
    it('same initial state and inputs produce exactly the same complete numeric state', () => {
        const a = activeState();
        const b = createInitialState(42);
        stepTicks(b, 12345);
        expect(compareStates(a, b)).toEqual({ equal: true, tick: 12345, firstDifference: null });
        expect(a.spikeCounts.reduce((a, b) => a + b, 0)).toBeGreaterThan(100);
        expect(a.body.pathLength).toBeGreaterThan(0);
    });
    it('snapshot/restore continuation equals uninterrupted execution', () => {
        const a = activeState();
        const saved = snapshot(a);
        const b = restore(saved);
        stepTicks(a, 23456);
        stepTicks(b, 23456);
        expect(compareStates(a, b).equal).toBe(true);
        expect(saved.tick).toBe(12345);
        const digest = (state: unknown) => createHash('sha256').update(JSON.stringify(state)).digest('hex');
        writeFileSync(evidencePath('regression-regression-synthetic-numerical-proof.json'), JSON.stringify({ seed: 42, snapshotTick: saved.tick, comparisonTick: a.tick, activePotentials: Array.from(saved.v), synapticState: Array.from(saved.g), pendingSignals: Array.from(saved.delay).filter(Boolean), prng: Array.from(saved.prng), inputFilters: Array.from(saved.inputFilter), motorFilters: Array.from(saved.motorFilter), body: saved.body, spikeCounts: Array.from(saved.spikeCounts), restoreMatch: compareStates(a, b), uninterruptedHash: digest(a), restoredHash: digest(b) }, null, 2));
    });
    it('no-op fork matches original at the same tick, including future-affecting state', () => {
        const a = activeState();
        const b = fork(snapshot(a));
        stepTicks(a, 50000);
        stepTicks(b, 50000);
        expect(compareStates(a, b).equal).toBe(true);
        writeFileSync(evidencePath('regression-regression-synthetic-noop-proof.json'), JSON.stringify({ forkTick: 12345, comparison: compareStates(a, b), originalBody: a.body, forkBody: b.body, originalSpikes: Array.from(a.spikeCounts), forkSpikes: Array.from(b.spikeCounts) }, null, 2));
        b.g[3] += 0.001;
        expect(compareStates(a, b)).toEqual({ equal: false, tick: a.tick, firstDifference: 'g[3]' });
    });
    it('branches and saved snapshots own every mutable buffer, queue, filter and body/history', () => {
        const a = activeState();
        const saved = snapshot(a);
        const b = fork(saved);
        for (const key of ['v', 'g', 'refractoryUntil', 'delay', 'prng', 'motorFilter', 'inputFilter', 'spikeCounts'] as const) {
            expect(b[key].buffer).not.toBe(a[key].buffer);
            expect(b[key].buffer).not.toBe(saved[key].buffer);
            b[key][0] += 1;
        }
        b.body.x += 1;
        b.trail[0].x += 1;
        expect(compareStates(a, saved).equal).toBe(true);
        expect(b.body).not.toBe(a.body);
        expect(b.trail).not.toBe(a.trail);
        expect(b.trail[0]).not.toBe(a.trail[0]);
        const control = restore(saved);
        stepTicks(b, 1000);
        stepTicks(a, 1000);
        stepTicks(control, 1000);
        expect(compareStates(a, control).equal).toBe(true);
        expect(compareStates(a, b).equal).toBe(false);
    });
    it('chunking, pauses and observation frequency do not change the result', () => {
        const reference = activeState();
        stepTicks(reference, 10000);
        for (const batch of [1, 37, 200, 1000]) {
            const s = activeState();
            let remaining = 10000;
            while (remaining) {
                const n = Math.min(batch, remaining);
                stepTicks(s, n);
                remaining -= n;
            }
            expect(compareStates(s, reference).equal).toBe(true);
        }
    });
    it('motion depends on neural outputs: cutting output transmission stops the body', () => {
        const moving = createInitialState(42);
        const silent = createInitialState(42);
        stepTicks(moving, 20000);
        // Test-only clamp: output cells stay refractory, without changing sensory activity.
        silent.refractoryUntil[6] = 100000;
        silent.refractoryUntil[7] = 100000;
        stepTicks(silent, 20000);
        expect(moving.body.pathLength).toBeGreaterThan(1);
        expect(silent.spikeCounts[0]).toBeGreaterThan(0);
        expect(silent.motorFilter).toEqual(new Float64Array(2));
        expect(silent.body.pathLength).toBe(0);
    });
    it('rejects corrupted snapshot without accepting NaN, bad sizes, version or PRNG', () => {
        const s = activeState();
        expect(() => restore({ ...snapshot(s), version: 9 })).toThrow();
        expect(() => restore({ ...snapshot(s), v: new Float64Array(1) })).toThrow();
        const bad = snapshot(s);
        bad.g[2] = NaN;
        expect(() => restore(bad)).toThrow();
        const zero = snapshot(s);
        zero.prng.fill(0);
        expect(() => restore(zero)).toThrow();
    });
    it('reports tick mismatch and invalid step counts', () => {
        const a = createInitialState(1);
        const b = createInitialState(1);
        stepTicks(b, 1);
        expect(compareStates(a, b).firstDifference).toBe('tick');
        for (const n of [-1, 1.2, NaN, Infinity, 1200001])
            expect(() => stepTicks(a, n)).toThrow();
    });
});
describe('tick ordering and bounded model state', () => {
    it('delivers an emitted spike exactly eighteen ticks after its stamped boundary', () => {
        const s = createInitialState(42);
        s.v[2] = -45.0001;
        s.g[2] = 100;
        s.refractoryUntil[6] = 100;
        stepTicks(s, 1);
        expect(s.spikeCounts[2]).toBe(1);
        expect(s.g[6]).toBe(0);
        stepTicks(s, 18);
        expect(s.tick).toBe(19);
        expect(s.g[6]).toBe(0);
        stepTicks(s, 1);
        expect(s.g[6]).toBeCloseTo(95 * Math.exp(-0.1 / 5), 12);
    });
    it('accumulates and decays external and synaptic input during refractory while voltage stays reset', () => {
        const s = createInitialState(42);
        s.refractoryUntil[0] = 10;
        s.g[0] = 4;
        s.delay[0] = 7;
        s.inputFilter[0] = 1;
        s.prng[1] = 0;
        stepTicks(s, 1);
        expect(s.v[0]).toBe(-52);
        expect(s.spikeCounts[0]).toBe(0);
        expect(s.g[0]).toBeCloseTo((4 + 7 + 120) * Math.exp(-0.1 / 5), 12);
        expect(s.delay[0]).toBe(0);
    });
    it('validates snapshot body/history/ticks and reports first nested difference', () => {
        const a = activeState();
        const b = snapshot(a);
        b.body.x += 0.1;
        expect(compareStates(a, b).firstDifference).toBe('body.x');
        b.body.x = a.body.x;
        b.trail.pop();
        expect(compareStates(a, b).firstDifference).toBe('trail.length');
        for (const change of [{ tick: -1 }, { body: { ...a.body, x: 41 } }, { trail: [] }, { goalReachedTick: a.tick + 1 }, { prng: new Uint32Array(7) }])
            expect(() => restore({ ...a, ...change })).toThrow();
        expect(() => createInitialState(-1)).toThrow();
    });
});
describe('physical bounds and goal recording', () => {
    it('blocks neural movement into a wall and records actual goal entry', () => {
        const blocked = createInitialState(42);
        blocked.body.x = 24.79;
        blocked.body.y = 43;
        blocked.body.heading = 0;
        blocked.motorFilter.fill(200);
        stepTicks(blocked, 100);
        expect(blocked.body.x).toBe(24.79);
        expect(blocked.body.pathLength).toBe(0);
        const reached = createInitialState(42);
        reached.body.x = 28;
        reached.body.y = 10;
        stepTicks(reached, 100);
        expect(reached.goalReachedTick).toBe(100);
        stepTicks(reached, 100);
        expect(reached.goalReachedTick).toBe(100);
    });
});
