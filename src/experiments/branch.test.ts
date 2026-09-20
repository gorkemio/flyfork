import { expect, it } from 'vitest';
import { Branch, restoreBranch } from './branch';
import { validateEvent, secondsToTick } from './events';
import type { InterventionEvent } from './events';
import { createInitialState, compareStates, stepTicks } from '../simulation/engine';
import { SYNTHETIC_CONFIG as c } from '../simulation/config';
const ids = Array.from({ length: 8 }, (_, i) => `fixture-${i}`);
function event(change: Partial<InterventionEvent> = {}): InterventionEvent { return { id: 'e1', branch: 'A', model: c.model, datasetHash: c.datasetHash, configHash: c.configHash, operatorVersion: 1, operation: 'suppression', sourceIds: ['fixture-6'], sensoryChannel: null, magnitude: 1, startTick: 100, endTick: 1000, sequence: 1, ...change }; }
it('three independent no-op branches remain exact and identity events affect provenance only', () => {
    const s = createInitialState(42);
    stepTicks(s, 12345);
    const a = new Branch('original', s, c, ids), b = new Branch('A', s, c, ids), d = new Branch('B', s, c, ids);
    b.schedule(event({ startTick: 12345, endTick: 16000, magnitude: 0 }));
    d.schedule(event({ branch: 'B', startTick: 12345, endTick: 16000, operation: 'odor-gain', sourceIds: [], sensoryChannel: 'odor', magnitude: 1 }));
    for (const x of [a, b, d])
        x.advanceTo(17345);
    expect(compareStates(a.state, b.state).equal).toBe(true);
    expect(compareStates(a.state, d.state).equal).toBe(true);
    b.state.delay[0] += 1;
    b.state.prng[0]++;
    b.state.trail[0].x++;
    expect(compareStates(a.state, d.state).equal).toBe(true);
    expect(a.state.delay).not.toBe(b.state.delay);
});
it('validates and freezes events atomically, including overlapping targets and boundaries', () => {
    const b = new Branch('A', createInitialState(42), c, ids);
    const input = event();
    b.schedule(input);
    expect(Object.isFrozen(b.events[0].sourceIds)).toBe(true);
    for (const e of [event({ id: 'e2', sequence: 2, startTick: 200 }), event({ id: 'e2', sequence: 2, magnitude: NaN }), event({ id: 'e2', sequence: 2, sourceIds: ['bad'] }), event({ id: 'e2', sequence: 2, startTick: -1 }), event({ id: 'e2', sequence: 2, endTick: 1200001 }), event({ id: 'e2', sequence: 2, operatorVersion: 2 as 1 }), event({ id: 'e2', sequence: 2, model: 'bad' }), event({ id: 'e2', sequence: 3 }), event({ id: 'e2', sequence: 2, sensoryChannel: 'odor' }), event({ id: 'e2', sequence: 2, sourceIds: ['fixture-6', 'fixture-6'] })])
        expect(() => b.schedule(e)).toThrow();
    expect(b.events).toHaveLength(1);
    b.schedule(event({ id: 'e2', sequence: 2, startTick: 1000, endTick: 2000 }));
    expect(b.events).toHaveLength(2);
    expect(() => validateEvent(event(), 'original', c, ids, [], 0)).toThrow();
    expect(secondsToTick(.123456, c.dt)).toBe(1235);
    for (const s of [NaN, -1, 121])
        expect(() => secondsToTick(s, c.dt)).toThrow();
});
it('half-open events restore in their middle; ending keeps causal history and other streams are untouched', () => {
    const b = new Branch('A', createInitialState(42), c, ids), control = new Branch('B', createInitialState(42), c, ids);
    b.schedule(event());
    b.advanceTo(600);
    control.advanceTo(600);
    expect(b.capture().activeIds).toEqual(['e1']);
    expect(b.state.prng).toEqual(control.state.prng);
    const frozen = b.capture(), copy = restoreBranch(frozen, c, ids, 'A');
    b.advanceTo(1600);
    copy.advanceTo(1600);
    expect(compareStates(b.state, copy.state).equal).toBe(true);
    expect(b.capture().activeIds).toEqual([]);
    expect(b.state.spikeCounts[6]).toBeLessThanOrEqual(control.state.spikeCounts[6] + 20);
    expect(() => restoreBranch(frozen, c, ids, 'B')).toThrow();
    expect(() => restoreBranch({ ...frozen, activeIds: [] }, c, ids, 'A')).toThrow();
    expect(() => b.schedule(event({ id: 'past', sequence: 2 }))).toThrow();
});
it('clamp begins at startTick, ends before endTick integration, and does not undo delivered history', () => {
    const b = new Branch('A', createInitialState(42), c, ids);
    b.schedule(event({ sourceIds: ['fixture-0'], startTick: 100, endTick: 200 }));
    b.advanceTo(100);
    b.state.v[0] = 100;
    b.state.delay[(100 % 19) * 8] = 4;
    b.advanceTo(101);
    expect(b.state.v[0]).toBe(-52);
    const spikes = b.state.spikeCounts[0];
    expect(b.state.g[0]).toBeGreaterThan(0);
    b.advanceTo(199);
    b.state.v[0] = 100;
    b.advanceTo(200);
    expect(b.state.spikeCounts[0]).toBe(spikes);
    expect(b.state.v[0]).toBe(-52);
    expect(b.state.g[0]).toBeGreaterThan(0);
    b.state.v[0] = 100;
    b.state.refractoryUntil[0] = 0;
    b.advanceTo(201);
    expect(b.state.spikeCounts[0]).toBe(spikes + 1);
});
it('odor cuts only newly generated inputs while filters and queues survive; different operations may overlap', () => {
    const b = new Branch('A', createInitialState(42), c, ids);
    b.advanceTo(1000);
    b.schedule(event({ operation: 'odor-gain', sourceIds: [], sensoryChannel: 'odor', magnitude: 0, startTick: 1000, endTick: 2000 }));
    b.schedule(event({ id: 'suppression', sequence: 2, sourceIds: ['fixture-6'], startTick: 1000, endTick: 2000 }));
    const before = b.state.inputEvents.slice(), filter = b.state.inputFilter.slice();
    b.advanceTo(2000);
    expect(b.state.inputEvents).toEqual(before);
    expect(b.state.inputFilter).not.toEqual(filter);
    expect(b.state.inputFilter.every(v => v > 0)).toBe(true);
    const frozen = b.capture();
    for (const bad of [{ ...frozen, version: 2 }, { ...frozen, eventRevision: 3 }, { ...frozen, samples: [{ ...frozen.samples[0], leftHz: NaN }] }])
        expect(() => restoreBranch(bad as typeof frozen, c, ids, 'A')).toThrow();
});
