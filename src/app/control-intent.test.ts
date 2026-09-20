import { expect, it } from 'vitest';
import { SimulationHost } from '../worker-protocol/host';
import { controlAllowed, controlContext, controlLabel } from './control-intent';
import type { Action } from '../worker-protocol/protocol';
const compare: Action = { type: 'COMPARE', payload: {} };
function fixture() {
    const host = new SimulationHost();
    let id = 0;
    const send = (action: Action) => host.handle({ ...action, protocolVersion: 4, sessionId: 'controls', epoch: 0, requestId: ++id, expectedRevision: host.revision });
    send({ type: 'INIT', payload: { seed: 42, dataset: 'synthetic' } });
    send({ type: 'SNAPSHOT', payload: {} });
    send({ type: 'FORK', payload: {} });
    send({ type: 'STEP', payload: { ticks: 10000 } });
    while (host.computing) host.continueJob();
    return { host, send, view: host.view() };
}
it('keeps a compare bound to the selected tick through a genuine recovery ACK revision', async () => {
    const { host, view } = fixture();
    const before = controlContext(view, compare);
    const reply = await host.dispatch({ type: 'EXPORT_STATE', payload: { id: 'recovery', name: 'recovery', dataset: 'synthetic', runtime: 'test', savedAt: '2026-09-20T12:00:00.000Z' }, protocolVersion: 4, sessionId: 'controls', epoch: 0, requestId: 5, expectedRevision: host.revision });
    expect(reply.kind).toBe('ACK');
    expect(reply.file).toBeTruthy();
    expect(controlContext(reply.view!, compare)).toBe(before);
    expect(controlAllowed(reply.view!, compare)).toBe(true);
});
it.each(['tick', 'frontier', 'record', 'event', 'snapshot', 'fork', 'branch', 'config', 'dataset', 'running'] as const)('invalidates accepted compare when semantic %s changes', field => {
    const { view } = fixture(), changed = structuredClone(view);
    switch (field) {
        case 'tick': changed.original.tick++; break;
        case 'frontier': changed.highWater++; break;
        case 'record': changed.recordRevision++; break;
        case 'event': changed.eventRevisions.A++; break;
        case 'snapshot': changed.snapshot = null; break;
        case 'fork': changed.forkTick = null; break;
        case 'branch': changed.branchB = null; break;
        case 'config': changed.configHash += 'changed'; break;
        case 'dataset': changed.dataset.hash += 'changed'; break;
        case 'running': changed.running = true; break;
    }
    expect(controlContext(changed, compare)).not.toBe(controlContext(view, compare));
});
it('keeps PAUSE explicit during normal running progress, never converts it into RUN', () => {
    const { view } = fixture(); view.running = true;
    const pause: Action = { type: 'PAUSE', payload: {} };
    const next = structuredClone(view); next.original.tick += 500; next.highWater += 500; next.recordRevision++;
    expect(controlAllowed(next, pause)).toBe(true);
    expect(controlContext(next, pause)).toBe(controlContext(view, pause));
    next.running = false;
    expect(controlAllowed(next, pause)).toBe(false);
    expect(controlContext(next, pause)).not.toBe(controlContext(view, pause));
});
it('preserves every distinct native control eligibility boundary', () => {
    const { view } = fixture();
    const allowed: Action[] = [compare, { type: 'REPLAY', payload: {} }, { type: 'RUN', payload: { speed: 1 } }, { type: 'STEP', payload: { ticks: 10000 } }, { type: 'SEEK', payload: { tick: 0 } }, { type: 'RESTORE', payload: {} }];
    for (const action of allowed) expect(controlAllowed(view, action), action.type).toBe(true);
    const rejected: Action[] = [{ type: 'PAUSE', payload: {} }, { type: 'FORK', payload: {} }, { type: 'SNAPSHOT', payload: {} }, { type: 'SEEK', payload: { tick: 10001 } }, { type: 'STEP', payload: { ticks: 0 } }];
    for (const action of rejected) expect(controlAllowed(view, action), action.type).toBe(false);
    for (const action of allowed) {
        expect(controlAllowed(null, action)).toBe(false);
        expect(controlAllowed({ ...view, job: { type: 'seek', target: 0, progress: 0 } }, action)).toBe(false);
    }
    const end = { ...view, original: { ...view.original, tick: 1200000 } };
    expect(controlAllowed(end, { type: 'RUN', payload: { speed: 1 } })).toBe(false);
    expect(controlAllowed(end, { type: 'STEP', payload: { ticks: 10000 } })).toBe(false);
    expect(controlAllowed({ ...view, branch: null }, compare)).toBe(false);
    expect(controlAllowed({ ...view, branch: { ...view.branch!, tick: 99 } }, compare)).toBe(false);
    expect(controlAllowed({ ...view, running: true }, compare)).toBe(false);
});
it('keeps Apply event identity, sequence, frontier and interval guards', () => {
    const { view } = fixture();
    const action: Action = { type: 'SCHEDULE_INTERVENTION', payload: { id: 'one', branch: 'A', model: view.dataset.model, datasetHash: view.dataset.hash, configHash: view.configHash, operatorVersion: 1, operation: 'odor-gain', sourceIds: [], sensoryChannel: 'odor', magnitude: 0, startTick: 20000, endTick: 30000, sequence: 1 } };
    expect(controlAllowed(view, action)).toBe(true);
    for (const payload of [{ sequence: 2 }, { datasetHash: 'wrong' }, { configHash: 'wrong' }, { startTick: 9999 }, { endTick: 20000 }]) expect(controlAllowed(view, { ...action, payload: { ...action.payload, ...payload } })).toBe(false);
    expect(controlAllowed({ ...view, highWater: 120000 }, action)).toBe(false);
});
it('separate STEP activations advance twice and comparison does not advance or edit logs', () => {
    const { host, send, view } = fixture();
    const initial = JSON.stringify({ original: view.original, branch: view.branch, branchB: view.branchB, events: view.events, recordRevision: view.recordRevision });
    send(compare);
    const after = host.view();
    expect(JSON.stringify({ original: after.original, branch: after.branch, branchB: after.branchB, events: after.events, recordRevision: after.recordRevision })).toBe(initial);
    for (let i = 0; i < 2; i++) { send({ type: 'STEP', payload: { ticks: 10000 } }); while (host.computing) host.continueJob(); }
    expect(host.view().original.tick).toBe(30000);
});

