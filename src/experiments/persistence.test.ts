import { expect, it } from 'vitest';
import { Experiment } from './experiment';
import { snapshot, compareStates } from '../simulation/engine';
import { SYNTHETIC_CONFIG as c } from '../simulation/config';
it.each(['neural state', 'motor sample'])('replay checks recorded %s even after seek recomputes the visible state', field => {
    const ids = Array.from({ length: 8 }, (_, i) => `fixture-${i}`);
    const e = new Experiment(42, c, ids);
    e.advanceTo(20000);
    e.fork(snapshot(e.original.state));
    e.advanceTo(40000);
    if (field === 'neural state')
        e.records.A!.terminal.state.v[0] += .01;
    else
        e.records.A!.terminal.samples[10].displacement += .01;
    for (const tick of [10000, 40000])
        for (const progress of e.seek(tick))
            void progress;
    expect(compareStates(e.branches.A!.state, e.original.state).equal).toBe(true);
    for (const progress of e.replay())
        void progress;
    expect(e.replayStatus.status).toBe('Mismatch');
    expect(e.replayStatus.detail).toContain('recorded terminal');
});
