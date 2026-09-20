import { expect, it } from 'vitest';
import { Experiment } from './experiment';
import { Branch, fingerprint } from './branch';
import { CheckpointPool, checkpointKey } from './checkpoints';
import { createInitialState, compareStates, snapshot } from '../simulation/engine';
import { SYNTHETIC_CONFIG as c } from '../simulation/config';
import type { InterventionEvent } from './events';
const ids = Array.from({ length: 8 }, (_, i) => `fixture-${i}`);
const make = () => new Experiment(42, c, ids);
const event: InterventionEvent = { id: 'cut', branch: 'A', model: c.model, datasetHash: c.datasetHash, configHash: c.configHash, operatorVersion: 1, operation: 'odor-gain', sourceIds: [], sensoryChannel: 'odor', magnitude: 0, startTick: 15000, endTick: 35000, sequence: 1 };
function run(job: Generator<unknown, void>) { while (!job.next().done) { /* advance an independent job to completion */ } }
it('seek uses own checkpoints, replays active intervals, evicts safely and never leaks future metrics', () => {
    const e = make();
    e.advanceTo(10000);
    e.fork(snapshot(e.original.state));
    e.schedule(event);
    e.advanceTo(60000);
    const terminal = e.branches.A!.capture();
    run(e.seek(25000));
    expect(e.branches.A!.capture().activeIds).toEqual(['cut']);
    expect(e.metrics().endTick).toBe(25000);
    expect(e.branches.A!.state.trail.at(-1)!.tick).toBe(25000);
    expect(() => e.schedule({ ...event, id: 'past', sequence: 2, startTick: 26000, endTick: 27000 })).toThrow();
    e.checkpoints.clear();
    run(e.seek(60000));
    expect(compareStates(e.branches.A!.state, terminal.state).equal).toBe(true);
    run(e.seek(5000));
    expect(e.branches.A).toBeNull();
    run(e.seek(60000));
    expect(compareStates(e.branches.A!.state, terminal.state).equal).toBe(true);
});
it('own-log replay matches divergent branches, preserves live state and detects record/log corruption', () => {
    const e = make();
    e.advanceTo(10000);
    e.fork(snapshot(e.original.state));
    e.schedule(event);
    e.advanceTo(50000);
    expect(e.compare().A.equal).toBe(false);
    const before = fingerprint(e.branches);
    run(e.replay());
    expect(e.replayStatus.status).toBe('Matched');
    expect(fingerprint(e.branches)).toBe(before);
    e.branches.A!.state.trail[200].x += .01;
    run(e.replay());
    expect(e.replayStatus.status).toBe('Mismatch');
    expect(e.replayStatus.detail).toContain('A');
    const f = make();
    f.advanceTo(10000);
    f.fork(snapshot(f.original.state));
    f.schedule(event);
    f.advanceTo(50000);
    f.records.A!.proofs.set(20000, 'corrupt');
    run(f.replay());
    expect(f.replayStatus.status).toBe('Mismatch');
    expect(f.replayStatus.detail).toContain('20000');
});
it('checkpoint identities reject wrong branch/event revision; snapshots are detached and budgets bounded', () => {
    const b = new Branch('A', createInitialState(42), c, ids);
    b.advanceTo(20000);
    const s = b.capture(), p = new CheckpointPool(1000000);
    p.put(s);
    s.state.v[0] += 1;
    const found = p.nearest(b.capture(), 20000)!;
    expect(compareStates(found.state, b.state).equal).toBe(true);
    expect(p.nearest({ ...s, branch: 'B' }, 20000)).toBeNull();
    expect(p.nearest({ ...s, eventRevision: 1 }, 20000)).toBeNull();
    expect(checkpointKey(s)).not.toBe(checkpointKey({ ...s, operatorVersion: 2 as 1 }));
    for (let i = 2; i < 9; i++) {
        b.advanceTo(i * 20000);
        p.put(b.capture());
        expect(p.bytes).toBeLessThanOrEqual(p.budget);
    }
    p.clear();
    expect(p.size).toBe(0);
});
it('forking a captured S0 after seeking backward retains its measurement history for replay', () => {
    const e = make();
    e.advanceTo(20000);
    const s0 = snapshot(e.original.state);
    run(e.seek(10000));
    e.fork(s0);
    e.advanceTo(40000);
    run(e.replay());
    expect(e.replayStatus.status).toBe('Matched');
});
it('replay detects modified recorded event logs and extra/missing measurements without certifying them', () => {
    const e = make();
    e.advanceTo(10000);
    e.fork(snapshot(e.original.state));
    e.schedule(event);
    e.advanceTo(40000);
    const r = e.records.A!;
    r.start = { ...r.start, events: [{ ...event, magnitude: 1 }] };
    run(e.replay());
    expect(e.replayStatus.status).toBe('Mismatch');
    const f = make();
    f.advanceTo(10000);
    f.fork(snapshot(f.original.state));
    f.advanceTo(14000);
    f.branches.B!.samples.push({ ...f.branches.B!.samples.at(-1)! });
    run(f.replay());
    expect(f.replayStatus.status).toBe('Mismatch');
});
it('resuming across S0 rebuilds the children and matches an uninterrupted intervention run', () => {
    const e = make();
    e.advanceTo(10000);
    e.fork(snapshot(e.original.state));
    e.schedule(event);
    e.advanceTo(60000);
    const expected = e.branches.A!.capture();
    run(e.seek(1000));
    e.advanceTo(60000);
    expect(compareStates(e.branches.A!.state, expected.state).equal).toBe(true);
    expect(e.branches.A!.samples).toEqual(expected.samples);
});
it('reports the actual shared sample window at a non-body fork boundary and rejects incompatible experiment configuration',()=>{
 const e=make();e.advanceTo(12345);e.fork(snapshot(e.original.state));e.advanceTo(17456);expect(e.metrics().startTick).toBe(12400);expect(e.metrics().endTick).toBe(17400);expect(e.metrics().branches.A!.samples).toBe(51);
 expect(()=>new Experiment(1,{...c,dt:.05},ids)).toThrow();expect(()=>new Experiment(1,c,['one'])).toThrow();
});
it('every mutable buffer, body, trail and measurement belongs to its own branch and S0',()=>{
 const e=make();e.advanceTo(1000);const s0=snapshot(e.original.state);e.fork(s0);const a=e.branches.A!,b=e.branches.B!;
 for(const key of ['v','g','delay','prng','inputFilter','motorFilter','spikeCounts','refractoryUntil','inputEvents'] as const){expect(a.state[key].buffer).not.toBe(b.state[key].buffer);expect(a.state[key].buffer).not.toBe(s0[key].buffer);a.state[key][0]+=1;}
 a.state.body.x+=.1;a.state.trail[0].x+=.1;a.samples[0].speed+=.1;
 expect(compareStates(e.original.state,b.state).equal).toBe(true);expect(compareStates(s0,b.state).equal).toBe(true);expect(b.samples).toEqual(e.original.samples);expect(b.samples[0]).not.toBe(a.samples[0]);
 b.advanceTo(2000);e.original.advanceTo(2000);expect(compareStates(e.original.state,b.state).equal).toBe(true);
});
