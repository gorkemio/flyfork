import { Experiment } from '../experiments/experiment';
import { copyBranchSnapshot, restoreBranch } from '../experiments/branch';
import type { BranchSnapshot } from '../experiments/branch';
import type { BranchId } from '../experiments/events';
import { compareStates, createInitialState, restore, snapshot } from '../simulation/engine';
import type { SimState } from '../simulation/engine';
import type { ModelConfig } from '../simulation/config';
export interface ExperimentRecord {
    version: 1;
    seed: number;
    playhead: number;
    frontier: number;
    forkTick: number | null;
    recordRevision: number;
    anchor: SimState | null;
    live: BranchSnapshot[];
    records: {
        branch: BranchId;
        start: BranchSnapshot;
        terminal: BranchSnapshot;
        proofs: [
            number,
            string
        ][];
    }[];
}
export function captureExperiment(e: Experiment, anchor: SimState | null, seed: number): ExperimentRecord {
    return { version: 1, seed, playhead: e.original.state.tick, frontier: e.highWater, forkTick: e.forkTick, recordRevision: e.recordRevision,
        anchor: anchor ? snapshot(anchor) : null,
        live: Object.values(e.branches).flatMap(b => b ? [b.capture()] : []),
        records: (['original', 'A', 'B'] as const).flatMap(branch => {
            const r = e.records[branch];
            return r ? [{ branch, start: copyBranchSnapshot(r.start), terminal: copyBranchSnapshot(r.terminal), proofs: [...r.proofs].map(([t, h]) => [t, h] as [
                        number,
                        string
                    ]) }] : [];
        }) };
}
function check(value: unknown, message: string): asserts value {
    if (!value)
        throw new Error(`Invalid experiment: ${message}`);
}
export function restoreExperiment(input: ExperimentRecord, c: ModelConfig, ids: readonly string[]) {
    const validTick = (t: number) => Number.isSafeInteger(t) && t >= 0 && t <= 1200000;
    check(input.version === 1 && Number.isInteger(input.seed) && input.seed >= 0 && input.seed <= 0xffffffff, 'version or seed');
    check(validTick(input.playhead) && validTick(input.frontier) && input.playhead <= input.frontier, 'playhead/frontier');
    check(Number.isSafeInteger(input.recordRevision) && input.recordRevision >= 0, 'revision');
    check(input.forkTick === null || (validTick(input.forkTick) && input.forkTick <= input.frontier), 'fork tick');
    const expectedIds: BranchId[] = input.forkTick === null ? ['original'] : ['original', 'A', 'B'];
    check(input.records.length === expectedIds.length && new Set(input.records.map(r => r.branch)).size === expectedIds.length, 'branch identities');
    const expectedLive = input.forkTick === null || input.playhead < input.forkTick ? ['original'] : expectedIds;
    check(input.live.length === expectedLive.length && new Set(input.live.map(b => b.branch)).size === expectedLive.length, 'visible branches');
    const e = new Experiment(input.seed, c, ids), anchor = input.anchor ? restore(input.anchor, c) : null;
    check(!anchor || anchor.tick <= input.frontier, 'anchor horizon');
    check(input.forkTick === null || anchor?.tick === input.forkTick, 'fork anchor');
    const allEventIds = new Set<string>();
    for (const r of input.records) {
        check(expectedIds.includes(r.branch), 'unknown branch');
        const start = restoreBranch(r.start, c, ids, r.branch).capture();
        const terminal = restoreBranch(r.terminal, c, ids, r.branch).capture();
        check(start.state.tick === (r.branch === 'original' ? 0 : input.forkTick) && terminal.state.tick === input.frontier, 'record horizons');
        check(JSON.stringify(start.events) === JSON.stringify(terminal.events), 'inconsistent event logs');
        check(start.events.every(event => event.startTick >= start.state.tick), 'event before branch');
        check(start.samples.length === Math.floor(start.state.tick / 100) && terminal.samples.length === Math.floor(terminal.state.tick / 100), 'incomplete measurements');
        if (r.branch === 'original')
            check(compareStates(start.state, createInitialState(input.seed, c)).equal && !start.events.length, 'initial control state');
        else
            check(anchor && compareStates(start.state, anchor).equal, 'different S₀ states');
        for (const event of start.events) {
            check(!allEventIds.has(event.id) && allEventIds.size < 256, 'duplicate event ID or limit');
            allEventIds.add(event.id);
        }
        let previous = start.state.tick;
        check(r.proofs.length === Math.floor(input.frontier / 20000) - Math.floor(start.state.tick / 20000), 'missing checkpoint evidence');
        for (const [tick, hash] of r.proofs) {
            check(validTick(tick) && tick === (Math.floor(previous / 20000) + 1) * 20000 && tick <= input.frontier && /^[a-f0-9]{16}$/.test(hash), 'checkpoint evidence');
            previous = tick;
        }
        e.records[r.branch] = { start, terminal, proofs: new Map(r.proofs) };
    }
    e.branches = { original: null, A: null, B: null };
    for (const s of input.live) {
        check(expectedLive.includes(s.branch), 'unexpected visible branch');
        const b = restoreBranch(s, c, ids, s.branch);
        check(b.state.tick === input.playhead && b.samples.length === Math.floor(input.playhead / 100), 'visible tick/history');
        check(JSON.stringify(b.events) === JSON.stringify(e.records[s.branch]!.start.events), 'visible event log');
        e.branches[s.branch] = b;
    }
    e.forkTick = input.forkTick;
    e.recordRevision = input.recordRevision;
    e.replayStatus = { status: 'Not checked', tick: input.playhead, detail: 'Loaded record; recompute each branch before trusting replay', checked: 0 };
    return { experiment: e, anchor };
}
