import type { Action, LabView } from '../worker-protocol/protocol';

/** UI admission only. The Worker remains the authority for every command. */
export function controlAllowed(view: LabView | null, action: Action): boolean {
    if (!view || view.job) return false;
    const tick = view.original.tick;
    if (action.type === 'PAUSE') return view.running;
    if (view.running) return false;
    switch (action.type) {
        case 'RUN': return tick < 1200000;
        case 'STEP': return Number.isInteger(action.payload.ticks) && action.payload.ticks > 0 && action.payload.ticks <= 50000 && tick + action.payload.ticks <= 1200000;
        case 'SEEK': return Number.isInteger(action.payload.tick) && action.payload.tick >= 0 && action.payload.tick <= view.highWater;
        case 'SNAPSHOT': return !view.snapshot;
        case 'FORK': return Boolean(view.snapshot && view.forkTick === null);
        case 'RESTORE': return Boolean(view.snapshot);
        case 'COMPARE':
        case 'REPLAY': return Boolean(view.branch && view.branch.tick === tick && (!view.branchB || view.branchB.tick === tick) && (action.type === 'COMPARE' || tick !== (view.snapshot?.tick ?? 0)));
        case 'SCHEDULE_INTERVENTION': {
            const p = action.payload;
            return Boolean((p.branch === 'A' ? view.branch : view.branchB) && tick === view.highWater && p.model === view.dataset.model && p.datasetHash === view.dataset.hash && p.configHash === view.configHash && p.sequence === view.eventRevisions[p.branch] + 1 && p.startTick >= tick && p.endTick > p.startTick && p.endTick <= 1200000 && (p.operation === 'odor-gain' || p.sourceIds.length > 0));
        }
        default: return false;
    }
}

/** Recovery ACK sequence/revision is transport bookkeeping, not experiment identity. */
export function controlContext(view: LabView, action: Action): string {
    return JSON.stringify([view.dataset.hash, view.configHash, view.seed, view.running,
        view.snapshot?.tick, view.forkTick, Boolean(view.branch), Boolean(view.branchB), view.eventRevisions,
        // A live PAUSE remains PAUSE while ordinary simulation ticks advance.
        action.type === 'PAUSE' ? null : [view.original.tick, view.branch?.tick, view.branchB?.tick, view.highWater, view.recordRevision]]);
}

export function controlLabel(action: Action): string {
    switch (action.type) {
        case 'COMPARE': return 'Compare states';
        case 'REPLAY': return 'Replay check';
        case 'RUN': return 'Run';
        case 'PAUSE': return 'Pause';
        case 'STEP': return `+${action.payload.ticks / 10000} s`;
        case 'SEEK': return 'Seek';
        case 'SNAPSHOT': return 'Capture snapshot';
        case 'FORK': return 'Fork A + B';
        case 'RESTORE': return 'Restore S₀';
        case 'SCHEDULE_INTERVENTION': return 'Apply intervention';
        default: return 'Command';
    }
}
