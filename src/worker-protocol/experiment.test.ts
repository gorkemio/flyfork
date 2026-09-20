import { expect, it } from 'vitest';
import { SimulationHost } from './host';
import { acceptReply, replySchema } from './protocol';
import { snapshot, compareStates } from '../simulation/engine';
function setup() { const host = new SimulationHost(); let id = 0; const send = (type: string, payload: object = {}) => host.handle({ protocolVersion: 3, sessionId: 's3', epoch: 0, expectedRevision: host.revision, requestId: ++id, type, payload }); send('INIT', { seed: 42 }); return { host, send }; }
function finish(h: SimulationHost) { let r = h.continueJob(); while (h.computing)
    r = h.continueJob(); return r!; }
it('v3 jobs expose progress, reject racing commands, commit seek atomically and deduplicate events', () => {
    const { host, send } = setup();
    const start = send('STEP', { ticks: 20000 });
    expect(start.kind).toBe('PROGRESS');
    expect(replySchema.safeParse(start).success).toBe(true);
    expect(send('FORK').kind).toBe('ERROR');
    finish(host);
    send('SNAPSHOT');
    send('FORK');
    const cfg = host.config;
    const ev = { id: 'cut', branch: 'A', model: cfg.model, datasetHash: cfg.datasetHash, configHash: cfg.configHash, operatorVersion: 1, operation: 'odor-gain', sourceIds: [], sensoryChannel: 'odor', magnitude: 0, startTick: 20000, endTick: 30000, sequence: 1 };
    expect(send('SCHEDULE_INTERVENTION', ev).kind).toBe('ACK');
    expect(send('SCHEDULE_INTERVENTION', ev).kind).toBe('ERROR');
    send('STEP', { ticks: 40000 });
    finish(host);
    expect(send('COMPARE').view?.comparison?.equal).toBe(false);
    const before = snapshot(host.original), seek = send('SEEK', { tick: 25000 });
    expect(seek.kind).toBe('PROGRESS');
    expect(send('PAUSE').kind).toBe('ERROR');
    expect(compareStates(before, host.original).equal).toBe(true);
    host.continueJob();
    expect(compareStates(before, host.original).equal).toBe(true);
    finish(host);
    expect(host.original.tick).toBe(25000);
    expect(host.branchB!.tick).toBe(25000);
    const replay = send('REPLAY');
    expect(replay.view?.replay.status).toBe('Checking');
    const end = finish(host);
    expect(end.view?.replay.status).toBe('Matched');
    expect(replySchema.safeParse(end).success).toBe(true);
    expect(acceptReply(replay, { sessionId: 's3', epoch: 0, revision: end.revision, sequence: end.sequence }, null)).toBeNull();
    send('STEP', { ticks: 100 });
    finish(host);
    expect(host.view().replay.status).toBe('Not checked');
    expect(send('SEEK', { tick: 60001 }).kind).toBe('ERROR');
});
it('all three branches keep the same tick at every speed and malformed v3 events leave state intact', () => {
    const { host, send } = setup();
    send('SNAPSHOT');
    send('FORK');
    for (const speed of [.5, 1, 2, 4]) {
        send('RUN', { speed });
        host.pulse();
        send('PAUSE');
        expect(host.branch!.tick).toBe(host.original.tick);
        expect(host.branchB!.tick).toBe(host.original.tick);
        expect(compareStates(host.original, host.branchB!).equal).toBe(true);
    }
    const s = snapshot(host.original);
    expect(send('SCHEDULE_INTERVENTION', { id: 'bad' }).kind).toBe('ERROR');
    expect(compareStates(s, host.original).equal).toBe(true);
});