const labels: [Action, string][] = [
    [compare, 'Compare states'], [{ type: 'REPLAY', payload: {} }, 'Replay check'],
    [{ type: 'RUN', payload: { speed: 1 } }, 'Run'], [{ type: 'PAUSE', payload: {} }, 'Pause'],
    [{ type: 'STEP', payload: { ticks: 10000 } }, '+1 s'], [{ type: 'STEP', payload: { ticks: 50000 } }, '+5 s'],
    [{ type: 'SEEK', payload: { tick: 5000 } }, 'Seek'], [{ type: 'SNAPSHOT', payload: {} }, 'Capture snapshot'],
    [{ type: 'FORK', payload: {} }, 'Fork A + B'], [{ type: 'RESTORE', payload: {} }, 'Restore S₀'],
    [{ type: 'INIT', payload: { seed: 42, dataset: 'synthetic' } }, 'Command'],
];
it.each(labels)('labels a supported action %j as %s without modifying its fixed payload', (action, label) => {
    const before = structuredClone(action);
    Object.freeze(action.payload); Object.freeze(action);
    expect(controlLabel(action)).toBe(label);
    expect(action).toEqual(before);
});

it('admits capture/fork/restore at their actual lifecycle stages, but no replay at S₀', () => {
    const host = new SimulationHost(); let id = 0;
    const send = (action: Action) => host.handle({ ...action, protocolVersion: 4, sessionId: 'guard-stages', epoch: 0, requestId: ++id, expectedRevision: host.revision });
    send({ type: 'INIT', payload: { seed: 42, dataset: 'synthetic' } });
    const initial = host.view();
    expect(controlAllowed(initial, { type: 'SNAPSHOT', payload: {} })).toBe(true);
    expect(controlAllowed(initial, { type: 'RESTORE', payload: {} })).toBe(false);
    expect(controlAllowed(initial, { type: 'FORK', payload: {} })).toBe(false);
    send({ type: 'SNAPSHOT', payload: {} });
    expect(controlAllowed(host.view(), { type: 'FORK', payload: {} })).toBe(true);
    expect(controlAllowed(host.view(), { type: 'RESTORE', payload: {} })).toBe(true);
    send({ type: 'FORK', payload: {} });
    expect(controlAllowed(host.view(), compare)).toBe(true);
    expect(controlAllowed(host.view(), { type: 'REPLAY', payload: {} })).toBe(false);
});

