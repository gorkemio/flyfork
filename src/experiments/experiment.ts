import { createInitialState, compareStates, snapshot } from '../simulation/engine';
import type { SimState } from '../simulation/engine';
import type { ModelConfig } from '../simulation/config';
import { Branch, restoreBranch, fingerprint } from './branch';
import type { BranchSnapshot } from './branch';
import { CheckpointPool, snapshotBytes } from './checkpoints';
import type { BranchId, InterventionEvent } from './events';
import { branchMetrics, divergence } from '../metrics/metrics';
import type { WindowMetrics } from '../metrics/metrics';
export interface ReplayStatus {
    status: 'Not checked' | 'Checking' | 'Matched' | 'Mismatch' | 'Unavailable';
    tick: number;
    detail: string;
    checked: number;
}
interface Recording {
    start: BranchSnapshot;
    terminal: BranchSnapshot;
    proofs: Map<number, string>;
}
const names: BranchId[] = ['original', 'A', 'B'];
export class Experiment {
    branches: Record<BranchId, Branch | null>;
    readonly records: Partial<Record<BranchId, Recording>> = {};
    // Half of the approved pool is reserved for immutable initial/S0 anchors and working copies.
    readonly checkpoints = new CheckpointPool(32 * 1024 * 1024);
    forkTick: number | null = null;
    recordRevision = 0;
    replayStatus: ReplayStatus = { status: 'Not checked', tick: 0, detail: 'Replay has not run', checked: 0 };
    get original() { return this.branches.original!; }
    get highWater() { return this.records.original!.terminal.state.tick; }
    constructor(seed: number, readonly config: ModelConfig, readonly ids: readonly string[]) {
        if (config.dt !== .1 || ids.length !== config.neurons || new Set(ids).size !== ids.length)
            throw new Error('Experiments require .1 ms and unique source IDs for every neuron');
        const initial = new Branch('original', createInitialState(seed, config), config, ids);
        this.branches = { original: initial, A: null, B: null };
        this.records.original = { start: initial.capture(), terminal: initial.capture(), proofs: new Map() };
    }
    invalidate(): void { this.replayStatus = { status: 'Not checked', tick: this.original.state.tick, detail: 'The selected tick or experiment record changed', checked: 0 }; }
    fork(s: SimState): void {
        if (this.forkTick !== null)
            throw new Error('A fork already exists; start a new experiment for a new fork point');
        const prefix = this.records.original!.terminal.samples.filter(p => p.tick <= s.tick);
        const original = new Branch('original', s, this.config, this.ids, prefix), a = new Branch('A', s, this.config, this.ids, prefix), b = new Branch('B', s, this.config, this.ids, prefix);
        this.forkTick = s.tick;
        this.branches = { original, A: a, B: b };
        this.records.original!.terminal = original.capture();
        this.records.original!.proofs = new Map([...this.records.original!.proofs].filter(([tick]) => tick <= s.tick));
        for (const branch of [a, b])
            this.records[branch.id] = { start: branch.capture(), terminal: branch.capture(), proofs: new Map() };
        this.checkpoints.clear();
        this.invalidate();
        this.recordRevision++;
    }
    schedule(e: InterventionEvent): void {
        if (this.forkTick === null || !this.branches[e.branch] || this.original.state.tick !== this.highWater)
            throw new Error('Apply only at the recorded present after forking; restart to change history');
        if (Object.values(this.records).reduce((n, r) => n + r.terminal.events.length, 0) >= 256)
            throw new Error('Experiment event limit reached');
        const current = this.branches[e.branch]!, candidate = restoreBranch(current.capture(), this.config, this.ids, e.branch);
        candidate.schedule(e);
        const record = this.records[e.branch]!;
        const start = new Branch(e.branch, record.start.state, this.config, this.ids, record.start.samples, candidate.events).capture();
        this.branches[e.branch] = candidate;
        record.start = start;
        record.terminal = candidate.capture();
        this.checkpoints.clear();
        this.invalidate();
        this.recordRevision++;
    }
    advanceTo(target: number): void {
        if (!Number.isSafeInteger(target) || target < this.original.state.tick || target > 120000 / this.config.dt)
            throw new Error('Invalid experiment horizon');
        // Resuming before S0 recreates children exactly at S0, including their own logs only.
        while (this.original.state.tick < target) {
            const now = this.original.state.tick;
            let next = Math.min(target, (Math.floor(now / 20000) + 1) * 20000);
            if (this.forkTick !== null && now < this.forkTick)
                next = Math.min(next, this.forkTick);
            for (const id of names) {
                const b = this.branches[id];
                if (!b)
                    continue;
                b.advanceTo(next);
                const r = this.records[id]!;
                if (next >= r.terminal.state.tick) {
                    r.terminal = b.capture();
                    if (next % 20000 === 0)
                        r.proofs.set(next, fingerprint(b.state));
                }
                if (next % 20000 === 0)
                    this.checkpoints.put(b.capture());
            }
            if (this.forkTick === next && !this.branches.A)
                for (const id of ['A', 'B'] as const)
                    this.branches[id] = restoreBranch(this.records[id]!.start, this.config, this.ids, id);
        }
        this.recordRevision++;
        this.invalidate();
    }
    *seek(target: number): Generator<number, void> {
        if (!Number.isSafeInteger(target) || target < 0 || target > this.highWater)
            throw new Error('Seek must be within recorded history');
        const next: Record<BranchId, Branch | null> = { original: null, A: null, B: null };
        for (const id of names) {
            const r = this.records[id];
            if (!r || target < r.start.state.tick)
                continue;
            const cached = this.checkpoints.nearest(r.start, target), start = cached ?? r.start;
            const b = restoreBranch(start, this.config, this.ids, id);
            next[id] = b;
            while (b.state.tick < target) {
                b.advanceTo(Math.min(target, b.state.tick + 2000));
                yield b.state.tick;
            }
        }
        this.branches = next;
        this.invalidate();
    }
    *replay(): Generator<number, void> {
        const target = this.original.state.tick;
        this.replayStatus = { status: 'Checking', tick: target, detail: 'Recomputing each branch from its own start and event log', checked: 0 };
        let checked = 0;
        for (const id of names) {
            const live = this.branches[id], r = this.records[id];
            if (!live || !r)
                continue;
            const expected = live.capture(), b = restoreBranch(r.start, this.config, this.ids, id);
            while (b.state.tick < target) {
                const next = Math.min(target, b.state.tick + 2000, (Math.floor(b.state.tick / 20000) + 1) * 20000);
                b.advanceTo(next);
                const proof = r.proofs.get(next);
                if (proof !== undefined) {
                    checked++;
                    if (fingerprint(b.state) !== proof) {
                        this.replayStatus = { status: 'Mismatch', tick: target, detail: `${id}: numeric checkpoint at tick ${next} differs (2 s checkpoint resolution)`, checked };
                        return;
                    }
                }
                yield next;
            }
            for (let i = 0; i < expected.state.trail.length; i++)
                if (fingerprint(expected.state.trail[i]) !== fingerprint(b.state.trail[i])) {
                    this.replayStatus = { status: 'Mismatch', tick: target, detail: `${id}: trail[${i}] differs at tick ${expected.state.trail[i].tick} (10 ms samples)`, checked };
                    return;
                }
            for (let i = 0; i < expected.samples.length; i++)
                if (fingerprint(expected.samples[i]) !== fingerprint(b.samples[i])) {
                    this.replayStatus = { status: 'Mismatch', tick: target, detail: `${id}: motor sample differs at tick ${expected.samples[i].tick} (10 ms samples)`, checked };
                    return;
                }
            const diff = compareStates(expected.state, b.state);
            checked++;
            if (!diff.equal || expected.samples.length !== b.samples.length) {
                this.replayStatus = { status: 'Mismatch', tick: target, detail: `${id}: ${diff.firstDifference ?? 'samples.length'} differs at terminal tick ${target}; first neural difference not localized`, checked };
                return;
            }
            // A seek may have recomputed the visible state. Retain the independent
            // recorded terminal as evidence, especially across file round trips.
            const recorded = r.terminal.samples;
            if (target === r.terminal.state.tick && (!compareStates(r.terminal.state, b.state).equal || recorded.length !== b.samples.length || recorded.some((sample, i) => (Object.keys(sample) as (keyof typeof sample)[]).some(key => !Object.is(sample[key], b.samples[i][key]))))) {
                this.replayStatus = { status: 'Mismatch', tick: target, detail: `${id}: recorded terminal differs at tick ${target}`, checked };
                return;
            }
        }
        this.replayStatus = { status: 'Matched', tick: target, detail: `Own start + own log; full terminal state, 10 ms trails/measurements and ${checked} terminal/checkpoint records`, checked };
    }
    compare() {
        if (!this.branches.A || !this.branches.B)
            throw new Error('Create branches and seek to S₀ or later');
        return { A: compareStates(this.original.state, this.branches.A.state), B: compareStates(this.original.state, this.branches.B.state), AB: compareStates(this.branches.A.state, this.branches.B.state) };
    }
    metrics(): WindowMetrics {
        const step = Math.round(10 / this.config.dt), start = Math.ceil((this.forkTick ?? 0) / step) * step, end = Math.floor(this.original.state.tick / step) * step;
        const result: WindowMetrics = { reason: null, startTick: start, endTick: end, branches: {}, divergence: { AO: null, BO: null, AB: null } };
        if (end <= start) {
            result.reason = 'No complete comparison window yet';
            return result;
        }
        for (const id of names) {
            const b = this.branches[id];
            if (b) {
                const m = branchMetrics(b.state, b.samples, b.events, start, end);
                if (m)
                    result.branches[id] = m;
                else
                    result.reason = 'Missing common samples';
            }
        }
        if (this.branches.A && this.branches.B) {
            result.divergence = { AO: divergence(this.branches.A.state, this.original.state, start, end), BO: divergence(this.branches.B.state, this.original.state, start, end), AB: divergence(this.branches.A.state, this.branches.B.state, start, end) };
        }
        return result;
    }
    memory() { return { cacheBytes: this.checkpoints.bytes, checkpointCount: this.checkpoints.size, anchorBytes: Object.values(this.records).reduce((n, r) => n + snapshotBytes(r.start), 0) }; }
    captureOriginal() { return snapshot(this.original.state); }
}
