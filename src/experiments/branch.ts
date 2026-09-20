import { restore, snapshot, stepTicks } from '../simulation/engine';
import type { SimState, MotorSample } from '../simulation/engine';
import type { ModelConfig } from '../simulation/config';
import { eventPhase, validateEvent, OPERATOR_VERSION } from './events';
import type { BranchId, InterventionEvent } from './events';
export interface BranchSnapshot {
    version: 3;
    operatorVersion: 1;
    branch: BranchId;
    eventRevision: number;
    events: readonly InterventionEvent[];
    cursor: number;
    activeIds: string[];
    state: SimState;
    samples: MotorSample[];
}
export class Branch {
    state: SimState;
    samples: MotorSample[];
    private log: readonly InterventionEvent[] = Object.freeze([]);
    get events() { return this.log; }
    get eventRevision() { return this.log.length; }
    constructor(readonly id: BranchId, initial: SimState, readonly config: ModelConfig, readonly sourceIds: readonly string[], samples: readonly MotorSample[] = [], events: readonly InterventionEvent[] = []) {
        this.state = restore(initial, config);
        this.samples = samples.map(s => ({ ...s }));
        const log: InterventionEvent[] = [];
        for (const e of events)
            log.push(validateEvent(e, id, config, sourceIds, log, 0));
        this.log = Object.freeze(log);
    }
    schedule(input: InterventionEvent): void {
        const event = validateEvent(input, this.id, this.config, this.sourceIds, this.log, this.state.tick);
        this.log = Object.freeze([...this.log, event]);
    }
    capture(): BranchSnapshot {
        return { version: 3, operatorVersion: OPERATOR_VERSION, branch: this.id, eventRevision: this.eventRevision,
            events: this.log.map(e => ({ ...e, sourceIds: [...e.sourceIds] })), ...eventPhase(this.log, this.state.tick),
            state: snapshot(this.state), samples: this.samples.map(s => ({ ...s })) };
    }
    advanceTo(target: number): void {
        if (!Number.isSafeInteger(target) || target < this.state.tick || target > 120000 / this.config.dt)
            throw new Error('Invalid branch target tick');
        while (this.state.tick < target) {
            const now = this.state.tick, suppression = Array<number>(this.config.neurons).fill(0);
            let next = target, odorGain = 1;
            for (const e of this.log) {
                if (e.startTick > now)
                    next = Math.min(next, e.startTick);
                if (e.endTick > now)
                    next = Math.min(next, e.endTick);
                if (e.startTick <= now && now < e.endTick) {
                    if (e.operation === 'odor-gain')
                        odorGain = e.magnitude;
                    else
                        for (const id of e.sourceIds)
                            suppression[this.sourceIds.indexOf(id)] = e.magnitude;
                }
            }
            stepTicks(this.state, next - now, this.config, { suppression, odorGain, onBodyStep: sample => this.samples.push(sample) });
        }
    }
}
export function restoreBranch(s: BranchSnapshot, c: ModelConfig, ids: readonly string[], expected: BranchId): Branch {
    if (s.version !== 3 || s.operatorVersion !== OPERATOR_VERSION || s.branch !== expected || !Array.isArray(s.events) || s.eventRevision !== s.events.length || !Array.isArray(s.samples))
        throw new Error('Incompatible branch snapshot');
    const b = new Branch(expected, s.state, c, ids);
    // Validate the immutable whole log before installing it, including past intervals.
    const log: InterventionEvent[] = [];
    for (const e of s.events)
        log.push(validateEvent(e, expected, c, ids, log, 0));
    const phase = eventPhase(log, s.state.tick);
    if (phase.cursor !== s.cursor || JSON.stringify(phase.activeIds) !== JSON.stringify(s.activeIds))
        throw new Error('Invalid event phase');
    let previous = -1;
    for (const sample of s.samples) {
        if (typeof sample.blocked !== 'boolean' || !Object.entries(sample).filter(([key]) => key !== 'blocked').every(([, value]) => Number.isFinite(value)) || !Number.isInteger(sample.tick) || sample.tick % Math.round(10 / c.dt) || sample.tick <= previous || sample.tick > s.state.tick || sample.displacement < 0 || sample.speed < 0 || sample.speed > 6)
            throw new Error('Invalid measurement history');
        previous = sample.tick;
    }
    return new Branch(expected, b.state, c, ids, s.samples, log);
}
// Non-cryptographic 64-bit numeric fingerprint; replay also compares full terminal state and every recorded sample.
export function fingerprint(value: unknown): string {
    const text = JSON.stringify(value) ?? 'undefined';
    let a = 2166136261, b = 3335557771;
    for (let i = 0; i < text.length; i++) {
        const n = text.charCodeAt(i);
        a = Math.imul(a ^ n, 16777619);
        b = Math.imul(b ^ n, 2246822519);
    }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
export function copyBranchSnapshot(s: BranchSnapshot): BranchSnapshot {
    return { ...s, state: snapshot(s.state), events: s.events.map(e => ({ ...e, sourceIds: [...e.sourceIds] })), activeIds: [...s.activeIds], samples: s.samples.map(x => ({ ...x })) };
}