it.each([-1, .5, 50001, Infinity, NaN])('rejects an invalid STEP amount %s before dispatch', ticks => {
    expect(controlAllowed(fixture().view, { type: 'STEP', payload: { ticks } })).toBe(false);
});
it('keeps exact STEP and SEEK limits inclusive, rejects fractional/negative Seek, and preserves its target', () => {
    const { view } = fixture();
    for (const ticks of [1, 50000]) expect(controlAllowed(view, { type: 'STEP', payload: { ticks } })).toBe(true);
    for (const tick of [0, view.highWater]) expect(controlAllowed(view, { type: 'SEEK', payload: { tick } })).toBe(true);
    for (const tick of [-1, .5, NaN]) expect(controlAllowed(view, { type: 'SEEK', payload: { tick } })).toBe(false);
    const action: Action = { type: 'SEEK', payload: Object.freeze({ tick: 5000 }) };
    Object.freeze(action);
    expect(controlAllowed(view, action)).toBe(true);
    controlContext(view, action); controlLabel(action);
    expect(action.payload.tick).toBe(5000);
    const atEdge = structuredClone(view);
    atEdge.original.tick = atEdge.branch!.tick = atEdge.branchB!.tick = atEdge.highWater = 1199999;
    expect(controlAllowed(atEdge, { type: 'STEP', payload: { ticks: 1 } })).toBe(true);
    expect(controlAllowed(atEdge, { type: 'STEP', payload: { ticks: 2 } })).toBe(false);
});

it('guards branch B and suppression source/identity/range while leaving the accepted event immutable', () => {
    const { view } = fixture();
    const action: Extract<Action, { type: 'SCHEDULE_INTERVENTION' }> = { type: 'SCHEDULE_INTERVENTION', payload: { id: 'b-event', branch: 'B', model: view.dataset.model, datasetHash: view.dataset.hash, configHash: view.configHash, operatorVersion: 1, operation: 'suppression', sourceIds: [view.dataset.cells[0].id], sensoryChannel: null, magnitude: .5, startTick: view.original.tick, endTick: 1200000, sequence: 1 } };
    const before = structuredClone(action);
    Object.freeze(action.payload.sourceIds); Object.freeze(action.payload); Object.freeze(action);
    expect(controlLabel(action)).toBe('Apply intervention');
    expect(controlAllowed(view, action)).toBe(true);
    expect(controlAllowed({ ...view, branchB: null }, action)).toBe(false);
    for (const payload of [{ sourceIds: [] }, { model: 'different-model' }, { endTick: 1200001 }]) expect(controlAllowed(view, { ...action, payload: { ...action.payload, ...payload } })).toBe(false);
    controlContext(view, action);
    expect(action).toEqual(before);
});

it.each(['seed', 'branchA', 'eventB'] as const)('binds the remaining real experiment identity field %s', field => {
    const { view } = fixture(), changed = structuredClone(view);
    if (field === 'seed') changed.seed++;
    if (field === 'branchA') changed.branch = null;
    if (field === 'eventB') changed.eventRevisions.B++;
    expect(controlContext(changed, compare)).not.toBe(controlContext(view, compare));
});
it('does not admit valid protocol INIT through the transport-control helper', () => {
    expect(controlAllowed(fixture().view, { type: 'INIT', payload: { seed: 42, dataset: 'synthetic' } })).toBe(false);
});
