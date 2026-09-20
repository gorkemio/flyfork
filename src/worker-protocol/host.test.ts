import { describe, expect, it } from 'vitest';
import { SimulationHost } from './host';
import { acceptReply, replySchema } from './protocol';
import { compareStates, snapshot, createInitialState, stepTicks } from '../simulation/engine';
function lab() {
    const host = new SimulationHost();
    let id = 0;
    const send = (type: string, payload: object = {}) => host.handle({ protocolVersion: 1, requestId: ++id, sessionId: 'test-session', epoch: 0, expectedRevision: host.revision, type, payload });
    send('INIT', { seed: 42 });
    return { host, send };
}
describe('authoritative Worker host', () => {
    it('runs, pauses, snapshots active state, forks and compares at a shared tick', () => {
        const { host, send } = lab();
        send('RUN', { speed: 1 });
        for (let i = 0; i < 30; i++)
            host.pulse();
        send('PAUSE');
        const paused = snapshot(host.original);
        host.pulse();
        expect(compareStates(paused, host.original).equal).toBe(true);
        send('SNAPSHOT');
        send('FORK');
        send('STEP', { ticks: 20000 });
        const result = send('COMPARE');
        expect(result.kind).toBe('ACK');
        expect(result.view?.comparison?.equal).toBe(true);
        expect(host.original.tick).toBe(host.branch?.tick);
        send('RESTORE');
        expect(compareStates(paused, host.original).equal).toBe(true);
    });
    it('pause/resume and speed scheduling are numerically independent', () => {
        const { host, send } = lab();
        for (const speed of [0.5, 1, 2, 4]) {
            send('RUN', { speed });
            host.pulse();
            send('PAUSE');
            host.pulse();
        }
        const reference = createInitialState(42);
        stepTicks(reference, host.original.tick);
        expect(compareStates(reference, host.original).equal).toBe(true);
    });
    it('rejects malformed, unsupported, stale session/epoch/revision commands atomically', () => {
        const { host } = lab();
        const before = snapshot(host.original);
        const valid = { protocolVersion: 1, requestId: 80, sessionId: 'test-session', epoch: 0, expectedRevision: host.revision, type: 'STEP', payload: { ticks: 12 } };
        for (const bad of [null, {}, { ...valid, protocolVersion: 2 }, { ...valid, payload: { ticks: NaN } }, { ...valid, payload: { ticks: 1.2 } },
            { ...valid, payload: { ticks: 10, extra: true } }, { ...valid, sessionId: 'old' }, { ...valid, epoch: 9 }, { ...valid, expectedRevision: 0 }]) {
            expect(host.handle(bad).kind).toBe('ERROR');
            expect(compareStates(before, host.original).equal).toBe(true);
        }
    });
    it('deduplicates request IDs and rejects their reuse with a different payload', () => {
        const { host } = lab();
        const cmd = { protocolVersion: 1, requestId: 2, sessionId: 'test-session', epoch: 0, expectedRevision: 1, type: 'STEP', payload: { ticks: 1000 } };
        const first = host.handle(cmd);
        const second = host.handle(cmd);
        expect(second).toEqual(first);
        expect(host.original.tick).toBe(1000);
        expect(host.handle({ ...cmd, payload: { ticks: 2000 } }).kind).toBe('ERROR');
        expect(host.original.tick).toBe(1000);
    });
    it('guards unavailable actions and prevents snapshot replacement or unsafe running commands', () => {
        const { host, send } = lab();
        for (const type of ['FORK', 'RESTORE', 'COMPARE'])
            expect(send(type).kind).toBe('ERROR');
        send('RUN', { speed: 1 });
        expect(send('SNAPSHOT').kind).toBe('ERROR');
        expect(send('STEP', { ticks: 10 }).kind).toBe('ERROR');
        send('PAUSE');
        send('SNAPSHOT');
        expect(send('SNAPSHOT').kind).toBe('ERROR');
        send('FORK');
        expect(send('FORK').kind).toBe('ERROR');
        expect(host.branch).not.toBeNull();
        if (host.branch) {
            host.branch.motorFilter[0] += 1;
            expect(send('COMPARE').view?.comparison?.firstDifference).toBe('motorFilter[0]');
        }
    });
    it('full telemetry is validated and detached from mutable worker buffers', () => {
        const { host, send } = lab();
        const r = send('STEP', { ticks: 12345 });
        expect(replySchema.safeParse(r).success).toBe(true);
        const before = snapshot(host.original);
        if (r.view) {
            r.view.original.v[0] = 0;
            r.view.original.body.x = 0;
            r.view.original.trail[0].x = 0;
        }
        expect(compareStates(before, host.original).equal).toBe(true);
    });
});
describe('UI reply gate', () => {
    it('rejects invalid, previous-session/revision and reordered messages without replacing state', () => {
        const { send } = lab();
        const reply = send('STEP', { ticks: 100 });
        const cursor = { sessionId: 'test-session', epoch: 0, revision: 1, sequence: 0 };
        expect(acceptReply(reply, cursor, reply.requestId)).not.toBeNull();
        for (const bad of [null, { ...reply, sessionId: 'old' }, { ...reply, epoch: 1 }, { ...reply, revision: 0 }, { ...reply, sequence: 0 }, { ...reply, view: {} }])
            expect(acceptReply(bad, cursor, reply.requestId)).toBeNull();
        expect(acceptReply(reply, cursor, 999)).toBeNull();
    });
});
describe('bounded experiment horizon', () => {
    it('stops on exactly 120 seconds without dropping ticks or growing the trail', () => {
        const { host, send } = lab();
        for (let i = 0; i < 23; i++)
            expect(send('STEP', { ticks: 50000 }).kind).toBe('ACK');
        send('RUN', { speed: 4 });
        while (host.running)
            host.pulse();
        expect(host.original.tick).toBe(1200000);
        expect(host.original.trail).toHaveLength(12001);
        expect(send('RUN', { speed: 1 }).kind).toBe('ERROR');
        expect(send('STEP', { ticks: 1 }).kind).toBe('ERROR');
        expect(host.original.tick).toBe(1200000);
    });
});
